/* ---------- Pages view: real page preview ---------- */
function setView(v, quiet) {
  author.view = v;
  $('#viewWrite').setAttribute('aria-pressed', v === 'write' ? 'true' : 'false');
  $('#viewPages').setAttribute('aria-pressed', v === 'pages' ? 'true' : 'false');
  $('#writeView').hidden = v !== 'write';
  $('#pagesView').hidden = v !== 'pages';
  if (v === 'pages') { schedulePreview(0); if (!quiet) announce('Pages view: a preview of the exported pages.'); }
  else if (!quiet) { announce('Write view.'); document.querySelectorAll('#edSheet textarea.tx').forEach(autosize); }
}
let previewTimer, previewSeq = 0;
function schedulePreview(delay) { if (author.view !== 'pages' || !author.doc) return; clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, delay == null ? 400 : delay); }
async function renderPreview() {
  const seq = ++previewSeq, host = $('#pagesView');
  let out, pdf;
  try { out = await buildPdf(author.doc); pdf = await pdfjsLib.getDocument({ data: out.bytes, isEvalSupported: false }).promise; }
  catch (e) { console.error(e); host.replaceChildren(el('p', { class: 'alert', role: 'alert' }, 'The page preview could not be drawn: ' + (e.message || e))); return; }
  const avail = Math.max(300, $('#main').clientWidth - 64);
  const scale = Math.min(1.4, avail / out.PW);
  const frag = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1), vp = page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;
    const canvas = el('canvas', { 'aria-hidden': 'true' });
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    if (seq !== previewSeq) { pdf.destroy(); return; }
    const ov = el('div', { class: 'pv-ov' });
    const groups = new Map();
    for (const r of out.rects.filter((x) => x.page === i)) {
      const g = groups.get(r.blockId); groups.set(r.blockId, g ? { ...g, x0: Math.min(g.x0, r.x0), y0: Math.min(g.y0, r.y0), x1: Math.max(g.x1, r.x1), y1: Math.max(g.y1, r.y1) } : { ...r });
    }
    for (const g of groups.values()) {
      const b = findBlock(g.blockId); if (!b) continue;
      ov.append(previewBox(b, g, scale, out.PH));
    }
    frag.push(el('section', { class: 'pv-page', 'aria-label': 'Page ' + (i + 1) + ' of ' + pdf.numPages },
      el('h3', { class: 'pv-label' }, 'Page ' + (i + 1)),
      el('div', { class: 'pv-sheet', style: 'width:' + vp.width + 'px;height:' + vp.height + 'px' }, canvas, ov)));
  }
  pdf.destroy();
  if (seq !== previewSeq) return;
  const scroller = $('#main'), keep = scroller.scrollTop;
  host.replaceChildren(el('p', { class: 'small muted pv-help' }, 'This is the exported layout. Select any item to see its properties; switch to Write to edit the text.'), ...frag);
  scroller.scrollTop = keep;
}
function previewBox(b, g, scale, PH) {
  const fs = author.findings.filter((f) => f.blockId === b.id);
  const sev = fs.some((f) => f.severity === 'error') ? 'error' : fs.length ? 'warning' : '';
  const label = blockName(b) + ': ' + clip(blockLabel(b), 60) + (fs.length ? '. ' + plural(fs.length, 'issue') + ': ' + fs[0].title : '');
  const box = el('button', { type: 'button', class: 'pvbox' + (author.sel === b.id ? ' sel' : '') + (sev ? ' ' + sev : ''), 'data-id': b.id, 'aria-label': label,
    style: 'left:' + (g.x0 * scale - 2) + 'px;top:' + ((PH - g.y1) * scale - 2) + 'px;width:' + ((g.x1 - g.x0) * scale + 4) + 'px;height:' + ((g.y1 - g.y0) * scale + 4) + 'px' },
    el('span', { class: 'pvtag', 'aria-hidden': 'true' }, blockTag(b)));
  box.addEventListener('focus', () => selectBlock(b.id));
  box.addEventListener('click', () => selectBlock(b.id));
  return box;
}

