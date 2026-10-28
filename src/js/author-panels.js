/* ---------- side panels ---------- */
function renderOutline() {
  const host = $('#outlineList'); if (!host || !author.doc) return;
  host.replaceChildren();
  const hs = author.doc.blocks.filter((b) => b.type === 'heading');
  if (!hs.length) host.append(el('p', { class: 'small muted' }, 'No headings yet. Headings become the PDF’s bookmarks.'));
  else host.append(el('ul', { class: 'outline' }, hs.map((h) => el('li', { style: 'padding-left:' + ((h.level - 1) * 16) + 'px' },
    el('button', { type: 'button', class: 'row', 'data-oid': h.id, 'aria-current': author.sel === h.id ? 'true' : null, onclick: () => { selectBlock(h.id); focusBlock(h.id, 0, 'end'); } },
      chip('H' + h.level), el('span', { class: 'lbl' + (h.text.trim() ? '' : ' missing') }, h.text.trim() || 'Empty heading'))))));
  $('#outlineFacts').textContent = plural(author.doc.blocks.filter(hasContent).length, 'block') + ' with content';
}
function updateOutlineCurrent() {
  document.querySelectorAll('#outlineList .row').forEach((r) => { if (r.dataset.oid === author.sel) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current'); });
}
function decorateFlags() {
  document.querySelectorAll('.bflag').forEach((f) => f.remove());
  for (const b of author.doc ? author.doc.blocks : []) {
    const fs = author.findings.filter((f) => f.blockId === b.id); if (!fs.length) continue;
    const w = document.querySelector('.blk[data-id="' + b.id + '"]'); if (!w) continue;
    const sev = fs.some((f) => f.severity === 'error') ? 'error' : 'warning';
    w.append(el('div', { class: 'bflag' + (sev === 'warning' ? ' warn' : ''), 'aria-hidden': 'true' }, icon(sev), fs[0].title + (fs.length > 1 ? ' (+' + (fs.length - 1) + ' more)' : '')));
  }
}
function renderAuthorChecks() {
  const host = $('#authorChecks'); if (!host) return;
  host.replaceChildren();
  const errs = author.findings.filter((f) => f.severity === 'error'), warns = author.findings.filter((f) => f.severity === 'warning');
  if (errs.length) host.append(el('div', { class: 'blocked' }, icon('error'), el('span', {}, el('strong', { style: 'display:block' }, plural(errs.length, 'problem') + ' block' + (errs.length === 1 ? 's' : '') + ' export'), el('span', { class: 'small' }, 'Fix these and the PDF will conform.'))));
  else host.append(el('div', { class: 'okbox' }, icon('ok'), el('span', {}, el('strong', { style: 'display:block' }, 'Ready to export'), el('span', { class: 'small' }, warns.length ? plural(warns.length, 'warning') + ' to review.' : 'No problems found.'))));
  if (author.findings.length) {
    host.append(el('ul', { class: 'findings-list' }, author.findings.map((f) => el('li', {}, el('button', { type: 'button', class: 'finding', onclick: () => goToFinding(f) },
      icon(f.severity), el('span', { style: 'flex:1' }, el('span', { class: 't' }, f.title),
        el('span', { class: 's' }, wcagLabel(f) + (f.blockId ? '' : ' · Document settings')),
        f.detail ? el('span', { class: 'd' }, f.detail) : null))))));
  }
  const d = author.doc, lang = LANGS.find((l) => l[0] === d.lang), fam = FAMILIES.find((f) => f[0] === d.font);
  host.append(el('div', { class: 'docbox' }, el('h3', {}, 'Document'),
    el('dl', { class: 'props' },
      el('dt', {}, 'Title'), el('dd', {}, d.title || 'Not set'),
      el('dt', {}, 'Language'), el('dd', {}, lang ? lang[1] + ' (' + d.lang + ')' : d.lang || 'Not set'),
      el('dt', {}, 'Default font'), el('dd', {}, fam ? fam[1] : FAMILIES[0][1]),
      el('dt', {}, 'Page size'), el('dd', {}, d.pageSize === 'Letter' ? 'US Letter' : 'A4'),
      d.author ? [el('dt', {}, 'Author'), el('dd', {}, d.author)] : null),
    el('button', { type: 'button', class: 'btn link', style: 'margin-top:6px;padding:0', onclick: () => openDocDialog('edit') }, 'Edit document settings')));
  renderRemediationPanel();
}
function goToFinding(f) {
  if (f.remItem && author.doc.remediation && !f.blockId) {
    const it = author.doc.remediation.items.find((x) => x.id === f.remItem);
    if (it) { goToRemItem(it, true); return; }
  }
  if (f.blockId) {
    selectBlock(f.blockId);
    const b = findBlock(f.blockId);
    if (b && b.type === 'image' && b.data && !b.decorative && /alternative/i.test(f.title)) { const a = $('#propAlt'); if (a) { a.focus(); return; } }
    if (/contrast/i.test(f.title) && $('#propColor')) { $('#propColor').focus(); return; }
    focusBlock(f.blockId, 0, 'end');
  } else openDocDialog('edit');
}

/* ---------- properties panel ---------- */
const refocus = (id) => { const n = document.getElementById(id); if (n) n.focus(); };
function field(label, control, help, id) {
  return el('div', { class: 'field' }, el('label', { for: id || control.id }, label), control, help ? el('span', { class: 'help' }, help) : null);
}
function numInput(id, value, min, max, step, onchange) {
  const i = el('input', { type: 'number', id, class: 'input num', min: String(min), max: String(max), step: String(step), value: String(value), inputmode: 'decimal' });
  i.addEventListener('change', () => { const v = parseFloat(i.value); if (isNaN(v)) { i.value = String(value); return; } const c = Math.min(max, Math.max(min, v)); i.value = String(c); onchange(c); });
  return i;
}
function radioRow(name, legend, options, current, onpick) {
  return el('fieldset', { class: 'fs' }, el('legend', {}, legend), el('div', { class: 'seg', role: 'presentation' }, options.map(([val, label]) => {
    const id = name + '-' + val;
    const r = el('input', { type: 'radio', name, id, value: val, checked: current === val ? true : null, class: 'sr-only' });
    r.addEventListener('change', () => { onpick(val); refocus(id); });
    return el('label', { for: id, class: 'segbtn' }, r, el('span', {}, label));
  })));
}
function styleSection(b) {
  const d = author.doc, st = resolveStyle(b, d);
  const S = (k, v) => { b.style[k] = v; changed('sheet'); };
  const famSel = el('select', { id: 'propFont', class: 'input', 'aria-describedby': 'propFontHelp' }, fontOptions(b.style.font || '', 'Document default (' + (FAMILIES.find((f) => f[0] === d.font) || FAMILIES[0])[1] + ')'));
  const famHelp = el('span', { class: 'help', id: 'propFontHelp' }, (FAMILIES.find((f) => f[0] === st.font) || [0, 0, 0, ''])[3] + '.');
  famSel.addEventListener('change', () => { S('font', famSel.value || null); famHelp.textContent = (FAMILIES.find((f) => f[0] === resolveStyle(b, d).font) || [0, 0, 0, ''])[3] + '.'; refocus('propFont'); });
  const size = numInput('propSize', st.size, 7, 72, 0.5, (v) => { S('size', v); refocus('propSize'); });
  const bold = el('button', { type: 'button', class: 'tgl', id: 'propBold', 'aria-pressed': st.bold ? 'true' : 'false' }, el('b', {}, 'B'), el('span', { class: 'sr-only' }, 'Bold'));
  bold.addEventListener('click', () => { const v = bold.getAttribute('aria-pressed') !== 'true'; bold.setAttribute('aria-pressed', String(v)); S('bold', v); updateReadout(); });
  const ital = el('button', { type: 'button', class: 'tgl', id: 'propItalic', 'aria-pressed': st.italic ? 'true' : 'false' }, el('i', {}, 'I'), el('span', { class: 'sr-only' }, 'Italic'));
  ital.addEventListener('click', () => { const v = ital.getAttribute('aria-pressed') !== 'true'; ital.setAttribute('aria-pressed', String(v)); S('italic', v); });
  const color = el('input', { type: 'color', id: 'propColor', value: st.color, class: 'colorin' });
  const readout = el('span', { class: 'help', id: 'propColorRead', 'aria-live': 'polite' });
  function updateReadout() {
    const s2 = resolveStyle(b, d), r = contrast(s2.color, '#FFFFFF'), need = largeText(s2.size, s2.bold) ? 3 : 4.5;
    readout.replaceChildren(icon(r >= need ? 'ok' : 'error'), ' ' + r.toFixed(1) + ':1 on a white page (' + (largeText(s2.size, s2.bold) ? 'large text needs 3:1' : 'needs 4.5:1') + ')');
  }
  color.addEventListener('input', () => { b.style.color = color.value; changed('sheet'); updateReadout(); });
  size.addEventListener('change', updateReadout);
  updateReadout();
  const lh = el('select', { id: 'propLH', class: 'input' }, [[1.15, 'Tight (1.15)'], [1.25, 'Snug (1.25)'], [1.45, 'Normal (1.45)'], [1.6, 'Relaxed (1.6)'], [2, 'Double (2.0)']].map(([v, n]) => el('option', { value: String(v), selected: Math.abs(st.lh - v) < 0.01 ? true : null }, n)));
  lh.addEventListener('change', () => { S('lineHeight', +lh.value); refocus('propLH'); });
  const sec = el('div', { class: 'propsec' }, el('h3', {}, 'Text'),
    el('div', { class: 'field' }, el('label', { for: 'propFont' }, 'Font'), famSel, famHelp),
    el('div', { class: 'grid2 tight' }, field('Size (pt)', size), el('div', { class: 'field' }, el('span', { class: 'flabel', id: 'styleLbl' }, 'Style'), el('div', { class: 'tglrow', role: 'group', 'aria-labelledby': 'styleLbl' }, bold, ital))),
    el('div', { class: 'field' }, el('label', { for: 'propColor' }, 'Colour'), el('div', { class: 'colorrow' }, color, readout)),
    radioRow('propAlign', 'Alignment', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], st.align, (v) => S('align', v)),
    field('Line spacing', lh));
  if (b.type === 'heading') sec.append(el('p', { class: 'help', style: 'margin:8px 0 0' }, 'Headings are bold by default. Size and weight are visual only: the heading level is what screen readers use.'));
  return sec;
}
function renderProps() {
  const host = $('#props'); if (!host) return;
  host.replaceChildren();
  const b = findBlock(author.sel);
  if (!b) { host.append(el('h2', {}, 'Properties'), el('p', { class: 'small muted', style: 'margin:6px 0 0' }, 'Select a block to see its properties, or use Insert to add one.')); return; }
  host.append(el('div', { class: 'props-head' }, el('h2', {}, blockName(b)), chip(blockTag(b))));
  blockTypeTools(b, host);
  if (b.type === 'list') {
    const m = el('select', { id: 'propMarker', class: 'input' }, MARKERS.map(([k, n]) => el('option', { value: k, selected: b.marker === k ? true : null }, n)));
    m.addEventListener('change', () => { b.marker = m.value; changed('sheet'); refocus('propMarker'); });
    host.append(field('Bullet or numbering', m, 'Saved in the PDF so screen readers announce the list type.'),
      el('button', { type: 'button', class: 'btn', style: 'margin-top:12px', onclick: () => { b.items.push(''); changed('sheet', { focusId: b.id, field: b.items.length - 1 }); } }, 'Add item'));
  }
  if (b.type === 'image') {
    host.append(el('div', { class: 'imgmeta' },
      b.data ? el('img', { src: 'data:image/jpeg;base64,' + b.data, alt: '', class: 'thumb' }) : el('span', { class: 'thumb' }),
      el('span', { style: 'flex:1;min-width:0' }, el('span', { style: 'display:block;font-weight:500;overflow-wrap:anywhere' }, b.name || 'No image chosen'),
        b.data ? el('span', { class: 'small muted' }, b.w + ' × ' + b.h + ' px') : null),
      el('button', { type: 'button', class: 'btn', onclick: () => pickImage(b.id) }, b.data ? 'Replace' : 'Choose')));
    host.append(el('fieldset', { class: 'fs' }, el('legend', {}, 'How should this image be read?'),
      [['Informative', false, 'It conveys meaning, so it needs alternative text.'], ['Decorative', true, 'Saved as an artifact, so screen readers skip it.']].map(([label, val, help]) => {
        const r = el('input', { type: 'radio', name: 'imgRole', id: 'imgRole' + label, checked: b.decorative === val ? true : null });
        r.addEventListener('change', () => { b.decorative = val; changed('sheet'); renderProps(); refocus('imgRole' + label); });
        return el('label', { class: 'choice' }, r, el('span', {}, el('b', {}, label), el('span', {}, help)));
      })));
    if (!b.decorative) {
      const ta = el('textarea', { id: 'propAlt', class: 'input' + (b.data && !b.alt.trim() ? ' bad' : ''), rows: '3', 'aria-describedby': 'propAltHelp', placeholder: 'e.g. Glass-fronted library entrance with a ramp beside the steps' });
      ta.value = b.alt;
      const cnt = el('span', { class: 'help num', 'aria-hidden': 'true' }, b.alt.length + ' / 250');
      ta.addEventListener('input', () => {
        b.alt = ta.value; cnt.textContent = b.alt.length + ' / 250'; ta.classList.toggle('bad', !!b.data && !b.alt.trim());
        const btn = document.querySelector('.blk[data-id="' + b.id + '"] .imgsel');
        if (btn) btn.setAttribute('aria-label', 'Image ' + (b.name || '') + ', ' + (b.alt.trim() ? 'alternative text: ' + b.alt.trim() : 'no alternative text yet'));
        changed('text');
      });
      host.append(el('div', { class: 'field' }, el('label', { for: 'propAlt' }, 'Alternative text ', el('span', { class: 'req' }, 'Required')), ta,
        el('div', { style: 'display:flex;justify-content:space-between;gap:10px' }, el('span', { id: 'propAltHelp', class: 'help' }, 'Describe what the image tells the reader, not every detail.'), cnt)));
    }
    {
      host.append(el('div', { class: 'propsec' }, el('h3', {}, 'Size'),
        field('Width (% of text column)', numInput('propWidth', b.widthPct || 100, 10, 100, 5, (v) => { b.widthPct = v; changed('sheet'); refocus('propWidth'); })),
        radioRow('propImgAlign', 'Alignment', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], b.align || 'left', (v) => { b.align = v; changed('sheet'); })));
    }
    const cap = el('input', { type: 'checkbox', id: 'propCap', checked: b.showCaption ? true : null });
    cap.addEventListener('change', () => { b.showCaption = cap.checked; changed('sheet', cap.checked ? { focusId: b.id, field: 1 } : {}); if (!cap.checked) refocus('propCap'); });
    host.append(el('label', { class: 'check', style: 'margin-top:8px' }, cap, el('span', {}, 'Show a caption under the image')));
  }
  if (b.type === 'table') {
    const stepper = (label, id, get, inc, dec) => {
      const out = el('output', { id: id + 'Val', 'aria-live': 'polite' }, String(get()));
      return el('div', { class: 'rowline' }, el('span', { id: id + 'Lbl' }, label),
        el('div', { class: 'stepper', role: 'group', 'aria-labelledby': id + 'Lbl' },
          el('button', { type: 'button', 'aria-label': 'Fewer ' + label.toLowerCase(), onclick: () => { if (dec()) { changed('sheet'); out.textContent = String(get()); } } }, '−'), out,
          el('button', { type: 'button', 'aria-label': 'More ' + label.toLowerCase(), onclick: () => { if (inc()) { changed('sheet'); out.textContent = String(get()); } } }, '+')));
    };
    host.append(
      stepper('Rows', 'tRows', () => b.rows.length, () => { if (b.rows.length >= 200) return false; b.rows.push(b.rows[0].map(() => '')); return true; }, () => { if (b.rows.length <= 1) return false; b.rows.pop(); return true; }),
      stepper('Columns', 'tCols', () => b.rows[0].length, () => { if (b.rows[0].length >= 8) return false; b.rows.forEach((r) => r.push('')); return true; }, () => { if (b.rows[0].length <= 1) return false; b.rows.forEach((r) => r.pop()); return true; }));
    const chk = (id, label, key, after) => { const c = el('input', { type: 'checkbox', id, checked: b[key] ? true : null }); c.addEventListener('change', () => { b[key] = c.checked; changed('sheet'); if (after) after(); }); return el('label', { class: 'check' }, c, el('span', {}, label)); };
    host.append(el('fieldset', { class: 'fs' }, el('legend', {}, 'Header cells'),
      chk('tHeadRow', 'First row is headers (scope: column)', 'headerRow', () => renderTablePreview(b)),
      chk('tHeadCol', 'First column is headers (scope: row)', 'headerCol', () => renderTablePreview(b)),
      chk('tRepeat', 'Repeat the header row on each page', 'repeatHeader')));
    const cap = el('input', { type: 'text', id: 'tCap', class: 'input', value: b.caption });
    cap.addEventListener('input', () => { b.caption = cap.value; changed('sheet'); });
    host.append(field('Caption (optional)', cap, 'Announced before the table. Say what it contains.'));
    const shade = el('input', { type: 'checkbox', id: 'tShade', checked: b.headerFill ? true : null });
    const shadeColor = el('input', { type: 'color', id: 'tShadeColor', class: 'colorin', value: b.headerFill || '#E8EEF4', 'aria-label': 'Header shading colour' });
    shade.addEventListener('change', () => { b.headerFill = shade.checked ? shadeColor.value : ''; changed('sheet'); });
    shadeColor.addEventListener('input', () => { if (shade.checked) { b.headerFill = shadeColor.value; changed('sheet'); } });
    host.append(el('div', { class: 'propsec' }, el('h3', {}, 'Look'),
      field('Text size (pt)', numInput('tSize', b.size || 10, 7, 24, 0.5, (v) => { b.size = v; changed('sheet'); refocus('tSize'); })),
      el('div', { class: 'colorrow', style: 'margin-top:10px' }, el('label', { class: 'check' }, shade, el('span', {}, 'Shade header cells')), shadeColor),
      chk('tStripes', 'Stripe alternate rows', 'stripes')));
    host.append(el('div', { class: 'srprev', id: 'tPrev' }));
    renderTablePreview(b);
    host.append(tableTools(b));
  }
  if (b.type === 'pagebreak') host.append(el('p', { class: 'small muted', style: 'margin:10px 0 0' }, 'The next block starts on a new page. Page breaks are layout only and aren’t announced.'));
  if (TEXTY(b)) host.append(styleSection(b));
  const jt = joinTools(b); if (jt) host.append(jt);
  host.append(el('div', { class: 'blockacts' },
    el('button', { type: 'button', class: 'btn', onclick: () => moveBlock(-1) }, 'Move up'),
    el('button', { type: 'button', class: 'btn', onclick: () => moveBlock(1) }, 'Move down'),
    el('button', { type: 'button', class: 'btn', onclick: () => removeBlock(b.id) }, 'Delete')));
}
function renderTablePreview(b) {
  const host = $('#tPrev'); if (!host) return;
  host.replaceChildren(el('h3', {}, 'Screen reader preview'));
  const r = b.rows.length > 1 ? 1 : 0, row = b.rows[r];
  const parts = row.map((cell, c) => {
    const hdrs = [];
    if (b.headerCol && c > 0 && b.rows[r][0].trim()) hdrs.push(b.rows[r][0].trim());
    if (b.headerRow && r > 0 && b.rows[0][c].trim()) hdrs.push(b.rows[0][c].trim());
    return (hdrs.length ? hdrs.join(', ') + ': ' : '') + (cell.trim() || 'blank');
  });
  host.append(el('p', { class: 'mono small' }, 'Table' + (b.caption.trim() ? ', ' + b.caption.trim() : '') + ', ' + b.rows.length + ' rows, ' + row.length + ' columns.'),
    el('p', { class: 'mono small' }, 'Row ' + (r + 1) + '. ' + parts.join('. ') + '.'));
}

