/* ---------- remediation: rebuild as a new document ----------
   The analysed content becomes ordinary editor blocks. Each block remembers
   where it came from (b.src) so it can be compared with the original, and the
   draft carries a review list (d.remediation) that the person works through
   before exporting. Export then goes through the normal release gate. */

const remSource = { name: '', pdf: null, X: null, R: null, renders: new Map() };   // the original, while it's open
const isFileTitle = (t) => !t || /^(untitled|document\d*|microsoft (word|powerpoint|excel) - .*|.*\.(docx?|pptx?|xlsx?|pdf|indd|odt|pages))$/i.test(t.trim());
const validLang = (l) => /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(l || '');
const langName = (l) => { const f = LANGS.find((x) => x[0].toLowerCase() === String(l).toLowerCase()); return f ? f[1] : l; };
const rid = () => 'r' + Math.random().toString(36).slice(2, 9);

async function pageRender(pageIndex, scale) {
  const key = pageIndex + '@' + scale;
  if (remSource.renders.has(key)) return remSource.renders.get(key);
  const p = remSource.X.pages[pageIndex];
  const r = await renderPageCanvas(p.proxy, scale);
  if (remSource.renders.size > 6) remSource.renders.delete(remSource.renders.keys().next().value);
  remSource.renders.set(key, r);
  return r;
}

