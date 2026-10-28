/* ---------- remediation: layout analysis ----------
   Turns the raw page content from extractPdf into blocks in reading order:
   headings, paragraphs, lists, images, tables and artifacts. Every text item
   and image ends up in exactly one block or artifact, so the tag-in-place
   writer can tag all of the original content.

   These are heuristics. They work well on single-column documents with clear
   styling and are weaker on complex layouts; the review step exists for that. */

const BULLET_RE = /^([•●◦▪▫■□‣⁃∙·–—−*➢➔▸►✓✔❖-])(\s+|$)/;
const ORDERED_RE = /^\(?((\d{1,3})|([a-z])|([A-Z])|([ivxlc]{1,6})|([IVXLC]{1,6}))[.)](\s+|$)/;
const MARKER_ONLY_RE = /^(\(?(\d{1,3}|[a-zA-Z]|[ivxlcIVXLC]{1,6})[.)]|[•●◦▪▫■□‣⁃∙·–—−*➢➔▸►✓✔❖-])$/;
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const wordCount = (s) => (String(s).trim() ? String(s).trim().split(/\s+/).length : 0);
const rectOf = (bs) => bs.reduce((r, b) => (r ? union(r, b) : b.slice()), null);
const centre = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
const inside = (pt, r, pad) => pt[0] >= r[0] - (pad || 0) && pt[0] <= r[2] + (pad || 0) && pt[1] >= r[1] - (pad || 0) && pt[1] <= r[3] + (pad || 0);
const overlapArea = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

function itemRect(it) { return [it.x, it.y - it.size * 0.25, it.x + it.w, it.y + it.size * 0.8]; }

function markerInfo(text) {
  const t = text.trim();
  let m = BULLET_RE.exec(t);
  if (m) return { cls: 'bullet', marker: /[–—−-]/.test(m[1]) ? 'dash' : 'disc', token: m[1], rest: t.slice(m[0].length) };
  m = ORDERED_RE.exec(t);
  if (m) {
    const marker = m[2] ? 'decimal' : m[5] ? 'lower-roman' : m[6] ? 'upper-roman' : m[3] ? 'lower-alpha' : 'upper-alpha';
    return { cls: 'ordered', marker, token: m[1], rest: t.slice(m[0].length) };
  }
  return null;
}

/* text items -> segments (runs of text on one baseline without a wide gap) */
function buildSegments(items) {
  const its = items.filter((it) => !it.rotated).sort((a, b) => b.y - a.y || a.x - b.x);
  const kept = [], dups = [];
  for (const it of its) {          // text drawn twice to fake bold, or as a shadow
    const twin = kept.find((k) => k.str === it.str && Math.abs(k.x - it.x) < 1.5 && Math.abs(k.y - it.y) < 1.5);
    if (twin) dups.push([it, twin]); else kept.push(it);
  }
  const lines = [];
  for (const it of kept) {
    let ln = null;
    for (let k = lines.length - 1; k >= 0 && k >= lines.length - 4; k--) {
      const L = lines[k];
      if (Math.abs(L.y - it.y) <= 0.38 * Math.max(L.size, it.size) && !(Math.min(L.size, it.size) < 0.8 * Math.max(L.size, it.size) && Math.abs(L.y - it.y) > 1)) { ln = L; break; }
    }
    if (!ln) { ln = { y: it.y, size: it.size, items: [] }; lines.push(ln); }
    ln.items.push(it);
    if (it.size > ln.size) { ln.size = it.size; ln.y = it.y; }
  }
  // superscripts and subscripts (smaller text just off the baseline) join the line they sit on
  for (const Ls of lines) {
    if (!Ls.items.length) continue;
    for (const Lb of lines) {
      if (Lb === Ls || !Lb.items.length || Ls.size >= 0.8 * Lb.size || Math.abs(Ls.y - Lb.y) > 0.65 * Lb.size) continue;
      const move = Ls.items.filter((it) => Lb.items.some((o) => Math.min(Math.abs(it.x - (o.x + o.w)), Math.abs(o.x - (it.x + it.w))) <= Lb.size));
      if (!move.length) continue;
      Lb.items.push(...move);
      Ls.items = Ls.items.filter((it) => !move.includes(it));
    }
  }
  const segs = [];
  for (const L of lines) {
    if (!L.items.length) continue;
    L.items.sort((a, b) => a.x - b.x);
    let cur = null;
    for (const it of L.items) {
      const gap = cur ? it.x - cur.x1 : 0;
      if (!cur || gap > Math.max(0.9 * Math.max(cur.size, it.size), 5)) { cur = { items: [], x0: it.x, x1: it.x + it.w, y: L.y, size: it.size }; segs.push(cur); }
      cur.items.push(it); cur.x1 = Math.max(cur.x1, it.x + it.w); cur.size = Math.max(cur.size, it.size);
    }
  }
  segs.forEach(finishSeg);
  return { segs, dups };
}
function joinItems(items) {
  let s = '', prev = null;
  for (const it of items) {
    if (prev) {
      const gap = it.x - (prev.x + prev.w);
      if (Math.abs(it.y - prev.y) > prev.size * 0.5) s += ' ';
      else if (gap > 0.12 * Math.max(prev.size, it.size) && !/\s$/.test(s) && !/^[\s,.;:!?)\]]/.test(it.str)) s += ' ';
    }
    s += it.str; prev = it;
  }
  return s.replace(/\s+/g, ' ').trim();
}
function finishSeg(sg) {
  sg.text = joinItems(sg.items);
  let b = 0, it = 0, n = 0;
  for (const x of sg.items) { const c = x.str.replace(/\s/g, '').length; n += c; if (x.bold) b += c; if (x.italic) it += c; }
  sg.bold = n > 0 && b / n > 0.6; sg.italic = n > 0 && it / n > 0.6;
  sg.top = sg.y + sg.size * 0.8; sg.bottom = sg.y - sg.size * 0.25;
  sg.rect = [sg.x0, sg.bottom, sg.x1, sg.top];
  sg.words = wordCount(sg.text);
  return sg;
}

