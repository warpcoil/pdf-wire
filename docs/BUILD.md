# Building PDF Wire

PDF Wire is shipped as a single self-contained file, `index.html`, so it can be opened straight from disk or hosted anywhere. That file is **compiled** from the sources in `src/`. Edit the files in `src/`, never `index.html` itself: the next compile overwrites it.

The compiler is a small Python script with no dependencies. It joins files together and adds the generated data. It doesn't minify, transpile or rename anything, so the code in `index.html` is exactly the code in `src/`.

## Source layout

```
src/
├── index.html              Page template: <head>, include directives, script wrapper
├── css/
│   ├── base.css            Colour tokens (light and dark), reset, focus, utilities, icons
│   ├── app-chrome.css      Top bar, toolbars, workspace grid
│   ├── audit.css           Audit mode: tag tree, page view, inspector, checker,
│   │                       status bar, report dialog
│   ├── modes-home.css      Mode switching, insert toolbar, home screen
│   ├── editor.css          Write view, panels and forms
│   ├── editor-v3.css       Property controls, Pages view, layer list, forced-colours rules
│   ├── remediate.css       Remediation review, image descriptions, tag in place
│   └── workbench.css       Test build 6 design: header, labelled toolbars, selection,
│                           drag and drop, combine dialog, side-by-side tagging
├── html/
│   ├── appbar.html         Header (mode tabs) and the audit, tag-in-place and editor toolbars
│   ├── workspace.html      Panes, status bar, live region, hidden file input
│   └── dialogs.html        Document settings, font licences, export, report, combine
├── js/                     App code, in load order:
│   ├── helpers.js          $, el(), icons, reference data, PDF.js setup, state
│   ├── audit-loading.js    Opening PDFs and drafts
│   ├── audit-analysis.js   Reading the tag tree, marked content and metadata
│   ├── audit-rules.js      The 19 audit rules
│   ├── audit-views.js      Tag tree, inspector, checker and page rendering; selection
│   ├── audit-report.js     HTML accessibility report
│   ├── pdf-writer.js       Layout and tagged PDF/UA-1 writer (buildPdf)
│   ├── author-model.js     Authoring model; loading fonts for on-screen display
│   ├── author-checks.js    Live authoring checks
│   ├── author-write-view.js  Document lifecycle and the Write view
│   ├── author-pages-view.js  Pages view (real page preview)
│   ├── author-panels.js    Side panels, properties panel, document settings
│   ├── drafts-export.js    .pwj drafts, export and release gate, font licences dialog
│   ├── history.js          Undo and redo (snapshots, with images pooled); Ctrl+Z shortcuts
│   ├── combine-dnd.js      Multi-select, the toolbar, Combine, and drag and drop in the Write view
│   ├── remediate-extract.js  Remediation: reading text, images, rules and links from a PDF
│   ├── remediate-layout.js   Remediation: layout analysis (reading order, headings, lists, tables)
│   ├── remediate-rebuild.js  Remediation: rebuild as a draft, review panel, image descriptions,
│   │                         table and block tools
│   ├── remediate-tag.js      Remediation: tag in place (content lexer, probe, writer; uses pdf-lib)
│   ├── remediate-tag-view.js Remediation: the tag-in-place review screen
│   ├── remediate-ui.js       Remediation: choosing a method, entry points
│   └── wiring.js           Event listeners and start-up
└── generated/
    ├── fontdata.json       Subsetted fonts and metrics (written by `fonts`)
    └── fontmeta.json       Font picker and licence data (written by `fonts`)
```

The WordPress theme and pages for the website are in `wordpress/`, outside `src/`. They have their own build script, `wordpress/build-theme.py`, which copies the compiled `index.html` into the theme. See [wordpress/README.md](../wordpress/README.md).

The sample PDFs are taken from `examples/riverside-sample-with-problems.pdf` (**Open sample PDF**) and `examples/remediation/untagged-council-report.pdf` (**Try an untagged sample**).

### How the template works

`src/index.html` is ordinary HTML with directives, each on a line of its own:

| Directive | Replaced by |
| --- | --- |
| `<!-- @include css/base.css -->` | The file's contents, verbatim. Paths are relative to `src/`. |
| `<!-- @generated data -->` | Four constants: `SAMPLE_PDF_B64`, `REMEDIATE_SAMPLE_B64`, `FONTDATA` and `FONTMETA`. |