async function rebuildFromAnalysis(name, X, R, progress) {
  const first = X.pages[0] || { w: 595, h: 842 };
  const pageSize = Math.abs(first.w - 612) < Math.abs(first.w - 595.28) ? 'Letter' : 'A4';
  const h1 = R.blocks.find((b) => b.kind === 'heading' && b.level === 1);
  const metaTitle = isFileTitle(R.meta.title) ? '' : R.meta.title;
  const title = metaTitle || (h1 && h1.text) || name.replace(/\.pdf$/i, '');
  const lang = validLang(R.meta.lang) ? R.meta.lang : 'en-IE';
  const blocks = [], items = [];
  const item = (o) => { const it = Object.assign({ id: rid(), done: false }, o); items.push(it); return it; };
  const textW = (pi) => {                  // width of the original text column, for image sizing
    const bs = R.pages[pi] ? R.pages[pi].blocks.filter((b) => b.kind === 'paragraph' || b.kind === 'heading') : [];
    if (!bs.length) return X.pages[pi].w - 144;
    return Math.max(...bs.map((b) => b.rect[2])) - Math.min(...bs.map((b) => b.rect[0]));
  };
  let imgN = 0;
  for (const s of R.blocks) {
    const src = { page: s.page, rect: s.rect.map((v) => Math.round(v * 10) / 10) };
    let b = null;
    if (s.kind === 'heading') b = makeBlock('heading', { level: s.level, text: s.text });
    else if (s.kind === 'paragraph') {
      b = makeBlock('paragraph', { text: s.text });
      if (s.bold) b.style.bold = true;
      if (s.italic) b.style.italic = true;
      if (s.align) b.style.align = s.align;
    } else if (s.kind === 'list') {
      b = makeBlock('list');
      b.marker = s.marker; b.items = s.items.map((i) => i.text);
      if (s.nested) item({ kind: 'list', blockId: b.id, page: s.page, title: 'A nested list was flattened', detail: 'This editor doesn’t have lists inside lists yet, so every item is now at the same level. Check the list still makes sense.' });
    } else if (s.kind === 'image') {
      imgN++;
      if (progress) progress('Copying image ' + imgN + '…');
      const rendered = await pageRender(s.page, 2.5);
      const crop = cropRegion(rendered, X.pages[s.page], s.rect, 2000);
      if (!crop) continue;
      b = makeBlock('image');
      Object.assign(b, crop, { name: 'Image from page ' + (s.page + 1), altSuggestion: s.alt || '' });
      b.widthPct = Math.max(10, Math.min(100, Math.round((s.rect[2] - s.rect[0]) / textW(s.page) * 20) * 5));
      if (s.caption) { b.caption = s.caption.text; b.showCaption = true; }
      if (s.vector) b.name = 'Chart or diagram from page ' + (s.page + 1);
      item({ kind: 'alt', blockId: b.id, page: s.page, title: 'Describe the ' + (s.vector ? 'chart or diagram' : 'image') + ' on page ' + (s.page + 1),
        detail: s.vector ? 'It was drawn with lines and shapes, so it was copied as a picture. Describe what it shows, including the key figures.'
          : s.alt ? 'The original had alternative text. Check it still describes the image.' : 'Write alternative text, or mark the image as decorative.' });
    } else if (s.kind === 'table') {
      b = makeBlock('table');
      b.rows = s.rows.map((r) => r.map((c) => c.text));
      b.headerRow = s.headerRow; b.headerCol = s.headerCol;
      const how = s.source === 'rules' ? 'from its ruling lines' : 'from text that lines up in columns';
      item({ kind: 'table', blockId: b.id, page: s.page, title: 'Check the table on page ' + (s.page + 1),
        detail: 'Found ' + how + ': ' + b.rows.length + ' rows, ' + b.rows[0].length + ' columns. ' +
          (s.headerRow ? 'The first row is marked as headers' + (s.headerWhy ? ' because ' + s.headerWhy : '') + '. ' : '') +
          (s.headerCol ? 'The first column is marked as headers. ' : '') + 'Check every value is in the right cell, and that the header cells are right.' });
    }
    if (!b) continue;
    b.src = src;
    blocks.push(b);
  }
  if (!blocks.length) blocks.push(makeBlock('heading', { level: 1, text: title }));
  // things to check that aren't tied to one block
  const hs = R.headingStyles || [];
  if (hs.length) item({ kind: 'headings', title: 'Check the heading levels', detail: 'Headings were worked out from text size and weight: ' +
    hs.map((s) => s.size + ' pt' + (s.bold ? ' bold' : '') + ' became H' + s.level + ' (' + s.count + ')').join(', ') + '. Change a block’s type in the properties panel if one is wrong.' });
  else item({ kind: 'headings', title: 'No headings were found', detail: 'Nothing in the original was larger or bolder than the body text. Add headings so people can find their way around.' });
  item({ kind: 'meta', title: 'Check the title and language', detail: 'Title: “' + title + '”' + (metaTitle ? ' (from the original’s metadata)' : h1 ? ' (from the first heading)' : ' (from the file name)') +
    '. Language: ' + langName(lang) + (validLang(R.meta.lang) ? ' (from the original).' : ' (the original didn’t say, so this is a guess).') });
  for (const f of R.flags) item({ kind: 'layout', page: f.page, title: f.title, detail: f.detail, flag: f.kind });
  const links = X.pages.flatMap((p) => p.links.map((l) => ({ page: p.index, url: l.url })));
  if (links.length) item({ kind: 'links', title: plural(links.length, 'link') + ' became plain text', detail: 'This editor doesn’t have links yet, so the text is kept but no longer clickable: ' +
    [...new Set(links.map((l) => l.url).filter(Boolean))].slice(0, 5).join(', ') + '. If a link matters, write its address out in the text.' });
  if (X.fontsMissing.length) item({ kind: 'fonts', title: 'The original’s fonts weren’t embedded', detail: 'The rebuilt document uses PDF Wire’s embedded fonts instead (' + X.fontsMissing.slice(0, 4).join(', ') + (X.fontsMissing.length > 4 ? '…' : '') + ').', done: true });
  const removed = R.artifacts.map((a) => ({ page: a.page, text: a.kind === 'image' ? 'Image' : a.text, why: a.why }));
  return {
    format: 'apdf-draft', version: 2, title, lang, author: R.meta.author && R.meta.author !== 'anonymous' ? R.meta.author : '', pageSize, font: DEFAULT_FONT, blocks,
    remediation: { source: name, pages: X.numPages, method: 'rebuild', created: new Date().toISOString(), items, removed }
  };
}

