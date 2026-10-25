/* ---------- rendering: tree ---------- */
function nodeLabel(n) {
  if (n.role === 'Figure') return n.alt ? n.alt : 'No alternative text';
  if (n.role === 'Table') { const r = rowsOf(n); return r.length + ' rows × ' + (r[0] ? r[0].kids.length : 0) + ' columns'; }
  if (n.role === 'TR') return n.kids.map((k) => k.text).filter(Boolean).join(' | ') || 'Row';
  if (CONTAINERS.has(n.role)) return n.kids.length + ' children';
  return n.text || '(empty)';
}
function renderTree() {
  const host = $('#tree'); host.replaceChildren();
  if (!state.doc.tagged) {
    $('#treeHint').textContent = 'This PDF has no tags. Screen readers will guess its structure.';
    return;
  }
  $('#treeHint').textContent = 'Tags in reading order. Select one to inspect it.';
  for (const p of state.pages) {
    const det = el('details', { class: 'tree-page', open: p.index === state.pageIndex ? true : null, 'data-page': p.index },
      el('summary', {}, 'Page ' + (p.index + 1), el('span', { class: 'count' }, plural(p.orderCount, 'block'))));
    if (!p.roots.length) det.append(el('p', { class: 'small muted', style: 'margin:0 16px 12px' }, 'No tags on this page.'));
    else {
      const build = (nodes) => el('ul', { class: 'tree', role: 'list' }, nodes.map((n) => {
        const w = worst(n.uid);
        const label = nodeLabel(n);
        const btn = el('button', { type: 'button', class: 'row', 'data-uid': n.uid, onclick: () => select(n.uid, true) },
          chip(n.role),
          el('span', { class: 'lbl' + (n.role === 'Figure' && !n.alt ? ' missing' : '') }, clip(label, 80)),
          w ? icon(w, w === 'error' ? 'Error' : 'Warning') : null);
        return el('li', {}, btn, n.kids.length ? build(n.kids) : null);
      }));
      det.append(build(p.roots));
    }
    host.append(det);
  }
}

/* ---------- rendering: inspector ---------- */
function renderInspector() {
  const host = $('#inspector'); host.replaceChildren();
  const n = state.selected && state.nodes.get(state.selected);
  if (!n) {
    host.append(el('p', { class: 'small muted', style: 'margin:6px 0 0' }, 'Select a tag in the tree or on the page to see its properties.'));
    return;
  }
  const props = [['Tag', chip(n.role)], ['Page', String(n.page + 1)]];
  const root = (function f(x) { while (x.parent) x = x.parent; return x; })(n);
  const ordered = (function f(x) { while (x && x.order == null) x = x.parent; return x; })(n);
  if (ordered) props.push(['Reading order', ordered.order + ' of ' + state.pages[n.page].orderCount + (ordered !== n ? ' (inside ' + ordered.role + ')' : '')]);
  if (n.role === 'Figure') props.push(['Alternative text', n.alt ? n.alt : el('span', { class: 'sev-error', style: 'font-weight:600' }, 'None')]);
  else if (n.alt) props.push(['Alternative text', n.alt]);
  if (n.lang) props.push(['Language', n.lang]);
  if (n.role === 'Table') { const r = rowsOf(n); props.push(['Rows', String(r.length)]); props.push(['Header cells', String(r.reduce((s, row) => s + row.kids.filter((k) => k.role === 'TH').length, 0))]); }
  if (n.objs.length) props.push(['Linked objects', n.objs.join(', ')]);
  if (n.text && n.role !== 'Figure') props.push(['Text', clip(n.text, 220)]);
  if (n.kids.length) props.push(['Child tags', n.kids.length + ' (' + [...new Set(n.kids.map((k) => k.role))].join(', ') + ')']);
  void root;
  host.append(el('dl', { class: 'props' }, props.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));
  const fs = state.byNode.get(n.uid) || [];
  if (fs.length) {
    host.append(el('ul', { style: 'list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px' },
      fs.map((f) => el('li', { style: 'display:flex;gap:8px;align-items:flex-start' }, icon(f.severity),
        el('span', {}, el('strong', { style: 'display:block' }, f.title), el('span', { class: 'small muted' }, criteriaText(f.rule)))))));
  } else {
    host.append(el('p', { class: 'small', style: 'margin:12px 0 0;display:flex;gap:6px;align-items:center' }, icon('ok'), 'No issues found on this tag.'));
  }
  host.append(el('p', { class: 'note' }, 'Existing PDFs are read-only in this build. Fixing them in place comes later; new documents can be created with New.'));
}

