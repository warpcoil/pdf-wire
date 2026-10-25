/* ---------- rules ---------- */
const headingLevel = (role) => { const m = /^H([1-6])$/.exec(role); return m ? +m[1] : null; };
function rowsOf(table) {
  const rows = [];
  const visit = (n) => n.kids.forEach((k) => {
    if (k.role === 'TR') rows.push(k);
    else if (['THead', 'TBody', 'TFoot'].includes(k.role)) visit(k);
  });
  visit(table);
  return rows;
}

const RULES = [
  { id: 'tagged', title: 'Document is tagged', wcag: ['1.3.1'], mh: '01', severity: 'error',
    run(c, add) {
      if (!c.doc.tagged) add({ title: c.doc.marked ? 'The tag tree is empty' : 'Document is not tagged',
        detail: 'Without tags, screen readers cannot tell headings, lists, tables or images apart.' });
    } },
  { id: 'title', title: 'Title is set in the document metadata', wcag: ['2.4.2'], mh: '06', severity: 'error',
    run(c, add) {
      if (!c.doc.xmpTitle && !c.doc.infoTitle) add({ title: 'Document has no title', detail: 'Give the document a descriptive title in its properties (XMP dc:title).' });
      else if (!c.doc.xmpTitle) add({ title: 'Title is not in the XMP metadata', detail: 'The title “' + clip(c.doc.infoTitle, 80) + '” is only in the older Info dictionary. PDF/UA requires it in XMP metadata as dc:title.' });
    } },
  { id: 'displayTitle', title: 'Title is shown in the window title bar', wcag: ['2.4.2'], mh: '07', severity: 'error',
    run(c, add) {
      if (c.doc.viewerPrefs === undefined) return 'skip';
      if (!(c.doc.viewerPrefs && c.doc.viewerPrefs.DisplayDocTitle)) add({ title: 'Title is not shown in the title bar', detail: 'PDF viewers will show the file name instead. DisplayDocTitle must be true in the viewer preferences.' });
    } },
  { id: 'lang', title: 'Document language is set', wcag: ['3.1.1'], mh: '11', severity: 'error',
    run(c, add) {
      if (!c.doc.lang) add({ title: 'Document language is not set', detail: 'Screen readers need the language to choose the right voice and pronunciation. Set it in the document catalog (for example en-IE).' });
      else if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(c.doc.lang)) add({ title: 'Document language “' + c.doc.lang + '” is not a valid language tag', detail: 'Use a BCP 47 tag such as en, en-IE or ga.' });
    } },
  { id: 'roles', title: 'All tags are standard or role-mapped', wcag: ['1.3.1', '4.1.2'], mh: '02', severity: 'error',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      for (const n of c.ordered) if (!STANDARD.has(n.role)) add({ node: n, title: '“' + n.role + '” is not a standard tag', detail: 'Assistive technology only understands standard tags. Map it to one in the role map (for example Heading1 to H1).' });
    } },
  { id: 'untagged', title: 'All page content is tagged or marked as an artifact', wcag: ['1.3.1'], mh: '01', severity: 'error',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      for (const p of c.pages) {
        const items = p.untagged;
        if (!items.length) continue;
        const texts = items.filter((u) => u.kind === 'text'), imgs = items.filter((u) => u.kind === 'image');
        if (texts.length) add({ page: p.index, untagged: true, title: plural(texts.length, 'piece') + ' of text not tagged on page ' + (p.index + 1),
          detail: 'For example “' + clip(texts.map((t) => t.str).join(' '), 70) + '”. Untagged text is skipped or read out of order. Tag it, or mark it as an artifact if it is decoration.' });
        if (imgs.length) add({ page: p.index, untagged: true, title: plural(imgs.length, 'image') + ' not tagged on page ' + (p.index + 1),
          detail: 'Tag informative images as Figure with alternative text; mark decorative ones as artifacts.' });
      }
    } },
  { id: 'orphans', title: 'Every piece of marked content belongs to a tag', wcag: ['1.3.1'], mh: '01', severity: 'error',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      for (const p of c.pages) {
        const lost = [...p.marked].filter((m) => !p.refMcids.has(m));
        if (lost.length) add({ page: p.index, title: plural(lost.length, 'piece') + ' of content on page ' + (p.index + 1) + ' not linked to any tag',
          detail: 'The content is marked but no tag points at it, so it is invisible to screen readers.' + (p.texts.get(lost[0]) ? ' Example: “' + clip(p.texts.get(lost[0]), 60) + '”.' : '') });
      }
    } },
  { id: 'figureAlt', title: 'Every image has alternative text', wcag: ['1.1.1'], mh: '13', severity: 'error',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const figs = c.ordered.filter((n) => n.role === 'Figure');
      if (!figs.length) return 'na';
      for (const f of figs) if (!f.alt) add({ node: f, title: 'Image has no alternative text',
        detail: 'Add text that conveys what the image tells the reader, or mark it as decorative (an artifact) if it adds nothing.' });
    } },
  { id: 'altQuality', title: 'Alternative text looks meaningful', wcag: ['1.1.1'], mh: '13', severity: 'warning',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const figs = c.ordered.filter((n) => n.role === 'Figure' && n.alt);
      if (!figs.length) return 'na';
      for (const f of figs) {
        const a = f.alt;
        if (/\.(png|jpe?g|gif|tiff?|bmp|svg|webp|emf|wmf)$/i.test(a)) add({ node: f, title: 'Alternative text is a file name', detail: '“' + clip(a, 60) + '” tells the reader nothing about the image.' });
        else if (/^(image|picture|photo|photograph|graphic|figure|img|logo|chart|icon)\s*\d*\.?$/i.test(a)) add({ node: f, title: 'Alternative text is a placeholder', detail: '“' + a + '” only names the kind of image. Describe what it conveys.' });
        else if (/^(an? )?(image|picture|photo|graphic) of\b/i.test(a)) add({ node: f, title: 'Alternative text starts with “image of”', detail: 'Screen readers already announce it as an image; start with what it shows.' });
        else if (a.length > 250) add({ node: f, title: 'Alternative text is very long (' + a.length + ' characters)', detail: 'Keep it short and move detail into the body text or a caption.' });
      }
    } },
  { id: 'headingsPresent', title: 'Document uses headings', wcag: ['1.3.1', '2.4.6'], mh: '14', severity: 'warning',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const hs = c.ordered.filter((n) => headingLevel(n.role) || n.role === 'H');
      if (!hs.length && c.doc.pages > 1) add({ title: 'No headings found', detail: 'Headings let screen reader users jump between sections. Tag section titles as H1 to H6.' });
    } },
  { id: 'headingStart', title: 'Headings start at H1', wcag: ['1.3.1'], mh: '14', severity: 'warning',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const first = c.ordered.find((n) => headingLevel(n.role));
      if (!first) return 'na';
      if (headingLevel(first.role) !== 1) add({ node: first, title: 'First heading is ' + first.role + ', not H1', detail: 'The main title of the document is usually tagged H1.' });
    } },
  { id: 'headingSkip', title: 'Heading levels are not skipped', wcag: ['1.3.1'], mh: '14', severity: 'error',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const hs = c.ordered.filter((n) => headingLevel(n.role));
      if (!hs.length) return 'na';
      let prev = 0;
      for (const h of hs) {
        const l = headingLevel(h.role);
        if (prev && l > prev + 1) add({ node: h, title: 'Heading level skipped: H' + prev + ' to H' + l,
          detail: '“' + clip(h.text || '(no text)', 50) + '” jumps a level, which suggests a missing section. Suggested fix: change it to H' + (prev + 1) + '.' });
        prev = l;
      }
    } },
  { id: 'headingMix', title: 'Heading types are not mixed', wcag: ['1.3.1'], mh: '14', severity: 'warning',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const hasH = c.ordered.some((n) => n.role === 'H'), hasN = c.ordered.some((n) => headingLevel(n.role));
      if (hasH && hasN) add({ title: 'Document mixes H and H1–H6 headings', detail: 'Use numbered headings (H1 to H6) throughout so the outline is clear.' });
    } },
  { id: 'tableHeaders', title: 'Tables have header cells', wcag: ['1.3.1'], mh: '15', severity: 'error',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const tables = c.ordered.filter((n) => n.role === 'Table');
      if (!tables.length) return 'na';
      for (const t of tables) {
        const rows = rowsOf(t);
        if (!rows.length) { add({ node: t, title: 'Table has no rows', detail: 'A Table tag must contain TR rows (directly or inside THead, TBody or TFoot).' }); continue; }
        const hasTH = rows.some((r) => r.kids.some((k) => k.role === 'TH'));
        if (!hasTH) add({ node: t, title: 'Table has no header cells',
          detail: 'Tag the header row or column as TH so each data cell is read with its header.' });
      }
    } },
  { id: 'tableShape', title: 'Table structure is regular', wcag: ['1.3.1'], mh: '15', severity: 'warning',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const tables = c.ordered.filter((n) => n.role === 'Table');
      if (!tables.length) return 'na';
      for (const t of tables) {
        const rows = rowsOf(t);
        if (!rows.length) continue;
        const bad = rows.find((r) => r.kids.some((k) => k.role !== 'TH' && k.role !== 'TD'));
        if (bad) add({ node: t, severity: 'error', title: 'A table row contains something other than TH or TD', detail: 'Rows may only contain header (TH) and data (TD) cells.' });
        const counts = new Set(rows.map((r) => r.kids.filter((k) => k.role === 'TH' || k.role === 'TD').length));
        if (counts.size > 1) add({ node: t, title: 'Rows have different numbers of cells', detail: 'Fine if some cells span rows or columns; otherwise cells are missing or extra. Spans can’t be read by this version, so check this one by eye.' });
      }
    } },
  { id: 'lists', title: 'Lists are structured correctly', wcag: ['1.3.1'], mh: '16', severity: 'error',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const lists = c.ordered.filter((n) => n.role === 'L');
      if (!lists.length) return 'na';
      for (const l of lists) {
        if (l.kids.some((k) => !['LI', 'L', 'Caption'].includes(k.role))) add({ node: l, title: 'List contains tags other than list items', detail: 'An L tag may contain only LI items (plus nested lists or a caption).' });
        for (const li of l.kids.filter((k) => k.role === 'LI')) {
          if (li.kids.length && li.kids.some((k) => !['Lbl', 'LBody'].includes(k.role))) { add({ node: li, severity: 'warning', title: 'List item is not split into Lbl and LBody', detail: 'Put the bullet or number in Lbl and the item text in LBody.' }); break; }
        }
      }
    } },
  { id: 'linksTagged', title: 'Links are tagged', wcag: ['2.4.4', '4.1.2'], mh: '28', severity: 'error',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const all = c.pages.flatMap((p) => p.links.map((l) => ({ p, l })));
      if (!all.length) return 'na';
      for (const { p, l } of all) if (!p.refObjs.has(l.id)) add({ page: p.index, title: 'Link on page ' + (p.index + 1) + ' is not tagged', detail: 'The link' + (l.url ? ' to ' + clip(l.url, 50) : '') + ' must sit inside a Link tag so it can be reached and announced.' });
    } },
  { id: 'linkContents', title: 'Links have a description', wcag: ['2.4.4'], mh: '28', severity: 'error',
    run(c, add) {
      const all = c.pages.flatMap((p) => p.links.map((l) => ({ p, l })));
      if (!all.length) return 'na';
      for (const { p, l } of all) if (!l.contents) {
        const node = c.ordered.find((n) => n.role === 'Link' && n.objs.includes(l.id) && n.page === p.index);
        add({ node, page: p.index, title: 'Link has no description', detail: 'PDF/UA requires each link annotation to carry a Contents description' + (l.url ? ', for example where it goes (' + clip(l.url, 50) + ')' : '') + '.' });
      }
    } },
  { id: 'linkText', title: 'Link text says where it goes', wcag: ['2.4.4'], mh: null, severity: 'warning',
    run(c, add) {
      if (!c.doc.tagged) return 'skip';
      const links = c.ordered.filter((n) => n.role === 'Link');
      if (!links.length) return 'na';
      for (const l of links) if (l.text && VAGUE_LINKS.test(l.text.trim())) add({ node: l, title: 'Link text “' + l.text.trim() + '” is not descriptive', detail: 'Out of context, it doesn’t say where the link goes. Use the destination’s name instead.' });
    } }
];