To add a file, create it and add an `@include` line in the right place. `compile` and `check` warn about any `.css`, `.js` or `.html` file in `src/` that isn't included.

### JavaScript files share one scope

The JS files are **not** modules. The template wraps them all in one function:

```js
(function () {
'use strict';
// helpers.js, audit-loading.js, ... wiring.js, in template order
})();
```

So:

- A top-level `const`, `let` or `function` in one file is visible in every other file. There are no imports or exports.
- **Order matters** for code that runs at load time. Function declarations are hoisted, but a `const` must be defined in an earlier file (or earlier in the same file) than any code that *runs* immediately and uses it. Code inside functions can use anything.
- Two files can't declare the same top-level name. The browser reports a `SyntaxError` and the app doesn't start.
- `FONTDATA`, `FONTMETA`, `SAMPLE_PDF_B64` and `REMEDIATE_SAMPLE_B64` come from a separate `<script>` before the app, so they're globals.
- Editors may flag names from other files as undefined. That's expected.

`window.__app` (set in `wiring.js`) exposes `buildPdf`, `auditBytes`, the app state and the remediation functions (`remediate`) for the tests and for debugging in the browser console.

## Build files

```
build/
├── build.py          Compiler, font build and checks (Python)
├── fonts.json        Font families, weights and character set
├── requirements.txt  Python dependencies (fontTools, for fonts and check only)
├── smoke-test.mjs    Optional export test in headless Chromium (Node)
├── remediate-test.mjs     Optional test of both remediation methods (Node)
├── check-tagged.py        Independent structure check for tagged PDFs (pikepdf)
├── remediation-fixtures.py  Makes the ReportLab test PDFs in examples/remediation/
├── package.json      Dependencies for the smoke test (Playwright)
├── .gitignore        Ignores .cache/ and node_modules/
└── .cache/           Downloaded source fonts (not committed)
```

## Day-to-day workflow

1. Run `python build/build.py compile --watch`. It recompiles `index.html` every time you save a file in `src/`.
2. Open `index.html` in a browser and reload after each change.
3. Before committing, run `python build/build.py check`.
4. Commit the `src/` changes **and** the compiled `index.html` together. `check` fails if `index.html` doesn't match `src/`.

## Requirements

- **Python 3.9 or later.** `compile` needs nothing else.
- **fontTools** for `fonts` and `check`: `pip install -r build/requirements.txt`
- **Internet access** for `fonts` only. Source fonts are downloaded from `raw.githubusercontent.com` and cached in `build/.cache/`.
- Optional, for the smoke test: **Node.js 18 or later**.

On Windows, use `py` in place of `python` if `python` isn't on your path.

## Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `python build/build.py compile` | Builds `index.html` from `src/`. Add `--watch` to rebuild on every save, or `--out <file>` to write somewhere else. Output always uses LF line endings, whatever the sources use. |
| `python build/build.py check` | Checks `index.html`: that it matches `src/`, and that the fonts and licence data are valid. Exits with status 1 on any error. |
| `python build/build.py fonts` | Downloads, instances and subsets the fonts. Writes `src/generated/fontdata.json` and `src/generated/fontmeta.json`. Takes about a minute. Doesn't touch `index.html`; run `compile` afterwards. |
| `python build/build.py all` | `fonts`, then `compile`, then `check`. |

The generated font files are committed, so a fresh clone can be compiled straight away, without fontTools or a network connection. Font builds are reproducible: running `fonts` again with the same `fonts.json` and google/fonts revision gives byte-identical files, so git only shows a change when a font really changed.

Options for `fonts` and `all`:

| Option | Effect |
| --- | --- |
| `--only inter literata` | Rebuild only these families (by `key`) and merge them into the previous output. |
| `--ref <branch, tag or commit>` | Use a specific revision of google/fonts. Overrides `googleFontsRef` in `fonts.json`. |
| `--refresh` | Download the source fonts again, ignoring the cache. |
| `--jobs N` | Number of fonts built in parallel. Defaults to the number of CPUs. |

## What the font build does