/* merge collinear ruling segments into lines */
function mergeRules(segs, o) {
  const k = o === 'h' ? 'y' : 'x';
  const s = segs.filter((g) => g.o === o).sort((a, b) => a[k] - b[k] || a.a - b.a);
  const out = [];
  for (const g of s) {
    const last = out.find((L) => Math.abs(L[k] - g[k]) < 1.2 && g.a <= L.b + 2 && g.b >= L.a - 2);
    if (last) { last.a = Math.min(last.a, g.a); last.b = Math.max(last.b, g.b); }
    else out.push({ o, [k]: g[k], a: g.a, b: g.b });
  }
  return out;
}

/* ruled tables: groups of horizontal rules with text between them */
function findRuledTables(P, segs, bodySize) {
  const H = mergeRules(P.segs, 'h').filter((l) => l.b - l.a >= 30).sort((a, b) => b.y - a.y);
  const V = mergeRules(P.segs, 'v').filter((l) => l.b - l.a >= 8);
  const groups = [];
  for (const l of H) {
    const g = groups.find((G) => {
      const ov = Math.min(G.b, l.b) - Math.max(G.a, l.a);
      return ov >= 0.7 * Math.min(G.b - G.a, l.b - l.a) && G.lines[G.lines.length - 1].y - l.y <= Math.max(60, bodySize * 6);
    });
    if (g) { g.lines.push(l); g.a = Math.min(g.a, l.a); g.b = Math.max(g.b, l.b); }
    else groups.push({ lines: [l], a: l.a, b: l.b });
  }
  const tables = [];
  for (const g of groups) {
    const ys = [];
    for (const l of g.lines) if (!ys.some((y) => Math.abs(y - l.y) < 2)) ys.push(l.y);
    ys.sort((a, b) => b - a);
    if (ys.length < 2) continue;
    // a header row above the first rule (tables often only rule below the header)
    const above = segs.filter((sg) => sg.y > ys[0] && sg.y - ys[0] < 2.2 * sg.size && sg.x0 >= g.a - 4 && sg.x1 <= g.b + 4);
    if (above.length) {
      const near = Math.min(...above.map((sg) => sg.y)), row = above.filter((sg) => Math.abs(sg.y - near) < 2);
      const shadedAbove = P.fills.some((f) => f[1] >= ys[0] - 2 && f[1] <= ys[0] + 2 && overlapArea(f, [g.a, ys[0], g.b, ys[0] + 30]) > 0.5 * (g.b - g.a) * Math.min(30, f[3] - f[1]));
      if (row.length >= 2 || shadedAbove) ys.unshift(Math.max(...row.map((sg) => sg.top)) + 2);
    }
    if (ys.length < 3) continue;
    const all = [];
    for (const sg of segs) for (const it of sg.items) if (inside(centre(itemRect(it)), [g.a, ys[ys.length - 1], g.b, ys[0]], 0.5)) all.push(it);
    if (all.length < 4) continue;
    const size = median(all.map((i) => i.size)) || bodySize;
    const raw = [];
    for (let r = 0; r < ys.length - 1; r++) raw.push(all.filter((it) => { const c = it.y + it.size * 0.3; return c <= ys[r] && c > ys[r + 1]; }));
    // columns: vertical rules inside the region, or gaps in the text
    const colsOf = (lo, hi) => {
      const top = ys[lo], bot = ys[hi], h = top - bot, out = [];
      for (const v of V) if (v.x > g.a + 3 && v.x < g.b - 3 && (Math.min(v.b, top) - Math.max(v.a, bot)) >= 0.5 * h && !out.some((x) => Math.abs(x - v.x) < 3)) out.push(v.x);
      return (out.length ? out : projectionGaps(runsOf(raw.slice(lo, hi).flat()), Math.max(4, size * 0.5))).sort((a, b) => a - b);
    };
    const crosses = (items, bounds) => runsOf(items).some((it) => bounds.some((x) => it.x < x - 2 && it.x + it.w > x + 2));
    // leave out bands at either end whose text runs across the columns the rest agree on (a list or note under a rule)
    let lo = 0, hi = raw.length;
    while (hi - lo > 2) { const fewer = colsOf(lo, hi - 1); if (fewer.length > colsOf(lo, hi).length && crosses(raw[hi - 1], fewer)) hi--; else break; }
    while (hi - lo > 2) { const fewer = colsOf(lo + 1, hi); if (fewer.length > colsOf(lo, hi).length && crosses(raw[lo], fewer)) lo++; else break; }
    while (hi > lo && !raw[hi - 1].length) hi--;
    while (hi > lo && !raw[lo].length) lo++;
    const bounds = colsOf(lo, hi);
    const rect = [g.a, ys[hi], g.b, ys[lo]];
    const xs = [rect[0], ...bounds, rect[2]];
    if (xs.length < 3) continue;
    const its = raw.slice(lo, hi).flat();
    // rows: the bands between rules; split a band into lines when the rules are sparse
    const bands = [];
    const sparse = hi - lo <= 2;
    for (let r = lo; r < hi; r++) {
      const band = raw[r];
      if (!band.length) continue;
      const lines = groupBaselines(band);
      const filled = (ln) => new Set(ln.map((it) => colIndex(xs, it))).size;
      if (lines.length > 1 && (sparse || lines.every((ln) => filled(ln) >= Math.max(2, 0.6 * (xs.length - 1))))) {
        // each baseline is a row; a line with only one cell that starts in lower case continues the row above
        for (const ln of lines) {
          if (bands.length && filled(ln) === 1 && bands[bands.length - 1].band === r && /^[a-z]/.test(ln[0].str.trim())) bands[bands.length - 1].items.push(...ln);
          else bands.push({ band: r, items: ln.slice() });
        }
      } else bands.push({ band: r, items: band });
    }
    if (bands.length < 2) continue;
    const rows = bands.map((B) => {
      const cells = xs.slice(1).map(() => []);
      for (const it of B.items) cells[colIndex(xs, it)].push(it);
      return cells.map((c) => cellOf(c));
    });
    const used = new Set(its.map((i) => i.id));
    const firstBottom = bands[0].items.reduce((m, i) => Math.min(m, i.y - i.size * 0.3), Infinity);
    const shaded = P.fills.some((f) => overlapArea(f, [rect[0], firstBottom, rect[2], rect[3]]) > 0.4 * (rect[2] - rect[0]) * size);
    tables.push(makeTableBlock(P.index, rect, rows, 'rules', shaded, used));
  }
  return tables;
}
function colIndex(xs, it) {
  const cx = it.x + Math.min(it.w, it.size * 2) / 2;
  for (let c = 1; c < xs.length; c++) if (cx < xs[c]) return c - 1;
  return xs.length - 2;
}
function groupBaselines(items) {
  const s = [...items].sort((a, b) => b.y - a.y || a.x - b.x), lines = [];
  for (const it of s) {
    const L = lines.find((l) => Math.abs(l[0].y - it.y) <= 0.38 * it.size);
    if (L) L.push(it); else lines.push([it]);
  }
  lines.forEach((l) => l.sort((a, b) => a.x - b.x));
  return lines;
}
/* words on a line that are only a space apart, as one run (some PDFs draw every word separately) */
function runsOf(items) {
  const out = [];
  for (const ln of groupBaselines(items)) {
    let cur = null;
    for (const it of ln) {
      if (cur && it.x - (cur.x + cur.w) < Math.max(3, 0.5 * it.size)) cur.w = Math.max(cur.w, it.x + it.w - cur.x);
      else { cur = { x: it.x, w: it.w, y: it.y, size: it.size }; out.push(cur); }
    }
  }
  return out;
}
function projectionGaps(items, minGap) {
  const iv = items.map((i) => [i.x, i.x + i.w]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const v of iv) { const L = merged[merged.length - 1]; if (L && v[0] <= L[1] + 1) L[1] = Math.max(L[1], v[1]); else merged.push(v.slice()); }
  const out = [];
  for (let k = 1; k < merged.length; k++) if (merged[k][0] - merged[k - 1][1] >= minGap) out.push((merged[k][0] + merged[k - 1][1]) / 2);
  return out;
}
function cellOf(items) {
  const lines = groupBaselines(items);
  let text = '';
  for (const ln of lines) {
    const t = joinItems(ln);
    text = text ? (/[A-Za-zÀ-ɏ]-$/.test(text) && /^[a-zß-ÿ]/.test(t) ? text.slice(0, -1) + t : text + ' ' + t) : t;
  }
  return { text, items: items.map((i) => i.id), bold: items.length > 0 && items.every((i) => i.bold) };
}
function makeTableBlock(page, rect, rows, source, shaded, used) {
  const first = rows[0], firstCol = rows.map((r) => r[0]);
  const headBold = first.filter((c) => c.text).length > 0 && first.filter((c) => c.text).every((c) => c.bold);
  const bodyBold = rows.slice(1).some((r) => r.some((c) => c.text && c.bold));
  const colBold = firstCol.slice(1).filter((c) => c.text).length > 1 && firstCol.slice(1).filter((c) => c.text).every((c) => c.bold);
  const headerRow = headBold || shaded || !colBold;
  const why = headBold && !bodyBold ? 'the first row is bold' : shaded ? 'the first row is shaded' : colBold ? null : 'tables usually have one';
  return { kind: 'table', page, rect, rows, source, used, headerRow, headerCol: colBold, headerWhy: colBold && !headerRow ? 'the first column is bold' : why,
    confident: source === 'rules' && (headBold || shaded) };
}