/* ---------- rendering: checker ---------- */
function renderChecker() {
  const host = $('#checker'); host.replaceChildren();
  const e = count('error'), w = count('warning');
  const passed = state.results.filter((r) => r.status === 'pass' || r.status === 'na');
  host.append(el('div', { class: 'summary' },
    el('div', { class: 'stat e' }, el('b', {}, String(e)), el('span', {}, e === 1 ? 'Error' : 'Errors')),
    el('div', { class: 'stat w' }, el('b', {}, String(w)), el('span', {}, w === 1 ? 'Warning' : 'Warnings')),
    el('div', { class: 'stat p' }, el('b', {}, String(passed.length)), el('span', {}, 'Rules passed'))));
  const list = el('div', { class: 'findings' });
  for (const [sev, label] of [['error', 'Errors'], ['warning', 'Warnings']]) {
    const fs = state.findings.filter((f) => f.severity === sev);
    if (!fs.length) continue;
    list.append(el('h3', {}, label));
    list.append(el('ul', {}, fs.map((f) => el('li', {}, el('button', {
      type: 'button', class: 'finding', 'data-fid': f.id, 'aria-current': state.selectedFinding === f.id ? 'true' : null,
      onclick: () => openFinding(f)
    }, icon(sev), el('span', { style: 'flex:1' },
      el('span', { class: 't' }, f.title),
      el('span', { class: 's' }, criteriaText(f.rule) + (f.page != null ? ' · Page ' + (f.page + 1) : ' · Document')),
      f.detail ? el('span', { class: 'd' }, f.detail) : null))))));
  }
  if (!e && !w) list.append(el('p', { style: 'display:flex;gap:8px;align-items:center;margin:14px 0 0' }, icon('ok'), 'No problems found by the automated rules. Complete the manual checks below.'));
  host.append(list);

  host.append(el('details', { class: 'more' }, el('summary', {}, plural(passed.length, 'rule') + ' passed'),
    el('ul', {}, passed.map((r) => el('li', {}, r.rule.title + (r.status === 'na' ? ' (nothing to check)' : ''))))));
  const skipped = state.results.filter((r) => r.status === 'skip');
  if (skipped.length) host.append(el('details', { class: 'more' }, el('summary', {}, plural(skipped.length, 'rule') + ' skipped'),
    el('ul', {}, skipped.map((r) => el('li', {}, r.rule.title + (state.doc.tagged ? '' : ' (needs tags)'))))));
  host.append(el('details', { class: 'more' }, el('summary', {}, 'Not checked by this version'),
    el('ul', {}, NOT_CHECKED.map(([t, w]) => el('li', {}, t + (w ? ' (' + w + ')' : ''))))));

  const man = el('fieldset', { class: 'manual', style: 'border:0;padding:0;margin:14px 0 0;border-top:1px solid var(--line-soft);padding-top:10px' },
    el('legend', { style: 'font-weight:600;padding:12px 0 0;float:left;width:100%' }, 'Needs a human check'),
    el('p', { class: 'small muted', style: 'clear:both;margin:4px 0 0' }, 'Automated rules can’t judge these. Your answers go into the report.'),
    MANUAL.map((m) => el('label', {}, el('input', { type: 'checkbox', checked: state.manual[m.id] ? true : null, onchange: (ev) => { state.manual[m.id] = ev.target.checked; } }),
      el('span', {}, m.text, el('span', { class: 'small muted', style: 'display:block' }, m.wcag + ' ' + WCAG[m.wcag])))));
  host.append(man);
}

function renderFacts() {
  const d = state.doc;
  const parts = ['Language: ' + (d.lang || 'not set'), 'Title: ' + (d.xmpTitle || d.infoTitle || 'not set'),
    'Tagged: ' + (d.tagged ? 'yes' : 'no'), 'PDF/UA claim: ' + (d.uaPart ? 'PDF/UA-' + d.uaPart : 'none')];
  $('#docFacts').replaceChildren(...parts.map((p) => el('span', {}, p)));
}