For each family in `build/fonts.json`:

1. **Download.** Reads `ofl/<gf>/METADATA.pb` from google/fonts to find the upright and italic font files, then downloads them and the family's `OFL.txt`.
2. **Licence check.** Stops the build if `OFL.txt` declares a **Reserved Font Name**. The editor distributes subsetted copies, which the OFL treats as modified versions, and a modified version can't use a reserved name. See [Fonts and licensing](../README.md#fonts-and-licensing).
3. **Instance.** Turns the variable font into static instances: weight 400 for Regular and Italic, 700 for Bold and Bold Italic. Every other axis (`opsz`, `wdth`, `YTLC` and so on) is pinned at its default.
4. **Subset.** Keeps only the characters listed in `unicodes` (Latin‑1, Latin Extended‑A and common punctuation). Layout tables (GSUB, GPOS, kern), hinting and STAT are dropped, because the PDF writer doesn't use them. The `.notdef` outline is kept.
5. **Rename.** Rewrites name IDs 1, 2, 3, 4 and 6 and the bold/italic style bits to match the instance, for example `Inter Bold` / `Inter-Bold`. Copyright, trademark, designer, vendor and licence records are kept as published.
6. **Measure.** Records the glyph widths and font metrics, scaled to 1000 units per em, and the Unicode-to-glyph map.

The copyright line and source URL shown in the **Font licences** dialog are taken from the first line of each family's `OFL.txt`. To override them, add `"copyright"` or `"source"` to the family in `fonts.json`.

## `build/fonts.json`