const NOT_CHECKED = [
  ['Table header scope and header IDs', '1.3.1'],
  ['Fonts embedded with Unicode mappings', '1.3.1'],
  ['Tab order set to follow the structure on each page', '2.4.3'],
  ['Language of individual passages', '3.1.2'],
  ['Text contrast', '1.4.3'],
  ['Full PDF/UA validation with veraPDF (server side, not connected in this test build)', null]
];
const MANUAL = [
  { id: 'order', text: 'Reading order makes sense when the page is read aloud', wcag: '1.3.2' },
  { id: 'alt', text: 'Alternative text accurately describes each informative image', wcag: '1.1.1' },
  { id: 'colour', text: 'Colour is never the only way information is shown', wcag: '1.4.1' },
  { id: 'contrast', text: 'Text has enough contrast against its background', wcag: '1.4.3' }
];

function checkAudit(A) {
  const ctx = { doc: A.doc, pages: A.pages, ordered: A.ordered };
  const F = [], results = [];
  for (const rule of RULES) {
    const before = F.length;
    let status;
    try { status = rule.run(ctx, (f) => F.push(Object.assign({ rule, severity: rule.severity }, f, { node: f.node || null }))); }
    catch (e) { status = 'skip'; console.error(rule.id, e); }
    results.push({ rule, status: status === 'skip' ? 'skip' : F.length > before ? 'fail' : status === 'na' ? 'na' : 'pass' });
  }
  F.forEach((f, i) => { f.id = 'f' + i; if (f.node && f.page == null) f.page = f.node.page; });
  F.sort((a, b) => (a.severity === b.severity ? (a.page ?? -1) - (b.page ?? -1) : a.severity === 'error' ? -1 : 1));
  const byNode = new Map();
  for (const f of F) if (f.node) { const a = byNode.get(f.node.uid) || []; a.push(f); byNode.set(f.node.uid, a); }
  return { findings: F, results, byNode };
}
const count = (sev) => state.findings.filter((f) => f.severity === sev).length;
const worst = (uid) => { const fs = state.byNode.get(uid); if (!fs) return null; return fs.some((f) => f.severity === 'error') ? 'error' : 'warning'; };
const criteriaText = (rule) => {
  const parts = rule.wcag.map((w) => w + ' ' + WCAG[w]);
  if (rule.mh) parts.push('Matterhorn ' + rule.mh + ' ' + MATTERHORN[rule.mh]);
  return parts.join('; ');
};

