/* ---------- remediation: the tag-in-place review ----------
   Left: the structure in reading order. Middle: the original page with every
   tag drawn over it. Right: the selected tag, then what still needs doing. */

const rt = { T: null, page: 0, sel: null, renderTask: null, origTask: null, crops: new Map(), multi: new Set(), zoom: 1, layout: 'both', past: [], future: [] };
const RT_ROLES = [['H1', 'Heading 1'], ['H2', 'Heading 2'], ['H3', 'Heading 3'], ['H4', 'Heading 4'], ['H5', 'Heading 5'], ['H6', 'Heading 6'],
  ['P', 'Paragraph'], ['L', 'List'], ['Table', 'Table'], ['Figure', 'Figure (image)'], ['Artifact', 'Artifact (decoration, not read)']];
const rtRoleName = (r) => (RT_ROLES.find((x) => x[0] === r) || [r, r])[1];
const rtFind = (id) => rt.T && rt.T.blocks.find((b) => b.id === id);
const rtLabel = (b) => (b.role === 'Figure' ? (b.alt ? b.alt : 'Image, not described yet') : b.role === 'Table' ? 'Table, ' + b.rows.length + ' × ' + b.rows[0].length : b.text) || rtRoleName(b.role);

function enterRetag(T) {
  rt.T = T; rt.page = 0; rt.crops = new Map(); rt.multi = new Set(); rt.past = []; rt.future = []; rt.zoom = 1;
  rt.sel = T.blocks[0] ? T.blocks[0].id : null;
  $('#rtTitle').value = T.title;
  const ls = $('#rtLang');
  fill(ls, el('option', { value: '' }, 'Choose a language'), ...LANGS.map(([v, n]) => el('option', { value: v }, n + ' (' + v + ')')));
  if (T.lang && !LANGS.some((l) => l[0] === T.lang)) ls.append(el('option', { value: T.lang }, T.lang));
  ls.value = T.lang || '';
  setMode('retag');
  renderRetag();
  announce('Tag in place: ' + plural(T.blocks.length, 'item') + ' found in reading order. Check each one, then write the tagged PDF.');
}
function renderRetag() { renderRtList(); renderRtProps(); renderRtSummary(); rtRenderPage(); rtUpdateToolbar(); }