/* reading order: split at column gutters, otherwise top to bottom */
function boxesOrder(boxes, bodySize, depth, info) {
  if (boxes.length < 2 || depth > 30) return sortTopDown(boxes);
  const g = findGutter(boxes, bodySize, info);
  if (!g) {
    // no column gutter across the whole region: split at the widest horizontal gap and look again,
    // which finds a sidebar or columns that only cover part of the page
    const cut = boxes.length >= 5 && depth < 24 ? widestGap(boxes, bodySize) : null;
    if (cut == null) return sortTopDown(boxes);
    const top = boxes.filter((b) => (b.top + b.bottom) / 2 > cut), rest = boxes.filter((b) => (b.top + b.bottom) / 2 <= cut);
    if (!top.length || !rest.length) return sortTopDown(boxes);
    return [...boxesOrder(top, bodySize, depth + 1, info), ...boxesOrder(rest, bodySize, depth + 1, info)];
  }
  if (boxes.some((b) => b.kind === 'seg' && b.x1 <= g.x0 + 0.5) && boxes.some((b) => b.kind === 'seg' && b.x0 >= g.x1 - 0.5)) info.columns = Math.max(info.columns, 2);
  const gx = (g.x0 + g.x1) / 2;
  const crossing = boxes.filter((b) => b.x0 < g.x0 - 0.5 && b.x1 > g.x1 + 0.5).sort((a, b) => b.top - a.top);
  let rest = boxes.filter((b) => !crossing.includes(b));
  const out = [];
  const cols = (bs) => [...boxesOrder(bs.filter((b) => (b.x0 + b.x1) / 2 < gx), bodySize, depth + 1, info), ...boxesOrder(bs.filter((b) => (b.x0 + b.x1) / 2 >= gx), bodySize, depth + 1, info)];
  for (const s of crossing) {
    const sc = (s.top + s.bottom) / 2;
    const above = rest.filter((b) => (b.top + b.bottom) / 2 > sc);
    out.push(...cols(above), s);
    rest = rest.filter((b) => !above.includes(b));
  }
  out.push(...cols(rest));
  return out;
}
function widestGap(boxes, bodySize) {
  const iv = boxes.map((b) => [b.bottom, b.top]).sort((a, b) => b[1] - a[1]);
  let best = null, lowest = iv[0][0];
  for (let k = 1; k < iv.length; k++) {
    const gap = lowest - iv[k][1];
    if (gap >= 0.6 * bodySize && (!best || gap > best.gap)) best = { gap, at: (lowest + iv[k][1]) / 2 };
    lowest = Math.min(lowest, iv[k][0]);
  }
  return best ? best.at : null;
}
/* A gutter is a vertical strip that almost nothing covers, with plenty of content on
   both sides. Boxes that cross it (a title over two columns) don't stop it counting. */
