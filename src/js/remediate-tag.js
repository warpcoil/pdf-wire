/* ---------- remediation: tag the original in place ----------
   Keeps every page exactly as it is drawn and adds the structure around it.

   1. Each page's content stream is split into operations. Any old structure
      marking is removed (optional-content marking is kept).
   2. Probe: every piece of content (each text-showing operator, path, image or
      form) is wrapped in its own numbered marked-content sequence. PDF.js reads
      the probe, so the layout analysis learns which number each text run and
      image came from.
   3. After review, the content is rewritten with real tags (P, H1, LBody, TD,
      Figure...) or as Artifact, and a new structure tree, parent tree, link
      structure, language, title and metadata are written.

   pdf-lib (MIT) parses and writes the file. It is loaded the first time it's
   needed, so normal use of the editor doesn't pay for it. */

const PDFLIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
let pdfLibPromise = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!pdfLibPromise) pdfLibPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = PDFLIB_URL; s.async = true;
    s.onload = () => (window.PDFLib ? res(window.PDFLib) : rej(new Error('pdf-lib did not start')));
    s.onerror = () => { pdfLibPromise = null; s.remove(); rej(new Error('The tagging engine (pdf-lib) could not be downloaded. Check your connection and try again.')); };
    document.head.append(s);
  });
  return pdfLibPromise;
}

/* ---- content stream lexer ---- */
const CS_WS = new Uint8Array(256); [0, 9, 10, 12, 13, 32].forEach((c) => { CS_WS[c] = 1; });
const CS_DELIM = new Uint8Array(256); '()<>[]{}/%'.split('').forEach((c) => { CS_DELIM[c.charCodeAt(0)] = 1; });
const latin1Of = (u, a, b) => { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(u[i]); return s; };
function lexContent(u) {
  const ops = [], n = u.length;
  let i = 0, operands = [], opStart = -1, depth = 0;
  while (i < n) {
    const c = u[i];
    if (CS_WS[c]) { i++; continue; }
    if (c === 37) { while (i < n && u[i] !== 10 && u[i] !== 13) i++; continue; }
    const t0 = i;
    if (opStart < 0) opStart = i;
    if (c === 47) { i++; while (i < n && !CS_WS[u[i]] && !CS_DELIM[u[i]]) i++; if (depth === 0) operands.push({ t: 'name', v: latin1Of(u, t0 + 1, i) }); continue; }
    if (c === 40) {
      let lvl = 1; i++;
      while (i < n && lvl) { const d = u[i]; if (d === 92) i += 2; else { if (d === 40) lvl++; else if (d === 41) lvl--; i++; } }
      if (depth === 0) operands.push({ t: 'str' });
      continue;
    }
    if (c === 60) {
      if (u[i + 1] === 60) { if (depth === 0) operands.push({ t: 'dict', s: i }); depth++; i += 2; continue; }
      i++; while (i < n && u[i] !== 62) i++; i++;
      if (depth === 0) operands.push({ t: 'hex' });
      continue;
    }
    if (c === 62) {
      if (u[i + 1] === 62) { depth = Math.max(0, depth - 1); i += 2; if (depth === 0) { const d = operands[operands.length - 1]; if (d && d.t === 'dict') d.e = i; } continue; }
      i++; continue;
    }
    if (c === 91) { if (depth === 0) operands.push({ t: 'arr' }); depth++; i++; continue; }
    if (c === 93) { depth = Math.max(0, depth - 1); i++; continue; }
    if (c === 123 || c === 125 || c === 41) { i++; continue; }
    i++; while (i < n && !CS_WS[u[i]] && !CS_DELIM[u[i]]) i++;
    if (depth > 0) continue;
    const w = latin1Of(u, t0, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) { operands.push({ t: 'num', v: +w }); continue; }
    if (w === 'true' || w === 'false' || w === 'null') { operands.push({ t: 'kw', v: w }); continue; }
    if (w === 'BI') {                      // inline image: skip the binary data up to EI
      let j = i;
      while (j < n - 1 && !(u[j] === 73 && u[j + 1] === 68 && CS_WS[u[j - 1]] && (j + 2 >= n || CS_WS[u[j + 2]]))) j++;
      j += 3;
      while (j < n - 1 && !(CS_WS[u[j - 1]] && u[j] === 69 && u[j + 1] === 73 && (j + 2 >= n || CS_WS[u[j + 2]] || CS_DELIM[u[j + 2]]))) j++;
      i = Math.min(n, j + 2);
      ops.push({ op: 'BI', s: opStart, e: i, operands: [] });
      operands = []; opStart = -1; continue;
    }
    ops.push({ op: w, s: opStart, e: i, operands });
    operands = []; opStart = -1;
  }
  return ops;
}