function rtIssues(b) {
  if (b.role === 'Figure' && !(b.alt || '').trim()) return 'error';
  if (b.role === 'Table' && !b.reviewed) return 'warning';
  return null;
}
function renderRtList() {
  const host = $('#rtList'); host.replaceChildren();
  const T = rt.T;
  T.Xp.pages.forEach((P) => {
    const bs = T.blocks.filter((b) => b.page === P.index);
    const arts = T.removed.filter((a) => a.page === P.index && !a.restored);
    const det = el('details', { class: 'tree-page', open: true, 'data-page': P.index },
      el('summary', {}, 'Page ' + (P.index + 1), el('span', { class: 'count' }, plural(bs.filter((b) => b.role !== 'Artifact').length, 'tag'))));
    const ol = el('ul', { class: 'tree' }, bs.map((b) => {
      const iss = rtIssues(b);
      const cb = el('input', { type: 'checkbox', class: 'rtsel', id: 'rts-' + b.id, checked: rt.multi.has(b.id) ? true : null, 'aria-label': 'Select ' + rtRoleName(b.role) + ': ' + clip(rtLabel(b), 40) });
      cb.addEventListener('change', () => { if (cb.checked) rt.multi.add(b.id); else rt.multi.delete(b.id); cb.closest('.rowwrap').classList.toggle('multi', cb.checked); rtMarkOverlays(); rtUpdateToolbar(); });
      return el('li', {}, el('div', { class: 'rowwrap' + (rt.multi.has(b.id) ? ' multi' : ''), draggable: 'true', 'data-rid': b.id },
        cb, el('span', { class: 'rgrip', 'aria-hidden': 'true', title: 'Drag to change the reading order. Drop onto another tag to combine them.' }, '⠿'),
        el('button', { type: 'button', class: 'row', 'data-rid': b.id, 'aria-current': rt.sel === b.id ? 'true' : null, onclick: () => rtSelect(b.id, true) },
          chip(b.role === 'Artifact' ? 'Artifact' : b.role), el('span', { class: 'lbl' + (b.role === 'Artifact' ? ' missing' : '') }, clip(rtLabel(b), 60)),
          iss ? icon(iss, iss === 'error' ? 'Needs alternative text' : 'Not checked yet') : null)));
    }));
    det.append(ol);
    if (arts.length) det.append(el('details', { class: 'more', style: 'margin:4px 10px 8px' }, el('summary', {}, plural(arts.length, 'artifact') + ' left out'),
      el('ul', { class: 'plain small' }, arts.map((a) => el('li', {}, clip(a.text || 'Image', 50) + ' (' + a.why + ') ',
        el('button', { type: 'button', class: 'btn link small', style: 'min-height:32px;padding:0 4px', onclick: () => rtRestore(a) }, 'Read it'))))));
    host.append(det);
  });
}
function rtSelect(id, fromList) {
  const b = rtFind(id); if (!b) return;
  rt.sel = id;
  document.querySelectorAll('#rtList .row[aria-current]').forEach((r) => r.removeAttribute('aria-current'));
  const row = document.querySelector('#rtList .row[data-rid="' + id + '"]'); if (row) { row.setAttribute('aria-current', 'true'); if (!fromList) row.scrollIntoView({ block: 'nearest' }); }
  renderRtProps(); rtUpdateToolbar();
  if (b.page !== rt.page) { rt.page = b.page; rtRenderPage(); }
  else { document.querySelectorAll('#rtOverlay .ov.sel').forEach((o) => o.classList.remove('sel')); const ov = document.querySelector('#rtOverlay .ov[data-rid="' + id + '"]'); if (ov) { ov.classList.add('sel'); if (fromList) ov.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
}
async function rtRenderPage() {
  const T = rt.T, P = T.Xp.pages[rt.page]; if (!P) return;
  const both = rt.layout === 'both';
  $('#rtViewer').dataset.layout = rt.layout;
  const avail = Math.max(280, $('#main').clientWidth - 64);
  const fit = Math.min(2, Math.max(0.3, (both ? (avail - 24) / 2 : avail) / P.w));
  const scale = fit * rt.zoom;
  const vp = P.proxy.getViewport({ scale }), dpr = window.devicePixelRatio || 1;
  const paint = (canvas, sheet, proxy, key) => {
    const v = proxy.getViewport({ scale });
    canvas.width = Math.floor(v.width * dpr); canvas.height = Math.floor(v.height * dpr);
    canvas.style.width = v.width + 'px'; canvas.style.height = v.height + 'px';
    sheet.style.width = v.width + 'px'; sheet.style.height = v.height + 'px';
    if (rt[key]) { try { rt[key].cancel(); } catch (e) { /* ignore */ } }
    rt[key] = proxy.render({ canvasContext: canvas.getContext('2d'), viewport: v, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
    return rt[key].promise.catch((e) => { if (!e || e.name !== 'RenderingCancelledException') console.error(e); });
  };
  const jobs = [];
  if (rt.layout !== 'original') jobs.push(paint($('#rtCanvas'), $('#rtSheet'), P.proxy, 'renderTask'));
  if (rt.layout !== 'tagged') {
    // the original file when it is still open, otherwise the probe, which draws identically
    const orig = remSource.X && remSource.name === T.name && remSource.X.pages[rt.page] ? remSource.X.pages[rt.page].proxy : P.proxy;
    jobs.push(paint($('#rtOrigCanvas'), $('#rtOrigSheet'), orig, 'origTask'));
  }
  $('#rtOrigHead').textContent = 'Original · page ' + (rt.page + 1);
  const ov = $('#rtOverlay'); ov.replaceChildren();
  const view = P.proxy.view;
  const box = (r) => toView(vp, [r[0] + view[0], r[1] + view[1], r[2] + view[0], r[3] + view[1]]);
  const artLayer = el('div', { class: 'rtart-layer', 'aria-hidden': 'true', hidden: !$('#rtShowArt').checked ? true : null });
  for (const a of T.removed.filter((x) => x.page === rt.page && !x.restored)) {
    const v = box(a.rect);
    artLayer.append(el('div', { class: 'rtart', title: 'Artifact: ' + (a.text || 'image') + ' (' + a.why + ')', style: `left:${v.x}px;top:${v.y}px;width:${Math.max(v.w, 4)}px;height:${Math.max(v.h, 4)}px` }));
  }
  ov.append(artLayer);
  let ord = 0;
  for (const b of T.blocks.filter((x) => x.page === rt.page)) {
    const v = box(b.rect), iss = rtIssues(b), isArt = b.role === 'Artifact';
    if (!isArt) ord++;
    ov.append(el('button', { type: 'button', class: 'ov' + (iss ? ' issue' : '') + (rt.sel === b.id ? ' sel' : '') + (isArt ? ' rtartbox' : '') + (rt.multi.has(b.id) ? ' multi' : ''), 'data-rid': b.id,
      style: `--c:${isArt ? '#6B7280' : typeColor(b.role === 'L' ? 'L' : b.role)};left:${v.x}px;top:${v.y}px;width:${Math.max(v.w, 6)}px;height:${Math.max(v.h, 6)}px`,
      'aria-label': rtRoleName(b.role) + (isArt ? '' : ', reading order ' + ord) + ', ' + clip(rtLabel(b), 60) + (iss === 'error' ? ', needs alternative text' : iss ? ', not checked yet' : ''),
      onclick: (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) rtToggleMulti(b.id); else rtSelect(b.id, false); } },
      el('span', { class: 'labels', 'aria-hidden': 'true' }, el('span', { class: 'tag' }, isArt ? 'Artifact' : b.role)),
      isArt ? null : el('span', { class: 'ord', 'aria-hidden': 'true' }, String(ord))));
  }
  $('#rtSheet').classList.toggle('hide-order', !$('#rtShowOrder').checked);
  $('#rtSheet').classList.toggle('hide-tags', !$('#rtShowTags').checked);
  $('#rtPageLabel').textContent = 'Page ' + (rt.page + 1) + ' of ' + T.Xp.pages.length;
  $('#rtZoomLabel').textContent = Math.round(scale * 100) + '%';
  $('#rtPrev').disabled = rt.page <= 0; $('#rtNext').disabled = rt.page >= T.Xp.pages.length - 1;
  document.querySelectorAll('#rtLayout button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.layout === rt.layout ? 'true' : 'false'));
  const sel = document.querySelector('#rtOverlay .ov.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  await Promise.all(jobs);
}

/* ---- the selected tag ---- */
async function rtCrop(b) {
  if (rt.crops.has(b.id)) return rt.crops.get(b.id);
  const P = rt.T.Xp.pages[b.page];
  const r = await renderPageCanvas(P.proxy, 2);
  const c = cropRegion(r, P, b.rect, 1200);
  const url = c ? 'data:image/jpeg;base64,' + c.data : '';
  rt.crops.set(b.id, url);
  return url;
}
function renderRtProps() {
  const host = $('#rtProps'); host.replaceChildren();
  const b = rtFind(rt.sel);
  if (!b) { host.append(el('h2', {}, 'Tag'), el('p', { class: 'small muted' }, 'Select an item in the structure list or on the page.')); return; }
  const T = rt.T, i = T.blocks.indexOf(b);
  host.append(el('div', { class: 'props-head' }, el('h2', {}, rtRoleName(b.role)), chip(b.role === 'Artifact' ? 'Artifact' : b.role)));
  const texty = !!b.lines;
  const opts = b.role === 'Figure' && !texty ? ['Figure', 'Artifact'] : b.role === 'Table' ? ['Table', 'P', 'Artifact'] : texty ? ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'L', 'Figure', 'Artifact'] : ['Figure', 'Artifact'];
  if (b.role === 'Artifact' && b.was === 'Table') opts.unshift('Table');
  const sel = el('select', { id: 'rtRole', class: 'input' }, [...new Set([b.role, ...opts])].map((r) => el('option', { value: r, selected: r === b.role ? true : null }, b.role === 'Table' && r === 'P' ? 'Paragraphs (one per row)' : rtRoleName(r))));
  sel.addEventListener('change', () => { rtSetRole(b, sel.value); refocus('rtRole'); });
  host.append(field('Tag', sel, b.role === 'Artifact' ? 'Artifacts are skipped by screen readers. Use this for decoration, repeated headers and footers, and page numbers.' : 'What a screen reader announces this as.'));
  if (b.text && b.role !== 'Table') host.append(el('div', { class: 'srprev' }, el('h3', {}, 'Text'), el('p', { class: 'small' }, clip(b.text, 400))));
  if (b.role === 'Figure') {
    const img = el('img', { alt: '', class: 'rtthumb' });
    rtCrop(b).then((u) => { img.src = u; });
    const ta = el('textarea', { id: 'rtAlt', class: 'input' + (b.alt.trim() ? '' : ' bad'), rows: '3', 'aria-describedby': 'rtAltHelp' });
    ta.value = b.alt;
    ta.addEventListener('focus', () => { ta.dataset.rec = ''; });
    ta.addEventListener('input', () => { if (!ta.dataset.rec) { rtBefore(); ta.dataset.rec = '1'; } b.alt = ta.value; ta.classList.toggle('bad', !b.alt.trim()); rtRefreshSoon(); });
    host.append(img, el('div', { class: 'field' }, el('label', { for: 'rtAlt' }, 'Alternative text ', el('span', { class: 'req' }, 'Required')), ta,
      el('span', { id: 'rtAltHelp', class: 'help' }, 'Say what the image tells the reader. If it’s only decoration, change the tag to Artifact.')),
    b.suggestion ? el('div', { class: 'note' }, 'The original described it as “' + b.suggestion + '”. ', el('button', { type: 'button', class: 'btn link small', style: 'padding:0;min-height:32px', onclick: () => { ta.value = b.suggestion; ta.dispatchEvent(new Event('input')); ta.focus(); } }, 'Use this')) : null);
  }
  if (b.role === 'L') {
    const m = el('select', { id: 'rtMarker', class: 'input' }, MARKERS.map(([k, n]) => el('option', { value: k, selected: b.marker === k ? true : null }, n)));
    m.addEventListener('change', () => { rtBefore(); b.marker = m.value; refocus('rtMarker'); });
    host.append(field('Numbering announced', m, 'Only changes what screen readers announce; the page looks the same.'),
      el('div', { class: 'srprev' }, el('h3', {}, plural(b.items.length, 'item')), el('ol', { class: 'small', style: 'margin:4px 0 0;padding-left:20px' }, b.items.map((it) => el('li', {}, clip(it.text, 90))))));
  }
  if (b.role === 'Table') host.append(rtTableTools(b));
  const next = T.blocks[i + 1];
  host.append(el('div', { class: 'blockacts' },
    el('button', { type: 'button', class: 'btn', id: 'rtUp', disabled: i <= 0 ? true : null, onclick: () => rtMove(b, -1) }, 'Move up'),
    el('button', { type: 'button', class: 'btn', id: 'rtDown', disabled: i >= T.blocks.length - 1 ? true : null, onclick: () => rtMove(b, 1) }, 'Move down'),
    texty && next && next.lines && next.page === b.page && b.role !== 'Table' && next.role !== 'Table' ? el('button', { type: 'button', class: 'btn', onclick: () => rtMergeNext(b) }, 'Join with next') : null),
  el('p', { class: 'help', style: 'margin:8px 0 0' }, 'Moving changes the reading order only. The page itself never changes.'));
}
function rtTableTools(b) {
  const rows = b.rows.length, cols = b.rows[0].length;
  const chk = (id, label, key) => { const c = el('input', { type: 'checkbox', id, checked: b[key] ? true : null }); c.addEventListener('change', () => { rtBefore(); b[key] = c.checked; renderRtProps(); refocus(id); rtRefreshSoon(); }); return el('label', { class: 'check' }, c, el('span', {}, label)); };
  const grid = el('table', { class: 'rtgrid' }, el('tbody', {}, b.rows.map((row, r) => el('tr', {}, row.map((c, k) => {
    const th = (b.headerRow && r === 0) || (b.headerCol && k === 0);
    return el(th ? 'th' : 'td', th ? { scope: b.headerRow && r === 0 ? 'col' : 'row' } : {}, clip(c.text || '', 40) || '—');
  })))));
  const rowSel = el('select', { id: 'rtRowSel', class: 'input', 'aria-label': 'Row' }, b.rows.slice(0, -1).map((_, r) => el('option', { value: String(r) }, 'Row ' + (r + 1) + ' and ' + (r + 2))));
  const colSel = el('select', { id: 'rtColSel', class: 'input', 'aria-label': 'Column' }, b.rows[0].slice(0, -1).map((_, c) => el('option', { value: String(c) }, 'Column ' + (c + 1) + ' and ' + (c + 2))));
  const merge = (kind) => {
    rtBefore();
    if (kind === 'row') {
      const r = +rowSel.value;
      b.rows[r] = b.rows[r].map((c, k) => ({ text: [c.text, b.rows[r + 1][k].text].filter(Boolean).join(' '), units: [...c.units, ...b.rows[r + 1][k].units] }));
      b.rows.splice(r + 1, 1);
    } else {
      const c = +colSel.value;
      b.rows.forEach((row) => { row[c] = { text: [row[c].text, row[c + 1].text].filter(Boolean).join(' '), units: [...row[c].units, ...row[c + 1].units] }; row.splice(c + 1, 1); });
    }
    b.text = b.rows.map((r) => r.map((c) => c.text).join(' ')).join(' / ');
    renderRtProps(); refocus(kind === 'row' ? 'rtRowMerge' : 'rtColMerge'); rtRefreshSoon();
    announce('Merged. The table now has ' + b.rows.length + ' rows and ' + b.rows[0].length + ' columns.');
  };
  const reviewed = el('input', { type: 'checkbox', id: 'rtReviewed', checked: b.reviewed ? true : null });
  reviewed.addEventListener('change', () => { rtBefore(); b.reviewed = reviewed.checked; rtRefreshSoon(true); refocus('rtReviewed'); });
  return el('div', {},
    el('p', { class: 'small muted', style: 'margin:8px 0' }, 'Found ' + (b.source === 'rules' ? 'from its ruling lines' : 'from text that lines up in columns') + '. ' + rows + ' rows, ' + cols + ' columns.'),
    el('div', { class: 'table-wrap rtgridwrap' }, grid),
    el('fieldset', { class: 'fs' }, el('legend', {}, 'Header cells'), chk('rtHeadRow', 'First row is headers (scope: column)', 'headerRow'), chk('rtHeadCol', 'First column is headers (scope: row)', 'headerCol')),
    rows > 1 ? el('div', { class: 'rtmerge' }, rowSel, el('button', { type: 'button', class: 'btn', id: 'rtRowMerge', onclick: () => merge('row') }, 'Merge rows')) : null,
    cols > 1 ? el('div', { class: 'rtmerge' }, colSel, el('button', { type: 'button', class: 'btn', id: 'rtColMerge', onclick: () => merge('col') }, 'Merge columns')) : null,
    el('p', { class: 'help' }, 'Merge rows when one cell’s text wrapped onto two lines and was split. Cells can only be merged, not split, because the page content can’t move.'),
    el('label', { class: 'check', style: 'margin-top:6px' }, reviewed, el('span', {}, 'I’ve checked this table')));
}
function rtRectOfUnits(page, units) {
  const P = rt.T.Xp.pages[page], set = new Set(units); let r = null;
  for (const it of P.items) if (set.has(it.mcid)) r = r ? union(r, itemRect(it)) : itemRect(it);
  for (const im of P.images) if (set.has(im.mcid)) r = r ? union(r, im.rect) : im.rect.slice();
  return r;
}
let rtTimer;
function rtRefreshSoon(now) { clearTimeout(rtTimer); rtTimer = setTimeout(() => { renderRtList(); renderRtSummary(); rtRenderPage(); }, now ? 0 : 400); }

function rtSetRole(b, role, quiet) {
  if (!quiet) rtBefore();
  const T = rt.T, i = T.blocks.indexOf(b), from = b.role;
  const allUnits = () => (b.role === 'L' ? b.items.flatMap((it) => [...it.lbl, ...it.body]) : b.role === 'Table' ? b.rows.flatMap((r) => r.flatMap((c) => c.units)) : b.units || []);
  if (from === 'Table' && role === 'P') {
    const ps = b.lines.filter((l) => l.units.length).map((l) => ({ id: 't' + Math.random().toString(36).slice(2, 9), page: b.page, rect: rtRectOfUnits(b.page, l.units) || b.rect, role: 'P', text: l.text, units: l.units.slice(), lines: [l] }));
    T.blocks.splice(i, 1, ...ps);
    rt.sel = ps[0] ? ps[0].id : null;
    if (!quiet) { announce('Table changed into ' + plural(ps.length, 'paragraph') + '.'); renderRetag(); }
    return;
  }
  if (role === 'L' && b.lines) {
    const items = [];
    for (const l of b.lines) {
      if (!items.length || markerInfo(l.text) || !b.lines.some((x) => markerInfo(x.text))) items.push({ text: (markerInfo(l.text) || { rest: l.text }).rest, lbl: [], body: l.units.slice() });
      else { const it = items[items.length - 1]; it.text += ' ' + l.text; it.body.push(...l.units); }
    }
    if (b.role !== 'L') { b.units = allUnits(); }
    Object.assign(b, { role: 'L', items, marker: (b.lines.map((l) => markerInfo(l.text)).find(Boolean) || { marker: 'disc' }).marker });
  } else if (role === 'Table' && b.was === 'Table') {
    b.role = 'Table';
  } else {
    if (from === 'L' || from === 'Table') b.units = allUnits();
    if (from === 'Table' && role === 'Artifact') b.was = 'Table';
    else if (from !== 'Table') { delete b.rows; }
    if (role !== 'L') delete b.items;
    b.role = role;
    if (role === 'Figure' && b.alt == null) b.alt = '';
  }
  if (!quiet) { announce(rtRoleName(b.role) + '.'); renderRetag(); }
}
function rtMove(b, dir, focusId) {
  const bs = rt.T.blocks, i = bs.indexOf(b);
  let j = i + dir;
  while (j >= 0 && j < bs.length && bs[j].page !== b.page) j += dir;     // the reading order changes within the page
  if (j < 0 || j >= bs.length || bs[j].page !== b.page) { announce('Already ' + (dir < 0 ? 'first' : 'last') + ' on this page.'); return; }
  rtBefore();
  [bs[i], bs[j]] = [bs[j], bs[i]];
  renderRetag(); refocus(focusId || (dir < 0 ? 'rtUp' : 'rtDown'));
  announce('Moved ' + (dir < 0 ? 'up' : 'down') + ' in the reading order.');
}
function rtMergeNext(b) {
  const bs = rt.T.blocks, i = bs.indexOf(b), n = bs[i + 1];
  if (!n || !n.lines) return;
  rtBefore();
  const nu = n.role === 'L' ? n.items.flatMap((it) => [...it.lbl, ...it.body]) : n.units;
  if (b.role === 'L') b.items.push(...(n.role === 'L' ? n.items : [{ text: n.text, lbl: [], body: nu.slice() }]));
  else b.units = [...b.units, ...nu];
  b.lines = [...b.lines, ...n.lines];
  b.text = joinLines([{ text: b.text }, { text: n.text }]);
  b.rect = union(b.rect, n.rect);
  bs.splice(i + 1, 1);
  announce('Joined with the next item.');
  renderRetag();
}
function rtRestore(a) {
  const T = rt.T;
  rtBefore();
  a.restored = true;
  const units = [];
  for (const [u] of T.artifacts[a.page]) {
    const P = T.Xp.pages[a.page];
    const hit = (a.items || []).some((id) => { const it = P.items.find((x) => x.id === id); return it && it.mcid === u; }) || (a.images || []).some((id) => { const im = P.images.find((x) => x.id === id); return im && im.mcid === u; });
    if (hit) units.push(u);
  }
  units.forEach((u) => T.artifacts[a.page].delete(u));
  const blk = { id: 't' + Math.random().toString(36).slice(2, 9), page: a.page, rect: a.rect, role: a.kind === 'image' ? 'Figure' : 'P', text: a.text || '', alt: '', units, lines: a.kind === 'image' ? null : [{ text: a.text || '', units }] };
  let at = T.blocks.length;
  for (let k = T.blocks.length - 1; k >= 0; k--) if (T.blocks[k].page === a.page) { at = k + 1; break; }
  T.blocks.splice(at, 0, blk);
  rt.sel = blk.id;
  announce('It will be read now, at the end of page ' + (a.page + 1) + '. Move it if it belongs elsewhere.');
  renderRetag();
}

/* ---- what still needs doing ---- */
function rtProblems() {
  const T = rt.T, errs = [], warns = [];
  if (!$('#rtTitle').value.trim()) errs.push({ title: 'The document has no title', focus: 'rtTitle' });
  if (!validLang($('#rtLang').value)) errs.push({ title: 'Choose the document language', focus: 'rtLang' });
  for (const b of T.blocks) if (b.role === 'Figure' && !(b.alt || '').trim()) errs.push({ title: 'Image on page ' + (b.page + 1) + ' needs alternative text', id: b.id });
  for (const b of T.blocks) if (b.role === 'Table' && !b.reviewed) warns.push({ title: 'Table on page ' + (b.page + 1) + ' not checked yet', id: b.id });
  let prev = 0;
  for (const b of T.blocks) { const m = /^H([1-6])$/.exec(b.role); if (!m) continue; const l = +m[1]; if (prev && l > prev + 1) warns.push({ title: 'Heading level skipped: H' + prev + ' to H' + l, id: b.id }); prev = l; }
  return { errs, warns };
}
function renderRtSummary() {
  const host = $('#rtSummary'); if (!host || !rt.T) return;
  const T = rt.T, { errs, warns } = rtProblems(), c = taggedConformance(T);
  const item = (p, sev) => el('li', {}, el('button', { type: 'button', class: 'finding', onclick: () => { if (p.id) rtSelect(p.id, true); else refocus(p.focus); } }, icon(sev), el('span', { class: 't' }, p.title)));
  fill(host, 
    errs.length ? el('div', { class: 'blocked' }, icon('error'), el('span', {}, el('strong', { style: 'display:block' }, plural(errs.length, 'thing') + ' to fix before writing'))) :
      el('div', { class: 'okbox' }, icon('ok'), el('span', {}, el('strong', { style: 'display:block' }, 'Ready to write'), el('span', { class: 'small' }, warns.length ? plural(warns.length, 'warning') + ' to review.' : 'Nothing flagged.'))),
    errs.length || warns.length ? el('ul', { class: 'findings-list' }, errs.map((p) => item(p, 'error')), warns.map((p) => item(p, 'warning'))) : null,
    c.ua ? null : el('div', { class: 'note warnnote' }, el('strong', { style: 'display:block' }, 'This file can’t claim PDF/UA'), 'Because ' + c.why.join('; ') + '. The tags still help screen-reader users, but rebuilding is the way to a fully conforming file.'),
    T.flags.length ? el('details', { class: 'more' }, el('summary', {}, plural(T.flags.length, 'layout warning')), el('ul', {}, T.flags.map((f) => el('li', {}, el('strong', {}, f.title), '. ', f.detail)))) : null,
    complexCaveat(),
    el('details', { class: 'more' }, el('summary', {}, 'What tagging in place can’t fix'),
      el('ul', {}, el('li', {}, 'Colour contrast, small text and how the page looks'), el('li', {}, 'Text that is really a picture of text (it needs OCR)'),
        el('li', {}, 'Fonts that aren’t embedded, or that don’t map to real characters'), el('li', {}, 'Form fields, which aren’t tagged yet'),
        el('li', {}, 'Link text such as “click here”'), el('li', {}, 'Reflow: the text can’t be resized to fit a small screen'))));
}

/* ---- prompting for alternative text ---- */
async function describeTagImages(startId) {
  const T = rt.T;
  const figs = T.blocks.filter((b) => b.role === 'Figure' || (b.role === 'Artifact' && b.altAsked));
  if (!figs.length) { announce('There are no images to describe.'); return; }
  const entries = [];
  for (const b of figs) {
    const i = T.blocks.indexOf(b);
    const ctx = [T.blocks[i - 1], T.blocks[i + 1]].filter((x) => x && x.text && x.role !== 'Artifact').map((x) => (x.caption ? 'Caption: ' : '') + '“' + clip(x.text, 140) + '”').join(' … ');
    entries.push({ title: 'Image on page ' + (b.page + 1), img: await rtCrop(b), context: ctx, alt: b.alt || '', suggestion: b.suggestion || '', decorative: b.role === 'Artifact',
      save: (alt, deco) => { rtBefore(); b.alt = deco ? b.alt : alt; b.altAsked = true; b.role = deco ? 'Artifact' : 'Figure'; } });
  }
  let start = startId ? figs.findIndex((b) => b.id === startId) : figs.findIndex((b) => b.role === 'Figure' && !(b.alt || '').trim());
  openAltDialog(entries, Math.max(0, start), () => renderRetag());
}

/* ---- writing ---- */
async function rtWrite() {
  const T = rt.T;
  T.title = $('#rtTitle').value.trim(); T.lang = $('#rtLang').value;
  const { errs } = rtProblems();
  if (errs.length) {
    renderRtSummary();
    const p = errs[0];
    if (p.id) { const b = rtFind(p.id); if (b && b.role === 'Figure') { describeTagImages(p.id); return; } rtSelect(p.id, true); } else refocus(p.focus);
    announce(plural(errs.length, 'thing') + ' to fix before writing: ' + p.title + '.');
    return;
  }
  const dlg = $('#exportDialog'), body = $('#exportBody'), foot = $('#exportFoot');
  $('#expTitle').textContent = 'Write tagged PDF';
  const status = el('p', { role: 'status', class: 'small muted' }, 'Writing the tagged PDF…');
  fill(body, status); fill(foot, el('button', { type: 'button', class: 'btn push', onclick: () => dlg.close() }, 'Close'));
  dlg.showModal();
  try {
    const out = await writeTagged(T);
    status.textContent = 'Checking the written file…';
    const { A, C } = await auditBytes(out.bytes.slice());
    const e = C.findings.filter((f) => f.severity === 'error'), w = C.findings.filter((f) => f.severity === 'warning');
    const passed = C.results.filter((r) => r.status === 'pass' || r.status === 'na').length;
    const fname = T.name.replace(/\.pdf$/i, '') + '-tagged.pdf';
    rt.lastBytes = out.bytes; rt.lastName = fname;
    const tags = A.ordered.length;
    fill(body, 
      e.length ? el('div', { class: 'blocked', role: 'alert' }, icon('error'), el('span', {}, el('strong', { style: 'display:block' }, 'Written, but the file still fails ' + plural(e.length, 'check')), el('span', { class: 'small' }, 'See the list below. Some problems are in the original content and can only be fixed by rebuilding.')))
        : el('div', { class: 'okbox', role: 'status' }, icon('ok'), el('span', {}, el('strong', { style: 'display:block' }, 'Ready: ' + fname), el('span', { class: 'small' }, plural(A.doc.pages, 'page') + ', ' + Math.max(1, Math.round(out.bytes.length / 1024)) + ' KB, ' + plural(tags, 'tag') + '. Re-checked: 0 errors, ' + plural(passed, 'rule') + ' passed.'))),
      e.length || w.length ? el('ul', { class: 'plain' }, [...e, ...w].map((f) => el('li', {}, (f.severity === 'error' ? 'Error: ' : 'Warning: ') + f.title))) : null,
      out.conform.ua ? el('p', { class: 'small' }, 'The file declares PDF/UA-1 in its metadata.') : el('div', { class: 'note warnnote' }, 'The file does not claim PDF/UA, because ' + out.conform.why.join('; ') + '.'),
      el('p', { class: 'small muted' }, 'The pages are unchanged. Before relying on the file, run it through veraPDF or PAC and listen to it with a screen reader.'));
    const note = el('span', { class: 'small muted', 'aria-live': 'polite' });
    const dl = el('button', { type: 'button', class: 'btn primary', onclick: async () => {
      try { await saveFile(fname, new Blob([rt.lastBytes], { type: 'application/pdf' })); note.textContent = 'Saved.'; }
      catch (err) { note.textContent = err && err.code === 'declined' ? 'Download cancelled.' : 'The file couldn’t be saved here.'; }
    } }, 'Download tagged PDF');
    const view = el('button', { type: 'button', class: 'btn', onclick: () => { dlg.close(); openBytes(rt.lastBytes.slice(), fname); } }, 'View its tags');
    fill(foot, dl, note, view, el('button', { type: 'button', class: 'btn push', onclick: () => dlg.close() }, 'Back to tagging'));
    dl.focus();
  } catch (err) {
    console.error(err);
    fill(body, el('div', { class: 'blocked', role: 'alert' }, icon('error'), el('span', {}, el('strong', { style: 'display:block' }, 'The tagged PDF could not be written'), el('span', { class: 'small' }, String(err && err.message || err)))));
  }
}
function rtClose() {
  if (!confirm('Close tagging? Changes you made here are not saved.')) return;
  rt.T = null;
  setMode('home');
}

$('#rtWrite').addEventListener('click', rtWrite);
$('#rtDescribe').addEventListener('click', () => describeTagImages());
$('#rtCancel').addEventListener('click', rtClose);
$('#rtPrev').addEventListener('click', () => { rt.page--; rtRenderPage(); });
$('#rtNext').addEventListener('click', () => { rt.page++; rtRenderPage(); });
$('#rtShowOrder').addEventListener('change', (e) => $('#rtSheet').classList.toggle('hide-order', !e.target.checked));
$('#rtShowTags').addEventListener('change', (e) => $('#rtSheet').classList.toggle('hide-tags', !e.target.checked));
$('#rtShowArt').addEventListener('change', (e) => { const l = document.querySelector('.rtart-layer'); if (l) l.hidden = !e.target.checked; });
$('#rtTitle').addEventListener('input', () => { rt.T.title = $('#rtTitle').value; rtRefreshSoon(); });
$('#rtLang').addEventListener('change', () => { rt.T.lang = $('#rtLang').value; renderRtSummary(); });
$('#backToRetag').addEventListener('click', () => { if (rt.T) { setMode('retag'); renderRetag(); } });

/* ---- undo and redo for tagging ---- */
function rtSnap() {
  const T = rt.T;
  return JSON.stringify({ blocks: T.blocks, arts: T.artifacts.map((m) => [...m]), restored: T.removed.map((a) => !!a.restored) });
}
function rtBefore() { if (!rt.T) return; rt.past.push(rtSnap()); if (rt.past.length > 100) rt.past.shift(); rt.future = []; rtUpdateHistory(); }
function rtApply(s) {
  const T = rt.T, o = JSON.parse(s);
  T.blocks = o.blocks; T.artifacts = o.arts.map((a) => new Map(a)); T.removed.forEach((a, i) => { a.restored = o.restored[i]; });
  rt.multi = new Set([...rt.multi].filter((id) => rtFind(id)));
  if (!rtFind(rt.sel)) rt.sel = T.blocks[0] ? T.blocks[0].id : null;
  rt.crops = new Map();
  renderRetag();
}
function rtUndo() { if (!rt.past.length) { announce('Nothing to undo.'); return; } rt.future.push(rtSnap()); rtApply(rt.past.pop()); rtUpdateHistory(); announce('Undone.'); }
function rtRedo() { if (!rt.future.length) { announce('Nothing to redo.'); return; } rt.past.push(rtSnap()); rtApply(rt.future.pop()); rtUpdateHistory(); announce('Redone.'); }
function rtUpdateHistory() { $('#rtUndo').disabled = !rt.past.length; $('#rtRedo').disabled = !rt.future.length; }

/* ---- the toolbar ---- */
const rtTextual = (b) => !!b && !!b.lines && b.role !== 'Table';
function rtTargets() { const ids = rt.multi.size ? [...rt.multi] : rt.sel ? [rt.sel] : []; return rt.T.blocks.filter((b) => ids.includes(b.id)); }
function rtRoleAllowed(b, role) {
  if (role === b.role) return true;
  if (b.role === 'Table') return role === 'P' || role === 'Artifact';
  if (role === 'Table') return b.was === 'Table';
  if (!b.lines) return role === 'Figure' || role === 'Artifact';           // an image
  return true;
}
function rtUpdateToolbar() {
  if (!rt.T) return;
  const ts = rtTargets(), roles = new Set(ts.map((b) => b.role));
  document.querySelectorAll('#rtTagAs .tagbtn').forEach((btn) => {
    const r = btn.dataset.role;
    btn.disabled = !ts.length || !ts.every((b) => rtRoleAllowed(b, r));
    btn.setAttribute('aria-pressed', roles.size === 1 && roles.has(r) ? 'true' : 'false');
  });
  const more = $('#rtTagMore'); more.disabled = !ts.length || !ts.every((b) => rtRoleAllowed(b, 'H4'));
  more.value = roles.size === 1 && /^H[4-6]$/.test([...roles][0]) ? [...roles][0] : '';
  const b = rtFind(rt.sel);
  $('#rtSplitBtn').disabled = !(ts.length === 1 && rtTextual(ts[0]) && ts[0].role !== 'L' && ts[0].lines.length > 1);
  $('#rtCombineBtn').disabled = !(ts.filter(rtTextual).length >= 2 || (ts.length === 1 && rtTextual(ts[0]) && rt.T.blocks.slice(rt.T.blocks.indexOf(ts[0]) + 1).some((x) => x.page === ts[0].page && rtTextual(x))));
  $('#rtUpBtn').disabled = !b || ts.length > 1; $('#rtDownBtn').disabled = !b || ts.length > 1;
  rtUpdateHistory();
}
function rtMarkOverlays() { document.querySelectorAll('#rtOverlay .ov').forEach((o) => o.classList.toggle('multi', rt.multi.has(o.dataset.rid))); }
function rtToggleMulti(id) {
  if (!rt.multi.size && rt.sel && rt.sel !== id) rt.multi.add(rt.sel);
  if (rt.multi.has(id)) rt.multi.delete(id); else rt.multi.add(id);
  renderRtList(); rtMarkOverlays(); rtUpdateToolbar();
  announce(plural(rt.multi.size, 'tag') + ' selected.');
}
function rtTagAs(role) {
  const ts = rtTargets().filter((b) => rtRoleAllowed(b, role));
  if (!ts.length) return;
  rtBefore();
  for (const b of ts) if (b.role !== role) rtSetRole(b, role, true);
  announce(plural(ts.length, 'tag') + ' now ' + rtRoleName(role) + '.');
  renderRetag();
}
document.querySelectorAll('#rtTagAs .tagbtn').forEach((btn) => btn.addEventListener('click', () => { rtTagAs(btn.dataset.role); refocus(btn.id || ''); btn.focus(); }));
$('#rtTagMore').addEventListener('change', (e) => { if (e.target.value) rtTagAs(e.target.value); refocus('rtTagMore'); });

/* ---- combining and splitting tags ---- */
function rtCombinedRole(bs, role) {
  const keep = bs[0];
  const units = bs.flatMap((b) => (b.role === 'L' ? b.items.flatMap((it) => [...it.lbl, ...it.body]) : b.units || []));
  return { units, lines: bs.flatMap((b) => b.lines || []), text: joinLines(bs.map((b) => ({ text: b.text || b.alt || '' }))), rect: bs.reduce((r, b) => union(r, b.rect), keep.rect.slice()), role };
}
function rtDoCombine(ids, role) {
  const T = rt.T;
  const bs = T.blocks.filter((b) => ids.includes(b.id) && rtTextual(b));
  if (bs.length < 2) return;
  const page = bs[0].page;
  if (bs.some((b) => b.page !== page)) { announce('Tags on different pages can’t be combined yet.'); return; }
  rtBefore();
  const first = bs[0], c = rtCombinedRole(bs, role || first.role);
  delete first.items; delete first.rows;
  Object.assign(first, { units: c.units, lines: c.lines, text: c.text, rect: c.rect, role: 'P' });
  const gone = new Set(bs.slice(1).map((b) => b.id));
  T.blocks = T.blocks.filter((b) => !gone.has(b.id));
  rtSetRole(first, c.role, true);
  if (first.role === 'Figure' && first.alt == null) first.alt = '';
  rt.multi.clear(); rt.sel = first.id;
  announce('Combined ' + plural(bs.length, 'tag') + ' into one ' + rtRoleName(first.role) + '. Undo is available.');
  renderRetag();
}
function rtOpenCombine() {
  const T = rt.T, ts = rtTargets();
  const chosen = new Set(ts.filter(rtTextual).map((b) => b.id));
  let rows;
  if (chosen.size >= 2) {
    const idx = [...chosen].map((id) => T.blocks.indexOf(rtFind(id)));
    rows = T.blocks.slice(Math.min(...idx), Math.max(...idx) + 1);
  } else {
    const a = Math.max(0, T.blocks.indexOf(rtFind(rt.sel)));
    rows = []; let n = 0;
    for (const b of T.blocks.slice(a)) { if (b.page !== T.blocks[a].page) break; rows.push(b); if (rtTextual(b)) n++; if (n >= 7) break; }
    const next = rows.slice(1).find(rtTextual);
    if (next) chosen.add(next.id);
  }
  const page = rows[0] ? rows[0].page : 0;
  const dlg = $('#combineDialog'), body = $('#combineBody'), foot = $('#combineFoot');
  let role = null;
  const draw = () => {
    const bs = T.blocks.filter((b) => chosen.has(b.id));
    if (!role) role = bs[0] ? (bs[0].role === 'Artifact' ? 'P' : bs[0].role) : 'P';
    const preview = bs.length >= 2 ? joinLines(bs.map((b) => ({ text: b.text || '' }))) : '';
    fill(body,
      el('p', { style: 'margin:0' }, 'Choose the tags to join into one. The page doesn’t change; only how it is read.'),
      el('ul', { class: 'combine-list' }, rows.map((b) => {
        if (!rtTextual(b) || b.page !== page) return el('li', { class: 'skip' }, chip(b.role), el('span', {}, clip(rtLabel(b), 70), el('span', { class: 'small', style: 'display:block' }, b.role === 'Table' ? 'Tables can’t be combined.' : b.page !== page ? 'On another page.' : 'An image, so it isn’t joined. It is read straight after the combined tag.')));
        const cb = el('input', { type: 'checkbox', id: 'rcmb-' + b.id, checked: chosen.has(b.id) ? true : null });
        cb.addEventListener('change', () => { if (cb.checked) chosen.add(b.id); else chosen.delete(b.id); draw(); refocus('rcmb-' + b.id); });
        return el('li', {}, cb, el('label', { for: 'rcmb-' + b.id, style: 'display:flex;gap:8px;align-items:center;flex:1;min-width:0' }, chip(b.role), el('span', {}, clip(rtLabel(b), 80))));
      })),
      el('fieldset', { class: 'fs' }, el('legend', {}, 'The combined tag is'),
        el('div', { class: 'fs inline', style: 'margin:0;flex-wrap:wrap' }, ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'L', 'Figure'].map((r) => {
          const x = el('input', { type: 'radio', name: 'rcmbRole', id: 'rcmbR-' + r, checked: r === role ? true : null });
          x.addEventListener('change', () => { role = r; draw(); refocus('rcmbR-' + r); });
          return el('label', { class: 'choice', style: 'min-width:120px' }, x, el('span', {}, el('b', {}, rtRoleName(r).replace(' (image)', ''))));
        }))),
      preview ? el('div', { class: 'combine-prev', role: 'status' }, el('strong', { style: 'display:block' }, 'Result: ' + rtRoleName(role)), el('span', {}, clip(preview, 300))) : el('p', { class: 'small muted' }, 'Select at least two tags.'));
    fill(foot, el('span', { class: 'push' }), el('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cancel'),
      el('button', { type: 'button', class: 'btn primary', disabled: bs.length < 2 ? true : null, onclick: () => { dlg.close(); rtDoCombine([...chosen], role); } }, 'Combine'));
  };
  $('#combineTitle').textContent = 'Combine tags';
  draw(); dlg.showModal();
  const f = body.querySelector('input'); if (f) f.focus();
}
function rtSplit() {
  const b = rtTargets()[0];
  if (!b || !rtTextual(b) || b.role === 'L' || b.lines.length < 2) return;
  rtBefore();
  const T = rt.T, i = T.blocks.indexOf(b);
  const parts = b.lines.filter((l) => l.units.length).map((l, k) => ({ id: k ? 't' + Math.random().toString(36).slice(2, 9) : b.id, page: b.page, rect: rtRectOfUnits(b.page, l.units) || b.rect, role: b.role, text: l.text, units: l.units.slice(), lines: [l], alt: b.alt }));
  T.blocks.splice(i, 1, ...parts);
  rt.multi.clear(); rt.sel = parts[0].id;
  announce('Split into ' + plural(parts.length, 'tag') + ', one per line.');
  renderRetag();
}
$('#rtCombineBtn').addEventListener('click', rtOpenCombine);
$('#rtSplitBtn').addEventListener('click', rtSplit);
$('#rtUpBtn').addEventListener('click', () => { const b = rtFind(rt.sel); if (b) rtMove(b, -1, 'rtUpBtn'); });
$('#rtDownBtn').addEventListener('click', () => { const b = rtFind(rt.sel); if (b) rtMove(b, 1, 'rtDownBtn'); });
$('#rtUndo').addEventListener('click', rtUndo);
$('#rtRedo').addEventListener('click', rtRedo);
$('#rtZoomIn').addEventListener('click', () => { rt.zoom = Math.min(3, rt.zoom * 1.25); rtRenderPage(); });
$('#rtZoomOut').addEventListener('click', () => { rt.zoom = Math.max(0.4, rt.zoom / 1.25); rtRenderPage(); });
document.querySelectorAll('#rtLayout button').forEach((btn) => btn.addEventListener('click', () => { rt.layout = btn.dataset.layout; rtRenderPage(); announce(btn.textContent + '.'); }));
$('#rtList').addEventListener('keydown', (e) => { if (e.key === 'Escape' && rt.multi.size) { rt.multi.clear(); renderRtList(); rtMarkOverlays(); rtUpdateToolbar(); announce('Selection cleared.'); } });

/* ---- drag and drop in the structure list ---- */
const rtDrag = { id: null };
function rtDropTarget(e) {
  const rows = [...document.querySelectorAll('#rtList .rowwrap')], src = rtFind(rtDrag.id);
  for (const r of rows) {
    const box = r.getBoundingClientRect();
    if (e.clientY < box.top || e.clientY > box.bottom) continue;
    const b = rtFind(r.dataset.rid), mid = (e.clientY - box.top) / Math.max(1, box.height);
    if (!b || !src || b.id === src.id) return null;
    if (b.page !== src.page) return { otherPage: true };
    if (rtTextual(b) && rtTextual(src) && mid > 0.3 && mid < 0.7) return { combine: b.id, el: r };
    return { id: b.id, before: mid < 0.5, el: r };
  }
  return null;
}
function rtClearDrop() { document.querySelectorAll('#rtList .rtdropline').forEach((x) => x.remove()); document.querySelectorAll('#rtList .dropcombine').forEach((x) => x.classList.remove('dropcombine')); }
$('#rtList').addEventListener('dragstart', (e) => {
  const r = e.target.closest && e.target.closest('.rowwrap'); if (!r) return;
  rtDrag.id = r.dataset.rid;
  e.dataTransfer.setData('application/x-pwire-tag', rtDrag.id); e.dataTransfer.setData('text/plain', clip(rtLabel(rtFind(rtDrag.id)), 60));
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => r.classList.add('dragging'));
});
$('#rtList').addEventListener('dragover', (e) => {
  if (!rtDrag.id) return;
  e.preventDefault();
  const t = rtDropTarget(e); rtClearDrop();
  e.dataTransfer.dropEffect = t && !t.otherPage ? 'move' : 'none';
  if (!t || t.otherPage) return;
  if (t.combine) { t.el.classList.add('dropcombine'); return; }
  const line = el('div', { class: 'rtdropline', 'aria-hidden': 'true' });
  const li = t.el.closest('li');
  if (t.before) li.before(line); else li.after(line);
});
$('#rtList').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !$('#rtList').contains(e.relatedTarget)) rtClearDrop(); });
$('#rtList').addEventListener('dragend', () => { rtClearDrop(); document.querySelectorAll('#rtList .dragging').forEach((x) => x.classList.remove('dragging')); rtDrag.id = null; });
$('#rtList').addEventListener('drop', (e) => {
  if (!rtDrag.id) return;
  e.preventDefault();
  const t = rtDropTarget(e), id = rtDrag.id; rtClearDrop(); rtDrag.id = null;
  if (!t) return;
  if (t.otherPage) { announce('Tags can only be moved within their page.'); return; }
  if (t.combine) { const T = rt.T; const target = rtFind(t.combine); rtDoCombine(T.blocks.filter((b) => b.id === id || b.id === t.combine).map((b) => b.id), target.role === 'Artifact' ? 'P' : target.role); return; }
  const T = rt.T, b = rtFind(id);
  rtBefore();
  T.blocks.splice(T.blocks.indexOf(b), 1);
  const at = T.blocks.indexOf(rtFind(t.id)) + (t.before ? 0 : 1);
  T.blocks.splice(at, 0, b);
  rt.sel = b.id;
  announce('Moved in the reading order.');
  renderRetag();
});
