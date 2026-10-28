/* ---------- drafts ---------- */
async function saveDraftFile() {
  if (!author.doc) return;
  const data = JSON.stringify(author.doc);
  try { await saveFile(slug(author.doc.title) + '.pwj', data, 'application/json'); announce('Draft saved.'); $('#saveChip').textContent = 'Draft saved to a file'; }
  catch (e) {
    if (e && e.code === 'rejected_extension') draftExtensionBlocked(data);
    else if (e && e.code !== 'declined') alert('The draft could not be saved here (' + (e.code || 'unavailable') + '). It is still kept in this browser.');
  }
}
function draftExtensionBlocked(data) {
  const dlg = $('#exportDialog'), body = $('#exportBody'), foot = $('#exportFoot');
  $('#expTitle').textContent = 'Save draft';
  body.replaceChildren(el('div', { class: 'blocked', role: 'alert' }, icon('warning'), el('span', {},
    el('strong', { style: 'display:block' }, 'This test site can’t download .pwj files'),
    el('span', { class: 'small' }, 'The hosting platform only allows a fixed list of file types. A self-hosted copy of the editor saves .pwj drafts normally. Your draft is still kept in this browser.'))),
    el('p', { class: 'small' }, 'If you need a file now, you can save the same draft with a .json extension and rename it to .pwj afterwards. The editor opens both.'));
  const note = el('span', { class: 'small muted', 'aria-live': 'polite' });
  const alt = el('button', { type: 'button', class: 'btn', onclick: async () => {
    try { await saveFile(slug(author.doc.title) + '.pwj.json', data, 'application/json'); note.textContent = 'Saved.'; }
    catch (err) { note.textContent = err && err.code === 'declined' ? 'Download cancelled.' : 'That didn’t work either (' + ((err && err.code) || 'unavailable') + ').'; }
  } }, 'Save as .json instead');
  foot.replaceChildren(alt, note, el('button', { type: 'button', class: 'btn push', onclick: () => dlg.close() }, 'Close'));
  dlg.showModal(); alt.focus();
}
async function openDraftFile(file) {
  try { const d = JSON.parse(await file.text()); if (!validDraft(d)) throw new Error('not a draft'); openDraft(d); }
  catch (e) { showError('“' + file.name + '” is not a .pwj draft saved by this editor.'); }
}