const TEXT_SHOW = new Set(['Tj', 'TJ', "'", '"']);
const PATH_BUILD = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're', 'W', 'W*']);
const PATH_PAINT = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n']);
const MC_BREAK = new Set(['q', 'Q', 'BT', 'ET', 'BX', 'EX']);
/* splits a page's content into pass-through operations and units of content */
function contentUnits(u, ops, xobjKinds) {
  const seq = [], units = [], mc = [];
  let pathStart = null;
  const unit = (kind, s, e, extra) => {
    const art = mc.some((m) => m.artifact);
    let origMcid = null; for (let k = mc.length - 1; k >= 0; k--) if (mc[k].mcid != null) { origMcid = mc[k].mcid; break; }
    const x = Object.assign({ type: 'unit', kind, s, e, k: units.length, origArtifact: art, origMcid }, extra || {});
    units.push(x); seq.push(x);
  };
  for (const o of ops) {
    if (pathStart != null && !PATH_BUILD.has(o.op) && !PATH_PAINT.has(o.op)) { seq.push({ type: 'pass', s: pathStart, e: o.s, op: '' }); pathStart = null; }
    if (o.op === 'BMC' || o.op === 'BDC') {
      const tag = o.operands[0] && o.operands[0].t === 'name' ? o.operands[0].v : '';
      let mcid = null;
      const d = o.operands[1];
      if (d && d.t === 'dict' && d.e) { const m = /\/MCID\s+(\d+)/.exec(latin1Of(u, d.s, d.e)); if (m) mcid = +m[1]; }
      const keep = tag === 'OC';
      mc.push({ keep, artifact: tag === 'Artifact', mcid });
      if (keep) seq.push({ type: 'pass', s: o.s, e: o.e, op: o.op, mc: true });
      continue;
    }
    if (o.op === 'EMC') { const m = mc.pop(); if (m && m.keep) seq.push({ type: 'pass', s: o.s, e: o.e, op: 'EMC', mc: true }); continue; }
    if (PATH_BUILD.has(o.op)) { if (pathStart == null) pathStart = o.s; continue; }
    if (PATH_PAINT.has(o.op)) { const s = pathStart != null ? pathStart : o.s; pathStart = null; unit(o.op === 'n' ? 'clip' : 'path', s, o.e); continue; }
    if (TEXT_SHOW.has(o.op)) unit('text', o.s, o.e);
    else if (o.op === 'Do') { const nm = o.operands[0] && o.operands[0].v; unit(xobjKinds.get(nm) === 'Image' ? 'image' : 'form', o.s, o.e, { xobj: nm }); }
    else if (o.op === 'BI') unit('image', o.s, o.e, { inline: true });
    else if (o.op === 'sh') unit('shade', o.s, o.e);
    else seq.push({ type: 'pass', s: o.s, e: o.e, op: o.op });
  }
  if (pathStart != null) seq.push({ type: 'pass', s: pathStart, e: u.length, op: '' });
  for (const m of mc) if (m.keep) seq.push({ type: 'raw', text: 'EMC' });   // close optional content the original left open
  return { seq, units };
}
function joinBytes(parts) {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* ---- reading and writing pages with pdf-lib ---- */
function pageContentBytes(L, doc, page) {
  const c = page.node.Contents();
  if (!c) return new Uint8Array(0);
  const streams = c instanceof L.PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
  const parts = [];
  for (const s of streams) {
    if (!s) continue;
    parts.push(s instanceof L.PDFRawStream ? L.decodePDFRawStream(s).decode() : s.getContents ? s.getContents() : new Uint8Array(0), latin1('\n'));
  }
  return joinBytes(parts);
}
function xobjectKinds(L, doc, page) {
  const out = new Map();
  const res = page.node.Resources();
  const xo = res && res.lookup(L.PDFName.of('XObject'));
  if (xo instanceof L.PDFDict) for (const [k, v] of xo.entries()) {
    const s = doc.context.lookup(v);
    const st = s && s.dict ? s.dict.get(L.PDFName.of('Subtype')) : null;
    out.set(k.decodeText(), st ? st.decodeText() : '');
  }
  return out;
}
function setPageContent(L, doc, page, bytes, compress) {
  const s = compress ? doc.context.flateStream(bytes) : doc.context.stream(bytes);
  page.node.set(L.PDFName.of('Contents'), doc.context.register(s));
}
async function loadForTagging(bytes) {
  const L = await loadPdfLib();
  const doc = await L.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  if (doc.isEncrypted) throw new Error('This PDF is encrypted, so it can’t be tagged in place. Remove the protection first, or rebuild it instead.');
  return { L, doc };
}

/* Step 1 and 2: the probe file */
async function buildProbe(bytes) {
  const { L, doc } = await loadForTagging(bytes);
  const pages = doc.getPages();
  const model = pages.map((pg) => {
    const u = pageContentBytes(L, doc, pg);
    const { seq, units } = contentUnits(u, lexContent(u), xobjectKinds(L, doc, pg));
    return { u, seq, units };
  });
  pages.forEach((pg, i) => {
    const M = model[i];
    const parts = M.seq.map((x) => (x.type === 'raw' ? latin1(x.text + '\n') : x.type === 'pass' ? joinBytes([M.u.subarray(x.s, x.e), latin1('\n')])
      : joinBytes([latin1('/P <</MCID ' + x.k + '>> BDC\n'), M.u.subarray(x.s, x.e), latin1('\nEMC\n')])));
    setPageContent(L, doc, pg, joinBytes(parts), false);
  });
  doc.catalog.delete(L.PDFName.of('StructTreeRoot'));
  return { model, probe: await doc.save({ useObjectStreams: false }) };
}

/* the analysis of the probe -> an editable tag model */
function buildTagModel(name, bytes, model, Xp, Rp, Xorig) {
  const unitOfItem = new Map(), charsOf = new Map(), unitOfImage = new Map();
  for (const P of Xp.pages) {
    const M = model[P.index];
    for (const it of P.items) {
      if (it.mcid == null || !M.units[it.mcid]) continue;
      unitOfItem.set(it.id, it.mcid); charsOf.set(it.id, it.str.replace(/\s/g, '').length || 1);
    }
    for (const im of P.images) if (im.mcid != null && M.units[im.mcid]) unitOfImage.set(im.id, im.mcid);
  }
  const unitsOf = (ids) => { const out = []; for (const id of ids || []) { const u = unitOfItem.get(id); if (u != null && !out.includes(u)) out.push(u); } return out; };
  const T = { name, bytes, model, Xp, Rp, title: '', lang: '', blocks: [], artifacts: Xp.pages.map(() => new Map()), flags: Rp.flags, removed: Rp.artifacts, fontsMissing: Xorig ? Xorig.fontsMissing : Xp.fontsMissing,
    widgets: Xp.pages.reduce((n, p) => n + p.widgets, 0), scanned: Rp.flags.some((f) => f.kind === 'scan'), probePdf: null };
  const altOf = (page, unit) => {
    const u = model[page].units[unit]; if (!u || u.origMcid == null || !Xorig) return '';
    return Xorig.pages[page].altByMcid.get(u.origMcid) || '';
  };
  const tbid = () => 't' + Math.random().toString(36).slice(2, 9);
  for (const b of Rp.blocks) {
    const base = { id: tbid(), page: b.page, rect: b.rect, text: '' };
    if (b.kind === 'heading' || b.kind === 'paragraph') {
      T.blocks.push(Object.assign(base, { role: b.kind === 'heading' ? 'H' + b.level : 'P', text: b.text, units: unitsOf(b.items), ids: b.items,
        lines: b.lines.map((l) => ({ text: l.text, units: unitsOf(l.items) })) }));
    } else if (b.kind === 'list') {
      const items = b.items.map((it) => {
        const lblIds = new Set(it.lblItems);
        // a unit is a label only if everything it draws is the marker
        const lbl = unitsOf(it.lblItems).filter((u) => it.items.filter((id) => unitOfItem.get(id) === u).every((id) => lblIds.has(id)));
        for (const u of it.lblPaths || []) if (u != null && model[b.page].units[u] && !lbl.includes(u)) lbl.push(u);
        return { text: it.text, lbl, body: unitsOf(it.items).filter((u) => !lbl.includes(u)) };
      });
      T.blocks.push(Object.assign(base, { role: 'L', marker: b.marker, text: b.items.map((i) => i.text).join('; '), items, ids: b.items.flatMap((i) => i.items),
        lines: b.items.map((it, k) => ({ text: it.text, units: [...items[k].lbl, ...items[k].body] })) }));
    } else if (b.kind === 'table') {
      T.blocks.push(Object.assign(base, { role: 'Table', text: b.rows.map((r) => r.map((c) => c.text).join(' ')).join(' / '), source: b.source, ids: b.rows.flatMap((r) => r.flatMap((c) => c.items)),
        rows: b.rows.map((r) => r.map((c) => ({ text: c.text, units: unitsOf(c.items) }))), headerRow: b.headerRow, headerCol: b.headerCol, reviewed: false,
        lines: b.rows.map((r) => ({ text: r.map((c) => c.text).filter(Boolean).join(' '), units: r.flatMap((c) => unitsOf(c.items)) })) }));
    } else if (b.kind === 'image' && b.vector) {
      const units = [...unitsOf(b.items), ...(b.paths || []).filter((u) => u != null && model[b.page].units[u])];
      T.blocks.push(Object.assign(base, { role: 'Figure', units: [...new Set(units)], ids: b.items, alt: '', suggestion: '', text: '', vector: true }));
    } else if (b.kind === 'image') {
      const u = unitOfImage.get(b.images[0]);
      if (u == null) continue;
      T.blocks.push(Object.assign(base, { role: 'Figure', units: [u], alt: '', suggestion: altOf(b.page, u), text: '' }));
      if (b.caption) T.blocks.push({ id: tbid(), page: b.page, rect: rectOf(b.caption.lines.map((l) => [l.x0, l.y - l.size * 0.25, l.x1, l.y + l.size * 0.8])), role: 'P', text: b.caption.text,
        units: unitsOf(b.caption.items), ids: b.caption.items, lines: [{ text: b.caption.text, units: unitsOf(b.caption.items) }], caption: true });
    }
  }
  // a unit that drew text for two blocks belongs to the one with more of its characters
  const weight = new Map();
  for (const blk of T.blocks) {
    for (const id of blk.ids || []) {
      const u = unitOfItem.get(id); if (u == null) continue;
      const k = blk.page + ':' + u, m = weight.get(k) || new Map();
      m.set(blk, (m.get(blk) || 0) + charsOf.get(id)); weight.set(k, m);
    }
    delete blk.ids;
  }
  for (const [k, m] of weight) {
    if (m.size < 2) continue;
    const best = [...m].sort((a, b) => b[1] - a[1])[0][0], u = +k.split(':')[1];
    for (const blk of m.keys()) if (blk !== best) removeUnit(blk, u);
  }
  // artifacts the analysis found (headers, footers, page numbers, repeated logos)
  for (const a of Rp.artifacts) {
    const units = a.kind === 'image' ? (a.images || []).map((id) => unitOfImage.get(id)).filter((u) => u != null) : unitsOf(a.items);
    for (const u of units) T.artifacts[a.page].set(u, a.type || null);
  }
  const meta = Xorig ? Xorig.meta : Xp.meta;
  const h1 = T.blocks.find((b) => b.role === 'H1');
  T.title = (!isFileTitle(meta.title) && meta.title) || (h1 && h1.text) || name.replace(/\.pdf$/i, '');
  T.titleFrom = !isFileTitle(meta.title) && meta.title ? 'metadata' : h1 ? 'heading' : 'file';
  T.lang = validLang(meta.lang) ? meta.lang : '';
  return T;
}
function blockHasUnit(b, u) {
  if (u == null) return false;
  if (b.role === 'L') return b.items.some((i) => i.lbl.includes(u) || i.body.includes(u));
  if (b.role === 'Table') return b.rows.some((r) => r.some((c) => c.units.includes(u)));
  return (b.units || []).includes(u);
}
function removeUnit(b, u) {
  const drop = (a) => { const i = a.indexOf(u); if (i >= 0) a.splice(i, 1); };
  if (b.units) drop(b.units);
  if (b.items) b.items.forEach((i) => { drop(i.lbl); drop(i.body); });
  if (b.rows) b.rows.forEach((r) => r.forEach((c) => drop(c.units)));
  if (b.lines) b.lines.forEach((l) => drop(l.units));
}
function blockUnits(b) {
  if (b.role === 'L') return b.items.flatMap((i) => [...i.lbl, ...i.body]);
  if (b.role === 'Table') return b.rows.flatMap((r) => r.flatMap((c) => c.units));
  return b.units || [];
}

/* ---- step 3: write the tagged file ---- */
async function writeTagged(T) {
  const { L, doc } = await loadForTagging(T.bytes);
  const ctx = doc.context, N = L.PDFName.of.bind(L.PDFName);
  const pages = doc.getPages();
  // structure in reading order
  const root = { S: 'Document', kids: [], parent: null };
  const E = (S, parent, extra) => { const e = Object.assign({ S, kids: [], parent }, extra || {}); parent.kids.push(e); return e; };
  const owner = pages.map(() => new Map());       // unit -> element
  const linkOf = pages.map(() => new Map());      // unit -> link annotation index
  const annots = pages.map((pg, p) => {
    const arr = pg.node.Annots();
    const list = arr ? arr.asArray().map((ref) => ({ ref, dict: ctx.lookup(ref) })).filter((a) => a.dict instanceof L.PDFDict) : [];
    for (const a of list) { const st = a.dict.get(N('Subtype')); a.subtype = st ? st.decodeText() : ''; const r = a.dict.lookup(N('Rect')); a.rect = r ? r.asArray().map((v) => v.asNumber()) : null; }
    return list;
  });
  // which units does each link cover?
  T.Xp.pages.forEach((P, p) => {
    const view = P.proxy.view;
    annots[p].forEach((a, ai) => {
      if (a.subtype !== 'Link' || !a.rect) return;
      const r = [Math.min(a.rect[0], a.rect[2]) - view[0], Math.min(a.rect[1], a.rect[3]) - view[1], Math.max(a.rect[0], a.rect[2]) - view[0], Math.max(a.rect[1], a.rect[3]) - view[1]];
      a.units = [];
      for (const it of P.items) if (it.mcid != null && inside(centre(itemRect(it)), r, 1)) { if (!linkOf[p].has(it.mcid)) linkOf[p].set(it.mcid, ai); if (!a.units.includes(it.mcid)) a.units.push(it.mcid); a.text = ((a.text || '') + ' ' + it.str).trim(); }
    });
  });
  const linkEls = pages.map(() => new Map());
  const claim = (e, p, units) => {
    let lastLink = null;
    for (const u of units) {
      if (owner[p].has(u)) continue;
      const ai = linkOf[p].get(u);
      if (ai != null) {
        let le = lastLink && lastLink.ai === ai ? lastLink : null;
        if (!le) { le = E('Link', e, { ai, page: p }); linkEls[p].set(ai, le); }
        owner[p].set(u, le); le.kids.push({ unit: u, page: p }); lastLink = le;
      } else { owner[p].set(u, e); e.kids.push({ unit: u, page: p }); lastLink = null; }
    }
  };
  for (const b of T.blocks) {
    const p = b.page;
    if (b.role === 'Artifact') continue;
    if (/^H[1-6]$/.test(b.role) || b.role === 'P') claim(E(b.role, root), p, b.units);
    else if (b.role === 'Figure') {
      const r = b.rect;
      const f = E('Figure', root, { alt: b.alt.trim(), attrs: { O: 'Layout', Placement: 'Block', BBox: [r[0], r[1], r[2], r[3]].map((v) => Math.round(v * 100) / 100) } });
      claim(f, p, b.units);
    } else if (b.role === 'L') {
      const Le = E('L', root, { attrs: { O: 'List', ListNumbering: (MARKERS.find((m) => m[0] === b.marker) || MARKERS[0])[2] } });
      for (const it of b.items) {
        const LI = E('LI', Le);
        if (it.lbl.length) claim(E('Lbl', LI), p, it.lbl);
        claim(E('LBody', LI), p, it.body);
      }
    } else if (b.role === 'Table') {
      const Te = E('Table', root);
      b.rows.forEach((row, r) => {
        const TR = E('TR', Te);
        row.forEach((cell, c) => {
          const th = (b.headerRow && r === 0) || (b.headerCol && c === 0);
          const cel = E(th ? 'TH' : 'TD', TR, th ? { attrs: { O: 'Table', Scope: b.headerRow && r === 0 ? 'Column' : 'Row' } } : {});
          claim(cel, p, cell.units);
        });
      });
    }
  }
  // links with no text of their own, and other annotations
  annots.forEach((list, p) => list.forEach((a, ai) => {
    if (a.subtype === 'Link') { a.el = linkEls[p].get(ai) || E('Link', root, { ai, page: p }); a.el.objr = a; }
    else if (a.subtype !== 'Popup' && a.subtype !== 'Widget') { a.el = E('Annot', root, { page: p }); a.el.objr = a; }
  }));

  // rewrite the content of every page
  const parentArr = pages.map(() => []);
  const XMP_PRODUCER = 'PDF Wire (tag in place)';
  pages.forEach((pg, p) => {
    const M = T.model[p], arts = T.artifacts[p];
    const parts = [];
    let open = null;                       // the sequence currently open: { el, mcid } or { art }
    const close = () => { if (open) { parts.push(latin1('EMC\n')); open = null; } };
    for (const x of M.seq) {
      if (x.type === 'raw') { close(); parts.push(latin1(x.text + '\n')); continue; }
      if (x.type === 'pass') { if (x.mc || MC_BREAK.has(x.op)) close(); parts.push(M.u.subarray(x.s, x.e), latin1('\n')); continue; }
      const e = owner[p].get(x.k);
      if (e) {
        if (!open || open.el !== e) {
          close();
          const mcid = parentArr[p].length; parentArr[p].push(e);
          open = { el: e, mcid };
          parts.push(latin1('/' + e.S + ' <</MCID ' + mcid + '>> BDC\n'));
        }
        x.mcid = open.mcid;
      } else {
        const type = arts.has(x.k) ? arts.get(x.k) : null;
        const key = 'art:' + (type || '');
        if (!open || open.art !== key) {
          close();
          open = { art: key };
          parts.push(latin1(type ? '/Artifact <</Type /Pagination /Subtype /' + type + '>> BDC\n' : '/Artifact BMC\n'));
        }
      }
      parts.push(M.u.subarray(x.s, x.e), latin1('\n'));
    }
    close();
    setPageContent(L, doc, pg, joinBytes(parts), true);
    // units -> MCIDs in each element's list of kids
    const mcidOfUnit = new Map(M.units.filter((x) => x.mcid != null).map((x) => [x.k, x.mcid]));
    const fix = (e) => {
      const seen = new Set(), kids = [];
      for (const k of e.kids) {
        if (k.unit != null) { if (k.page !== p) { kids.push(k); continue; } const m = mcidOfUnit.get(k.unit); if (m == null || seen.has(m)) continue; seen.add(m); kids.push({ mcid: m, page: p }); }
        else { kids.push(k); if (k.S) fix(k); }
      }
      e.kids = kids;
    };
    fix(root);
    M.units.forEach((x) => { delete x.mcid; });
  });

  // forms that carried old structure marks
  const seenForms = new Set();
  const stripForms = (res) => {
    const xo = res && res.lookup(N('XObject'));
    if (!(xo instanceof L.PDFDict)) return;
    for (const [, ref] of xo.entries()) {
      if (!(ref instanceof L.PDFRef) || seenForms.has(ref.toString())) continue;
      seenForms.add(ref.toString());
      const s = ctx.lookup(ref);
      if (!(s instanceof L.PDFRawStream) || !s.dict.get(N('Subtype')) || s.dict.get(N('Subtype')).decodeText() !== 'Form') continue;
      let u; try { u = L.decodePDFRawStream(s).decode(); } catch (e) { continue; }
      const txt = latin1Of(u, 0, Math.min(u.length, 4000000));
      s.dict.delete(N('StructParent')); s.dict.delete(N('StructParents'));
      if (/\bB(MC|DC)\b/.test(txt)) {
        const ops = lexContent(u), mc = [], parts = [];
        for (const o of ops) {
          if (o.op === 'BMC' || o.op === 'BDC') { const k = o.operands[0] && o.operands[0].v === 'OC'; mc.push(k); if (!k) continue; }
          else if (o.op === 'EMC') { const k = mc.pop(); if (!k) continue; }
          parts.push(u.subarray(o.s, o.e), latin1('\n'));
        }
        const ns = ctx.flateStream(joinBytes(parts));
        for (const [k, v] of s.dict.entries()) { const kn = k.decodeText(); if (kn !== 'Length' && kn !== 'Filter' && kn !== 'DecodeParms') ns.dict.set(k, v); }
        ctx.assign(ref, ns);
      }
      stripForms(s.dict.lookup(N('Resources')));
    }
  };
  pages.forEach((pg) => stripForms(pg.node.Resources()));

  // structure tree objects
  const all = [];
  const walk = (e) => { e.ref = ctx.nextRef(); all.push(e); e.kids.forEach((k) => { if (k.S) walk(k); }); };
  walk(root);
  const STR = ctx.nextRef(), PT = ctx.nextRef();
  let nextKey = pages.length;
  for (const list of annots) for (const a of list) if (a.el) a.key = nextKey++;
  const pageRef = (p) => pages[p].ref;
  const toPdf = (v) => (typeof v === 'number' ? L.PDFNumber.of(v) : Array.isArray(v) ? ctx.obj(v) : N(String(v)));
  for (const e of all) {
    const firstPage = e.kids.find((k) => k.mcid != null);
    e.pg = firstPage ? firstPage.page : e.objr ? e.page : null;
    const K = [];
    for (const k of e.kids) {
      if (k.S) K.push(k.ref);
      else if (k.mcid != null) K.push(k.page === e.pg ? L.PDFNumber.of(k.mcid) : ctx.obj({ Type: 'MCR', Pg: pageRef(k.page), MCID: k.mcid }));
    }
    if (e.objr) K.push(ctx.obj({ Type: 'OBJR', Obj: e.objr.ref, Pg: pageRef(e.page) }));
    const d = ctx.obj({ Type: 'StructElem', S: e.S, P: e.parent ? e.parent.ref : STR });
    if (e.pg != null) d.set(N('Pg'), pageRef(e.pg));
    if (K.length) d.set(N('K'), ctx.obj(K));
    if (e.alt) d.set(N('Alt'), L.PDFHexString.fromText(e.alt));
    if (e.attrs) { const A = ctx.obj({}); for (const [k, v] of Object.entries(e.attrs)) A.set(N(k), toPdf(v)); d.set(N('A'), A); }
    ctx.assign(e.ref, d);
  }
  const nums = [];
  parentArr.forEach((arr, p) => { nums.push(L.PDFNumber.of(p), ctx.obj(arr.map((e) => e.ref))); });
  annots.forEach((list) => list.forEach((a) => { if (a.el) nums.push(L.PDFNumber.of(a.key), a.el.ref); }));
  ctx.assign(PT, ctx.obj({ Nums: nums }));
  ctx.assign(STR, ctx.obj({ Type: 'StructTreeRoot', K: root.ref, ParentTree: PT, ParentTreeNextKey: nextKey }));

  // annotations, pages, catalogue, metadata
  annots.forEach((list) => list.forEach((a) => {
    a.dict.delete(N('StructParent'));
    if (!a.el) return;
    a.dict.set(N('StructParent'), L.PDFNumber.of(a.key));
    if (a.subtype === 'Link' && !a.dict.get(N('Contents'))) {
      const act = a.dict.lookup(N('A')); const uri = act instanceof L.PDFDict ? act.lookup(N('URI')) : null;
      const label = (a.text || '').trim() || (uri ? (uri.decodeText ? uri.decodeText() : String(uri)) : 'Link');
      a.dict.set(N('Contents'), L.PDFHexString.fromText(label));
    }
  }));
  pages.forEach((pg, p) => { pg.node.set(N('StructParents'), L.PDFNumber.of(p)); pg.node.set(N('Tabs'), N('S')); });
  const cat = doc.catalog;
  cat.set(N('StructTreeRoot'), STR);
  cat.set(N('MarkInfo'), ctx.obj({ Marked: true }));
  cat.delete(N('RoleMap'));
  doc.setTitle(T.title, { showInWindowTitleBar: true });
  doc.setLanguage(T.lang);
  doc.setProducer(XMP_PRODUCER);
  doc.setModificationDate(new Date());
  const conform = taggedConformance(T);
  const oldXmp = (() => { try { const m = cat.lookup(N('Metadata')); return m instanceof L.PDFRawStream ? new TextDecoder().decode(L.decodePDFRawStream(m).decode()) : ''; } catch (e) { return ''; } })();
  const pdfa = /pdfaid:part[^0-9]*(\d)/.exec(oldXmp), pdfaConf = /pdfaid:conformance[^A-Za-z]*([ABU])/i.exec(oldXmp);
  const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const xmp = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">\n' +
    '<dc:format>application/pdf</dc:format>\n<dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + xmlEsc(T.title) + '</rdf:li></rdf:Alt></dc:title>\n' +
    '<dc:language><rdf:Bag><rdf:li>' + xmlEsc(T.lang) + '</rdf:li></rdf:Bag></dc:language>\n' +
    '<pdf:Producer>' + XMP_PRODUCER + '</pdf:Producer>\n<xmp:ModifyDate>' + iso + '</xmp:ModifyDate>\n<xmp:MetadataDate>' + iso + '</xmp:MetadataDate>\n' +
    (conform.ua ? '<pdfuaid:part>1</pdfuaid:part>\n' : '') +
    (pdfa ? '<pdfaid:part>' + pdfa[1] + '</pdfaid:part>\n' + (pdfaConf ? '<pdfaid:conformance>' + pdfaConf[1].toUpperCase() + '</pdfaid:conformance>\n' : '') : '') +
    '</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>';
  cat.set(N('Metadata'), ctx.register(ctx.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' })));
  doc.context.header = L.PDFHeader.forVersion(1, 7);
  const bytes = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
  return { bytes, conform };
}
/* can the tagged file honestly claim PDF/UA? */
function taggedConformance(T) {
  const why = [];
  if (T.fontsMissing.length) why.push(plural(T.fontsMissing.length, 'font') + ' in the original ' + (T.fontsMissing.length === 1 ? 'isn’t' : 'aren’t') + ' embedded (' + T.fontsMissing.slice(0, 3).join(', ') + (T.fontsMissing.length > 3 ? '…' : '') + ')');
  if (T.widgets) why.push('the form fields aren’t tagged');
  if (T.scanned) why.push('some pages are scanned images with no real text');
  return { ua: !why.length, why };
}

/* probe -> analysis -> tag model */
async function prepareTagging(name, bytes, Xorig, progress) {
  if (progress) progress('Loading the tagging engine…');
  const { model, probe } = await buildProbe(bytes);
  if (progress) progress('Reading the page content…');
  const pdf = await pdfjsLib.getDocument({ data: probe.slice(), isEvalSupported: false }).promise;
  const Xp = await extractPdf(pdf, { outerMcid: true });
  Xp.meta = Object.assign({}, Xorig.meta);
  for (const P of Xp.pages) {
    const M = model[P.index], orig = Xorig.pages[P.index];
    const wasArt = (m) => !!(m != null && M.units[m] && M.units[m].origArtifact);
    for (const it of P.items) it.artifact = wasArt(it.mcid);
    for (const im of P.images) im.artifact = wasArt(im.mcid);
    P.hadTags = orig ? orig.hadTags : false;
    P.altByMcid = new Map();
  }
  if (progress) progress('Working out the structure…');
  const Rp = analyseLayout(Xp);
  const T = buildTagModel(name, bytes, model, Xp, Rp, Xorig);
  T.probePdf = pdf;
  return T;
}
