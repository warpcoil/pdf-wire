/* ---------- authoring: lifecycle ---------- */
function startNewDocument(s) {
  const blocks = [makeBlock('heading', { level: 1, text: s.title })];
  if (s.template === 'report') {
    blocks.push(makeBlock('paragraph'), makeBlock('heading', { level: 2, text: 'Introduction' }), makeBlock('paragraph'),
      makeBlock('heading', { level: 2, text: 'Main points' }), makeBlock('paragraph'), makeBlock('heading', { level: 2, text: 'Next steps' }), makeBlock('paragraph'));
  } else blocks.push(makeBlock('paragraph'));
  author.doc = { format: 'apdf-draft', version: 2, title: s.title, lang: s.lang, author: s.author || '', pageSize: s.pageSize, font: s.font || DEFAULT_FONT, blocks };
  author.sel = blocks[1].id;
  enterAuthor({ focusId: blocks[1].id });
  announce('Created ' + s.title + '. The cursor is in the first paragraph.');
}
function enterAuthor(opts) {
  if (hist.docRef !== author.doc) { author.multi.clear(); resetHistory(); }
  setMode('author'); setStatus(null);
  setView(author.view, true);
  renderEditor(opts || {}); renderOutline(); renderProps(); runAuthorChecks(); saveLocal(); updateToolbar();
}
function changed(kind, opts) {
  recordHistory(kind);
  if (kind === 'all' || kind === 'sheet') renderEditor(opts || {});
  if (kind === 'all') renderProps();
  renderOutline(); scheduleAuthorChecks(); saveLocalSoon(); updateHeader(); schedulePreview(); updateToolbar();
}
let saveTimer;
function saveLocalSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveLocal, 600); }
function saveLocal() {
  if (!author.doc) return;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(author.doc)); author.saveNote = 'Draft kept in this browser'; }
  catch (e) { author.saveNote = 'Too large to keep in this browser: use Save draft'; }
  const c = $('#saveChip'); if (c) c.textContent = author.saveNote;
}
function validDraft(d) {
  return d && d.format === 'apdf-draft' && Array.isArray(d.blocks) && typeof d.title === 'string' &&
    d.blocks.every((b) => b && typeof b.id === 'string' && ['heading', 'paragraph', 'list', 'image', 'table', 'pagebreak', 'shape'].includes(b.type));
}
function loadLocalDraft() {
  try { const s = localStorage.getItem(DRAFT_KEY); if (!s) return null; const d = JSON.parse(s); return validDraft(d) ? normalizeDoc(d) : null; } catch (e) { return null; }
}
function openDraft(d) {
  author.doc = normalizeDoc(d); author.sel = d.blocks[0] ? d.blocks[0].id : null;
  enterAuthor({ focusId: author.sel });
  announce('Opened draft ' + d.title + '.');
}