function findGutter(boxes, bodySize, info) {
  if (boxes.length < 4) return null;
  const minX = Math.floor(Math.min(...boxes.map((b) => b.x0))), maxX = Math.ceil(Math.max(...boxes.map((b) => b.x1)));
  const top = Math.max(...boxes.map((b) => b.top)), bottom = Math.min(...boxes.map((b) => b.bottom)), Ht = top - bottom;
  if (maxX - minX < 60 || Ht <= 0) return null;
  const cov = new Float32Array(maxX - minX + 1);
  for (const b of boxes) for (let x = Math.max(minX, Math.ceil(b.x0)); x <= Math.min(maxX, Math.floor(b.x1)); x++) cov[x - minX] += b.top - b.bottom;
  const thr = Math.max(0.12 * Ht, 3.2 * bodySize), minW = Math.max(9, bodySize * 0.9);
  const gaps = [];
  for (let x = 0; x < cov.length;) {
    if (cov[x] > thr) { x++; continue; }
    let e = x; let worst = 0;
    while (e < cov.length && cov[e] <= thr) { worst = Math.max(worst, cov[e]); e++; }
    const leftMax = Math.max(0, ...cov.slice(0, x)), rightMax = Math.max(0, ...cov.slice(e));
    if (e - x >= minW && x > 0 && e < cov.length && leftMax > 0.25 * Ht && rightMax > 0.25 * Ht) gaps.push({ x0: minX + x, x1: minX + e - 1, w: e - x, worst });
    x = e;
  }
  gaps.sort((a, b) => a.worst - b.worst || b.w - a.w);
  const crosses = (b, g) => b.x0 < g.x0 - 0.5 && b.x1 > g.x1 + 0.5;
  for (const g of gaps) {
    const narrow = boxes.filter((b) => !crosses(b, g));
    const L = narrow.filter((b) => b.x1 <= g.x1 + 0.5 && (b.x0 + b.x1) / 2 < g.x0), R = narrow.filter((b) => b.x0 >= g.x0 - 0.5 && (b.x0 + b.x1) / 2 > g.x1);
    const imgSide = (S) => S.length && S.every((b) => b.kind !== 'seg');
    if ((L.length < 2 && !imgSide(L)) || (R.length < 2 && !imgSide(R)) || !L.length || !R.length) continue;
    const lt = Math.max(...L.map((b) => b.top)), lb = Math.min(...L.map((b) => b.bottom));
    const rt = Math.max(...R.map((b) => b.top)), rb = Math.min(...R.map((b) => b.bottom));
    const ov = Math.min(lt, rt) - Math.max(lb, rb);
    if (ov < 0.3 * Math.min(lt - lb, rt - rb)) continue;
    const Ls = L.filter((b) => b.kind === 'seg'), Rs = R.filter((b) => b.kind === 'seg');
    if (Ls.length && Ls.every((b) => MARKER_ONLY_RE.test(b.text))) continue;     // a column of bullets or numbers, not a gutter
    if (Ls.length && Rs.length) {
      const match = Ls.filter((a) => Rs.some((b) => Math.abs(a.y - b.y) < 1.5)).length / Math.min(Ls.length, Rs.length);
      const words = Math.min(median(Ls.map((b) => b.words)), median(Rs.map((b) => b.words)));
      if (match > 0.6 && words <= 3) { info.tableLike = true; continue; }
    }
    return g;
  }
  return null;
}
function sortTopDown(boxes) {
  const s = [...boxes].sort((a, b) => b.top - a.top), out = [];
  while (s.length) {
    const f = s.shift();
    const row = [f];
    for (let k = 0; k < s.length;) {
      const b = s[k];
      const sameLine = f.kind === 'seg' && b.kind === 'seg' ? Math.abs(f.y - b.y) < 0.4 * Math.max(f.size, b.size) : (Math.min(f.top, b.top) - Math.max(f.bottom, b.bottom)) > 0.5 * Math.min(f.top - f.bottom, b.top - b.bottom);
      if (sameLine) { row.push(b); s.splice(k, 1); } else k++;
    }
    out.push(...row.sort((a, b) => a.x0 - b.x0));
  }
  return out;
}

/* Charts and diagrams drawn with lines and shapes rather than as an image: clusters of
   shapes holding only short labels, numbers in particular. They become one figure. */
