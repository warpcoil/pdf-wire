// PDF Wire remediation test.
//
// Runs both remediation methods on every PDF given (default: the PDFs in
// examples/ and examples/remediation/) in headless Chromium, using the app's
// own code from index.html:
//
//   rebuild       analyse -> rebuild as a draft -> describe images -> export -> release-gate audit
//   tag in place  probe -> analyse -> tag model -> describe images -> write -> audit
//
// Every image gets a placeholder description, and a missing language is set
// to en-GB, standing in for the person doing the review. Fails if either
// method throws or its output has an audit error. The tagged files are
// written to build/.cache/remediated/ so they can also be checked with
// build/check-tagged.py, which doesn't share any code with the app:
//
//   cd build && npm install && npx playwright install chromium
//   node remediate-test.mjs [file.pdf ...]
//   python check-tagged.py .cache/remediated/*-tagged.pdf
//
// Set PDFJS_DIR to a folder containing pdf.min.js, pdf.worker.min.js
// (PDF.js 3.11.174) and pdf-lib.min.js (pdf-lib 1.17.1) to run offline.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = join(root, 'index.html');
const outDir = join(here, '.cache', 'remediated');
mkdirSync(outDir, { recursive: true });
const list = (d) => readdirSync(d).filter((f) => f.endsWith('.pdf')).map((f) => join(d, f));
const files = process.argv.length > 2 ? process.argv.slice(2).map((f) => resolve(f)) : [...list(join(root, 'examples')), ...list(join(root, 'examples', 'remediation'))];

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.route(/counter\.warp\.co\.il|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
if (process.env.PDFJS_DIR) {
  await page.route(/cdnjs\.cloudflare\.com\/.*\/(pdf(\.worker)?\.min\.js|pdf-lib\.min\.js)$/, (r) =>
    r.fulfill({ path: join(process.env.PDFJS_DIR, r.request().url().split('/').pop()), contentType: 'application/javascript' }));
}
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => window.__app && window.pdfjsLib, null, { timeout: 30000 });

let failed = 0;
for (const f of files) {
  const b64 = readFileSync(f).toString('base64');
  const r = await page.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const { buildPdf, auditBytes, remediate: M } = window.__app;
    const errs = (C) => C.findings.filter((x) => x.severity === 'error').map((x) => x.title);
    const out = {};
    const pdf = await pdfjsLib.getDocument({ data: u.slice(), isEvalSupported: false }).promise;
    const X = await M.extractPdf(pdf);
    const R = M.analyseLayout(X);
    M.remSource.X = X; M.remSource.renders = new Map();
    out.found = { pages: X.numPages, blocks: R.blocks.length, headings: R.blocks.filter((b) => b.kind === 'heading').length, tables: R.blocks.filter((b) => b.kind === 'table').length,
      images: R.blocks.filter((b) => b.kind === 'image').length, flags: R.flags.map((x) => x.kind) };
    try {
      const d = await M.rebuildFromAnalysis('test.pdf', X, R, null);
      for (const b of d.blocks) if (b.type === 'image') b.alt = 'Placeholder description for the test';
      const o = await buildPdf(d);
      const { C } = await auditBytes(o.bytes.slice());
      out.rebuild = { pages: o.pages, bytes: o.bytes.length, errors: errs(C) };
    } catch (e) { out.rebuild = { errors: ['exception: ' + e.message] }; }
    try {
      const T = await M.prepareTagging('test.pdf', u, X, null);
      for (const b of T.blocks) if (b.role === 'Figure') b.alt = 'Placeholder description for the test';
      if (!T.lang) T.lang = 'en-GB';
      const w = await M.writeTagged(T);
      const { A, C } = await auditBytes(w.bytes.slice());
      let s = ''; for (let i = 0; i < w.bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, w.bytes.subarray(i, i + 0x8000));
      out.tag = { tags: A.ordered.length, bytes: w.bytes.length, ua: w.conform.ua, errors: errs(C), b64: btoa(s) };
    } catch (e) { out.tag = { errors: ['exception: ' + e.message] }; }
    pdf.destroy();
    return out;
  }, b64);
  if (r.tag.b64) writeFileSync(join(outDir, basename(f).replace(/\.pdf$/i, '') + '-tagged.pdf'), Buffer.from(r.tag.b64, 'base64'));
  const ok = !r.rebuild.errors.length && !r.tag.errors.length;
  if (!ok) failed++;
  const fd = r.found;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${basename(f)}`);
  console.log(`      found    ${fd.pages} pages, ${fd.blocks} blocks (${fd.headings} headings, ${fd.tables} tables, ${fd.images} images)${fd.flags.length ? '; flags: ' + fd.flags.join(', ') : ''}`);
  console.log(`      rebuild  ${r.rebuild.errors.length ? r.rebuild.errors.join('; ') : r.rebuild.pages + ' pages, ' + r.rebuild.bytes + ' bytes, 0 audit errors'}`);
  console.log(`      tag      ${r.tag.errors.length ? r.tag.errors.join('; ') : r.tag.tags + ' tags, ' + r.tag.bytes + ' bytes, 0 audit errors' + (r.tag.ua ? ', claims PDF/UA' : ', no PDF/UA claim')}`);
}
await browser.close();
if (pageErrors.length) { console.log('page errors:', pageErrors); failed++; }
console.log(`${files.length - failed}/${files.length} files remediated both ways with no audit errors`);
process.exit(failed ? 1 : 0);
