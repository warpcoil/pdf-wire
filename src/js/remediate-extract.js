/* ---------- remediation: reading an existing PDF ----------
   Collects what the layout analysis needs from every page: text runs with
   position, size and weight; images; ruling lines and filled boxes; links and
   other annotations; and any alternative text an existing tag tree holds.
   Coordinates are PDF points with the origin at the page's bottom-left corner. */

const fill = (host, ...kids) => host.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
const LIGATURES = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };
const cleanStr = (s) => String(s).replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c]).replace(/­/g, '').replace(/[   ]/g, ' ');
const PAINT_OPS = new Set();
if (pdfjsLib) ['stroke', 'closeStroke', 'fill', 'eoFill', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke', 'endPath']
  .forEach((k) => { if (OPS[k] != null) PAINT_OPS.add(OPS[k]); });

async function extractPdf(pdf, opts) {
  opts = opts || {};
  const X = { numPages: pdf.numPages, pages: [], meta: {} };
  const meta = await pdf.getMetadata().catch(() => ({}));
  const info = (meta && meta.info) || {};
  let xmpTitle = '';
  try { xmpTitle = meta && meta.metadata ? String(meta.metadata.get('dc:title') || '').trim() : ''; } catch (e) { /* no XMP */ }
  const markInfo = await pdf.getMarkInfo().catch(() => null);
  X.meta = { title: xmpTitle || String(info.Title || '').trim(), lang: String(info.Language || '').trim(), author: String(info.Author || '').trim(),
    marked: !!(markInfo && markInfo.Marked), encrypted: !!info.IsEncrypted };
  for (let i = 0; i < pdf.numPages; i++) {
    if (opts.cancelled && opts.cancelled()) return null;
    if (opts.progress) opts.progress(i + 1, pdf.numPages);
    X.pages.push(await extractPage(pdf, i, opts));
  }
  X.meta.tagged = X.pages.some((p) => p.hadTags);
  X.fontsMissing = [...new Set(X.pages.flatMap((p) => [...p.fontsMissing]))];
  return X;
}

async function extractPage(pdf, i, opts) {
  const proxy = await pdf.getPage(i + 1);
  const view = proxy.view, ox = view[0], oy = view[1];
  const W = view[2] - view[0], H = view[3] - view[1];
  const ol = await proxy.getOperatorList().catch(() => ({ fnArray: [], argsArray: [] }));
  const [tc, tree, annots] = await Promise.all([
    proxy.getTextContent({ includeMarkedContent: true }).catch(() => ({ items: [], styles: {} })),
    proxy.getStructTree().catch(() => null),
    proxy.getAnnotations().catch(() => [])
  ]);
  const P = { index: i, w: W, h: H, rotate: proxy.rotate || 0, proxy, items: [], images: [], segs: [], fills: [], paths: [],
    links: [], otherAnnots: [], widgets: 0, hadTags: !!(tree && tree.children && tree.children.length), altByMcid: new Map(), rotatedText: 0, fontsMissing: new Set() };
  const pick = (stack) => {               // the marked-content id an item belongs to
    if (opts.outerMcid) { for (const s of stack) if (s.mcid != null) return s.mcid; return null; }
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k].mcid != null) return stack[k].mcid;
    return null;
  };
  const fontInfo = new Map();
  const fontOf = (name) => {
    if (fontInfo.has(name)) return fontInfo.get(name);
    let f = null;
    try { if (proxy.commonObjs.has(name)) f = proxy.commonObjs.get(name); } catch (e) { f = null; }
    const nm = (f && f.name) || '';
    const r = { name: nm.replace(/^[A-Z]{6}\+/, ''),
      bold: !!(f && (f.bold || f.black)) || /bold|black|heavy|semibold|demi/i.test(nm),
      italic: !!(f && f.italic) || /italic|oblique/i.test(nm), missing: !!(f && f.missingFile) };
    if (r.missing) P.fontsMissing.add(r.name || name);
    fontInfo.set(name, r);
    return r;
  };

  // text
  const stack = [];
  let seq = 0;
  for (const it of tc.items) {
    if (it.type === 'beginMarkedContentProps' || it.type === 'beginMarkedContent') {
      stack.push({ tag: it.tag, mcid: it.type === 'beginMarkedContentProps' ? mcidOf(it.id) : null });
      continue;
    }
    if (it.type === 'endMarkedContent') { stack.pop(); continue; }
    if (typeof it.str !== 'string') continue;
    const str = cleanStr(it.str);
    if (!str.trim()) continue;
    const t = it.transform;
    const size = Math.hypot(t[2], t[3]) || it.height || 10;
    if (Math.abs(t[1]) > 0.01 * size || Math.abs(t[2]) > 0.01 * size || t[0] < 0) { P.rotatedText++; }
    const f = fontOf(it.fontName);
    P.items.push({ id: i + ':' + (seq++), str, x: t[4] - ox, y: t[5] - oy, w: it.width || size * 0.5 * str.length, size,
      bold: f.bold, italic: f.italic, font: f.name, mcid: pick(stack),
      artifact: stack.some((s) => s.tag === 'Artifact'), rotated: Math.abs(t[1]) > 0.01 * size || Math.abs(t[2]) > 0.01 * size || t[0] < 0 });
  }

  // images, lines, boxes
  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack = [], ms = [];
  let path = [];
  const pt = (x, y) => { const p = Util.applyTransform([x, y], ctm); return [p[0] - ox, p[1] - oy]; };
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
    else if (fn === OPS.constructPath) {
      const sub = args[0] || [], co = args[1] || [];
      let c = 0, cur = null, start = null;
      for (const op of sub) {
        if (op === OPS.rectangle) {
          const [x, y, w, h] = co.slice(c, c + 4); c += 4;
          const a = pt(x, y), b = pt(x + w, y), d = pt(x + w, y + h), e = pt(x, y + h);
          path.push({ rect: [Math.min(a[0], b[0], d[0], e[0]), Math.min(a[1], b[1], d[1], e[1]), Math.max(a[0], b[0], d[0], e[0]), Math.max(a[1], b[1], d[1], e[1])] });
          cur = start = a;
        } else if (op === OPS.moveTo) { cur = start = pt(co[c], co[c + 1]); c += 2; }
        else if (op === OPS.lineTo) { const p = pt(co[c], co[c + 1]); c += 2; if (cur) path.push({ line: [cur, p] }); cur = p; }
        else if (op === OPS.curveTo) { const p = pt(co[c + 4], co[c + 5]); c += 6; path.push({ curve: [cur, p] }); cur = p; }
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) { const p = pt(co[c + 2], co[c + 3]); c += 4; path.push({ curve: [cur, p] }); cur = p; }
        else if (op === OPS.closePath) { if (cur && start) path.push({ line: [cur, start] }); cur = start; }
      }
    } else if (PAINT_OPS.has(fn)) {
      const painted = fn !== OPS.endPath;
      const stroked = fn !== OPS.fill && fn !== OPS.eoFill && fn !== OPS.endPath;
      const mcid = (() => { if (opts.outerMcid) { for (const s of ms) if (s.mcid != null) return s.mcid; return null; } for (let j = ms.length - 1; j >= 0; j--) if (ms[j].mcid != null) return ms[j].mcid; return null; })();
      if (painted && path.length) {
        let bb = null;
        for (const s of path) {
          const ps = s.rect ? null : (s.line || s.curve).filter(Boolean);
          const r = s.rect || [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))];
          bb = bb ? union(bb, r) : r;
          if (s.rect) {
            const w = r[2] - r[0], h = r[3] - r[1];
            if (h <= 2.5 && w > 2) P.segs.push({ o: 'h', y: (r[1] + r[3]) / 2, a: r[0], b: r[2] });
            else if (w <= 2.5 && h > 2) P.segs.push({ o: 'v', x: (r[0] + r[2]) / 2, a: r[1], b: r[3] });
            else if (stroked) {
              P.segs.push({ o: 'h', y: r[1], a: r[0], b: r[2] }, { o: 'h', y: r[3], a: r[0], b: r[2] },
                { o: 'v', x: r[0], a: r[1], b: r[3] }, { o: 'v', x: r[2], a: r[1], b: r[3] });
            } else P.fills.push(r);
          } else if (s.line && stroked) {
            const [[x0, y0], [x1, y1]] = s.line;
            if (Math.abs(y1 - y0) < 1 && Math.abs(x1 - x0) > 2) P.segs.push({ o: 'h', y: (y0 + y1) / 2, a: Math.min(x0, x1), b: Math.max(x0, x1) });
            else if (Math.abs(x1 - x0) < 1 && Math.abs(y1 - y0) > 2) P.segs.push({ o: 'v', x: (x0 + x1) / 2, a: Math.min(y0, y1), b: Math.max(y0, y1) });
          }
        }
        if (bb) P.paths.push({ rect: bb, mcid, artifact: ms.some((s) => s.tag === 'Artifact') });
      }
      path = [];
    } else if (IMAGE_OPS.has(fn)) {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map((p) => pt(p[0], p[1]));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const r = [Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys)), Math.min(W, Math.max(...xs)), Math.min(H, Math.max(...ys))];
      if (r[2] - r[0] < 1 || r[3] - r[1] < 1) continue;
      let mcid = null;
      if (opts.outerMcid) { for (const s of ms) if (s.mcid != null) { mcid = s.mcid; break; } }
      else for (let j = ms.length - 1; j >= 0; j--) if (ms[j].mcid != null) { mcid = ms[j].mcid; break; }
      P.images.push({ id: i + ':img' + P.images.length, rect: r, mcid, artifact: ms.some((s) => s.tag === 'Artifact'), mask: fn === OPS.paintImageMaskXObject || fn === OPS.paintSolidColorImageMask });
    }
  }

  // annotations
  for (const a of annots || []) {
    const r = a.rect ? [a.rect[0] - ox, a.rect[1] - oy, a.rect[2] - ox, a.rect[3] - oy] : null;
    if (a.subtype === 'Link') P.links.push({ id: a.id, rect: r, url: a.url || a.unsafeUrl || '', contents: ((a.contentsObj && a.contentsObj.str) || '').trim() });
    else if (a.subtype === 'Widget') P.widgets++;
    else if (a.subtype !== 'Popup') P.otherAnnots.push({ id: a.id, subtype: a.subtype, rect: r, contents: ((a.contentsObj && a.contentsObj.str) || '').trim() });
  }

  // alternative text an existing tag tree already holds
  const walk = (n) => {
    if (!n || !n.children) return;
    if (n.role === 'Figure' && n.alt) for (const ch of n.children) if (ch.type === 'content') { const m = mcidOf(ch.id); if (m != null) P.altByMcid.set(m, String(n.alt).trim()); }
    n.children.forEach(walk);
  };
  if (tree) walk(tree);
  return P;
}