/* findings for the "Checks before export" list: unchecked review items are warnings */
function remediationFindings(d) {
  const rem = d.remediation;
  if (!rem || rem.finished) return [];
  const F = [];
  for (const it of rem.items) {
    if (it.done || it.kind === 'alt') continue;            // missing alternative text is already an error
    if (it.blockId && !d.blocks.some((b) => b.id === it.blockId)) continue;
    F.push({ severity: 'warning', title: 'Not reviewed: ' + it.title.replace(/^Check /, '').replace(/^./, (c) => c.toLowerCase()), wcag: it.kind === 'meta' ? '2.4.2' : '1.3.1', blockId: it.blockId || null, detail: it.detail, remItem: it.id });
  }
  return F;
}
function altDone(d, it) { const b = d.blocks.find((x) => x.id === it.blockId); return !b || b.decorative || !!b.alt.trim(); }

/* ---------- review panel ---------- */
function renderRemediationPanel() {
  const host = $('#remPanel'); if (!host) return;
  const d = author.doc, rem = d && d.remediation;
  host.hidden = !rem || !!rem.finished;
  if (host.hidden) { host.replaceChildren(); return; }
  const focusKey = host.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  for (const it of rem.items) if (it.kind === 'alt') it.done = altDone(d, it);
  const live = rem.items.filter((it) => !it.blockId || d.blocks.some((b) => b.id === it.blockId));
  const done = live.filter((it) => it.done).length;
  const alts = live.filter((it) => it.kind === 'alt' && !it.done).length;
  fill(host, 
    el('h2', { id: 'remHead' }, 'Remediation review'),
    el('p', { class: 'small muted', style: 'margin:6px 0 0' }, 'Rebuilt from “' + clip(rem.source, 60) + '” (' + plural(rem.pages, 'page') + '). ' + done + ' of ' + live.length + ' checked.'),
    el('progress', { max: String(live.length || 1), value: String(done), 'aria-label': 'Review progress', class: 'remprog' }),
    complexCaveat(),
    el('div', { class: 'remacts' },
      el('button', { type: 'button', class: 'btn' + (alts ? ' primary' : ''), 'data-key': 'describe', onclick: () => describeDocImages() }, alts ? 'Describe images (' + alts + ' left)' : 'Review image descriptions'),
      remSource.pdf && remSource.name === rem.source ? el('button', { type: 'button', class: 'btn', onclick: () => openOriginal(author.sel) }, 'Compare with original') : null),
    el('ul', { class: 'remlist' }, live.map((it) => {
      const b = it.blockId ? findBlock(it.blockId) : null;
      return el('li', { class: it.done ? 'done' : '' },
        el('button', { type: 'button', class: 'finding', 'data-key': 'go-' + it.id, onclick: () => goToRemItem(it) }, icon(it.done ? 'ok' : it.kind === 'alt' ? 'error' : 'warning'),
          el('span', { style: 'flex:1' }, el('span', { class: 't' }, it.title), b ? el('span', { class: 's' }, blockName(b) + (it.page != null ? ' · from page ' + (it.page + 1) : '')) : it.page != null ? el('span', { class: 's' }, 'Page ' + (it.page + 1)) : null,
            el('span', { class: 'd' }, it.detail))),
        it.kind === 'alt' ? null : el('button', { type: 'button', class: 'btn link small remtoggle', 'aria-pressed': it.done ? 'true' : 'false',
          'data-key': 'tg-' + it.id,
          'aria-label': (it.done ? 'Checked: ' : 'Mark as checked: ') + it.title, onclick: () => { it.done = !it.done; renderRemediationPanel(); changed('review'); announce(it.done ? 'Marked as checked.' : 'Marked as not checked.'); } }, it.done ? 'Checked ✓' : 'Mark as checked'));
    })),
    rem.removed && rem.removed.length ? el('details', { class: 'more' }, el('summary', {}, plural(rem.removed.length, 'header, footer or decoration', 'headers, footers and decorations') + ' left out'),
      el('p', { class: 'small muted' }, 'These are repeated on the page for layout only. The rebuilt PDF adds its own page numbers.'),
      el('ul', {}, rem.removed.map((r) => el('li', {}, 'Page ' + (r.page + 1) + ': ' + clip(r.text || '', 60) + ' (' + r.why + ')')))) : null,
    el('div', { class: 'remacts' }, el('button', { type: 'button', class: 'btn link', style: 'padding:0', onclick: finishReview }, 'Finish review and hide this panel')));
  if (focusKey) { const f = host.querySelector('[data-key="' + focusKey + '"]'); if (f) f.focus(); }
}
function complexCaveat() {
  return el('div', { class: 'note warnnote remcaveat', role: 'note' }, el('strong', { style: 'display:block' }, 'Complex layouts may cause problems'),
    'Automatic remediation is reliable for simple, single-column documents. Multiple columns, sidebars, text over images, footnotes, forms, and charts drawn as shapes can come out in the wrong order or lose their structure. Always compare with the original before you rely on the result.');
}
function goToRemItem(it, fromChecks) {
  if (it.kind === 'alt') { describeDocImages(it.blockId); return; }
  if (it.kind === 'meta') { openDocDialog('edit'); return; }
  if (it.blockId && findBlock(it.blockId)) { selectBlock(it.blockId); focusBlock(it.blockId, 0, 'end'); return; }
  if (it.page != null && remSource.pdf && remSource.name === author.doc.remediation.source && !fromChecks) { openOriginal(null, it.page); return; }
  const b = document.querySelector('#remPanel [data-key="go-' + it.id + '"]');   // from the checks list: show it in the review
  if (b) { b.scrollIntoView({ block: 'center' }); b.focus(); }
}
function finishReview() {
  const rem = author.doc.remediation;
  const open = rem.items.filter((it) => !it.done && (!it.blockId || findBlock(it.blockId))).length;
  if (open && !confirm(plural(open, 'item') + ' still to check. Hide the review anyway? Unchecked items stop showing as warnings.')) return;
  rem.finished = true;
  changed('all');
  announce('Remediation review finished.');
}