/* ---------- rendering: page ---------- */
async function renderPage() {
  const p = state.pages[state.pageIndex];
  if (!p) return;
  const base = p.proxy.getViewport({ scale: 1 });
  const avail = Math.max(280, $('#main').clientWidth - 64);
  state.fit = Math.min(2, Math.max(0.4, avail / base.width));
  const scale = state.fit * state.zoom;
  const vp = p.proxy.getViewport({ scale });
  const canvas = $('#canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
  canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
  $('#sheet').style.width = vp.width + 'px'; $('#sheet').style.height = vp.height + 'px';
  if (state.renderTask) { try { state.renderTask.cancel(); } catch (e) { /* ignore */ } }
  const ctx = canvas.getContext('2d');
  state.renderTask = p.proxy.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null, annotationMode: pdfjsLib.AnnotationMode ? pdfjsLib.AnnotationMode.ENABLE : undefined });
  drawOverlay(p, vp);
  updateNav();
  try { await state.renderTask.promise; } catch (e) { if (!e || e.name !== 'RenderingCancelledException') console.error(e); }
}
function toView(vp, r) {
  const v = vp.convertToViewportRectangle(r);
  return { x: Math.min(v[0], v[2]), y: Math.min(v[1], v[3]), w: Math.abs(v[2] - v[0]), h: Math.abs(v[3] - v[1]) };
}
function drawOverlay(p, vp) {
  const ov = $('#overlay'); ov.replaceChildren();
  // untagged content first, beneath tag overlays
  const ug = el('div', { class: 'untag-layer', 'aria-hidden': 'true' });
  for (const u of p.untagged) {
    const r = toView(vp, u.rect);
    ug.append(el('div', { class: 'untag', style: `left:${r.x}px;top:${r.y}px;width:${Math.max(r.w, 4)}px;height:${Math.max(r.h, 4)}px` }, el('span', {}, 'Untagged')));
  }
  ug.hidden = !$('#showUntagged').checked;
  ov.append(ug);
  const shown = [];
  const collect = (n) => { if (n.box && (n.order != null || n.role === 'Link' || n.role === 'Figure')) shown.push(n); n.kids.forEach(collect); };
  p.roots.forEach(collect);
  for (const n of shown) {
    const r = toView(vp, n.box);
    const w = worst(n.uid);
    const fs = state.byNode.get(n.uid) || [];
    const name = n.role === 'Figure' ? (n.alt ? 'image: ' + clip(n.alt, 60) : 'image with no alternative text') : clip(n.text || '', 60);
    const label = n.role + (n.order ? ', reading order ' + n.order : '') + ', ' + name + (fs.length ? ', ' + plural(fs.length, 'issue') : '');
    const b = el('button', { type: 'button', class: 'ov' + (w ? ' issue' : '') + (state.selected === n.uid ? ' sel' : ''), 'data-uid': n.uid,
      style: `--c:${typeColor(n.role)};left:${r.x}px;top:${r.y}px;width:${Math.max(r.w, 6)}px;height:${Math.max(r.h, 6)}px`,
      'aria-label': label, onclick: () => select(n.uid, false) },
      el('span', { class: 'labels', 'aria-hidden': 'true' },
        el('span', { class: 'tag' }, n.role),
        w ? el('span', { class: 'bad' + (w === 'warning' ? ' warn' : '') }, icon(w), el('span', { class: 'txt' }, clip(fs[0].title, 40) + (fs.length > 1 ? ' (+' + (fs.length - 1) + ')' : ''))) : null),
      n.order ? el('span', { class: 'ord', 'aria-hidden': 'true' }, String(n.order)) : null);
    ov.append(b);
  }
  $('#sheet').classList.toggle('hide-tags', !$('#showTags').checked);
  $('#sheet').classList.toggle('hide-order', !$('#showOrder').checked);
}
function updateNav() {
  const n = state.pages.length;
  $('#pageLabel').textContent = 'Page ' + (state.pageIndex + 1) + ' of ' + n;
  $('#prevPage').disabled = state.pageIndex <= 0;
  $('#nextPage').disabled = state.pageIndex >= n - 1;
  $('#zoomLabel').textContent = Math.round(state.fit * state.zoom * 100) + '%';
  document.querySelectorAll('.tree-page').forEach((d) => { d.open = +d.dataset.page === state.pageIndex; });
}
async function goPage(i) {
  if (i < 0 || i >= state.pages.length) return;
  state.pageIndex = i;
  await renderPage();
}

/* ---------- selection ---------- */
async function select(uid, fromTree) {
  const n = state.nodes.get(uid);
  if (!n) return;
  state.selected = uid;
  if (n.page !== state.pageIndex) await goPage(n.page);
  document.querySelectorAll('.row[aria-current]').forEach((r) => r.removeAttribute('aria-current'));
  const row = document.querySelector('.row[data-uid="' + uid + '"]');
  if (row) { row.setAttribute('aria-current', 'true'); const det = row.closest('details'); if (det) det.open = true; row.scrollIntoView({ block: 'nearest' }); }
  document.querySelectorAll('.ov.sel').forEach((o) => o.classList.remove('sel'));
  let target = n;
  let ovb = document.querySelector('.ov[data-uid="' + uid + '"]');
  while (!ovb && target.parent) { target = target.parent; ovb = document.querySelector('.ov[data-uid="' + target.uid + '"]'); }
  if (ovb) { ovb.classList.add('sel'); if (fromTree) ovb.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); }
  renderInspector();
}
async function openFinding(f) {
  state.selectedFinding = f.id;
  document.querySelectorAll('.finding[aria-current]').forEach((b) => b.removeAttribute('aria-current'));
  const b = document.querySelector('.finding[data-fid="' + f.id + '"]'); if (b) b.setAttribute('aria-current', 'true');
  if (f.node) await select(f.node.uid, true);
  else if (f.page != null) {
    await goPage(f.page);
    if (f.untagged) { $('#showUntagged').checked = true; document.querySelector('.untag-layer').hidden = false; const u = document.querySelector('.untag'); if (u) u.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
}

