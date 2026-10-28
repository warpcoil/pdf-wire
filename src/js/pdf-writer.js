/* ---------- PDF writer: tagged PDF/UA-1 output ---------- */
const FONTS = FONTDATA;
const DEFAULT_FONT = 'atkinson';
const FAMILIES = FONTMETA.families.map((f) => [f.key, f.name, f.cat, f.blurb]);
const OLD_FONT_KEYS = { sans: 'inter', serif: 'sourceserif', hyper: 'atkinson' };   // drafts from earlier builds
const famKey = (k) => (FONTS[k + '-R'] ? k : OLD_FONT_KEYS[k] || DEFAULT_FONT);
const FACE = new Proxy({}, { get: (_, k) => 'APDF ' + famKey(String(k)) });
const fontKey = (fam, bold, italic) => famKey(fam) + '-' + (bold ? (italic ? 'BI' : 'B') : (italic ? 'I' : 'R'));
const MM = 72 / 25.4;
const INK_HEX = '#17191E';
const HSIZE = { 1: 24, 2: 18, 3: 15, 4: 13, 5: 12, 6: 11 };
const MARKERS = [['disc', 'Bullet •', 'Disc'], ['dash', 'Dash –', 'None'], ['decimal', 'Numbers 1. 2. 3.', 'Decimal'],
  ['lower-alpha', 'Letters a. b. c.', 'LowerAlpha'], ['upper-alpha', 'Letters A. B. C.', 'UpperAlpha'],
  ['lower-roman', 'Roman i. ii. iii.', 'LowerRoman'], ['upper-roman', 'Roman I. II. III.', 'UpperRoman']];
const latin1 = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
const b64bytes = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const fnum = (v) => String(Math.round(v * 100) / 100);
const hex4 = (n) => n.toString(16).padStart(4, '0').toUpperCase();
function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0x17191E; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
const rgbOp = (hex) => rgb(hex).map((v) => String(Math.round(v * 1000) / 1000)).join(' ');
function luminance(hex) { const c = rgb(hex).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
function pdfText(s) {
  let h = 'FEFF';
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp > 0xFFFF) { const v = cp - 0x10000; h += hex4(0xD800 + (v >> 10)) + hex4(0xDC00 + (v & 1023)); } else h += hex4(cp);
  }
  return '<' + h + '>';
}
const pdfLiteral = (s) => '(' + String(s).replace(/[\\()]/g, '\\$&') + ')';
const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
async function deflate(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try { const cs = new CompressionStream('deflate'); const wr = cs.writable.getWriter(); wr.write(u8); wr.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
  catch (e) { return null; }
}
const glyphOf = (font, cp) => font.cmap[cp];
function canShow(font, s) { const bad = new Set(); for (const ch of String(s || '')) { const cp = ch.codePointAt(0); if (cp >= 32 && glyphOf(font, cp) == null) bad.add(ch); } return bad; }
function measure(font, s, size) { let w = 0; for (const ch of s) { const g = glyphOf(font, ch.codePointAt(0)) ?? glyphOf(font, 63); w += font.widths[g] || 0; } return w * size / 1000; }
function wrapText(font, text, size, maxW) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const out = []; let line = '';
  for (const w of words) {
    const cand = line ? line + ' ' + w : w;
    if (measure(font, cand, size) <= maxW) { line = cand; continue; }
    if (line) out.push(line);
    if (measure(font, w, size) <= maxW) { line = w; continue; }
    let part = '';
    for (const ch of w) { if (part && measure(font, part + ch, size) > maxW) { out.push(part); part = ch; } else part += ch; }
    line = part;
  }
  if (line) out.push(line);
  return out;
}
function resolveStyle(b, d) {
  const s = b.style || {}, isH = b.type === 'heading';
  const size = s.size || (isH ? HSIZE[b.level] || 13 : 11);
  return { font: famKey(s.font || d.font || DEFAULT_FONT), size, bold: s.bold != null ? s.bold : isH, italic: !!s.italic, color: s.color || INK_HEX,
    align: s.align || 'left', lh: s.lineHeight || (isH ? 1.25 : 1.45) };
}
const roman = (n) => { const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s; };
const alpha = (k) => { let s = ''; k += 1; while (k > 0) { k--; s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26); } return s; };
function listLabel(m, k) {
  switch (m) {
    case 'dash': return '\u2013';
    case 'decimal': return (k + 1) + '.';
    case 'lower-alpha': return alpha(k) + '.';
    case 'upper-alpha': return alpha(k).toUpperCase() + '.';
    case 'lower-roman': return roman(k + 1).toLowerCase() + '.';
    case 'upper-roman': return roman(k + 1) + '.';
    default: return '\u2022';
  }
}
const pageDims = (d) => (d.pageSize === 'Letter' ? [612, 792] : [595.28, 841.89]);