/* ---------- prompting for alternative text ---------- */
function describeDocImages(startId) {
  const d = author.doc;
  const imgs = d.blocks.filter((b) => b.type === 'image' && b.data);
  if (!imgs.length) { announce('There are no images in this document.'); return; }
  let start = startId ? imgs.findIndex((b) => b.id === startId) : imgs.findIndex((b) => !b.decorative && !b.alt.trim());
  if (start < 0) start = 0;
  const near = (b) => {
    const i = blockIndex(b.id), around = [d.blocks[i - 1], d.blocks[i + 1]].filter((x) => x && TEXTY(x) && blockLabel(x));
    return [b.showCaption && b.caption.trim() ? 'caption “' + b.caption.trim() + '”' : null, ...around.map((x) => '“' + clip(blockLabel(x), 140) + '”')].filter(Boolean).join(' · ');
  };
  openAltDialog(imgs.map((b) => ({
    title: b.name || 'Image', img: 'data:image/jpeg;base64,' + b.data, context: near(b), alt: b.alt, suggestion: b.altSuggestion || '', decorative: b.decorative,
    save: (alt, deco) => { b.alt = alt; b.decorative = deco; const it = d.remediation && d.remediation.items.find((x) => x.blockId === b.id && x.kind === 'alt'); if (it) it.done = true; }
  })), start, () => { changed('all', { focusId: author.sel }); });
}

