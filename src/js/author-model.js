/* ---------- authoring: model ---------- */
const LANGS = [['en-IE', 'English (Ireland)'], ['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['ga', 'Irish'],
  ['fr', 'French'], ['de', 'German'], ['es', 'Spanish'], ['it', 'Italian'], ['pl', 'Polish'], ['pt', 'Portuguese'], ['nl', 'Dutch']];
const DRAFT_KEY = 'apdf.draft.v1';
const PX = 1.3; // screen pixels per point in the Write view
const author = { doc: null, sel: null, findings: [], layout: null, saveNote: '', lastPdf: null, pendingImage: null, dialogMode: 'new', view: 'write' };
const bid = () => 'b' + Math.random().toString(36).slice(2, 10);
const TEXTY = (b) => b.type === 'heading' || b.type === 'paragraph' || b.type === 'list';
const blockTag = (b) => (b.type === 'heading' ? 'H' + b.level : b.type === 'paragraph' ? 'P' : b.type === 'list' ? 'L'
  : b.type === 'image' ? (b.decorative ? 'Artifact' : 'Figure') : b.type === 'table' ? 'Table' : 'Break');
const blockName = (b) => (b.type === 'heading' ? 'Heading ' + b.level : b.type === 'paragraph' ? 'Paragraph' : b.type === 'list' ? 'List'
  : b.type === 'image' ? 'Image' : b.type === 'table' ? 'Table' : 'Page break');
const blockLabel = (b) => (b.type === 'heading' || b.type === 'paragraph' ? b.text.trim() : b.type === 'list' ? b.items.filter((i) => i.trim()).join(', ')
  : b.type === 'image' ? (b.decorative ? 'Decorative image' : b.alt.trim() || b.name || 'Image') : b.type === 'table' ? b.caption.trim() || 'Table' : 'Page break') || blockName(b);
function makeBlock(type, o) {
  o = o || {};
  const b = { id: bid(), type, style: {} };
  if (type === 'heading') Object.assign(b, { level: o.level || 2, text: o.text || '' });
  if (type === 'paragraph') b.text = o.text || '';
  if (type === 'list') Object.assign(b, { marker: 'disc', items: [''] });
  if (type === 'image') Object.assign(b, { name: '', data: '', w: 0, h: 0, alt: '', decorative: false, caption: '', showCaption: false, widthPct: 100, align: 'left' });
  if (type === 'table') Object.assign(b, { rows: [['', '', ''], ['', '', ''], ['', '', '']], headerRow: true, headerCol: false, caption: '', size: 10, headerFill: '#E8EEF4', stripes: false, repeatHeader: true });
  return b;
}
function normalizeDoc(d) {
  d.font = famKey(d.font || DEFAULT_FONT);
  d.format = 'apdf-draft';
  d.blocks = d.blocks.filter((b) => b.type !== 'shape');   // layers were removed: drop shapes
  for (const b of d.blocks) {
    delete b.pos; delete b.z;                               // and put positioned items back in the text flow
    b.style = b.style || {};
    if (b.style.font) b.style.font = famKey(b.style.font);
    if (b.type === 'list' && !b.marker) { b.marker = b.ordered ? 'decimal' : 'disc'; delete b.ordered; }
    if (b.type === 'table') { if (b.size == null) b.size = 10; if (b.headerFill == null) b.headerFill = '#E8EEF4'; if (b.stripes == null) b.stripes = false; if (b.repeatHeader == null) b.repeatHeader = true; }
    if (b.type === 'image') { if (b.widthPct == null) b.widthPct = 100; if (!b.align) b.align = 'left'; }
  }
  return d;
}
const hasContent = (b) => (b.type === 'heading' || b.type === 'paragraph' ? !!b.text.trim() : b.type === 'list' ? b.items.some((i) => i.trim())
  : b.type === 'image' ? !!b.data : b.type === 'table' ? b.rows.some((r) => r.some((c) => c.trim())) : false);
const findBlock = (id) => author.doc && author.doc.blocks.find((b) => b.id === id);
const blockIndex = (id) => (author.doc ? author.doc.blocks.findIndex((b) => b.id === id) : -1);
const slug = (s) => (String(s).toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document');
const r1 = (v) => Math.round(v * 10) / 10;
const largeText = (size, bold) => size >= 18 || (bold && size >= 14);
const wcagLabel = (f) => (f.wcag ? f.wcag + ' ' + WCAG[f.wcag] : 'Legibility (good practice)');

/* ---------- fonts on screen (loaded the first time a family is used) ---------- */
const loadedFaces = new Set();
function ensureFace(fam) {
  fam = famKey(fam);
  if (loadedFaces.has(fam)) return;
  loadedFaces.add(fam);
  const jobs = ['R', 'B', 'I', 'BI'].map(async (st) => {
    try {
      const face = new FontFace(FACE[fam], b64bytes(FONTS[fam + '-' + st].ttf).buffer, { weight: st.includes('B') ? '700' : '400', style: st.includes('I') ? 'italic' : 'normal' });
      await face.load(); document.fonts.add(face);
    } catch (e) { /* fall back to system fonts on screen; the PDF still embeds the real font */ }
  });
  Promise.all(jobs).then(() => document.querySelectorAll('#edSheet textarea.tx').forEach(autosize));
}
function fontOptions(selected, withDefault) {
  const groups = [['sans', 'Sans serif'], ['serif', 'Serif'], ['mono', 'Monospaced']];
  return [withDefault ? el('option', { value: '' }, withDefault) : null].concat(groups.map(([cat, label]) =>
    el('optgroup', { label }, FAMILIES.filter((f) => f[2] === cat).map(([k, n]) => el('option', { value: k, selected: selected === k ? true : null }, n)))));
}
function applyTextStyle(node, b) {
  const st = resolveStyle(b, author.doc);
  ensureFace(st.font);
  node.style.fontFamily = "'" + FACE[st.font] + "', system-ui, sans-serif";
  node.style.fontSize = (st.size * PX) + 'px';
  node.style.fontWeight = st.bold ? '700' : '400';
  node.style.fontStyle = st.italic ? 'italic' : 'normal';
  node.style.color = st.color;
  node.style.textAlign = st.align;
  node.style.lineHeight = String(st.lh);
}