async function buildPdf(d, opts) {
  opts = opts || {};
  const [PW, PH] = pageDims(d);
  const ML = 64, MR = 64, MT = 72, MB = 72, W = PW - ML - MR;
  const GREY = '#4A5160', RULE = '#1A1A1F', SOFT = '#BFC4CC';
  const used = new Map(), resNames = new Map();
  const rects = [], images = [], outline = [];
  const pages = []; let fi = -1, pg, y;
  const root = { S: 'Document', kids: [], parent: null };

  const pageAt = (i) => { while (pages.length <= i) pages.push({ index: pages.length, flow: [], layers: [], next: 0, parents: [], xobjs: [] }); return pages[i]; };
  const newPage = () => { fi++; pg = pageAt(fi); y = PH - MT; };
  newPage();
  const atTop = () => y >= PH - MT - 0.01;
  function show(fk, size, x, base, s, color) {
    const f = FONTS[fk];
    let map = used.get(fk);
    if (!map) { map = new Map(); used.set(fk, map); resNames.set(fk, 'F' + (resNames.size + 1)); }
    let hex = '';
    for (const ch of s) {
      let cp = ch.codePointAt(0); let g = glyphOf(f, cp);
      if (g == null) { cp = 63; g = glyphOf(f, 63); }
      if (!map.has(g)) map.set(g, cp);
      hex += hex4(g);
    }
    return 'BT ' + rgbOp(color) + ' rg /' + resNames.get(fk) + ' ' + fnum(size) + ' Tf 1 0 0 1 ' + fnum(x) + ' ' + fnum(base) + ' Tm <' + hex + '> Tj ET\n';
  }
  const addEl = (S, parent, extra) => { const e = Object.assign({ S, kids: [], parent }, extra || {}); parent.kids.push(e); return e; };
  function mark(elem, page) { page = page || pg; const id = page.next++; page.parents[id] = elem; elem.kids.push({ mcid: id, page }); if (!elem.pg) elem.pg = page; return id; }
  function emit(ops, page, z) { page = page || pg; if (!z) page.flow.push(ops); else page.layers.push({ z, ops }); }
  function artifact(ops, type, subtype, page, z) {
    emit('/Artifact ' + (type ? '<</Type /' + type + (subtype ? ' /Subtype /' + subtype : '') + '>> BDC' : 'BMC') + '\n' + ops + 'EMC\n', page, z);
  }
  const rect = (b, page, x0, y0, x1, y1, kind, extra) => rects.push(Object.assign({ blockId: b.id, page: page.index, x0, y0, x1, y1, kind }, extra || {}));

  function flowText(b, elem, tag, lns, st, x0, width) {
    const fk = fontKey(st.font, st.bold, st.italic), f = FONTS[fk], lead = st.size * st.lh;
    let i = 0;
    while (i < lns.length) {
      if (y - lead < MB) newPage();
      const id = mark(elem); let ops = '/' + tag + ' <</MCID ' + id + '>> BDC\n'; const top = y;
      let minx = Infinity, maxx = -Infinity;
      while (i < lns.length && y - lead >= MB - 0.01) {
        const lw = measure(f, lns[i], st.size), dx = st.align === 'center' ? (width - lw) / 2 : st.align === 'right' ? width - lw : 0;
        ops += show(fk, st.size, x0 + dx, y - lead * 0.78, lns[i], st.color);
        minx = Math.min(minx, x0 + dx); maxx = Math.max(maxx, x0 + dx + lw);
        y -= lead; i++;
      }
      emit(ops + 'EMC\n');
      rect(b, pg, minx, y, maxx, top, 'text', { color: st.color, size: st.size, bold: st.bold });
    }
  }
  function placeImage(b, x, yb, w, h, page, z) {
    const name = 'Im' + images.length;
    images.push({ bytes: b64bytes(b.data), w: b.w, h: b.h });
    page.xobjs.push(name);
    const draw = 'q ' + fnum(w) + ' 0 0 ' + fnum(h) + ' ' + fnum(x) + ' ' + fnum(yb) + ' cm /' + name + ' Do Q\n';
    if (b.decorative) artifact(draw, null, null, page, z);
    else {
      const F = addEl('Figure', root, { alt: b.alt.trim(), attrs: '/A << /O /Layout /Placement /Block /BBox [' + [x, yb, x + w, yb + h].map(fnum).join(' ') + '] >>' });
      const id = mark(F, page);
      emit('/Figure <</MCID ' + id + '>> BDC\n' + draw + 'EMC\n', page, z);
    }
    rect(b, page, x, yb, x + w, yb + h, 'image');
  }

  for (const b of d.blocks) {
    if (b.type === 'heading' || b.type === 'paragraph') {
      const t = (b.text || '').trim(); if (!t) continue;
      const st = resolveStyle(b, d), tag = b.type === 'heading' ? 'H' + b.level : 'P';
      const e = addEl(tag, root);
      const f = FONTS[fontKey(st.font, st.bold, st.italic)], lead = st.size * st.lh;
      const lns = wrapText(f, t, st.size, W);
      if (b.type === 'heading') {
        if (!atTop()) y -= st.size * 0.75;
        if (y - lead * lns.length - 32 < MB && !atTop()) newPage();
        outline.push({ level: b.level, title: t, page: pg, y: y + 4 });
      }
      flowText(b, e, tag, lns, st, ML, W);
      y -= b.type === 'heading' ? Math.max(4, st.size * 0.4) : Math.max(6, st.size * 0.9);
    } else if (b.type === 'list') {
      const items = b.items.map((s) => s.trim()).filter(Boolean); if (!items.length) continue;
      const st = resolveStyle(b, d), fk = fontKey(st.font, st.bold, st.italic), f = FONTS[fk], lead = st.size * st.lh;
      const marker = b.marker || 'disc', numbering = (MARKERS.find((m) => m[0] === marker) || MARKERS[0])[2];
      const L = addEl('L', root, { attrs: '/A << /O /List /ListNumbering /' + numbering + ' >>' });
      const IND = Math.max(st.size * 2, Math.max(...items.map((_, k) => measure(f, listLabel(marker, k), st.size))) + st.size);
      items.forEach((it, k) => {
        if (y - lead < MB) newPage();
        const LI = addEl('LI', L), Lbl = addEl('Lbl', LI), LB = addEl('LBody', LI);
        const id = mark(Lbl);
        emit('/Lbl <</MCID ' + id + '>> BDC\n' + show(fk, st.size, ML + 2, y - lead * 0.78, listLabel(marker, k), st.color) + 'EMC\n');
        flowText(b, LB, 'LBody', wrapText(f, it, st.size, W - IND), Object.assign({}, st, { align: 'left' }), ML + IND, W - IND);
        y -= st.size * 0.25;
      });
      y -= st.size * 0.7;
    } else if (b.type === 'image') {
      if (!b.data) continue;
      const maxH = (PH - MT - MB) * 0.7, pct = Math.min(100, Math.max(10, b.widthPct || 100)) / 100;
      const s = Math.min(W * pct / b.w, maxH / b.h);
      const w = b.w * s, h = b.h * s;
      if (!atTop()) y -= 4;
      if (y - h < MB) newPage();
      const x = ML + (W - w) * (b.align === 'center' ? 0.5 : b.align === 'right' ? 1 : 0);
      placeImage(b, x, y - h, w, h, pg, 0);
      y -= h + 8;
      if (b.showCaption && (b.caption || '').trim()) {
        const st = { font: d.font || DEFAULT_FONT, size: 9.5, bold: false, italic: false, color: GREY, align: b.align || 'left', lh: 1.35 };
        flowText({ id: b.id }, addEl('P', root), 'P', wrapText(FONTS[fontKey(st.font, false, false)], b.caption.trim(), 9.5, W), st, ML, W);
      }
      y -= 10;
    } else if (b.type === 'table') {
      const rows = b.rows; if (!rows.some((r) => r.some((c) => c.trim()))) continue;
      const fam = d.font || DEFAULT_FONT, SZ = b.size || 10, LD = SZ * 1.35, PAD = SZ * 0.5;
      const cols = rows[0].length, colW = W / cols;
      const isTH = (r, c) => (b.headerRow && r === 0) || (b.headerCol && c === 0);
      const fkOf = (r, c) => fontKey(fam, isTH(r, c), false);
      const cellLines = rows.map((row, r) => row.map((txt, c) => (txt.trim() ? wrapText(FONTS[fkOf(r, c)], txt.trim(), SZ, colW - 2 * PAD) : [])));
      const rowH = cellLines.map((cl) => Math.max(1, ...cl.map((l) => l.length)) * LD + 2 * PAD);
      if (!atTop()) y -= 4;
      const T = addEl('Table', root);
      const capLines = (b.caption || '').trim() ? wrapText(FONTS[fontKey(fam, true, false)], b.caption.trim(), SZ + 0.5, W) : [];
      if (y - capLines.length * (SZ + 5) - rowH[0] - (rowH[1] || 0) < MB && !atTop()) newPage();
      if (capLines.length) { flowText(b, addEl('Caption', T), 'Caption', capLines, { font: fam, size: SZ + 0.5, bold: true, italic: false, color: INK_HEX, align: 'left', lh: 1.4 }, ML, W); y -= 4; }
      const hline = (yy, wd, col) => artifact(wd + ' w ' + rgbOp(col) + ' RG ' + fnum(ML) + ' ' + fnum(yy) + ' m ' + fnum(ML + W) + ' ' + fnum(yy) + ' l S\n', 'Layout');
      const fill = (yTop, h, col, x0, w0) => artifact('q ' + rgbOp(col) + ' rg ' + fnum(x0) + ' ' + fnum(yTop - h) + ' ' + fnum(w0) + ' ' + fnum(h) + ' re f Q\n', 'Layout');
      hline(y, 1.2, RULE);
      const drawRow = (r, repeat) => {
        if (b.headerFill && b.headerRow && r === 0) fill(y, rowH[r], b.headerFill, ML, W);
        else if (b.stripes && r % 2 === (b.headerRow ? 0 : 1)) fill(y, rowH[r], '#F1F3F6', ML, W);
        if (b.headerFill && b.headerCol && !(b.headerRow && r === 0)) fill(y, rowH[r], b.headerFill, ML, colW);
        const TR = repeat ? null : addEl('TR', T);
        rows[r].forEach((txt, c) => {
          const th = isTH(r, c), x = ML + c * colW + PAD;
          let ops = '', base = y - PAD - LD * 0.78;
          for (const l of cellLines[r][c]) { ops += show(fkOf(r, c), SZ, x, base, l, INK_HEX); base -= LD; }
          if (repeat) { if (ops) artifact(ops, 'Pagination', 'Header'); return; }
          const cell = addEl(th ? 'TH' : 'TD', TR, th ? { attrs: '/A << /O /Table /Scope /' + ((b.headerRow && r === 0) ? 'Column' : 'Row') + ' >>' } : {});
          if (ops) { const id = mark(cell); emit('/' + cell.S + ' <</MCID ' + id + '>> BDC\n' + ops + 'EMC\n'); }
        });
        rect(b, pg, ML, y - rowH[r], ML + W, y, 'text', { color: INK_HEX, size: SZ, bold: false, table: true });
        y -= rowH[r];
        const hdr = b.headerRow && r === 0;
        hline(y, hdr ? 0.9 : 0.5, hdr ? RULE : SOFT);
      };
      for (let r = 0; r < rows.length; r++) {
        if (y - rowH[r] < MB) { newPage(); hline(y, 1.2, RULE); if (b.headerRow && r > 0 && b.repeatHeader !== false) drawRow(0, true); }
        drawRow(r, false);
      }
      hline(y, 1.2, RULE);
      y -= 14;
    } else if (b.type === 'pagebreak') {
      if (!atTop()) newPage();
    }
  }
  while (pages.length > 1) { const last = pages[pages.length - 1]; if (last.flow.length || last.layers.length) break; pages.pop(); }
  const N = pages.length;
  const footKey = fontKey(d.font || DEFAULT_FONT, false, false);
  pages.forEach((p, i) => {
    const label = 'Page ' + (i + 1) + ' of ' + N;
    artifact(show(footKey, 9, (PW - measure(FONTS[footKey], label, 9)) / 2, 36, label, GREY), 'Pagination', 'Footer', p, 0);
  });
  if (opts.layoutOnly) return { rects, pages: N, PW, PH };

  /* serialise */
  const objs = [];
  const alloc = () => { objs.push(null); return objs.length; };
  const put = (n, v) => { objs[n - 1] = v; };
  const stream = (extra, bytes, z) => ({ dict: '<< /Length ' + bytes.length + (z ? ' /Filter /FlateDecode' : '') + (extra ? ' ' + extra : '') + ' >>', bytes });
  const CAT = alloc(), PAGES = alloc(), STR = alloc(), PT = alloc(), META = alloc(), INFO = alloc();
  const fontNums = new Map();
  for (const k of used.keys()) fontNums.set(k, { t0: alloc(), cid: alloc(), fd: alloc(), ff: alloc(), tu: alloc() });
  const imgNums = images.map(() => alloc());
  const pageNums = pages.map(() => ({ page: alloc(), content: alloc() }));
  const walk = (e) => { e.num = alloc(); e.kids.forEach((k) => { if (k.S) walk(k); }); };
  walk(root);

  let OUT = null;
  if (outline.length) {
    OUT = alloc();
    const top = { level: 0, kids: [], num: OUT }, stack = [top];
    for (const it of outline) {
      while (stack[stack.length - 1].level >= it.level) stack.pop();
      const parent = stack[stack.length - 1];
      it.kids = []; it.parent = parent; it.num = alloc(); parent.kids.push(it); stack.push(it);
    }
    const ser = (it) => {
      const sib = it.parent.kids, i = sib.indexOf(it);
      let s = '<< /Title ' + pdfText(it.title) + ' /Parent ' + it.parent.num + ' 0 R';
      if (i > 0) s += ' /Prev ' + sib[i - 1].num + ' 0 R';
      if (i < sib.length - 1) s += ' /Next ' + sib[i + 1].num + ' 0 R';
      if (it.kids.length) s += ' /First ' + it.kids[0].num + ' 0 R /Last ' + it.kids[it.kids.length - 1].num + ' 0 R /Count ' + it.kids.length;
      s += ' /Dest [' + pageNums[Math.min(it.page.index, pages.length - 1)].page + ' 0 R /XYZ null ' + fnum(Math.min(PH, it.y)) + ' null] >>';
      put(it.num, s); it.kids.forEach(ser);
    };
    top.kids.forEach(ser);
    put(OUT, '<< /Type /Outlines /First ' + top.kids[0].num + ' 0 R /Last ' + top.kids[top.kids.length - 1].num + ' 0 R /Count ' + outline.length + ' >>');
  }
  const serEl = (e) => {
    const parentRef = e.parent ? e.parent.num + ' 0 R' : STR + ' 0 R';
    const kids = e.kids.map((k) => (k.S ? k.num + ' 0 R' : (k.page === e.pg ? String(k.mcid) : '<< /Type /MCR /Pg ' + pageNums[k.page.index].page + ' 0 R /MCID ' + k.mcid + ' >>'))).join(' ');
    let s = '<< /Type /StructElem /S /' + e.S + ' /P ' + parentRef;
    if (e.pg) s += ' /Pg ' + pageNums[e.pg.index].page + ' 0 R';
    s += ' /K [' + kids + ']';
    if (e.alt) s += ' /Alt ' + pdfText(e.alt);
    if (e.attrs) s += ' ' + e.attrs;
    put(e.num, s + ' >>');
    e.kids.forEach((k) => { if (k.S) serEl(k); });
  };
  serEl(root);
  put(STR, '<< /Type /StructTreeRoot /K [' + root.num + ' 0 R] /ParentTree ' + PT + ' 0 R /ParentTreeNextKey ' + pages.length + ' >>');
  put(PT, '<< /Nums [' + pages.map((p, i) => i + ' [' + p.parents.map((e) => e.num + ' 0 R').join(' ') + ']').join(' ') + '] >>');

  const keyList = Object.keys(FONTS);
  for (const [k, n] of fontNums) {
    const f = FONTS[k], bold = /B/.test(k.split('-')[1]);
    const ix = keyList.indexOf(k);
    const name = 'AP' + [3, 2, 1, 0].map((p) => String.fromCharCode(65 + Math.floor(ix / Math.pow(26, p)) % 26)).join('') + '+' + f.psName;
    const map = used.get(k), gids = [...map.keys()].sort((a, b) => a - b);
    put(n.t0, '<< /Type /Font /Subtype /Type0 /BaseFont /' + name + ' /Encoding /Identity-H /DescendantFonts [' + n.cid + ' 0 R] /ToUnicode ' + n.tu + ' 0 R >>');
    put(n.cid, '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /' + name + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + n.fd + ' 0 R /DW 1000 /W [' + gids.map((g) => g + ' [' + f.widths[g] + ']').join(' ') + '] /CIDToGIDMap /Identity >>');
    put(n.fd, '<< /Type /FontDescriptor /FontName /' + name + ' /Flags ' + (32 + (f.italicAngle ? 64 : 0)) + ' /FontBBox [' + f.bbox.join(' ') + '] /ItalicAngle ' + (f.italicAngle || 0) + ' /Ascent ' + f.ascent + ' /Descent ' + f.descent + ' /CapHeight ' + f.capHeight + ' /StemV ' + (bold ? 140 : 80) + ' /FontWeight ' + (bold ? 700 : 400) + ' /FontFile2 ' + n.ff + ' 0 R >>');
    const raw = b64bytes(f.ttf), zf = await deflate(raw);
    put(n.ff, stream('/Length1 ' + raw.length, zf || raw, !!zf));
    let cm = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let i = 0; i < gids.length; i += 100) {
      const part = gids.slice(i, i + 100);
      cm += part.length + ' beginbfchar\n' + part.map((g) => '<' + hex4(g) + '> <' + hex4(map.get(g)) + '>').join('\n') + '\nendbfchar\n';
    }
    cm += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
    const cmb = latin1(cm), zc = await deflate(cmb);
    put(n.tu, stream('', zc || cmb, !!zc));
  }
  images.forEach((im, i) => put(imgNums[i], stream('/Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', im.bytes, false)));

  const fontRes = [...fontNums].map(([k, n]) => '/' + resNames.get(k) + ' ' + n.t0 + ' 0 R').join(' ');
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i], n = pageNums[i];
    const ordered = p.layers.map((l, k) => ({ l, k })).sort((a, b) => a.l.z - b.l.z || a.k - b.k).map((x) => x.l);
    const ops = ordered.filter((l) => l.z < 0).map((l) => l.ops).join('') + p.flow.join('') + ordered.filter((l) => l.z > 0).map((l) => l.ops).join('');
    const raw = latin1(ops), z = await deflate(raw);
    put(n.content, stream('', z || raw, !!z));
    const xo = p.xobjs.length ? ' /XObject << ' + p.xobjs.map((nm) => '/' + nm + ' ' + imgNums[+nm.slice(2)] + ' 0 R').join(' ') + ' >>' : '';
    put(n.page, '<< /Type /Page /Parent ' + PAGES + ' 0 R /MediaBox [0 0 ' + fnum(PW) + ' ' + fnum(PH) + '] /Resources << /Font << ' + fontRes + ' >>' + xo + ' >> /Contents ' + n.content + ' 0 R /StructParents ' + i + ' /Tabs /S >>');
  }
  put(PAGES, '<< /Type /Pages /Kids [' + pageNums.map((n) => n.page + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>');

  const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const pdfDate = 'D:' + iso.replace(/[-:T]/g, '').replace('Z', '') + 'Z';
  const producer = 'PDF Wire (test build 6)';
  const xmp = '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">\n' +
    '<dc:format>application/pdf</dc:format>\n<dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + xmlEsc(d.title) + '</rdf:li></rdf:Alt></dc:title>\n' +
    (d.author ? '<dc:creator><rdf:Seq><rdf:li>' + xmlEsc(d.author) + '</rdf:li></rdf:Seq></dc:creator>\n' : '') +
    '<dc:language><rdf:Bag><rdf:li>' + xmlEsc(d.lang) + '</rdf:li></rdf:Bag></dc:language>\n' +
    '<pdf:Producer>' + producer + '</pdf:Producer>\n<xmp:CreatorTool>' + producer + '</xmp:CreatorTool>\n' +
    '<xmp:CreateDate>' + iso + '</xmp:CreateDate>\n<xmp:ModifyDate>' + iso + '</xmp:ModifyDate>\n<pdfuaid:part>1</pdfuaid:part>\n</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>';
  put(META, stream('/Type /Metadata /Subtype /XML', new TextEncoder().encode(xmp), false));
  put(INFO, '<< /Title ' + pdfText(d.title) + (d.author ? ' /Author ' + pdfText(d.author) : '') + ' /Producer ' + pdfText(producer) + ' /Creator ' + pdfText(producer) + ' /CreationDate (' + pdfDate + ') /ModDate (' + pdfDate + ') >>');
  put(CAT, '<< /Type /Catalog /Pages ' + PAGES + ' 0 R /StructTreeRoot ' + STR + ' 0 R /MarkInfo << /Marked true >> /Lang ' + pdfLiteral(d.lang) + ' /Metadata ' + META + ' 0 R /ViewerPreferences << /DisplayDocTitle true >>' + (OUT ? ' /Outlines ' + OUT + ' 0 R /PageMode /UseOutlines' : '') + ' >>');

  const chunks = []; let off = 0;
  const push = (u) => { chunks.push(u); off += u.length; };
  push(latin1('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'));
  const offsets = [];
  objs.forEach((o, i) => {
    if (o == null) throw new Error('Internal error: object ' + (i + 1) + ' was not written.');
    offsets[i] = off;
    push(latin1((i + 1) + ' 0 obj\n'));
    if (typeof o === 'string') push(latin1(o)); else { push(latin1(o.dict + '\nstream\n')); push(o.bytes); push(latin1('\nendstream')); }
    push(latin1('\nendobj\n'));
  });
  const xref = off;
  let x = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offsets.forEach((o) => { x += String(o).padStart(10, '0') + ' 00000 n \n'; });
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) => v.toString(16).padStart(2, '0')).join('');
  x += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + CAT + ' 0 R /Info ' + INFO + ' 0 R /ID [<' + id + '> <' + id + '>] >>\nstartxref\n' + xref + '\n%%EOF\n';
  push(latin1(x));
  const out = new Uint8Array(off);
  let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return { bytes: out, pages: N, rects, PW, PH };
}

