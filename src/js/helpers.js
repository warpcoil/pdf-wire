/* ---------- small helpers ---------- */
const $ = (s) => document.querySelector(s);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') n.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}
const NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  error: '<circle cx="10" cy="10" r="7"/><path d="M7.5 7.5l5 5M12.5 7.5l-5 5"/>',
  warning: '<path d="M10 3.5l7.5 13h-15z"/><path d="M10 8.5v3.5"/><path d="M10 14.3v.1"/>',
  ok: '<circle cx="10" cy="10" r="7"/><path d="M7 10.2l2 2 4-4.4"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v5"/><path d="M10 6.3v.1"/>'
};
function icon(name, label) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 20 20');
  s.setAttribute('class', 'i ' + (name === 'error' ? 'sev-error' : name === 'warning' ? 'sev-warning' : name === 'ok' ? 'sev-ok' : ''));
  s.innerHTML = ICONS[name];
  if (label) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); }
  else s.setAttribute('aria-hidden', 'true');
  return s;
}
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const announce = (msg) => { const l = $('#live'); l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 30); };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

/* ---------- reference data ---------- */
const WCAG = {
  '1.1.1': 'Non-text Content', '1.3.1': 'Info and Relationships', '1.3.2': 'Meaningful Sequence',
  '1.4.1': 'Use of Color', '1.4.3': 'Contrast (Minimum)', '2.4.2': 'Page Titled', '2.4.3': 'Focus Order',
  '2.4.4': 'Link Purpose (In Context)', '2.4.6': 'Headings and Labels', '3.1.1': 'Language of Page',
  '3.1.2': 'Language of Parts', '4.1.2': 'Name, Role, Value'
};
const MATTERHORN = {
  '01': 'Real content tagged', '02': 'Role mapping', '06': 'Metadata', '07': 'Dictionary',
  '11': 'Natural language', '13': 'Graphics', '14': 'Headings', '15': 'Tables', '16': 'Lists', '28': 'Annotations'
};
const STANDARD = new Set(('Document Part Art Sect Div BlockQuote Caption TOC TOCI Index NonStruct Private ' +
  'H H1 H2 H3 H4 H5 H6 P L LI Lbl LBody Table TR TH TD THead TBody TFoot Span Quote Note Reference BibEntry ' +
  'Code Link Annot Ruby RB RT RP Warichu WT WP Figure Formula Form ' +
  'DocumentFragment Aside Title FENote Sub Em Strong Artifact').split(' '));
const CONTAINERS = new Set(['Document', 'DocumentFragment', 'Part', 'Art', 'Sect', 'Div', 'NonStruct', 'Private', 'Aside']);
const BLOCKS = new Set(['P', 'H', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'Figure', 'Formula', 'Table', 'L', 'Caption',
  'BlockQuote', 'TOC', 'Index', 'Note', 'FENote', 'Code', 'Form', 'Title', 'BibEntry']);
const VAGUE_LINKS = /^(click here|here|click|read more|more|more info|more information|link|this link|learn more|go|details|this|page)[.!:]?$/i;

function typeColor(role) {
  if (/^H[1-6]?$/.test(role) || role === 'Title') return 'var(--t-h)';
  if (role === 'P' || role === 'Span' || role === 'Caption') return 'var(--t-p)';
  if (role === 'Figure' || role === 'Formula') return 'var(--t-fig)';
  if (['Table', 'TR', 'TH', 'TD', 'THead', 'TBody', 'TFoot'].includes(role)) return 'var(--t-table)';
  if (role === 'Link' || role === 'Annot') return 'var(--t-link)';
  if (['L', 'LI', 'Lbl', 'LBody'].includes(role)) return 'var(--t-list)';
  return 'var(--t-other)';
}
const chip = (role) => el('span', { class: 'chip', style: '--c:' + typeColor(role) }, role);

/* ---------- PDF.js setup ---------- */
const pdfjsLib = window.pdfjsLib;
let OPS, Util, IMAGE_OPS;
if (pdfjsLib) {
  OPS = pdfjsLib.OPS; Util = pdfjsLib.Util;
  IMAGE_OPS = new Set(['paintImageXObject', 'paintImageMaskXObject', 'paintInlineImageXObject',
    'paintImageXObjectRepeat', 'paintImageMaskXObjectRepeat', 'paintSolidColorImageMask', 'paintJpegXObject',
    'paintInlineImageXObjectGroup', 'paintImageMaskXObjectGroup'].map((k) => OPS[k]).filter((v) => v != null));
}

/* ---------- state ---------- */
const state = {
  mode: 'home', pdf: null, fileName: '', pages: [], nodes: new Map(), ordered: [], doc: null,
  findings: [], results: [], byNode: new Map(),
  pageIndex: 0, zoom: 1, fit: 1, selected: null, selectedFinding: null,
  manual: {}, renderTask: null, loadSeq: 0
};
let uidSeq = 0;

const mcidOf = (id) => { const m = /_mc(\d+)$/.exec(id || ''); return m ? +m[1] : null; };
const tagName = (t) => (t && typeof t === 'object' && typeof t.name === 'string' ? t.name : t);
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

function setMode(m) {
  state.mode = m;
  document.body.dataset.mode = m;
  if (m === 'home') renderHome();
  updateHeader();
}
/* the Write / Pages / Check / Remediate tabs in the header */
function updateModeTabs() {
  const m = state.mode, v = author.view;
  const on = { modeWrite: m === 'author' && v === 'write', modePages: m === 'author' && v === 'pages', modeCheck: m === 'audit', modeRemediate: m === 'retag' };
  for (const [id, val] of Object.entries(on)) { const b = document.getElementById(id); if (b) b.setAttribute('aria-pressed', val ? 'true' : 'false'); }
  const pages = document.getElementById('modePages'); if (pages) pages.disabled = !author.doc;
}
function updateHeader() {
  const m = state.mode;
  $('#fileName').textContent = m === 'author' ? (author.doc ? author.doc.title || 'Untitled document' : '') : m === 'audit' ? state.fileName : m === 'retag' ? (rt.T ? rt.T.name : '') : 'No file open';
  $('#backToEdit').hidden = !(m === 'audit' && author.doc);
  $('#backToRetag').hidden = !(m === 'audit' && rt.T);
  const c = $('#saveChip'); if (c) c.textContent = author.saveNote || '';
  updateModeTabs();
}
function renderHome() {
  const host = $('#homeDraft'); if (!host) return;
  host.replaceChildren();
  const d = author.doc || loadLocalDraft();
  if (d) host.append(el('div', { class: 'card' }, el('h3', {}, 'Continue your draft'),
    el('p', {}, '“' + clip(d.title || 'Untitled', 70) + '”, ' + plural(d.blocks.filter(hasContent).length, 'block') + ' with content. Kept in this browser.'),
    el('div', { class: 'actions' }, el('button', { type: 'button', class: 'btn primary', onclick: () => openDraft(d) }, 'Continue editing'))));
}