/* ---------- document settings dialog ---------- */
function openDocDialog(mode) {
  author.dialogMode = mode;
  const d = mode === 'edit' && author.doc ? author.doc : { title: '', lang: 'en-IE', author: '', pageSize: 'A4', font: DEFAULT_FONT };
  $('#docDlgTitle').textContent = mode === 'edit' ? 'Document settings' : 'Create a new PDF';
  $('#docDlgSubmit').textContent = mode === 'edit' ? 'Save settings' : 'Create document';
  $('#dTitle').value = d.title; $('#dAuthor').value = d.author || '';
  $('#dLang').value = LANGS.some((l) => l[0] === d.lang) ? d.lang : 'en-IE';
  $('#dFont').value = famKey(d.font || DEFAULT_FONT);
  document.querySelector('input[name="dSize"][value="' + (d.pageSize === 'Letter' ? 'Letter' : 'A4') + '"]').checked = true;
  $('#dTemplateWrap').hidden = mode === 'edit';
  $('#dReplaceNote').hidden = !(mode === 'new' && author.doc);
  $('#dTitleErr').hidden = true; $('#dTitle').removeAttribute('aria-invalid');
  $('#docDialog').showModal();
  $('#dTitle').focus();
}
function submitDocDialog(e) {
  e.preventDefault();
  const title = $('#dTitle').value.trim();
  if (!title) { $('#dTitleErr').hidden = false; $('#dTitle').setAttribute('aria-invalid', 'true'); $('#dTitle').focus(); return; }
  const s = { title, lang: $('#dLang').value, author: $('#dAuthor').value.trim(), font: $('#dFont').value, pageSize: document.querySelector('input[name="dSize"]:checked').value,
    template: (document.querySelector('input[name="dTemplate"]:checked') || {}).value || 'blank' };
  $('#docDialog').close();
  if (author.dialogMode === 'edit' && author.doc) {
    Object.assign(author.doc, { title: s.title, lang: s.lang, author: s.author, pageSize: s.pageSize, font: s.font });
    const rem = author.doc.remediation; if (rem) rem.items.forEach((it) => { if (it.kind === 'meta') it.done = true; });
    changed('all'); announce('Document settings saved.');
  }
  else startNewDocument(s);
}