/* ---------- export ---------- */
async function auditBytes(bytes) {
  const pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  try { const A = await auditPdf(pdf, null, null); return { A, C: checkAudit(A) }; }
  finally { try { pdf.destroy(); } catch (e) { /* ignore */ } }
}
async function openExport() {
  if (!author.doc) return;
  await runAuthorChecks();
  const dlg = $('#exportDialog'), body = $('#exportBody'), foot = $('#exportFoot');
  $('#expTitle').textContent = 'Check & export PDF';
  body.replaceChildren(); foot.replaceChildren();
  const close = el('button', { type: 'button', class: 'btn push', onclick: () => dlg.close() }, 'Close');
  dlg.showModal();
  const errs = author.findings.filter((f) => f.severity === 'error');
  if (errs.length) {
    body.append(el('div', { class: 'blocked', role: 'alert' }, icon('error'), el('span', {}, el('strong', { style: 'display:block' }, 'Fix ' + plural(errs.length, 'problem') + ' to export'),
      el('span', { class: 'small' }, 'Only PDFs that pass every check are exported. Your work is kept as a draft meanwhile.'))),
    el('ul', { class: 'findings-list' }, errs.map((f) => el('li', {}, el('button', { type: 'button', class: 'finding', onclick: () => { dlg.close(); goToFinding(f); } },
      icon('error'), el('span', {}, el('span', { class: 't' }, f.title), el('span', { class: 's' }, wcagLabel(f))))))));
    foot.append(close); close.focus();
    return;
  }
  const status = el('p', { role: 'status', class: 'small muted' }, 'Building the PDF…');
  body.append(status);
  try {
    const out = await buildPdf(author.doc);
    status.textContent = 'Checking the exported file…';
    const { C } = await auditBytes(out.bytes.slice());
    author.lastPdf = out.bytes;
    const e = C.findings.filter((f) => f.severity === 'error'), w = C.findings.filter((f) => f.severity === 'warning');
    const passed = C.results.filter((r) => r.status === 'pass' || r.status === 'na').length;
    const fname = slug(author.doc.title) + '.pdf';
    body.replaceChildren();
    const viewBtn = el('button', { type: 'button', class: 'btn', onclick: () => { dlg.close(); openBytes(author.lastPdf.slice(), fname); } }, 'View its tags');
    if (e.length) {
      body.append(el('div', { class: 'blocked', role: 'alert' }, icon('error'), el('span', {}, el('strong', { style: 'display:block' }, 'Export stopped: the generated file failed ' + plural(e.length, 'check')),
        el('span', { class: 'small' }, 'This is a bug in the editor, not in your document. The file was not released.'))),
      el('ul', { class: 'plain' }, e.map((f) => el('li', {}, f.title + ' (' + criteriaText(f.rule) + ')'))));
      foot.append(viewBtn, close);
      return;
    }
    const B = author.doc.blocks;
    const figs = B.filter((b) => b.type === 'image' && b.data && !b.decorative).length, decos = B.filter((b) => b.type === 'image' && b.data && b.decorative).length;
    const tables = B.filter((b) => b.type === 'table' && hasContent(b)).length, hs = B.filter((b) => b.type === 'heading' && b.text.trim()).length;
    const fams = [...new Set(B.filter(TEXTY).map((b) => resolveStyle(b, author.doc).font).concat([famKey(author.doc.font)]))].map((k) => (FAMILIES.find((f) => f[0] === k) || [0, k])[1]);
    body.append(el('div', { class: 'okbox', role: 'status' }, icon('ok'), el('span', {}, el('strong', { style: 'display:block' }, 'Ready: ' + fname),
      el('span', { class: 'small' }, plural(out.pages, 'page') + ', ' + Math.max(1, Math.round(out.bytes.length / 1024)) + ' KB. The exported file was re-checked: 0 errors, ' + plural(passed, 'rule') + ' passed.'))),
    el('h3', {}, 'What’s in the file'),
    el('ul', { class: 'plain' },
      el('li', {}, 'Tagged structure in your block order, with ' + plural(hs, 'heading') + ' that also become bookmarks'),
      figs || decos ? el('li', {}, plural(figs, 'image') + ' with alternative text' + (decos ? ', ' + decos + ' marked decorative' : '')) : null,
      tables ? el('li', {}, plural(tables, 'table') + ' with header cells and scope') : null,
      el('li', {}, fams.join(', ') + ' embedded, with Unicode mapping for every character'),
      el('li', {}, 'Title, language (' + author.doc.lang + ') and the PDF/UA-1 identifier in the metadata'),
      el('li', {}, 'Page numbers, table rules and shading marked as artifacts, so screen readers skip them')),
    ...(w.length ? [el('p', { class: 'small' }, plural(w.length, 'warning') + ' to review: ' + w.map((f) => f.title).join('; ') + '.')] : []),
    el('p', { class: 'small muted' }, 'Still worth a human check: read the alternative text aloud and confirm it says what each image means. In the full version, veraPDF also validates every export on the server; it isn’t connected in this test build.'));
    const dlNote = el('span', { class: 'small muted', 'aria-live': 'polite' });
    const dl = el('button', { type: 'button', class: 'btn primary', onclick: async () => {
      try { await saveFile(fname, new Blob([author.lastPdf], { type: 'application/pdf' })); dlNote.textContent = 'Saved.'; }
      catch (err) { dlNote.textContent = err && err.code === 'declined' ? 'Download cancelled.' : 'Downloads aren’t available here.'; }
    } }, 'Download PDF');
    foot.append(dl, dlNote);
    foot.append(viewBtn, close);
    dl.focus();
  } catch (err) {
    console.error(err);
    body.replaceChildren(el('div', { class: 'blocked', role: 'alert' }, icon('error'), el('span', {}, el('strong', { style: 'display:block' }, 'The PDF could not be built'), el('span', { class: 'small' }, String(err && err.message || err)))));
    foot.append(close);
  }
}

/* ---------- font licences ---------- */
function openFontLicences() {
  const body = $('#fontsBody');
  if (!body.childElementCount) {
    body.append(el('p', {}, 'Every font below is licensed under the SIL Open Font License 1.1, and none declares a Reserved Font Name. That matters because this editor distributes subsetted copies of the fonts and embeds them in exported PDFs, both of which the licence allows. The copyright and licence notices are also kept inside each font file.'),
      el('div', { class: 'table-wrap' }, el('table', { class: 'fonttable' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Font'), el('th', { scope: 'col' }, 'Copyright'))),
        el('tbody', {}, FONTMETA.families.map((f) => el('tr', {}, el('th', { scope: 'row' }, f.name, el('span', { class: 'small muted', style: 'display:block;font-weight:400' }, f.blurb)), el('td', { class: 'small' }, f.copyright)))))),
      el('details', { class: 'more' }, el('summary', {}, 'SIL Open Font License 1.1 (full text)'), el('pre', { class: 'ofl' }, FONTMETA.ofl)));
  }
  $('#fontsDialog').showModal();
}

