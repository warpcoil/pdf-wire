/* ---------- Write view: selecting several blocks, combining, toolbar, drag and drop ----------
   Ctrl-click (Cmd-click) adds or removes a block; Shift-click selects a range.
   Combine joins the text of the selected headings, paragraphs and lists into
   one block. Images and tables between them aren't text, so they stay where they
   are, after the combined block. Everything here also works from the keyboard
   through the toolbar and the Combine dialog; dragging is a shortcut. */

author.multi = new Set();
const isTexty = (b) => !!b && TEXTY(b);
function selectedIds() {
  if (!author.doc) return [];
  const ids = new Set(author.multi);
  if (author.sel) ids.add(author.sel);
  return author.doc.blocks.filter((b) => ids.has(b.id)).map((b) => b.id);
}
function clearMulti() { if (!author.multi.size) return; author.multi.clear(); refreshSelection(); }
function toggleMulti(id, range) {
  const d = author.doc;
  if (range && author.sel) {
    const a = blockIndex(author.sel), z = blockIndex(id);
    author.multi = new Set(d.blocks.slice(Math.min(a, z), Math.max(a, z) + 1).map((b) => b.id));
  } else {
    if (!author.multi.size && author.sel) author.multi.add(author.sel);
    if (author.multi.has(id)) author.multi.delete(id); else author.multi.add(id);
    if (author.multi.size === 1) { const only = [...author.multi][0]; author.multi.clear(); selectBlock(only); }
  }
  if (author.multi.size && !author.multi.has(author.sel)) author.sel = [...author.multi][0];
  refreshSelection();
  const n = author.multi.size;
  announce(n > 1 ? plural(n, 'block') + ' selected.' : 'One block selected.');
}
function refreshSelection() {
  document.querySelectorAll('#edSheet .blk').forEach((w) => w.classList.toggle('multi', author.multi.size > 1 && author.multi.has(w.dataset.id)));
  updateToolbar();
}

/* ---- toolbar ---- */
let tbFontFilled = false;
function updateToolbar() {
  if (!author.doc) return;
  const ids = selectedIds(), bs = ids.map(findBlock), texty = bs.filter(isTexty);
  const font = $('#tbFont'), size = $('#tbSize'), bold = $('#tbBold'), ital = $('#tbItalic');
  if (!tbFontFilled) { font.append(...fontOptions('', 'Document default').filter(Boolean)); tbFontFilled = true; }
  [font, size, bold, ital].forEach((c) => { c.disabled = !texty.length; });
  if (texty.length) {
    const st = resolveStyle(texty[0], author.doc), fonts = new Set(texty.map((b) => b.style.font || ''));
    font.value = fonts.size === 1 ? [...fonts][0] : '';
    size.value = String(st.size);
    bold.setAttribute('aria-pressed', st.bold ? 'true' : 'false');
    ital.setAttribute('aria-pressed', st.italic ? 'true' : 'false');
  } else { size.value = ''; bold.setAttribute('aria-pressed', 'false'); ital.setAttribute('aria-pressed', 'false'); }
  const i = blockIndex(author.sel), single = ids.length <= 1;
  $('#moveUpBtn').disabled = !single || i <= 0;
  $('#moveDownBtn').disabled = !single || i < 0 || i >= author.doc.blocks.length - 1;
  $('#deleteBtn').disabled = !ids.length;
  $('#combineBtn').disabled = !(texty.length >= 2 || (texty.length === 1 && author.doc.blocks.slice(i + 1).some(isTexty)));
  $('#selInfo').textContent = ids.length > 1 ? plural(ids.length, 'block') + ' selected' + (texty.length >= 2 ? '. Combine joins their text.' : '.') : 'Ctrl-click or Shift-click to select several blocks.';
  updateHistoryButtons();
}
function styleSelected(k, v) {
  const bs = selectedIds().map(findBlock).filter(isTexty);
  bs.forEach((b) => { if (v == null || v === '') delete b.style[k]; else b.style[k] = v; });
  changed('sheet'); renderProps(); updateToolbar();
}
$('#tbFont').addEventListener('change', (e) => { styleSelected('font', e.target.value || null); refocus('tbFont'); });
$('#tbSize').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) styleSelected('size', Math.min(72, Math.max(7, v))); refocus('tbSize'); });
$('#tbBold').addEventListener('click', () => { const on = $('#tbBold').getAttribute('aria-pressed') !== 'true'; styleSelected('bold', on); refocus('tbBold'); });
$('#tbItalic').addEventListener('click', () => { const on = $('#tbItalic').getAttribute('aria-pressed') !== 'true'; styleSelected('italic', on); refocus('tbItalic'); });
$('#moveUpBtn').addEventListener('click', () => { moveBlock(-1); refocus('moveUpBtn'); });
$('#moveDownBtn').addEventListener('click', () => { moveBlock(1); refocus('moveDownBtn'); });
$('#deleteBtn').addEventListener('click', () => {
  const ids = selectedIds();
  if (ids.length > 1) {
    if (!confirm('Delete ' + plural(ids.length, 'block') + '? You can undo this.')) return;
    author.doc.blocks = author.doc.blocks.filter((b) => !ids.includes(b.id));
    author.multi.clear(); author.sel = author.doc.blocks[0] ? author.doc.blocks[0].id : null;
    changed('all'); announce(plural(ids.length, 'block') + ' deleted.');
  } else if (ids.length) removeBlock(ids[0]);
});
$('#combineBtn').addEventListener('click', () => openCombine(selectedIds()));
$('#edSheet').addEventListener('keydown', (e) => { if (e.key === 'Escape' && author.multi.size) { clearMulti(); announce('Selection cleared.'); } });

