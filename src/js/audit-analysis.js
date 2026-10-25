/* ---------- analysis ---------- */
async function auditPdf(pdf, cancelled, progress) {
  const A = { pages: [], nodes: new Map(), ordered: [], doc: null };
  const meta = await pdf.getMetadata().catch(() => ({}));
  const info = (meta && meta.info) || {};
  const xmp = meta && meta.metadata;
  const xget = (k) => { try { const v = xmp ? xmp.get(k) : null; return v == null ? '' : String(v).trim(); } catch (e) { return ''; } };
  const markInfo = await pdf.getMarkInfo().catch(() => null);
  let viewerPrefs;
  if (typeof pdf.getViewerPreferences === 'function') viewerPrefs = await pdf.getViewerPreferences().catch(() => null);
  A.doc = {
    infoTitle: (info.Title || '').trim(), xmpTitle: xget('dc:title'), hasXmp: !!xmp,
    lang: (info.Language || '').trim(), marked: !!(markInfo && markInfo.Marked), viewerPrefs,
    uaPart: xget('pdfuaid:part'), version: info.PDFFormatVersion || '', pages: pdf.numPages
  };
  for (let i = 0; i < pdf.numPages; i++) {
    if (cancelled && cancelled()) return null;
    A.pages.push(await analysePage(pdf, i, A));
    if (progress && pdf.numPages > 8 && i % 5 === 4) progress(i + 1, pdf.numPages);
  }
  A.doc.tagged = A.doc.marked && A.pages.some((p) => p.roots.length);
  const walk = (n) => { A.ordered.push(n); n.kids.forEach(walk); };
  A.pages.forEach((p) => p.roots.forEach(walk));
  return A;
}

async function analysePage(pdf, i, A) {
  const proxy = await pdf.getPage(i + 1);
  const [tree, tc, ol, annots] = await Promise.all([
    proxy.getStructTree().catch(() => null),
    proxy.getTextContent({ includeMarkedContent: true }).catch(() => ({ items: [] })),
    proxy.getOperatorList().catch(() => ({ fnArray: [], argsArray: [] })),
    proxy.getAnnotations().catch(() => [])
  ]);
  const page = { index: i, proxy, roots: [], boxes: new Map(), texts: new Map(), marked: new Set(),
    refMcids: new Set(), refObjs: new Set(), untagged: [], links: [] };
  const addBox = (m, r) => { const b = page.boxes.get(m); page.boxes.set(m, b ? union(b, r) : r); };

  // text: boxes and text per marked-content id, untagged text
  const stack = [];
  for (const it of tc.items) {
    if (it.type === 'beginMarkedContentProps' || it.type === 'beginMarkedContent') {
      const m = it.type === 'beginMarkedContentProps' ? mcidOf(it.id) : null;
      stack.push({ tag: it.tag, mcid: m });
      if (m != null) page.marked.add(m);
      continue;
    }
    if (it.type === 'endMarkedContent') { stack.pop(); continue; }
    if (typeof it.str !== 'string' || !it.str.trim()) continue;
    if (stack.some((s) => s.tag === 'Artifact')) continue;
    const t = it.transform;
    const h = it.height || Math.hypot(t[2], t[3]) || 10;
    const r = [t[4], t[5] - h * 0.22, t[4] + (it.width || h * 0.5 * it.str.length), t[5] + h * 0.88];
    let cur = null;
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k].mcid != null) { cur = stack[k]; break; }
    if (!cur) { page.untagged.push({ kind: 'text', str: it.str, rect: r }); continue; }
    addBox(cur.mcid, r);
    const prev = page.texts.get(cur.mcid);
    page.texts.set(cur.mcid, prev ? prev + ' ' + it.str : it.str);
  }

  // images: position from the operator list
  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack = [], ms = [];
  for (let k = 0; k < ol.fnArray.length; k++) {
    const fn = ol.fnArray[k], args = ol.argsArray[k];
    if (fn === OPS.save) ctmStack.push(ctm);
    else if (fn === OPS.restore) ctm = ctmStack.pop() || ctm;
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { ctmStack.push(ctm); if (args && Array.isArray(args[0])) ctm = Util.transform(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = ctmStack.pop() || ctm;
    else if (fn === OPS.beginMarkedContentProps) ms.push({ tag: tagName(args && args[0]), mcid: args && typeof args[1] === 'number' ? args[1] : null });
    else if (fn === OPS.beginMarkedContent) ms.push({ tag: tagName(args && args[0]), mcid: null });
    else if (fn === OPS.endMarkedContent) ms.pop();
    else if (IMAGE_OPS.has(fn)) {
      if (ms.some((s) => s.tag === 'Artifact')) continue;
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map((p) => Util.applyTransform(p, ctm));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const r = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      let cur = null;
      for (let j = ms.length - 1; j >= 0; j--) if (ms[j].mcid != null) { cur = ms[j]; break; }
      if (cur) { addBox(cur.mcid, r); page.marked.add(cur.mcid); }
      else page.untagged.push({ kind: 'image', str: '[image]', rect: r });
    }
  }

  // links
  for (const a of annots || []) {
    if (a.subtype !== 'Link') continue;
    page.links.push({ id: a.id, rect: a.rect, url: a.url || a.unsafeUrl || '',
      contents: ((a.contentsObj && a.contentsObj.str) || a.contents || '').trim() });
  }

  // tag tree
  const walk = (raw, parent) => {
    const node = { uid: 'n' + (++uidSeq), role: raw.role || '?', alt: (raw.alt || '').trim(), lang: raw.lang || '',
      page: i, parent, kids: [], seq: [], mcids: [], objs: [], order: null };
    for (const ch of raw.children || []) {
      if (ch.type === 'content') { const m = mcidOf(ch.id); if (m != null) { node.mcids.push(m); page.refMcids.add(m); node.seq.push({ m }); } }
      else if (ch.type === 'object') { node.objs.push(ch.id); page.refObjs.add(ch.id); }
      else if (ch.role) { const c = walk(ch, node); node.kids.push(c); node.seq.push({ n: c }); }
    }
    A.nodes.set(node.uid, node);
    return node;
  };
  if (tree && Array.isArray(tree.children)) page.roots = tree.children.filter((c) => c && c.role).map((c) => walk(c, null));

  // boxes, text and reading order
  const finish = (n) => {
    let box = null; const parts = [];
    for (const s of n.seq) {
      if (s.m != null) { const b = page.boxes.get(s.m); if (b) box = box ? union(box, b) : b; const t = page.texts.get(s.m); if (t) parts.push(t); }
      else { finish(s.n); if (s.n.box) box = box ? union(box, s.n.box) : s.n.box; if (s.n.text) parts.push(s.n.text); }
    }
    n.box = box; n.text = parts.join(' ').replace(/\s+/g, ' ').trim();
  };
  page.roots.forEach(finish);
  let ord = 0;
  const number = (n, inside) => {
    let numbered = inside;
    if (!inside && !CONTAINERS.has(n.role) && (BLOCKS.has(n.role) || n.mcids.length)) { n.order = ++ord; numbered = true; }
    n.kids.forEach((k) => number(k, numbered));
  };
  page.roots.forEach((r) => number(r, false));
  page.orderCount = ord;
  return page;
}