```json
{
  "googleFontsRef": "main",
  "weights": { "R": 400, "B": 700 },
  "unicodes": ["U+0020-007E", "U+00A0-017F", "U+2013", "..."],
  "families": [
    {
      "key": "inter",
      "name": "Inter",
      "cat": "sans",
      "blurb": "Clear screen-and-print workhorse",
      "gf": "inter"
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `googleFontsRef` | google/fonts revision to download from. Set it to a commit hash to make builds reproducible. |
| `weights` | `wght` values used for the regular (`R`) and bold (`B`) instances. |
| `unicodes` | Code points to keep, as single values or ranges. Characters a font lacks are left out and reported by `check`. The editor flags them before export. |
| `key` | Internal ID. It is stored in `.pwj` drafts, so **never rename the key of an existing family**. |
| `name` | Family name shown in the editor and written into the font. |
| `cat` | `sans`, `serif` or `mono`. Controls grouping in the font picker. |
| `blurb` | One-line description in the font picker. |
| `gf` | Folder name under `ofl/` in google/fonts. |
| `ps` | Optional PostScript name prefix. Defaults to `name` without spaces. |

### Adding a family

1. Confirm the family is under the OFL in google/fonts and that its `OFL.txt` has no Reserved Font Name. The build checks this too.
2. Confirm it has a variable `wght` axis covering 400 and 700, or static Regular, Bold, Italic and Bold Italic files.
3. Add an entry to `families` in `fonts.json`.
4. Run `python build/build.py all --only <key>`.
5. Add a row to `FONT-LICENSES.md` and the family table in `README.md`. `check` reports a missing row in `FONT-LICENSES.md`.

### Removing a family

Existing drafts may still use it. The editor replaces an unknown font key with the default font, or with a replacement listed in `OLD_FONT_KEYS` (see `famKey()`). `OLD_FONT_KEYS` is at the top of `src/js/pdf-writer.js`; add the removed key there if a close substitute exists. Remove the entry from `fonts.json`, run `python build/build.py all`, and update `FONT-LICENSES.md` and `README.md`.

## What `check` verifies

Errors (the command fails):

- `index.html` is exactly what `compile` would produce from `src/` now
- every family in `fonts.json` has all four styles in `FONTDATA`, and `FONTMETA` lists the same families in the same order
- every font loads, has TrueType (`glyf`) outlines and is no longer variable
- `widths` has one entry per glyph and `cmap` matches the font's own cmap
- `FONTMETA.ofl` matches `OFL.txt`
- `FONT-LICENSES.md` has a row for every family
- `SAMPLE_PDF_B64` matches `examples/riverside-sample-with-problems.pdf`, and `REMEDIATE_SAMPLE_B64` matches `examples/remediation/untagged-council-report.pdf`

Warnings:

- a `.css`, `.js` or `.html` file in `src/` isn't included by the template
- a font's PostScript name (name ID 6) differs from `psName`
- a copyright line in `FONT-LICENSES.md` differs from `FONTMETA`

Notes list the requested characters each family lacks, so a font update that loses glyphs is noticed.

## Smoke test

`build/smoke-test.mjs` opens `index.html` in headless Chromium and exports `examples/riverside-visitor-guide.pwj` once in every font family, with bold and italic blocks so all 80 fonts are used. Each PDF goes through the same release-gate audit as a real export. The test fails if any export throws or the audit finds an error.

```
cd build
npm install
npx playwright install chromium
npm test
```

PDF.js loads from cdnjs, as it does for users. To run offline, set `PDFJS_DIR` to a folder containing `pdf.min.js` and `pdf.worker.min.js` from PDF.js 3.11.174. The test blocks the analytics counter, so runs aren't counted as visits.

## Remediation tests

`build/remediate-test.mjs` runs both remediation methods, rebuild and tag in place, on every PDF in `examples/` and `examples/remediation/` (or the files you name), in headless Chromium with the app's own code. A placeholder description is given to every image, and English to any file without a language, standing in for the review. Each result goes through the app's audit; any error fails the test. The tagged files are written to `build/.cache/remediated/`.

`build/check-tagged.py` then checks those files without using any PDF Wire code: every drawing operation is tagged or an artifact, the parent tree matches the structure tree, figures have alternative text, header cells have a scope, links are tagged with an `OBJR`, and no form XObject keeps old MCIDs. With `--original` and `--render`, it also renders both files with `pdftoppm` and confirms every page is pixel-for-pixel identical.

```
cd build
node remediate-test.mjs                        # or: node remediate-test.mjs some.pdf other.pdf
pip install pikepdf pillow                     # and poppler-utils for --render
python check-tagged.py .cache/remediated/*-tagged.pdf
python check-tagged.py .cache/remediated/two-column-newsletter-tagged.pdf --original ../examples/remediation/two-column-newsletter.pdf --render
```

Tag in place also needs pdf-lib, which loads from cdnjs like PDF.js. For an offline run, put `pdf-lib.min.js` from pdf-lib 1.17.1 in the `PDFJS_DIR` folder too.

To change the ReportLab test files, edit and run `python build/remediation-fixtures.py` (needs `reportlab` and `pillow`). How the other test files were made is described in `examples/remediation/README.md`. [REMEDIATION.md](REMEDIATION.md#8-testing) lists the current results.

## Before a release

1. `python build/build.py all` if `fonts.json` changed. Otherwise `python build/build.py compile`, then `check`.
2. `npm test` and `node remediate-test.mjs` in `build/`, then `python check-tagged.py .cache/remediated/*-tagged.pdf`.
3. Export a document with the editor and validate it with [veraPDF](https://verapdf.org) (PDF/UA-1 profile) or [PAC](https://pac.pdf-accessibility.org/).
4. Update the test build number in the `<title>` in `src/index.html`, the brand in `src/html/appbar.html`, the producer in `src/js/pdf-writer.js`, the report footer in `src/js/audit-report.js`, and `README.md`.
5. If the website should offer the new build, run `python wordpress/build-theme.py` and upload `wordpress/dist/pdf-wire-theme.zip`.
6. Commit `src/`, `index.html` and any other changes together. `build/.cache/`, `wordpress/dist/` and `wordpress/theme/pdf-wire/editor/` are not committed.

## Runtime dependencies

Three resources are not built into `index.html` and load from public CDNs:

- **PDF.js 3.11.174** from `cdnjs.cloudflare.com`
- **pdf-lib 1.17.1** from `cdnjs.cloudflare.com`, only when a PDF is tagged in place (see `PDFLIB_URL` in `src/js/remediate-tag.js`)
- **Inter** and **JetBrains Mono** (interface only) from Google Fonts

The build scripts don't change these. To make an offline copy, download them and point the `<script>` and `<link>` tags in `src/index.html`, and `PDFLIB_URL`, at local copies, then compile, as described in the [README](../README.md#getting-started).