/* Renders a page to a canvas at the given scale (points to pixels). */
async function renderPageCanvas(proxy, scale) {
  const vp = proxy.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
  await proxy.render({ canvasContext: ctx, viewport: vp }).promise;
  return { canvas: c, vp };
}
/* Cuts a region (PDF points) out of a rendered page and returns it as JPEG. */
function cropRegion(rendered, page, rect, maxPx) {
  const { canvas, vp } = rendered;
  const v = vp.convertToViewportRectangle([rect[0] + page.proxy.view[0], rect[1] + page.proxy.view[1], rect[2] + page.proxy.view[0], rect[3] + page.proxy.view[1]]);
  const x = Math.max(0, Math.floor(Math.min(v[0], v[2]))), y = Math.max(0, Math.floor(Math.min(v[1], v[3])));
  const w = Math.min(canvas.width - x, Math.ceil(Math.abs(v[2] - v[0]))), h = Math.min(canvas.height - y, Math.ceil(Math.abs(v[3] - v[1])));
  if (w < 1 || h < 1) return null;
  const s = Math.min(1, (maxPx || 2000) / Math.max(w, h));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * s)); out.height = Math.max(1, Math.round(h * s));
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
  return { data: out.toDataURL('image/jpeg', 0.88).split(',')[1], w: out.width, h: out.height };
}
