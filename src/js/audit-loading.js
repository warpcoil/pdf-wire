/* ---------- loading ---------- */
async function openBytes(bytes, name) {
  if (!pdfjsLib) { showError('The PDF engine did not load. Check your connection and reload the page.'); return; }
  const seq = ++state.loadSeq;
  if (state.pdf) { try { state.pdf.destroy(); } catch (e) { /* ignore */ } }
  Object.assign(state, { pdf: null, bytes: bytes.slice(), fileName: name, pages: [], nodes: new Map(), ordered: [], doc: null, findings: [], results: [], byNode: new Map(), pageIndex: 0, zoom: 1, selected: null, selectedFinding: null, manual: {} });
  setMode('audit');
  $('#viewer').hidden = true; $('#reportBtn').disabled = true;
  $('#tree').replaceChildren(); $('#treeHint').textContent = 'Reading the tag tree…';
  $('#checker').replaceChildren(); $('#inspector').replaceChildren(el('p', { class: 'small muted', style: 'margin:6px 0 0' }, 'Select a tag in the tree or on the page to see its properties.'));
  setStatus(el('div', { class: 'status-msg', role: 'status' }, el('p', {}, 'Reading ' + name + '…')));
  try {
    const task = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false });
    task.onPassword = () => { task.destroy(); };
    const pdf = await task.promise;
    if (seq !== state.loadSeq) { pdf.destroy(); return; }
    const A = await auditPdf(pdf, () => seq !== state.loadSeq, (i, n) => setStatus(el('div', { class: 'status-msg', role: 'status' }, el('p', {}, 'Reading page ' + i + ' of ' + n + '…'))));
    if (!A || seq !== state.loadSeq) return;
    Object.assign(state, A, checkAudit(A), { pdf });
    setStatus(null);
    $('#viewer').hidden = false;
    $('#reportBtn').disabled = false;
    ['#zoomIn', '#zoomOut', '#zoomFit'].forEach((s) => { $(s).disabled = false; });
    renderTree(); renderChecker(); renderInspector(); renderFacts();
    await renderPage();
    const e = count('error'), w = count('warning');
    announce('Checked ' + name + ': ' + plural(e, 'error') + ', ' + plural(w, 'warning') + '.');
  } catch (err) {
    if (seq !== state.loadSeq) return;
    const msg = err && err.name === 'PasswordException'
      ? 'This PDF is password-protected. This version can’t open protected files yet.'
      : 'This file could not be read as a PDF' + (err && err.message ? ' (' + err.message + ')' : '') + '. Files that are badly damaged are not supported.';
    showError(msg);
  }
}
function setStatus(node) { const a = $('#statusArea'); a.replaceChildren(); if (node) a.append(node); }
function showError(msg) {
  setMode('home');
  setStatus(el('div', { class: 'status-msg' }, el('div', { class: 'alert', role: 'alert' }, msg)));
}