function findVectorFigures(P, segs, tables, dots) {
  const area = P.w * P.h;
  const shapes = P.paths.filter((p) => {
    const w = p.rect[2] - p.rect[0], h = p.rect[3] - p.rect[1];
    return !p.artifact && !dots.includes(p) && w * h < 0.5 * area && (w > 0.5 || h > 0.5) && !tables.some((t) => inside(centre(p.rect), t.rect, 2));
  });
  if (shapes.length < 3 || shapes.length > 4000) return [];
  const par = shapes.map((_, i) => i);
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const E = 10, grow = (r) => [r[0] - E, r[1] - E, r[2] + E, r[3] + E];
  const order = shapes.map((_, i) => i).sort((a, b) => shapes[a].rect[0] - shapes[b].rect[0]);
  for (let a = 0; a < order.length; a++) {
    const ra = grow(shapes[order[a]].rect);
    for (let b = a + 1; b < order.length; b++) {
      const rb = shapes[order[b]].rect;
      if (rb[0] > ra[2]) break;
      if (rb[1] <= ra[3] && rb[3] >= ra[1]) par[find(order[a])] = find(order[b]);
    }
  }
  const groups = new Map();
  shapes.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
  const out = [];
  for (const members of groups.values()) {
    let rect = rectOf(members.map((m) => m.rect));
    const solid = members.filter((m) => m.rect[2] - m.rect[0] > 2.5 && m.rect[3] - m.rect[1] > 2.5).length;
    if (solid < 3 || (rect[2] - rect[0]) * (rect[3] - rect[1]) < 2500) continue;
    const texts = segs.filter((sg) => inside(centre(sg.rect), rect, sg.words <= 3 ? 16 : 6));
    const numeric = texts.filter((sg) => /^[-+\u2212\u2013]?[£$€]?[\d.,]+\s?%?[kKmMbB]?$/.test(sg.text.trim())).length;
    const long = texts.filter((sg) => sg.words > 6).length;
    if (long > 1 || !(numeric >= 3 || members.length >= 25)) continue;
    for (const sg of texts) rect = union(rect, sg.rect);
    out.push({ rect, paths: members, segs: texts });
  }
  return out;
}

/* rows of segments that line up in columns, with no ruling lines */
function findAlignedTables(lines, bodySize) {
  const out = [];
  let k = 0;
  while (k < lines.length) {
    const L = lines[k];
    if (L.kind !== 'line' || L.segs.length < 2) { k++; continue; }
    const run = [L];
    let j = k + 1;
    while (j < lines.length && lines[j].kind === 'line' && lines[j].segs.length >= 2 && run[run.length - 1].y - lines[j].y <= 2.6 * lines[j].size && run[run.length - 1].y > lines[j].y) { run.push(lines[j]); j++; }
    if (run.length >= 3) {
      const widest = run.reduce((m, r) => (r.segs.length > m.segs.length ? r : m), run[0]);
      const starts = widest.segs.map((s) => s.x0), ends = widest.segs.map((s) => s.x1);
      const fits = (r) => r.segs.every((s) => starts.some((x) => Math.abs(x - s.x0) < 4) || ends.some((x) => Math.abs(x - s.x1) < 4));
      const words = median(run.flatMap((r) => r.segs.map((s) => s.words)));
      if (run.every(fits) && words <= 5) {
        const xs = [Math.min(...run.flatMap((r) => r.segs.map((s) => s.x0))) - 1];
        for (let c = 1; c < starts.length; c++) xs.push((ends[c - 1] + starts[c]) / 2);
        xs.push(Math.max(...run.flatMap((r) => r.segs.map((s) => s.x1))) + 1);
        const rows = run.map((r) => {
          const cells = xs.slice(1).map(() => []);
          for (const s of r.segs) for (const it of s.items) cells[colIndex(xs, it)].push(it);
          return cells.map(cellOf);
        });
        const rect = rectOf(run.map((r) => [Math.min(...r.segs.map((s) => s.x0)), Math.min(...r.segs.map((s) => s.bottom)), Math.max(...r.segs.map((s) => s.x1)), Math.max(...r.segs.map((s) => s.top))]));
        out.push({ at: k, len: run.length, table: makeTableBlock(run[0].page, rect, rows, 'alignment', false, new Set(run.flatMap((r) => r.segs.flatMap((s) => s.items.map((i) => i.id))))) });
        k = j; continue;
      }
    }
    k++;
  }
  return out;
}