/* ---- combining ---- */
const COMBINE_TYPES = [['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['h5', 'Heading 5'], ['h6', 'Heading 6'], ['p', 'Paragraph'], ['list', 'List']];
const typeKey = (b) => (b.type === 'heading' ? 'h' + b.level : b.type === 'list' ? 'list' : 'p');
const blockPieces = (b) => (b.type === 'list' ? b.items.map((s) => s.trim()).filter(Boolean) : [b.text.trim()].filter(Boolean));
function combinedText(bs, key) {
  const pieces = bs.flatMap(blockPieces);
  return key === 'list' ? pieces : joinLines(pieces.map((t) => ({ text: t })));
}
function doCombine(ids, key) {
  const d = author.doc;
  const bs = d.blocks.filter((b) => ids.includes(b.id) && isTexty(b));
  if (bs.length < 2) return false;
  const first = bs[0];
  key = key || typeKey(first);
  const out = combinedText(bs, key);
  if (key === 'list') {
    first.marker = first.type === 'list' ? first.marker : (bs.find((b) => b.type === 'list') || {}).marker || 'disc';
    first.type = 'list'; first.items = out; delete first.text; delete first.level;
  } else {
    if (first.type === 'list') { delete first.items; delete first.marker; }
    first.text = out;
    if (key === 'p') { first.type = 'paragraph'; delete first.level; } else { first.type = 'heading'; first.level = +key.slice(1); }
  }
  const srcs = bs.map((b) => b.src).filter(Boolean);
  if (srcs.length > 1 && srcs.every((s) => s.page === srcs[0].page)) first.src = { page: srcs[0].page, rect: srcs.reduce((r, s) => union(r, s.rect), srcs[0].rect.slice()) };
  const gone = new Set(bs.slice(1).map((b) => b.id));
  d.blocks = d.blocks.filter((b) => !gone.has(b.id));
  if (d.remediation) d.remediation.items.forEach((it) => { if (gone.has(it.blockId)) it.blockId = first.id; });
  author.multi.clear(); author.sel = first.id;
  changed('all', { focusId: first.id, caret: 'end' });
  announce('Combined ' + plural(bs.length, 'block') + ' into one ' + blockName(first).toLowerCase() + '. Undo is available.');
  return true;
}
/* The dialog: choose which blocks (when only one was selected) and what the result is. */
function openCombine(ids, opts) {
  const d = author.doc; if (!d) return;
  opts = opts || {};
  const chosen = new Set(ids.filter((id) => isTexty(findBlock(id))));
  let rows;
  if (chosen.size >= 2) {
    const a = blockIndex([...chosen][0]), z = Math.max(...[...chosen].map(blockIndex));
    rows = d.blocks.slice(a, z + 1);
  } else {
    const a = Math.max(0, blockIndex(author.sel));
    rows = []; let n = 0;
    for (const b of d.blocks.slice(a)) { rows.push(b); if (isTexty(b)) n++; if (n >= 7) break; }
    const next = rows.slice(1).find(isTexty);
    if (rows[0] && isTexty(rows[0])) chosen.add(rows[0].id);
    if (next) chosen.add(next.id);
  }
  const dlg = $('#combineDialog'), body = $('#combineBody'), foot = $('#combineFoot');
  let key = null;
  const draw = () => {
    const bs = d.blocks.filter((b) => chosen.has(b.id));
    if (!key || !COMBINE_TYPES.some((t) => t[0] === key)) key = bs[0] ? typeKey(bs[0]) : 'p';
    const keys = [...new Set([...bs.map(typeKey), 'p', 'list'])];
    const preview = bs.length >= 2 ? combinedText(bs, key) : null;
    fill(body,
      el('p', { style: 'margin:0' }, 'Choose the blocks to join. Their text becomes one block, in document order.'),
      el('ul', { class: 'combine-list' }, rows.map((b) => {
        if (!isTexty(b)) return el('li', { class: 'skip' }, chip(blockTag(b)), el('span', {}, clip(blockLabel(b), 70), el('span', { class: 'small', style: 'display:block' }, 'Not text, so it isn’t joined. It stays after the combined block.')));
        const cb = el('input', { type: 'checkbox', id: 'cmb-' + b.id, checked: chosen.has(b.id) ? true : null });
        cb.addEventListener('change', () => { if (cb.checked) chosen.add(b.id); else chosen.delete(b.id); draw(); refocus('cmb-' + b.id); });
        return el('li', {}, cb, el('label', { for: 'cmb-' + b.id, style: 'display:flex;gap:8px;align-items:center;flex:1;min-width:0' }, chip(blockTag(b)), el('span', {}, clip(blockLabel(b), 80))));
      })),
      el('fieldset', { class: 'fs' }, el('legend', {}, 'The combined block is a'),
        el('div', { class: 'fs inline', style: 'margin:0;flex-wrap:wrap' }, COMBINE_TYPES.filter((t) => keys.includes(t[0])).map(([k, label]) => {
          const r = el('input', { type: 'radio', name: 'cmbType', id: 'cmbT-' + k, checked: k === key ? true : null });
          r.addEventListener('change', () => { key = k; draw(); refocus('cmbT-' + k); });
          return el('label', { class: 'choice', style: 'min-width:140px' }, r, el('span', {}, el('b', {}, label)));
        }))),
      preview ? el('div', { class: 'combine-prev', role: 'status' }, el('strong', { style: 'display:block' }, 'Result'),
        Array.isArray(preview) ? el('ul', { style: 'margin:4px 0 0;padding-left:20px' }, preview.slice(0, 8).map((t) => el('li', {}, clip(t, 120)))) : el('span', {}, clip(preview, 300)))
        : el('p', { class: 'small muted' }, 'Select at least two text blocks.'));
    fill(foot, el('span', { class: 'push' }), el('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cancel'),
      el('button', { type: 'button', class: 'btn primary', id: 'cmbGo', disabled: bs.length < 2 ? true : null, onclick: () => { dlg.close(); (opts.onCombine || doCombine)([...chosen], key); } }, 'Combine'));
  };
  $('#combineTitle').textContent = 'Combine blocks';
  draw();
  dlg.showModal();
  const first = body.querySelector('input'); if (first) first.focus();
}
$('#combineClose').addEventListener('click', () => $('#combineDialog').close());

/* ---- drag and drop in the Write view ---- */
const DT_BLOCK = 'application/x-pwire-block', DT_INSERT = 'application/x-pwire-insert';
const drag = { id: null, kind: null };
let dropLine = null;
function dragKind(e) {
  const t = [...(e.dataTransfer && e.dataTransfer.types || [])];
  if (t.includes(DT_BLOCK)) return 'block';
  if (t.includes(DT_INSERT)) return 'insert';
  if (t.includes('Files')) {
    const items = [...(e.dataTransfer.items || [])];
    if (!items.length || items.every((i) => i.kind === 'file' && /^image\//.test(i.type))) return 'file';
  }
  return null;
}
function dropTarget(e, kind) {
  const sheet = $('#edSheet'), ws = [...sheet.querySelectorAll(':scope > .blk')];
  const y = e.clientY;
  const dragged = drag.kind === 'block' ? findBlock(drag.id) : null;
  for (let i = 0; i < ws.length; i++) {
    const r = ws[i].getBoundingClientRect();
    if (y < r.top) return { index: i, el: ws[i], before: true };
    if (y <= r.bottom) {
      const b = findBlock(ws[i].dataset.id);
      const mid = (y - r.top) / Math.max(1, r.height);
      if (kind === 'block' && dragged && b && b.id !== dragged.id && isTexty(b) && isTexty(dragged) && mid > 0.25 && mid < 0.75) return { combine: b.id, el: ws[i] };
      return mid < 0.5 ? { index: i, el: ws[i], before: true } : { index: i + 1, el: ws[i], before: false };
    }
  }
  return { index: ws.length, el: ws[ws.length - 1], before: false };
}
function clearDrop() {
  if (dropLine) { dropLine.remove(); dropLine = null; }
  document.querySelectorAll('#edSheet .dropcombine').forEach((w) => w.classList.remove('dropcombine'));
}
function showDrop(t, kind) {
  clearDrop();
  if (t.combine) { t.el.classList.add('dropcombine'); return; }
  const sheet = $('#edSheet');
  const top = !t.el ? 40 : t.before ? t.el.offsetTop - 3 : t.el.offsetTop + t.el.offsetHeight + 3;
  const what = kind === 'block' ? 'Move here' : kind === 'file' ? 'Drop to insert the image here' : 'Insert ' + (drag.insert === 'heading' ? 'a heading' : drag.insert === 'pagebreak' ? 'a page break' : drag.insert === 'image' ? 'an image' : 'a ' + drag.insert) + ' here';
  dropLine = el('div', { class: 'dropline', style: 'top:' + top + 'px', 'aria-hidden': 'true' }, el('span', {}, what));
  sheet.append(dropLine);
}
$('#edSheet').addEventListener('dragstart', (e) => {
  const g = e.target.closest && e.target.closest('.grip'); if (!g) return;
  const w = g.closest('.blk'); drag.id = w.dataset.id; drag.kind = 'block';
  e.dataTransfer.setData(DT_BLOCK, drag.id); e.dataTransfer.setData('text/plain', blockLabel(findBlock(drag.id)) || '');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setDragImage(w, 24, 16); } catch (err) { /* older browsers */ }
  requestAnimationFrame(() => w.classList.add('dragging'));
});
document.querySelectorAll('[data-drag-insert]').forEach((w) => w.addEventListener('dragstart', (e) => {
  drag.kind = 'insert'; drag.insert = w.dataset.dragInsert;
  e.dataTransfer.setData(DT_INSERT, drag.insert); e.dataTransfer.setData('text/plain', drag.insert);
  e.dataTransfer.effectAllowed = 'copy';
}));
document.addEventListener('dragend', () => { clearDrop(); document.querySelectorAll('.blk.dragging').forEach((w) => w.classList.remove('dragging')); drag.id = null; drag.kind = null; });
$('#edSheet').addEventListener('dragover', (e) => {
  if (state.mode !== 'author') return;
  const kind = dragKind(e); if (!kind) return;
  e.preventDefault(); e.stopPropagation();
  e.dataTransfer.dropEffect = kind === 'block' ? 'move' : 'copy';
  showDrop(dropTarget(e, kind), kind);
});
$('#edSheet').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !$('#edSheet').contains(e.relatedTarget)) clearDrop(); });
$('#edSheet').addEventListener('drop', async (e) => {
  const kind = dragKind(e); if (!kind || state.mode !== 'author') return;
  e.preventDefault(); e.stopPropagation();
  document.body.classList.remove('dropping');
  const t = dropTarget(e, kind); clearDrop();
  const blocks = author.doc.blocks;
  if (kind === 'block') {
    const b = findBlock(e.dataTransfer.getData(DT_BLOCK) || drag.id); if (!b) return;
    if (t.combine) {
      const pair = blocks.filter((x) => x.id === b.id || x.id === t.combine).map((x) => x.id);
      doCombine(pair, typeKey(findBlock(t.combine)));
      return;
    }
    let i = blockIndex(b.id), j = t.index;
    if (j === i || j === i + 1) return;
    blocks.splice(i, 1); if (j > i) j--; blocks.splice(j, 0, b);
    author.sel = b.id; author.multi.clear();
    changed('all', { focusId: b.id });
    announce(blockName(b) + ' moved to position ' + (j + 1) + ' in the reading order.');
  } else if (kind === 'insert') {
    const type = e.dataTransfer.getData(DT_INSERT) || drag.insert;
    const nb = type === 'heading' ? makeBlock('heading', { level: +$('#insLevel').value }) : makeBlock(type);
    blocks.splice(t.index, 0, nb); author.sel = nb.id; author.multi.clear();
    changed('all', { focusId: nb.id });
    announce(blockName(nb) + ' inserted.');
    if (type === 'image') pickImage(nb.id);
  } else if (kind === 'file') {
    const files = [...e.dataTransfer.files].filter((f) => /^image\//.test(f.type));
    let at = t.index, firstId = null;
    for (const f of files) {
      try {
        const r = await processImage(f);
        const nb = Object.assign(makeBlock('image'), r, { name: f.name });
        const colW = pageDims(author.doc)[0] - 128;
        nb.widthPct = Math.max(10, Math.min(100, Math.round((r.w * 0.75) / colW * 100)));
        blocks.splice(at++, 0, nb); if (!firstId) firstId = nb.id;
      } catch (err) { alert('“' + f.name + '” could not be read as an image. Try a PNG or JPEG.'); }
    }
    if (!firstId) return;
    author.sel = firstId; author.multi.clear();
    changed('all', {});
    announce(plural(files.length, 'image') + ' added. Describe ' + (files.length === 1 ? 'it' : 'each one') + ' now.');
    setTimeout(() => describeDocImages(firstId), 100);
  }
});