/* A step-by-step dialog: one image at a time, with nearby text for context. */
function openAltDialog(entries, start, onClose) {
  const dlg = $('#altDialog'), body = $('#altBody'), foot = $('#altFoot');
  let i = Math.max(0, Math.min(start || 0, entries.length - 1));
  const draw = () => {
    const e = entries[i];
    $('#altTitle').textContent = 'Describe images (' + (i + 1) + ' of ' + entries.length + ')';
    const ta = el('textarea', { id: 'altText', class: 'input', rows: '3', 'aria-describedby': 'altHelp altErr' });
    ta.value = e.alt || '';
    const err = el('span', { id: 'altErr', class: 'errtext', hidden: true }, 'Write alternative text, or choose Decorative.');
    const cnt = el('span', { class: 'help num', 'aria-hidden': 'true' }, (ta.value.length) + ' / 250');
    ta.addEventListener('input', () => { cnt.textContent = ta.value.length + ' / 250'; err.hidden = true; ta.removeAttribute('aria-invalid'); });
    let deco = !!e.decorative;
    const altField = el('div', { class: 'field', hidden: deco ? true : null }, el('label', { for: 'altText' }, 'Alternative text ', el('span', { class: 'req' }, 'Required')), ta,
      el('div', { style: 'display:flex;justify-content:space-between;gap:10px' }, el('span', { id: 'altHelp', class: 'help' }, 'Say what the image tells the reader in this document, in a sentence or two. Don’t start with “image of”.'), cnt), err);
    const radios = [['Informative', false, 'It shows something the reader needs.'], ['Decorative', true, 'It’s only for decoration; screen readers will skip it.']].map(([label, val, help]) => {
      const r = el('input', { type: 'radio', name: 'altRole', id: 'altRole' + label, checked: deco === val ? true : null });
      r.addEventListener('change', () => { deco = val; altField.hidden = val; });
      return el('label', { class: 'choice' }, r, el('span', {}, el('b', {}, label), el('span', {}, help)));
    });
    fill(body, 
      el('div', { class: 'altwrap' },
        el('figure', { class: 'altimg' }, el('img', { src: e.img, alt: '' }), el('figcaption', { class: 'small muted' }, e.title)),
        el('div', { class: 'altform' },
          e.context ? el('p', { class: 'small' }, el('strong', {}, 'Near it in the document: '), e.context) : null,
          e.suggestion ? el('div', { class: 'note' }, 'The original PDF described it as “' + e.suggestion + '”. ',
            el('button', { type: 'button', class: 'btn link small', style: 'padding:0;min-height:32px', onclick: () => { ta.value = e.suggestion; ta.dispatchEvent(new Event('input')); ta.focus(); } }, 'Use this')) : null,
          el('fieldset', { class: 'fs' }, el('legend', {}, 'How should this image be read?'), radios),
          altField)));
    const save = () => {
      const alt = ta.value.trim();
      if (!deco && !alt) { err.hidden = false; ta.setAttribute('aria-invalid', 'true'); ta.focus(); return false; }
      e.save(deco ? e.alt || '' : alt, deco); e.alt = deco ? e.alt : alt; e.decorative = deco; e.saved = true;
      return true;
    };
    const last = i === entries.length - 1;
    fill(foot, 
      el('button', { type: 'button', class: 'btn', disabled: i === 0 ? true : null, onclick: () => { i--; draw(); } }, 'Back'),
      el('button', { type: 'button', class: 'btn', onclick: () => { if (last) close(); else { i++; draw(); } } }, last ? 'Skip and close' : 'Skip for now'),
      el('button', { type: 'button', class: 'btn primary push', onclick: () => { if (!save()) return; if (last) close(); else { i++; draw(); } } }, last ? 'Save and finish' : 'Save and next'));
    (deco ? document.getElementById('altRoleDecorative') : ta).focus();
  };
  const close = () => { dlg.close(); };
  dlg.onclose = () => { dlg.onclose = null; const n = entries.filter((e) => e.saved).length; if (n) announce(plural(n, 'image') + ' described.'); if (onClose) onClose(); };
  dlg.showModal();
  draw();
}