/* ---------- authoring: Write view ---------- */
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
function sizeSheet() {
  const [PW] = pageDims(author.doc);
  $('#edSheet').style.maxWidth = Math.round((PW - 128) * PX + 144) + 'px';
}
function renderEditor(opts) {
  opts = opts || {};
  const sheet = $('#edSheet'); sheet.replaceChildren();
  sizeSheet();
  const d = author.doc;
  if (!d.blocks.length) sheet.append(el('p', { class: 'ed-empty' }, 'This document is empty. Use the Insert toolbar to add a heading, paragraph, list, image or table.'));
  d.blocks.forEach((b) => sheet.append(renderBlock(b)));
  sheet.querySelectorAll('textarea.tx').forEach(autosize);
  decorateFlags();
  if (opts.focusId && author.view === 'write') focusBlock(opts.focusId, opts.field || 0, opts.caret);
}
function fieldsOf(id) {
  const w = document.querySelector('.blk[data-id="' + id + '"]');
  return w ? [...w.querySelectorAll('textarea, input, button.imgsel, button.pbbtn')] : [];
}
function focusBlock(id, idx, caret) {
  if (author.view !== 'write') { const box = document.querySelector('.pvbox[data-id="' + id + '"]'); if (box) box.focus(); return; }
  const f = fieldsOf(id); if (!f.length) return;
  const t = f[Math.max(0, Math.min(idx || 0, f.length - 1))];
  t.focus();
  if (caret != null && typeof t.setSelectionRange === 'function') {
    const pos = caret === 'end' ? t.value.length : caret === 'start' ? 0 : caret;
    try { t.setSelectionRange(pos, pos); } catch (e) { /* not a text field */ }
  }
  t.scrollIntoView({ block: 'nearest' });
}
function selectBlock(id) {
  if (author.sel === id) return;
  author.sel = id;
  document.querySelectorAll('.blk.sel, .pvbox.sel').forEach((b) => b.classList.remove('sel'));
  document.querySelectorAll('.blk[data-id="' + id + '"], .pvbox[data-id="' + id + '"]').forEach((w) => w.classList.add('sel'));
  renderProps(); updateOutlineCurrent(); updateToolbar();
}
function renderBlock(b) {
  const tag = blockTag(b);
  const w = el('div', { class: 'blk' + (author.sel === b.id ? ' sel' : '') + (author.multi.size > 1 && author.multi.has(b.id) ? ' multi' : ''), 'data-id': b.id });
  w.addEventListener('focusin', () => selectBlock(b.id));
  w.addEventListener('mousedown', (e) => {
    const inText = e.target.closest('textarea, input');
    if (e.ctrlKey || e.metaKey || (e.shiftKey && !inText)) { if (e.target.closest('.grip')) return; e.preventDefault(); toggleMulti(b.id, e.shiftKey && !e.ctrlKey && !e.metaKey); return; }
    if (author.multi.size && !e.target.closest('.grip')) clearMulti();
    if (e.target === w) selectBlock(b.id);
  }, true);
  w.append(el('span', { class: 'gut', 'aria-hidden': 'true' }, el('span', { class: 'selmark' }, '✓'),
    el('span', { class: 'grip', draggable: 'true', title: 'Drag to move. Drop onto another block to combine them.' }, '⠿'), chip(tag)));
  if (b.type === 'heading' || b.type === 'paragraph') {
    const ta = el('textarea', { class: 'tx', rows: '1',
      'aria-label': b.type === 'heading' ? 'Heading level ' + b.level : 'Paragraph', placeholder: b.type === 'heading' ? 'Heading text' : 'Type a paragraph' });
    ta.value = b.text; applyTextStyle(ta, b);
    ta.addEventListener('input', () => { b.text = ta.value.replace(/\n/g, ' '); autosize(ta); changed('text'); });
    ta.addEventListener('keydown', (e) => textKeys(e, b, ta));
    w.append(ta);
  } else if (b.type === 'list') {
    const L = el(['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'].includes(b.marker) ? 'ol' : 'ul', { class: 'ed-list', style: 'list-style-type:' + (b.marker === 'dash' ? '"– "' : b.marker) });
    const st = resolveStyle(b, author.doc); L.style.color = st.color;
    b.items.forEach((it, k) => {
      const ta = el('textarea', { class: 'tx', rows: '1', 'aria-label': 'List item ' + (k + 1) + ' of ' + b.items.length, placeholder: 'List item' });
      ta.value = it; applyTextStyle(ta, b);
      ta.addEventListener('input', () => { b.items[k] = ta.value.replace(/\n/g, ' '); autosize(ta); changed('text'); });
      ta.addEventListener('keydown', (e) => listKeys(e, b, k, ta));
      const li = el('li', {}, ta); li.style.fontSize = (st.size * PX) + 'px'; li.style.fontFamily = ta.style.fontFamily;
      L.append(li);
    });
    w.append(L);
  } else if (b.type === 'image') {
    const label = b.data ? 'Image ' + (b.name || '') + ', ' + (b.decorative ? 'decorative' : b.alt.trim() ? 'alternative text: ' + b.alt.trim() : 'no alternative text yet') : 'Choose an image file';
    const btn = el('button', { type: 'button', class: 'imgsel', 'aria-label': label, onclick: () => { selectBlock(b.id); if (!b.data) pickImage(b.id); } },
      b.data ? el('img', { src: 'data:image/jpeg;base64,' + b.data, alt: '' })
        : el('span', { class: 'ph' }, svgIcon('<rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.5" cy="8.5" r="1.5"/><path d="M3.5 14.5l4-4 3 3 2-2 4 4"/>', 36), el('span', {}, 'Choose an image')));
    if (b.data) {
      btn.style.width = (b.widthPct || 100) + '%';
      btn.style.marginLeft = b.align === 'center' || b.align === 'right' ? 'auto' : '0';
      btn.style.marginRight = b.align === 'center' ? 'auto' : '0';
    }
    w.append(btn);
    if (b.showCaption) {
      const ta = el('textarea', { class: 'tx cap', rows: '1', 'aria-label': 'Image caption', placeholder: 'Caption' });
      ta.value = b.caption;
      ta.addEventListener('input', () => { b.caption = ta.value.replace(/\n/g, ' '); autosize(ta); changed('text'); });
      w.append(ta);
    }
  } else if (b.type === 'table') {
    ensureFace(author.doc.font);
    const t = el('table', { class: 'ed-table', style: 'font-size:' + ((b.size || 10) * PX) + 'px;font-family:\'' + FACE[author.doc.font] + '\',system-ui,sans-serif' });
    if (b.caption.trim()) t.append(el('caption', {}, b.caption));
    const tb = el('tbody');
    b.rows.forEach((row, r) => {
      const tr = el('tr');
      row.forEach((cell, c) => {
        const isH = (b.headerRow && r === 0) || (b.headerCol && c === 0);
        const inp = el('input', { type: 'text', 'aria-label': (isH ? 'Header cell, ' : 'Cell, ') + 'row ' + (r + 1) + ', column ' + (c + 1) });
        inp.value = cell;
        inp.addEventListener('input', () => { b.rows[r][c] = inp.value; changed('text'); });
        inp.addEventListener('focus', () => { const was = author.cell; author.cell = { id: b.id, r, c }; if (author.sel === b.id && (!was || was.id !== b.id || was.r !== r || was.c !== c)) updateCellTools(b); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (r + 1 < b.rows.length) focusBlock(b.id, (r + 1) * row.length + c); } });
        const cellEl = isH ? el('th', { scope: (b.headerRow && r === 0) ? 'col' : 'row' }, inp) : el('td', {}, inp);
        if (isH && b.headerFill) cellEl.style.background = b.headerFill;
        else if (b.stripes && r % 2 === (b.headerRow ? 0 : 1)) cellEl.style.background = '#F1F3F6';
        else cellEl.style.background = 'transparent';
        tr.append(cellEl);
      });
      tb.append(tr);
    });
    t.append(tb); w.append(t);
  } else if (b.type === 'pagebreak') {
    w.append(el('button', { type: 'button', class: 'pbbtn', 'aria-label': 'Page break' }, el('span', { class: 'pb', 'aria-hidden': 'true' }, 'Page break')));
  }
  return w;
}
function svgIcon(paths, size) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true');
  if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
  s.innerHTML = paths; return s;
}
function textKeys(e, b, ta) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const before = ta.value.slice(0, ta.selectionStart), after = ta.value.slice(ta.selectionEnd);
    b.text = before.replace(/\n/g, ' ');
    const nb = makeBlock('paragraph', { text: after.replace(/\n/g, ' ') });
    if (b.type === 'paragraph') nb.style = Object.assign({}, b.style);
    insertAfter(b.id, nb);
    changed('all', { focusId: nb.id, caret: 'start' });
  } else if (e.key === 'Backspace' && ta.value === '' && author.doc.blocks.length > 1) { e.preventDefault(); removeBlock(b.id); }
}
function listKeys(e, b, k, ta) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (ta.value === '' && k === b.items.length - 1 && b.items.length > 1) {
      b.items.pop(); const nb = makeBlock('paragraph'); insertAfter(b.id, nb); changed('all', { focusId: nb.id }); return;
    }
    const before = ta.value.slice(0, ta.selectionStart), after = ta.value.slice(ta.selectionEnd);
    b.items[k] = before; b.items.splice(k + 1, 0, after);
    changed('sheet', { focusId: b.id, field: k + 1, caret: 'start' });
  } else if (e.key === 'Backspace' && ta.value === '') {
    e.preventDefault();
    if (b.items.length > 1) { b.items.splice(k, 1); changed('sheet', { focusId: b.id, field: Math.max(0, k - 1), caret: 'end' }); }
    else removeBlock(b.id);
  }
}
function insertAfter(refId, nb) {
  const blocks = author.doc.blocks, i = blockIndex(refId);
  blocks.splice(i < 0 ? blocks.length : i + 1, 0, nb);
  author.sel = nb.id;
}
function removeBlock(id) {
  const blocks = author.doc.blocks, i = blockIndex(id); if (i < 0) return;
  const b = blocks[i];
  blocks.splice(i, 1);
  const prev = blocks[i - 1] || blocks[i] || null;
  author.sel = prev ? prev.id : null;
  changed('all', prev ? { focusId: prev.id, field: 99, caret: 'end' } : {});
  announce(blockName(b) + ' deleted.');
}
function moveBlock(dir) {
  const blocks = author.doc.blocks, i = blockIndex(author.sel), j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return;
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  changed('all', { focusId: author.sel });
  announce(blockName(blocks[j]) + ' moved ' + (dir < 0 ? 'up' : 'down') + ' in the reading order.');
}
function doInsert(type) {
  if (!author.doc) return;
  const nb = type === 'heading' ? makeBlock('heading', { level: +$('#insLevel').value }) : makeBlock(type);
  insertAfter(author.sel, nb);
  changed('all', { focusId: nb.id });
  announce(blockName(nb) + ' inserted.');
  if (type === 'image') pickImage(nb.id);
}
function pickImage(id) { author.pendingImage = id; $('#imgInput').value = ''; $('#imgInput').click(); }
function readAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); }); }
async function processImage(file) {
  const url = await readAsDataURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not an image')); i.src = url; });
  const max = 2000; let w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) throw new Error('empty image');
  const s = Math.min(1, max / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
  return { data: c.toDataURL('image/jpeg', 0.9).split(',')[1], w, h };
}
async function onImageChosen(file) {
  const b = findBlock(author.pendingImage); author.pendingImage = null;
  if (!b || !file) return;
  try {
    const r = await processImage(file);
    Object.assign(b, r, { name: file.name });
    const colW = pageDims(author.doc)[0] - 128;
    b.widthPct = Math.max(10, Math.min(100, Math.round((r.w * 0.75) / colW * 100)));
    author.sel = b.id;
    changed('all', {});
    const alt = $('#propAlt'); if (alt && !b.decorative) alt.focus();
    announce('Image added. Now describe it in the alternative text field, or mark it as decorative.');
  } catch (e) { alert('“' + file.name + '” could not be read as an image. Try a PNG or JPEG.'); }
}

