/* ---------- remediation: choosing a method ---------- */
/* Save a file: through the host's download service when there is one (a published
   artifact), otherwise with an ordinary download link (a self-hosted copy, such as pdfwire.com). */
async function saveFile(filename, data, type) {
  if (downloads) return downloads.save({ filename, data });
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);                  // self-hosted copies: a plain download link
  const a = el('a', { href: url, download: filename, hidden: true });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

let remSeq = 0;
async function startRemediation(bytes, name) {
  if (!pdfjsLib) { showError('The PDF engine did not load. Check your connection and reload the page.'); return; }
  const seq = ++remSeq;
  const dlg = $('#remDialog'), body = $('#remBody'), foot = $('#remFoot');
  const status = el('p', { role: 'status', class: 'small muted' }, 'Reading “' + name + '”…');
  fill(body, status);
  fill(foot, el('button', { type: 'button', class: 'btn push', onclick: () => { remSeq++; dlg.close(); } }, 'Cancel'));
  $('#remTitle').textContent = 'Remediate a PDF';
  if (!dlg.open) dlg.showModal();
  try {
    if (remSource.pdf) { try { remSource.pdf.destroy(); } catch (e) { /* ignore */ } }
    Object.assign(remSource, { name: '', pdf: null, X: null, R: null, bytes: null, renders: new Map() });
    const task = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
    task.onPassword = () => { task.destroy(); };
    const pdf = await task.promise;
    const X = await extractPdf(pdf, { cancelled: () => seq !== remSeq, progress: (i, n) => { if (n > 4) status.textContent = 'Reading page ' + i + ' of ' + n + '…'; } });
    if (!X || seq !== remSeq) { pdf.destroy(); return; }
    status.textContent = 'Working out the structure…';
    await new Promise((r) => setTimeout(r, 0));
    const R = analyseLayout(X);
    Object.assign(remSource, { name, pdf, X, R, bytes: bytes.slice() });
    showRemChoice(name, X, R);
  } catch (err) {
    if (seq !== remSeq) return;
    console.error(err);
    fill(body, el('div', { class: 'alert', role: 'alert' }, err && err.name === 'PasswordException' ? 'This PDF is password-protected, so it can’t be remediated here.' : 'This file could not be read as a PDF' + (err && err.message ? ' (' + err.message + ')' : '') + '.'));
  }
}

function showRemChoice(name, X, R) {
  const body = $('#remBody'), foot = $('#remFoot');
  const n = (k) => R.blocks.filter((b) => b.kind === k).length;
  const hs = R.blocks.filter((b) => b.kind === 'heading'), levels = new Set(hs.map((h) => h.level)).size;
  const words = R.blocks.reduce((t, b) => t + wordCount(b.text || (b.items ? b.items.map((i) => i.text).join(' ') : '')), 0);
  const found = [
    plural(X.numPages, 'page') + (X.meta.tagged ? ', already tagged (the tags will be replaced)' : ', not tagged') + (words ? ', about ' + words.toLocaleString() + ' words' : ''),
    hs.length ? plural(hs.length, 'heading') + ' in ' + plural(levels, 'level') : 'No headings',
    plural(n('paragraph'), 'paragraph') + (n('list') ? ' and ' + plural(n('list'), 'list') : ''),
    n('table') ? plural(n('table'), 'table') : null,
    n('image') ? plural(n('image'), 'image') + ' (you’ll be asked to describe each one)' : null,
    R.artifacts.length ? plural(R.artifacts.length, 'header, footer, page number or decoration', 'headers, footers, page numbers and decorations') + ' to leave out' : null
  ].filter(Boolean);
  const choice = (val, title, rec, desc, extra) => el('label', { class: 'choice remchoice' },
    el('input', { type: 'radio', name: 'remMethod', value: val, checked: val === 'rebuild' ? true : null }),
    el('span', {}, el('b', {}, title, rec ? el('span', { class: 'req', style: 'margin-left:8px' }, rec) : null), el('span', {}, desc), extra || null));
  const conform = taggedConformance({ fontsMissing: X.fontsMissing, widgets: X.pages.reduce((t, p) => t + p.widgets, 0), scanned: R.flags.some((f) => f.kind === 'scan') });
  const hasDraft = !!(author.doc || loadLocalDraft());
  fill(body, 
    el('p', { style: 'margin:0' }, '“' + name + '”'),
    el('h3', {}, 'What was found'),
    el('ul', { class: 'plain' }, found.map((t) => el('li', {}, t))),
    R.flags.length ? el('ul', { class: 'findings-list' }, R.flags.map((f) => el('li', {}, el('div', { class: 'finding', style: 'cursor:default' }, icon('warning'), el('span', {}, el('span', { class: 't' }, f.title), el('span', { class: 'd' }, f.detail)))))) : null,
    complexCaveat(),
    el('fieldset', { class: 'fs' }, el('legend', {}, 'How do you want to fix it?'),
      choice('rebuild', 'Rebuild as a new accessible PDF', 'Recommended',
        'The content moves into the editor, where you check it and describe the images. It is then exported with PDF Wire’s layout and fonts, and must pass every check, like any document made here. The original’s look (fonts, colours and positions) isn’t kept.',
        hasDraft ? el('span', { class: 'small', style: 'display:block;margin-top:4px;color:var(--warn)' }, 'This replaces the draft kept in this browser. Save it first if you want to keep it.') : null),
      choice('tag', 'Tag the original in place', 'Experimental',
        'Every page stays exactly as it looks. Tags, reading order, alternative text, a title, a language and bookmark-friendly headings are added around the existing content. Problems inside the content itself, such as low contrast, text that is really a picture, or fonts that aren’t embedded, can’t be fixed this way.',
        conform.ua ? null : el('span', { class: 'small', style: 'display:block;margin-top:4px;color:var(--warn)' }, 'The tagged file won’t be able to claim PDF/UA: ' + conform.why.join('; ') + '.'))),
    el('p', { class: 'small muted' }, 'Not sure? Try both: they start from the same analysis, and the results can be checked here before you download anything.'));
  const go = el('button', { type: 'button', class: 'btn primary', onclick: () => {
    const m = (document.querySelector('input[name="remMethod"]:checked') || {}).value;
    if (m === 'tag') runTagInPlace(); else runRebuild();
  } }, 'Continue');
  fill(foot, el('span', { class: 'push' }), el('button', { type: 'button', class: 'btn', onclick: () => $('#remDialog').close() }, 'Cancel'), go);
  go.focus();
}