/* ---------- compare with the original ---------- */
let origPage = 0, origHighlight = null;
async function openOriginal(blockId, page) {
  if (!remSource.pdf) return;
  const b = blockId ? findBlock(blockId) : null;
  origHighlight = b && b.src ? b.src : null;
  origPage = page != null ? page : origHighlight ? origHighlight.page : 0;
  $('#origDialog').showModal();
  await drawOriginal();
}
async function drawOriginal() {
  const n = remSource.X.numPages;
  origPage = Math.max(0, Math.min(n - 1, origPage));
  $('#origLabel').textContent = 'Page ' + (origPage + 1) + ' of ' + n;
  $('#origPrev').disabled = origPage <= 0; $('#origNext').disabled = origPage >= n - 1;
  const p = remSource.X.pages[origPage];
  const avail = Math.min(780, window.innerWidth - 80);
  const r = await pageRender(origPage, Math.min(2, avail / p.w));
  const host = $('#origSheet'); host.replaceChildren();
  const c = r.canvas; c.style.width = Math.round(r.vp.width) + 'px'; c.style.height = Math.round(r.vp.height) + 'px';
  c.setAttribute('aria-hidden', 'true');
  host.style.width = c.style.width; host.style.height = c.style.height;
  host.append(c);
  $('#origNote').textContent = origHighlight && origHighlight.page === origPage ? 'The outlined area is where the selected block came from.' : 'Select a block in the editor to see where it came from.';
  if (origHighlight && origHighlight.page === origPage) {
    const v = toView(r.vp, [origHighlight.rect[0] + p.proxy.view[0], origHighlight.rect[1] + p.proxy.view[1], origHighlight.rect[2] + p.proxy.view[0], origHighlight.rect[3] + p.proxy.view[1]]);
    const box = el('div', { class: 'orighl', style: `left:${v.x - 3}px;top:${v.y - 3}px;width:${v.w + 6}px;height:${v.h + 6}px` });
    host.append(box);
    requestAnimationFrame(() => box.scrollIntoView({ block: 'center' }));
  }
}