function analyseLayout(X) {
  const R = { pages: [], blocks: [], artifacts: [], flags: [], meta: X.meta, numPages: X.numPages };
  const pages = X.pages.map((P) => Object.assign({ P }, buildSegments(P.items)));
  // body text size: the most common size, by characters
  const hist = new Map();
  for (const pg of pages) for (const s of pg.segs) { const k = Math.round(s.size * 2) / 2; hist.set(k, (hist.get(k) || 0) + s.text.length); }
  const bodySize = [...hist].sort((a, b) => b[1] - a[1])[0]?.[0] || 11;
  R.bodySize = bodySize;

  // repeated headers, footers and page numbers
  const band = (P, s) => { const m = Math.min(72, 0.09 * P.h); return s.y > P.h - m ? 'top' : s.y < m ? 'bottom' : null; };
  const keyOf = (s) => s.text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  const seen = new Map();
  for (const pg of pages) for (const s of pg.segs) { const b = band(pg.P, s); if (!b) continue; const k = b + '|' + keyOf(s); seen.set(k, (seen.get(k) || new Set()).add(pg.P.index)); }
  const PAGE_NO = /^[-–—\s|]*((page|p\.?|seite|página|pagina)\s*)?#(\s*(of|\/|de|von)\s*#)?[-–—\s|]*$/i;
  for (const pg of pages) {
    const P = pg.P;
    pg.artSegs = new Set();
    for (const s of pg.segs) {
      const b = band(P, s); if (!b && !(X.meta.tagged && s.items.every((i) => i.artifact))) continue;
      const k = keyOf(s), n = b ? seen.get(b + '|' + k).size : 0;
      const orig = X.meta.tagged && s.items.every((i) => i.artifact);
      if (orig || (b && ((X.numPages >= 2 && n >= Math.max(2, Math.ceil(X.numPages * 0.5))) || PAGE_NO.test(k)))) {
        pg.artSegs.add(s);
        R.artifacts.push({ page: P.index, kind: 'text', text: s.text, rect: s.rect, items: s.items.map((i) => i.id), type: b === 'top' ? 'Header' : b === 'bottom' ? 'Footer' : null,
          why: orig ? 'marked as an artifact in the original' : PAGE_NO.test(k) ? 'page number' : 'repeated on ' + n + ' pages' });
      }
    }
    // images: repeated logos, backgrounds, specks
    pg.artImgs = new Set();
    for (const im of P.images) {
      const w = im.rect[2] - im.rect[0], h = im.rect[3] - im.rect[1];
      const repeated = X.numPages >= 2 && pages.filter((q) => q.P.images.some((o) => Math.abs(o.rect[0] - im.rect[0]) < 2 && Math.abs(o.rect[1] - im.rect[1]) < 2 && Math.abs((o.rect[2] - o.rect[0]) - w) < 2)).length >= Math.max(2, Math.ceil(X.numPages * 0.5));
      const why = (X.meta.tagged && im.artifact) ? 'marked as an artifact in the original' : w * h > 0.8 * P.w * P.h ? 'covers the whole page (background)' : (w < 6 || h < 6) ? 'too small to carry meaning' : repeated ? 'repeated on every page' : null;
      if (why) { pg.artImgs.add(im); R.artifacts.push({ page: P.index, kind: 'image', rect: im.rect, images: [im.id], why, type: repeated ? (im.rect[1] > P.h / 2 ? 'Header' : 'Footer') : null }); }
    }
  }

  for (const pg of pages) {
    const P = pg.P, info = { columns: 1, tableLike: false };
    const segsAll = pg.segs.filter((s) => !pg.artSegs.has(s));
    // bullets drawn as small shapes rather than as text
    const dots = P.paths.filter((p) => { const w = p.rect[2] - p.rect[0], h = p.rect[3] - p.rect[1]; return !p.artifact && w >= 1.2 && h >= 1.2 && w <= 7 && h <= 7 && Math.abs(w - h) < 1.6; });
    const tables0 = findRuledTables(P, segsAll, bodySize);
    const vfigs = findVectorFigures(P, segsAll, tables0, dots);
    const inFig = new Set(vfigs.flatMap((f) => f.segs));
    const segs = segsAll.filter((sg) => !inFig.has(sg));
    const tables = tables0.filter((t) => !vfigs.some((f) => overlapArea(f.rect, t.rect) > 0.5 * (t.rect[2] - t.rect[0]) * (t.rect[3] - t.rect[1])));
    const inTable = new Set(tables.flatMap((t) => [...t.used]));
    // split segments whose items went partly into a table
    const free = [];
    for (const s of segs) {
      const rest = s.items.filter((i) => !inTable.has(i.id));
      if (rest.length === s.items.length) free.push(s);
      else if (rest.length) free.push(finishSeg({ items: rest, x0: Math.min(...rest.map((i) => i.x)), x1: Math.max(...rest.map((i) => i.x + i.w)), y: s.y, size: Math.max(...rest.map((i) => i.size)) }));
    }
    const images = P.images.filter((im) => !pg.artImgs.has(im));
    const boxes = [
      ...free.map((s) => Object.assign(s, { kind: 'seg', page: P.index })),
      ...tables.map((t) => ({ kind: 'table', t, x0: t.rect[0], x1: t.rect[2], top: t.rect[3], bottom: t.rect[1] })),
      ...images.map((im) => ({ kind: 'image', im, x0: im.rect[0], x1: im.rect[2], top: im.rect[3], bottom: im.rect[1] })),
      ...vfigs.map((f, k) => ({ kind: 'image', im: { id: P.index + ':vec' + k, rect: f.rect, vector: true, mcid: null, items: f.segs.flatMap((sg) => sg.items.map((i) => i.id)), paths: f.paths.map((p) => p.mcid) },
        x0: f.rect[0], x1: f.rect[2], top: f.rect[3], bottom: f.rect[1] }))
    ];
    const ordered = boxesOrder(boxes, bodySize, 0, info);
    // consecutive segments on one baseline form a line; a lone list marker joins the text after it
    const lines = [];
    for (const b of ordered) {
      if (b.kind !== 'seg') { lines.push(b); continue; }
      const L = lines[lines.length - 1];
      if (L && L.kind === 'line' && Math.abs(L.y - b.y) < 0.4 * Math.max(L.size, b.size) && b.x0 >= L.x1 - 1) {
        L.segs.push(b); L.x1 = b.x1; L.size = Math.max(L.size, b.size);
      } else lines.push({ kind: 'line', page: P.index, segs: [b], y: b.y, size: b.size, x0: b.x0, x1: b.x1 });
    }
    for (const L of lines) {
      if (L.kind !== 'line') continue;
      for (let k = 0; k < L.segs.length - 1; k++) {
        if (MARKER_ONLY_RE.test(L.segs[k].text) && L.segs[k + 1].x0 - L.segs[k].x1 < 4 * L.size) {
          const a = L.segs[k], b = L.segs[k + 1];
          const m = finishSeg({ items: [...a.items, ...b.items], x0: a.x0, x1: b.x1, y: a.y, size: Math.max(a.size, b.size) });
          m.kind = 'seg'; m.page = P.index; m.markerItems = a.items.map((i) => i.id); m.textX = b.x0;
          L.segs.splice(k, 2, m);
        }
      }
    }
    const aligned = findAlignedTables(lines, bodySize);
    for (const a of aligned.reverse()) lines.splice(a.at, a.len, { kind: 'table', t: a.table });
    if (aligned.length) info.alignedTables = aligned.length;
    // rotated text goes at the end of the page
    const rot = P.items.filter((i) => i.rotated);
    const blocks = groupBlocks(lines, P, bodySize, dots);
    if (rot.length) {
      blocks.push({ kind: 'paragraph', page: P.index, rect: rectOf(rot.map(itemRect)), text: rot.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim(),
        items: rot.map((i) => i.id), size: median(rot.map((i) => i.size)), bold: false, italic: false, rotated: true, lines: [{ items: rot.map((i) => i.id), text: rot.map((i) => i.str).join(' ') }] });
    }
    // duplicate items (fake bold) follow their twin
    pg.dupOf = new Map(pg.dups.map(([d, t]) => [d.id, t.id]));
    R.pages.push({ index: P.index, w: P.w, h: P.h, blocks, info, dupOf: pg.dupOf });
    R.blocks.push(...blocks);

    // things the review should mention
    const texty = P.items.length > 0;
    if (!texty && P.images.length) R.flags.push({ kind: 'scan', page: P.index, title: 'Page ' + (P.index + 1) + ' looks scanned', detail: 'It has no text, only an image of a page. Text can’t be recovered without OCR, which this version doesn’t have yet.' });
    if (info.columns > 1) R.flags.push({ kind: 'columns', page: P.index, title: 'Page ' + (P.index + 1) + ' has more than one column', detail: 'The reading order goes down each column in turn. Check it, especially around anything that spans the columns.' });
    if (P.rotatedText) R.flags.push({ kind: 'rotated', page: P.index, title: 'Page ' + (P.index + 1) + ' has rotated text', detail: 'Rotated text was placed at the end of the page. Move it if it belongs elsewhere.' });
    const over = P.items.filter((i) => images.some((im) => inside(centre(itemRect(i)), im.rect, -1))).length;
    if (over > 3) R.flags.push({ kind: 'overlap', page: P.index, title: 'Page ' + (P.index + 1) + ' has text over an image', detail: 'Text drawn on top of a picture is easy to put in the wrong order or miss.' });
    if (P.paths.length > 120 && P.paths.length > P.items.length) R.flags.push({ kind: 'vector', page: P.index, title: 'Page ' + (P.index + 1) + ' has many drawn shapes', detail: 'It may contain a chart or diagram drawn with lines rather than as an image. Shapes are treated as decoration, so add a description in the text if it carries meaning.' });
    if (P.widgets) R.flags.push({ kind: 'forms', page: P.index, title: 'Page ' + (P.index + 1) + ' has ' + plural(P.widgets, 'form field'), detail: 'Form fields aren’t supported yet and are not made accessible.' });
    if (info.tableLike && !tables.length && !aligned.length) R.flags.push({ kind: 'grid', page: P.index, title: 'Page ' + (P.index + 1) + ' may have a table that wasn’t detected', detail: 'Some text lines up in columns. If it’s a table, rebuild it as one.' });
  }
  assignHeadings(R, bodySize);
  return R;
}