async function runRebuild() {
  const body = $('#remBody'), foot = $('#remFoot');
  const status = el('p', { role: 'status', class: 'small muted' }, 'Building the document…');
  fill(body, status); foot.replaceChildren();
  try {
    const d = await rebuildFromAnalysis(remSource.name, remSource.X, remSource.R, (t) => { status.textContent = t; });
    $('#remDialog').close();
    author.doc = normalizeDoc(d); author.sel = d.blocks[0] ? d.blocks[0].id : null; author.cell = null;
    enterAuthor({ focusId: author.sel });
    const imgs = d.blocks.filter((b) => b.type === 'image').length;
    announce('Rebuilt ' + remSource.name + ' as ' + plural(d.blocks.length, 'block') + '. Work through the remediation review before you export.');
    if (imgs) setTimeout(() => describeDocImages(), 150);
  } catch (err) {
    console.error(err);
    fill(body, el('div', { class: 'alert', role: 'alert' }, 'The document could not be rebuilt: ' + (err && err.message || err)));
    fill(foot, el('button', { type: 'button', class: 'btn push', onclick: () => $('#remDialog').close() }, 'Close'));
  }
}
async function runTagInPlace() {
  const body = $('#remBody'), foot = $('#remFoot');
  const status = el('p', { role: 'status', class: 'small muted' }, 'Preparing…');
  fill(body, status); foot.replaceChildren();
  try {
    const T = await prepareTagging(remSource.name, remSource.bytes, remSource.X, (t) => { status.textContent = t; });
    $('#remDialog').close();
    enterRetag(T);
    if (T.blocks.some((b) => b.role === 'Figure')) setTimeout(() => describeTagImages(), 150);
  } catch (err) {
    console.error(err);
    fill(body, el('div', { class: 'alert', role: 'alert' }, 'This PDF can’t be tagged in place: ' + (err && err.message || err) + ' You can still rebuild it.'));
    fill(foot, el('button', { type: 'button', class: 'btn', onclick: () => showRemChoice(remSource.name, remSource.X, remSource.R) }, 'Back'),
      el('button', { type: 'button', class: 'btn push', onclick: () => $('#remDialog').close() }, 'Close'));
  }
}

function remediateSample() {
  const bin = atob(REMEDIATE_SAMPLE_B64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  startRemediation(bytes, 'untagged-council-report.pdf');
}
async function remediateFile(file) {
  if (!file) return;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { showError('“' + file.name + '” is not a PDF.'); return; }
  startRemediation(new Uint8Array(await file.arrayBuffer()), file.name);
}

$('#homeRemediate').addEventListener('change', (e) => { remediateFile(e.target.files[0]); e.target.value = ''; });
$('#homeRemSample').addEventListener('click', remediateSample);
$('#remediateBtn').addEventListener('click', () => { if (state.bytes) startRemediation(state.bytes, state.fileName); });
$('#remClose').addEventListener('click', () => { remSeq++; $('#remDialog').close(); });
$('#altClose').addEventListener('click', () => $('#altDialog').close());
$('#origClose').addEventListener('click', () => $('#origDialog').close());
$('#origPrev').addEventListener('click', () => { origPage--; drawOriginal(); });
$('#origNext').addEventListener('click', () => { origPage++; drawOriginal(); });

const REMEDIATE_API = { extractPdf, analyseLayout, rebuildFromAnalysis, prepareTagging, writeTagged, remSource, startRemediation };
