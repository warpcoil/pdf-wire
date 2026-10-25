// PDF Wire export smoke test.
//
// Opens index.html in headless Chromium, builds the sample draft once in every
// bundled font family (with bold and italic blocks, so all four styles are
// used) and runs each PDF through the app's own release-gate audit.
// Fails if any export throws or the audit reports an error.
//
//   cd build && npm install && npx playwright install chromium
//   npm test                         (or: node smoke-test.mjs [index.html] [draft.pwj])
//
// PDF.js loads from cdnjs as in normal use, so this needs a network connection.
// Set PDFJS_DIR to a folder containing pdf.min.js and pdf.worker.min.js
// (version 3.11.174) to run offline.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const html = resolve(process.argv[2] || join(here, '..', 'index.html'));
const draftPath = resolve(process.argv[3] || join(here, '..', 'examples', 'riverside-visitor-guide.pwj'));
const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
draft.blocks.forEach((b, i) => {
  b.style = b.style || {};
  if (i % 3 === 1) b.style.bold = true;
  if (i % 3 === 2) b.style.italic = true;
});

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Don't count test runs in site analytics, and don't wait on UI web fonts.
await page.route(/counter\.warp\.co\.il|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
if (process.env.PDFJS_DIR) {
  await page.route(/cdnjs\.cloudflare\.com\/.*\/(pdf(\.worker)?\.min\.js)$/, (r) =>
    r.fulfill({ path: join(process.env.PDFJS_DIR, r.request().url().split('/').pop()), contentType: 'application/javascript' }));
}

await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => window.__app && window.pdfjsLib, null, { timeout: 30000 });

const results = await page.evaluate(async (draft) => {
  const { buildPdf, auditBytes } = window.__app;
  const out = [];
  for (const { key } of FONTMETA.families) {
    const d = JSON.parse(JSON.stringify(draft));
    d.font = key;
    try {
      const o = await buildPdf(d);
      const { C } = await auditBytes(o.bytes.slice());
      out.push({ key, bytes: o.bytes.length, errors: C.findings.filter((f) => f.severity === 'error').map((f) => f.title) });
    } catch (e) {
      out.push({ key, bytes: 0, errors: ['exception: ' + e.message] });
    }
  }
  return out;
}, draft);
await browser.close();

let failed = 0;
for (const r of results) {
  const ok = r.errors.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${r.key.padEnd(15)} ${String(r.bytes).padStart(7)} bytes  ${r.errors.join('; ')}`);
}
if (pageErrors.length) { console.log('page errors:', pageErrors); failed++; }
console.log(`${results.length - failed}/${results.length} font families exported and passed the audit`);
process.exit(failed ? 1 : 0);