/* lines -> paragraphs, lists, images (with captions) and tables */
function groupBlocks(lines, P, bodySize, dots) {
  const out = [];
  let para = null, list = null;
  const lineText = (L) => L.segs.map((s) => s.text).join(' ');
  const flush = () => {
    if (para) { out.push(finishPara(para, P)); para = null; }
    if (list) { out.push(finishList(list, P)); list = null; }
  };
  for (let k = 0; k < lines.length; k++) {
    const L = lines[k];
    if (L.kind === 'image') {
      flush();
      out.push(L.im.vector ? { kind: 'image', vector: true, page: P.index, rect: L.im.rect, images: [], items: L.im.items, paths: L.im.paths, alt: '' }
        : { kind: 'image', page: P.index, rect: L.im.rect, images: [L.im.id], mcid: L.im.mcid, alt: P.altByMcid.get(L.im.mcid) || '' });
      continue;
    }
    if (L.kind === 'table') { flush(); out.push(L.t); continue; }
    const text = lineText(L), items = L.segs.flatMap((s) => s.items);
    const bold = L.segs.every((s) => s.bold), italic = L.segs.every((s) => s.italic);
    let mk = markerInfo(text), dot = null;
    if (!mk && dots && dots.length) {
      dot = dots.find((d) => d.rect[2] <= L.x0 - 0.5 && d.rect[2] >= L.x0 - 24 && (d.rect[1] + d.rect[3]) / 2 >= L.y - 0.2 * L.size && (d.rect[1] + d.rect[3]) / 2 <= L.y + 0.75 * L.size);
      if (dot) mk = { cls: 'bullet', marker: 'disc', token: '\u2022', rest: text };
    }
    const line = { text, items, x0: L.x0, x1: L.x1, y: L.y, size: L.size, bold, italic, markerItems: L.segs[0].markerItems || null, textX: L.segs[0].textX, markerPaths: dot ? [dot] : null };
    // caption: a short, small line straight under an image
    const prev = out[out.length - 1];
    if (!para && !list && prev && prev.kind === 'image' && !prev.caption && L.size <= bodySize + 0.25 && text.length < 200 &&
      prev.rect[1] - L.y < 2.2 * L.size + 6 && prev.rect[1] - L.y > 0 && L.x0 < prev.rect[2] && L.x1 > prev.rect[0]) {
      prev.caption = { text, items: items.map((i) => i.id), lines: [line] };
      const next = lines[k + 1];
      if (next && next.kind === 'line' && L.y - next.y < 1.5 * L.size && Math.abs(next.size - L.size) < 0.5 && !markerInfo(lineText(next))) {
        prev.caption.text += ' ' + lineText(next); prev.caption.items.push(...next.segs.flatMap((s) => s.items.map((i) => i.id))); k++;
      }
      continue;
    }
    if (mk && para && !list) {        // "• 1234" that only wrapped onto a new line is not a list
      const last = para.lines[para.lines.length - 1], lead = last.y - line.y;
      const right = Math.max(...para.lines.map((l) => l.x1));
      if (lead > 0 && lead < 1.7 * line.size && Math.abs(line.x0 - para.x0) < 0.5 * line.size && !/[.:;!?]$/.test(last.text.trim()) &&
        last.x1 >= right - 2 * line.size && (para.lines.length > 1 || last.x1 - last.x0 > 25 * line.size) && Math.abs(line.size - last.size) < 0.75) { para.lines.push(line); continue; }
    }
    if (mk) {
      if (para) { out.push(finishPara(para, P)); para = null; }
      if (list && list.cls !== mk.cls) { out.push(finishList(list, P)); list = null; }
      if (!list) list = { cls: mk.cls, marker: mk.marker, items: [], x0: line.x0 };
      line.mk = mk;
      list.items.push({ lines: [line], textX: line.textX || line.x0 + 2 * line.size });
      if (Math.abs(line.x0 - list.x0) > line.size * 1.5) list.nested = true;
      continue;
    }
    if (list) {
      const it = list.items[list.items.length - 1], last = it.lines[it.lines.length - 1];
      const lead = last.y - line.y;
      if (lead > 0 && lead < 1.7 * line.size && line.x0 > list.x0 + 0.5 * line.size && Math.abs(line.size - last.size) < 0.8) { it.lines.push(line); continue; }
      out.push(finishList(list, P)); list = null;
    }
    if (para) {
      const last = para.lines[para.lines.length - 1], lead = last.y - line.y;
      const limit = para.lead ? para.lead + 0.35 * line.size : 1.6 * Math.max(line.size, last.size);
      const styleChange = Math.abs(line.size - last.size) > 0.75 || line.bold !== last.bold;
      const indentOk = Math.abs(line.x0 - para.x0) < 1.5 * line.size || (para.lines.length === 1 && line.x0 < para.lines[0].x0);
      if (lead > 0 && lead <= limit && !styleChange && indentOk) {
        if (!para.lead) para.lead = lead;
        para.lines.push(line);
        if (para.lines.length === 2) para.x0 = Math.min(para.x0, line.x0);
        continue;
      }
      out.push(finishPara(para, P)); para = null;
    }
    para = { lines: [line], x0: line.x0, lead: 0 };
  }
  flush();
  return out;
}
function joinLines(lines) {
  let text = '';
  for (const l of lines) {
    const t = l.text.trim();
    if (!text) { text = t; continue; }
    if (/[A-Za-zÀ-ɏ]-$/.test(text) && /^[a-zß-ÿ]/.test(t)) text = text.slice(0, -1) + t;
    else text += ' ' + t;
  }
  return text.replace(/\s+/g, ' ').trim();
}
function finishPara(p, P) {
  const L = p.lines;
  const rect = rectOf(L.map((l) => [l.x0, l.y - l.size * 0.25, l.x1, l.y + l.size * 0.8]));
  const chars = L.reduce((n, l) => n + l.text.length, 0);
  const pageMid = P.w / 2;
  const centred = L.every((l) => Math.abs((l.x0 + l.x1) / 2 - pageMid) < 4) && L.some((l) => l.x0 > 90);
  return { kind: 'paragraph', page: P.index, rect, text: joinLines(L), items: L.flatMap((l) => l.items.map((i) => i.id)),
    size: median(L.map((l) => l.size)), bold: L.every((l) => l.bold), italic: L.every((l) => l.italic), chars, nLines: L.length,
    align: centred ? 'center' : null, lines: L.map((l) => ({ items: l.items.map((i) => i.id), text: l.text, x0: l.x0 })) };
}
function finishList(list, P) {
  const items = list.items.map((it) => {
    const first = it.lines[0];
    const ids = it.lines.flatMap((l) => l.items.map((i) => i.id));
    const lbl = first.markerItems || (first.items.length > 1 && MARKER_ONLY_RE.test(first.items[0].str.trim()) ? [first.items[0].id] : []);
    const text = joinLines([{ text: first.mk.rest }, ...it.lines.slice(1)]);
    return { text, items: ids, lblItems: lbl, lblPaths: first.markerPaths ? first.markerPaths.map((d) => d.mcid) : [], rect: rectOf(it.lines.map((l) => [l.x0, l.y - l.size * 0.25, l.x1, l.y + l.size * 0.8])) };
  });
  let marker = list.marker;
  if (list.cls === 'ordered') {          // i. ii. iii. are Roman numerals; i. j. k. are letters
    const toks = list.items.map((it) => it.lines[0].mk.token);
    if (toks.every((t) => /^[ivxlc]+$/.test(t)) && toks.length > 1 && toks[1] === 'ii') marker = 'lower-roman';
    else if (toks.every((t) => /^[IVXLC]+$/.test(t)) && toks.length > 1 && toks[1] === 'II') marker = 'upper-roman';
    else if (marker === 'lower-roman' && toks.some((t) => t.length === 1)) marker = 'lower-alpha';
    else if (marker === 'upper-roman' && toks.some((t) => t.length === 1)) marker = 'upper-alpha';
  }
  return { kind: 'list', page: P.index, marker, items, nested: !!list.nested, rect: rectOf(items.map((i) => i.rect)),
    size: median(list.items.flatMap((it) => it.lines.map((l) => l.size))), bold: false, italic: false };
}

