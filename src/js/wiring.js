/* ---------- wiring ---------- */
/* Check: the current draft as it would be exported, else the open PDF, else choose one */
async function checkMode() {
  if (state.mode === 'author' && author.doc) {
    try {
      announce('Building the PDF to check it…');
      const out = await buildPdf(author.doc);
      openBytes(out.bytes, slug(author.doc.title) + '.pdf');
    } catch (e) { console.error(e); alert('The draft could not be built: ' + (e.message || e)); }
  } else if (state.pdf) setMode('audit');
  else $('#checkInput').click();
}
async function openAny(file) {
  if (!file) return;
  if (/\.(pwj|json)$/i.test(file.name) || file.type === 'application/json') { openDraftFile(file); return; }
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { showError('“' + file.name + '” is not a PDF or a .pwj draft.'); return; }
  openBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}
function openSample() {
  const bin = atob(SAMPLE_PDF_B64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  openBytes(bytes, 'riverside-sample.pdf');
}
$('#dLang').append(...LANGS.map(([v, n]) => el('option', { value: v }, n + ' (' + v + ')')));
$('#dFont').append(...fontOptions(DEFAULT_FONT).filter(Boolean));
$('#fontLicBtn').addEventListener('click', openFontLicences);
$('#fontsClose').addEventListener('click', () => $('#fontsDialog').close());
$('#fontsClose2').addEventListener('click', () => $('#fontsDialog').close());
$('#fileInput').addEventListener('change', (e) => { openAny(e.target.files[0]); e.target.value = ''; });
$('#homeOpen').addEventListener('change', (e) => { openAny(e.target.files[0]); e.target.value = ''; });
$('#sampleBtn').addEventListener('click', openSample);
$('#homeSample').addEventListener('click', openSample);
$('#newBtn').addEventListener('click', () => openDocDialog('new'));
$('#homeNew').addEventListener('click', () => openDocDialog('new'));
$('#backToEdit').addEventListener('click', () => enterAuthor({ focusId: author.sel }));
$('#saveDraftBtn').addEventListener('click', saveDraftFile);
$('#exportBtn').addEventListener('click', openExport);
document.querySelectorAll('[data-insert]').forEach((b) => b.addEventListener('click', () => doInsert(b.dataset.insert)));
$('#homeBtn').addEventListener('click', () => setMode('home'));
$('#modeWrite').addEventListener('click', () => { if (author.doc) { if (state.mode !== 'author') enterAuthor({ focusId: author.sel }); setView('write'); } else openDocDialog('new'); });
$('#modePages').addEventListener('click', () => { if (!author.doc) return; if (state.mode !== 'author') enterAuthor({}); setView('pages'); });
$('#modeCheck').addEventListener('click', checkMode);
$('#modeRemediate').addEventListener('click', () => {
  if (rt.T) { setMode('retag'); renderRetag(); }
  else if (state.mode === 'audit' && state.bytes) startRemediation(state.bytes, state.fileName);
  else $('#remInput').click();
});
$('#checkInput').addEventListener('change', (e) => { openAny(e.target.files[0]); e.target.value = ''; });
$('#remInput').addEventListener('change', (e) => { remediateFile(e.target.files[0]); e.target.value = ''; });
$('#imgInput').addEventListener('change', (e) => onImageChosen(e.target.files[0]));
$('#docForm').addEventListener('submit', submitDocDialog);
$('#docCancel').addEventListener('click', () => $('#docDialog').close());
$('#docClose').addEventListener('click', () => $('#docDialog').close());
$('#expClose').addEventListener('click', () => $('#exportDialog').close());
$('#prevPage').addEventListener('click', () => goPage(state.pageIndex - 1));
$('#nextPage').addEventListener('click', () => goPage(state.pageIndex + 1));
$('#zoomIn').addEventListener('click', () => { state.zoom = Math.min(3, state.zoom * 1.25); renderPage(); });
$('#zoomOut').addEventListener('click', () => { state.zoom = Math.max(0.4, state.zoom / 1.25); renderPage(); });
$('#zoomFit').addEventListener('click', () => { state.zoom = 1; renderPage(); });
$('#showTags').addEventListener('change', (e) => $('#sheet').classList.toggle('hide-tags', !e.target.checked));
$('#showOrder').addEventListener('change', (e) => $('#sheet').classList.toggle('hide-order', !e.target.checked));
$('#showUntagged').addEventListener('change', (e) => { const l = document.querySelector('.untag-layer'); if (l) l.hidden = !e.target.checked; });
$('#reportBtn').addEventListener('click', openReport);
$('#closeReport').addEventListener('click', () => $('#reportDialog').close());
$('#closeReport2').addEventListener('click', () => $('#reportDialog').close());
$('#downloadReport').addEventListener('click', downloadReport);
const main = $('#main');
main.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropping'); });
main.addEventListener('dragleave', (e) => { if (e.target === main) document.body.classList.remove('dropping'); });
main.addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('dropping'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) openAny(f); });
let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
  if (state.mode === 'audit' && state.pdf) renderPage();
  if (state.mode === 'author') { document.querySelectorAll('#edSheet textarea.tx').forEach(autosize); schedulePreview(); }
  if (state.mode === 'retag' && rt.T) rtRenderPage();
}, 150); });

if (!pdfjsLib) showError('The PDF engine did not load. Check your connection and reload the page.');
else setMode('home');
window.__app = { state, author, openSample, buildPdf, auditBytes, remediate: REMEDIATE_API };
