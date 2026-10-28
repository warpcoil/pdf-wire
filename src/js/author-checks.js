/* ---------- authoring: checks ---------- */
function authorRules(d) {
  const F = [];
  const add = (severity, title, wcag, blockId, detail) => F.push({ severity, title, wcag, blockId, detail });
  if (!d.title.trim()) add('error', 'Document has no title', '2.4.2', null, 'Set a title in document settings.');
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(d.lang || '')) add('error', 'Document language is not set', '3.1.1', null, 'Choose a language in document settings.');
  if (!d.blocks.some(hasContent)) add('error', 'Document is empty', '1.3.1', null, 'Add at least one heading, paragraph, list, image or table.');
  let prev = 0, first = true;
  for (const b of d.blocks) {
    if (b.type !== 'heading') continue;
    if (!b.text.trim()) { add('error', 'Heading is empty', '2.4.6', b.id, 'Type the heading text, or delete the block.'); continue; }
    if (first && b.level !== 1) add('warning', 'First heading is H' + b.level + ', not H1', '1.3.1', b.id, 'The document title is usually the H1.');
    if (prev && b.level > prev + 1) add('error', 'Heading level skipped: H' + prev + ' to H' + b.level, '1.3.1', b.id, 'Change it to H' + (prev + 1) + ' in the properties panel.');
    prev = b.level; first = false;
  }
  if (!d.blocks.some((b) => b.type === 'heading' && b.text.trim()) && d.blocks.filter(hasContent).length > 3)
    add('warning', 'Document has no headings', '2.4.6', null, 'Headings let people move around the document. Start with an H1 title.');
  for (const b of d.blocks) {
    if (b.type === 'image') {
      if (!b.data) add('error', 'Image block has no image', '1.1.1', b.id, 'Choose an image file, or delete the block.');
      else if (!b.decorative && !b.alt.trim()) add('error', 'Image has no alternative text', '1.1.1', b.id, 'Describe what the image tells the reader, or mark it as decorative.');
      else if (!b.decorative) {
        const a = b.alt.trim();
        if (/\.(png|jpe?g|gif|tiff?|bmp|svg|webp)$/i.test(a)) add('warning', 'Alternative text is a file name', '1.1.1', b.id, 'Describe what the image shows or means instead.');
        else if (/^(image|picture|photo|photograph|graphic|figure|img|logo|chart|icon)\s*\d*\.?$/i.test(a)) add('warning', 'Alternative text is a placeholder', '1.1.1', b.id, '“' + a + '” only names the kind of image.');
        else if (/^(an? )?(image|picture|photo|graphic) of\b/i.test(a)) add('warning', 'Alternative text starts with “image of”', '1.1.1', b.id, 'Screen readers already say it is an image.');
        else if (a.length > 250) add('warning', 'Alternative text is very long', '1.1.1', b.id, 'Keep it under about 250 characters; put detail in the text or a caption.');
      }
      if (b.showCaption && !b.caption.trim()) add('warning', 'Caption is empty', '1.3.1', b.id, 'Type a caption or turn captions off.');
    }
    if (b.type === 'table') {
      if (!b.rows.some((r) => r.some((c) => c.trim()))) add('error', 'Table is empty', '1.3.1', b.id, 'Fill in the cells, or delete the table.');
      else {
        if (!b.headerRow && !b.headerCol) add('error', 'Table has no header cells', '1.3.1', b.id, 'Turn on a header row or header column so each cell is read with its header.');
        const heads = [];
        if (b.headerRow) heads.push(...b.rows[0]);
        if (b.headerCol) b.rows.forEach((r, i) => { if (!(b.headerRow && i === 0)) heads.push(r[0]); });
        if (heads.some((h) => !h.trim())) add('warning', 'A header cell is empty', '1.3.1', b.id, 'Data cells under an empty header are read without a label.');
        if (b.headerFill && (b.headerRow || b.headerCol)) {
          const r = contrast(INK_HEX, b.headerFill), need = largeText(b.size, true) ? 3 : 4.5;
          if (r < need) add('error', 'Header text contrast is ' + r.toFixed(1) + ':1 (needs ' + need + ':1)', '1.4.3', b.id, 'Choose a lighter header shading.');
        }
      }
    }
    if (b.type === 'list' && !b.items.some((i) => i.trim())) add('error', 'List has no items', '1.3.1', b.id, 'Type at least one item, or delete the list.');
    const bad = new Set();
    const scan = (s, bold, italic, fam) => canShow(FONTS[fontKey(fam || d.font, bold, italic)], s).forEach((c) => bad.add(c));
    if (TEXTY(b)) {
      const st = resolveStyle(b, d);
      if (b.type === 'list') b.items.forEach((i) => scan(i, st.bold, st.italic, st.font)); else scan(b.text, st.bold, st.italic, st.font);
    }
    if (b.type === 'image' && b.showCaption) scan(b.caption, false, false);
    if (b.type === 'table') { scan(b.caption, true, false); b.rows.forEach((r, ri) => r.forEach((c, ci) => scan(c, (b.headerRow && ri === 0) || (b.headerCol && ci === 0), false))); }
    if (bad.size) add('error', 'The chosen font can’t show: ' + [...bad].slice(0, 6).join(' '), '1.3.1', b.id, 'These characters would not be readable in the PDF. Replace them or choose another font.');
  }
  F.push(...remediationFindings(d));
  return F;
}
async function layoutRules(d) {
  const L = await buildPdf(d, { layoutOnly: true });
  author.layout = L;
  const F = [], seen = new Set();
  const add = (blockId, severity, title, wcag, detail) => { const k = blockId + '|' + title; if (seen.has(k)) return; seen.add(k); F.push({ severity, title, wcag, blockId, detail }); };
  for (const t of L.rects.filter((r) => r.kind === 'text')) {
    const need = largeText(t.size, t.bold) ? 3 : 4.5, r = contrast(t.color, '#FFFFFF');
    if (r < need) add(t.blockId, 'error', 'Text contrast is ' + r.toFixed(1) + ':1 (needs ' + need + ':1)', '1.4.3', 'Text ' + t.color.toUpperCase() + ' on a white page. Choose a darker colour.');
    if (t.size < 9 && !t.table) add(t.blockId, 'warning', 'Text is smaller than 9 pt', null, 'Small text is hard for many people to read.');
  }
  return F;
}
let checkTimer, checkSeq = 0;
function scheduleAuthorChecks() { clearTimeout(checkTimer); checkTimer = setTimeout(runAuthorChecks, 250); }
async function runAuthorChecks() {
  if (!author.doc) return;
  const seq = ++checkSeq;
  const F = authorRules(author.doc);
  try { F.push(...await layoutRules(author.doc)); } catch (e) { console.error(e); }
  if (seq !== checkSeq) return;
  F.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  author.findings = F;
  renderAuthorChecks(); decorateFlags();
}

