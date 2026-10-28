/* ---------- undo and redo ----------
   Write view: every change to the draft is recorded as a snapshot (typing is
   grouped, so a pause ends a step). Image data is kept once in a pool and the
   snapshots refer to it, so a long history of a document with photos stays small.
   Tag in place keeps its own history (see remediate-tag-view.js). */

const hist = { past: [], future: [], last: null, timer: null, docRef: null };
const imgPool = new Map(), imgKeyOf = new Map();
const HIST_MAX = 100;
function poolKey(v) {
  let k = imgKeyOf.get(v);
  if (!k) { k = '\u0000img' + imgKeyOf.size; imgKeyOf.set(v, k); imgPool.set(k, v); }
  return k;
}
const snapDoc = (d) => JSON.stringify(d, (k, v) => (k === 'data' && typeof v === 'string' && v.length > 256 ? poolKey(v) : v));
const unsnapDoc = (s) => JSON.parse(s, (k, v) => (k === 'data' && typeof v === 'string' && v.startsWith('\u0000img') ? imgPool.get(v) || '' : v));

/* a new or opened document starts a new history */
function resetHistory() {
  clearTimeout(hist.timer);
  hist.past = []; hist.future = [];
  hist.docRef = author.doc;
  hist.last = author.doc ? snapDoc(author.doc) : null;
  updateHistoryButtons();
}
function recordHistory(kind) {
  if (!author.doc) return;
  if (hist.docRef !== author.doc && !hist.restoring) { resetHistory(); return; }
  clearTimeout(hist.timer);
  if (kind === 'text') { hist.timer = setTimeout(commitHistory, 700); return; }
  commitHistory();
}
function commitHistory() {
  clearTimeout(hist.timer);
  if (!author.doc) return;
  const s = snapDoc(author.doc);
  if (s === hist.last) return;
  if (hist.last != null) hist.past.push(hist.last);
  if (hist.past.length > HIST_MAX) hist.past.shift();
  hist.last = s; hist.future = [];
  updateHistoryButtons();
}
function restoreSnapshot(s, what) {
  hist.restoring = true;
  const keepSel = author.sel;
  author.doc = normalizeDoc(unsnapDoc(s));
  hist.docRef = author.doc; hist.last = s;
  author.multi = new Set();
  author.sel = findBlock(keepSel) ? keepSel : (author.doc.blocks[0] ? author.doc.blocks[0].id : null);
  renderEditor({}); renderOutline(); renderProps(); scheduleAuthorChecks(); saveLocalSoon(); updateHeader(); schedulePreview(); updateToolbar();
  hist.restoring = false;
  updateHistoryButtons();
  announce(what);
}
function undo() {
  if (state.mode === 'retag') { rtUndo(); return; }
  if (state.mode !== 'author' || !author.doc) return;
  commitHistory();
  if (!hist.past.length) { announce('Nothing to undo.'); return; }
  hist.future.push(hist.last);
  restoreSnapshot(hist.past.pop(), 'Undone.');
}
function redo() {
  if (state.mode === 'retag') { rtRedo(); return; }
  if (state.mode !== 'author' || !author.doc || !hist.future.length) { announce('Nothing to redo.'); return; }
  hist.past.push(hist.last);
  restoreSnapshot(hist.future.pop(), 'Redone.');
}
function updateHistoryButtons() {
  const u = $('#undoBtn'), r = $('#redoBtn');
  if (u) u.disabled = !hist.past.length && !(author.doc && hist.last != null && hist.timer);
  if (r) r.disabled = !hist.future.length;
}
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
/* Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, except while typing in a field, where the field's own undo applies */
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (typing || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});