/* ---------- editing tools that remediation needs (and are useful anyway) ---------- */
const MAX_COLS = 12;
function tableTools(b) {
  const cols = b.rows[0].length;
  const cur = author.cell && author.cell.id === b.id ? author.cell : { id: b.id, r: 0, c: 0 };
  cur.r = Math.min(cur.r, b.rows.length - 1); cur.c = Math.min(cur.c, cols - 1);
  const { r, c } = cur;
  const op = (id, label, ok, fn) => el('button', { type: 'button', class: 'btn tbtn', id, disabled: ok ? null : true, onclick: () => {
    fn(); author.cell = cur; changed('all'); refocus(id); announce(label + '. The table now has ' + b.rows.length + ' rows and ' + b.rows[0].length + ' columns.');
  } }, label);
  const blankRow = () => b.rows[0].map(() => '');
  const sec = el('div', { class: 'propsec', id: 'tTools' }, el('h3', {}, 'Rows and columns'),
    el('p', { class: 'help', style: 'margin:0 0 8px' }, 'Selected cell: row ' + (r + 1) + ', column ' + (c + 1) + '. Click a cell in the table to choose another.'),
    el('div', { class: 'tgrid' },
      op('tRowAbove', 'Insert row above', b.rows.length < 200, () => { b.rows.splice(r, 0, blankRow()); }),
      op('tRowBelow', 'Insert row below', b.rows.length < 200, () => { b.rows.splice(r + 1, 0, blankRow()); cur.r = r + 1; }),
      op('tRowDel', 'Delete row', b.rows.length > 1, () => { b.rows.splice(r, 1); cur.r = Math.max(0, r - 1); }),
      op('tRowMerge', 'Merge row with next', r < b.rows.length - 1, () => { b.rows[r] = b.rows[r].map((t, k) => [t, b.rows[r + 1][k]].filter((x) => x.trim()).join(' ')); b.rows.splice(r + 1, 1); }),
      op('tColLeft', 'Insert column left', cols < MAX_COLS, () => { b.rows.forEach((row) => row.splice(c, 0, '')); }),
      op('tColRight', 'Insert column right', cols < MAX_COLS, () => { b.rows.forEach((row) => row.splice(c + 1, 0, '')); cur.c = c + 1; }),
      op('tColDel', 'Delete column', cols > 1, () => { b.rows.forEach((row) => row.splice(c, 1)); cur.c = Math.max(0, c - 1); }),
      op('tColMerge', 'Merge column with next', c < cols - 1, () => { b.rows.forEach((row) => { row[c] = [row[c], row[c + 1]].filter((x) => x.trim()).join(' '); row.splice(c + 1, 1); }); }),
      op('tShiftR', 'Shift cells right', c < cols - 1 && !b.rows[r][cols - 1].trim(), () => { b.rows[r].splice(cols - 1, 1); b.rows[r].splice(c, 0, ''); cur.c = c + 1; }),
      op('tShiftL', 'Shift cells left', c < cols - 1 && !b.rows[r][c].trim(), () => { b.rows[r].splice(c, 1); b.rows[r].push(''); })),
    el('p', { class: 'help', style: 'margin:8px 0 0' }, 'Shift cells moves the rest of the row along by one, for a value that landed in the wrong column.'),
    el('button', { type: 'button', class: 'btn', style: 'margin-top:10px', onclick: () => {
      if (!confirm('Turn this table into paragraphs, one per row?')) return;
      replaceWithParagraphs(b, b.rows.map((row) => row.filter((x) => x.trim()).join(' ')));
    } }, 'Not a table: turn into paragraphs'));
  return sec;
}
function updateCellTools(b) { const old = $('#tTools'); if (old) old.replaceWith(tableTools(b)); }
function replaceWithParagraphs(b, texts) {
  const i = blockIndex(b.id);
  const ps = texts.filter((t) => t.trim()).map((t) => { const p = makeBlock('paragraph', { text: t }); if (b.src) p.src = b.src; return p; });
  if (!ps.length) ps.push(makeBlock('paragraph'));
  author.doc.blocks.splice(i, 1, ...ps);
  const rem = author.doc.remediation;
  if (rem) rem.items.forEach((it) => { if (it.blockId === b.id) { it.blockId = ps[0].id; it.done = true; } });
  author.sel = ps[0].id;
  changed('all', { focusId: ps[0].id });
  announce(blockName(b) + ' turned into ' + plural(ps.length, 'paragraph') + '.');
}
/* heading or paragraph type, joining blocks, and lists back to paragraphs */
function blockTypeTools(b, host) {
  if (b.type === 'heading' || b.type === 'paragraph') {
    const sel = el('select', { id: 'propType', class: 'input' },
      el('option', { value: 'p', selected: b.type === 'paragraph' ? true : null }, 'Paragraph'),
      [1, 2, 3, 4, 5, 6].map((l) => el('option', { value: String(l), selected: b.type === 'heading' && b.level === l ? true : null }, 'Heading ' + l + (l === 1 ? ' (document title)' : ''))));
    sel.addEventListener('change', () => {
      if (sel.value === 'p') { b.type = 'paragraph'; delete b.level; }
      else { b.type = 'heading'; b.level = +sel.value; }
      changed('all'); refocus('propType'); announce(blockName(b) + '.');
    });
    host.append(field('Type', sel, 'Use one H1 for the title, then H2 for sections and H3 inside them. Don’t skip levels.'));
  }
}
function joinTools(b) {
  const i = blockIndex(b.id), next = author.doc.blocks[i + 1];
  const out = [];
  if ((b.type === 'heading' || b.type === 'paragraph') && next && (next.type === 'paragraph' || next.type === 'heading'))
    out.push(el('button', { type: 'button', class: 'btn', onclick: () => {
      b.text = joinLines([{ text: b.text }, { text: next.text }]);
      author.doc.blocks.splice(i + 1, 1);
      const rem = author.doc.remediation; if (rem) rem.items.forEach((it) => { if (it.blockId === next.id) it.blockId = b.id; });
      changed('all', { focusId: b.id, caret: 'end' }); announce('Joined with the next block.');
    } }, 'Join with next block'));
  if (b.type === 'list') out.push(el('button', { type: 'button', class: 'btn', onclick: () => replaceWithParagraphs(b, b.items) }, 'Not a list: turn into paragraphs'));
  if (b.src && remSource.pdf && author.doc.remediation && remSource.name === author.doc.remediation.source)
    out.push(el('button', { type: 'button', class: 'btn', onclick: () => openOriginal(b.id) }, 'Show in the original'));
  return out.length ? el('div', { class: 'blockacts' }, out) : null;
}