/* short paragraphs set larger or bolder than body text become headings, ranked by size */
function assignHeadings(R, bodySize) {
  const bodyBold = (() => { let b = 0, n = 0; for (const x of R.blocks) if (x.kind === 'paragraph') { n += x.chars; if (x.bold) b += x.chars; } return n > 0 && b / n > 0.5; })();
  const cands = R.blocks.filter((b) => b.kind === 'paragraph' && !b.rotated && b.nLines <= 3 && b.chars <= 160 && /[A-Za-z0-9À-ɏ]/.test(b.text) &&
    (b.size >= bodySize * 1.12 || (b.bold && !bodyBold && b.size >= bodySize * 0.95 && b.chars <= 100 && !/[.,;:]$/.test(b.text))));
  const key = (b) => Math.round(b.size * 2) / 2 + (b.bold ? 'b' : '');
  const styles = [...new Set(cands.map(key))].map((k) => ({ k, size: parseFloat(k), bold: k.endsWith('b') }))
    .sort((a, b) => b.size - a.size || (b.bold ? 1 : 0) - (a.bold ? 1 : 0));
  styles.forEach((s, i) => { s.level = Math.min(6, i + 1); s.count = cands.filter((b) => key(b) === s.k).length; });
  R.headingStyles = styles;
  let prev = 0;
  for (const b of R.blocks) {
    if (!cands.includes(b)) continue;
    let lvl = styles.find((s) => s.k === key(b)).level;
    if (lvl > prev + 1) lvl = prev + 1;
    b.kind = 'heading'; b.level = lvl; prev = lvl;
  }
}
