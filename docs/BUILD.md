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
│   └── editor-v3.css       Property controls, Pages view, layer list, forced-colours rules
├── html/
│   ├── appbar.html         Top bar and both toolbars
│   ├── workspace.html      Panes, status bar, live region, hidden file input
│   └── dialogs.html        Document settings, font licences, export, report
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
│   └── wiring.js           Event listeners and start-up
└── generated/
    ├── fontdata.json       Subsetted fonts and metrics (written by `fonts`)
    └── fontmeta.json       Font picker and licence data (written by `fonts`)
```

The sample PDF is taken from `examples/riverside-sample-with-problems.pdf`.

### How the template works

`src/index.html` is ordinary HTML with directives, each on a line of its own:

| Directive | Replaced by |
| --- | --- |
| `<!-- @include css/base.css -->` | The file's contents, verbatim. Paths are relative to `src/`. |
| `<!-- @generated data -->` | Three constants: `SAMPLE_PDF_B64`, `FONTDATA` and `FONTMETA`. |

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
- `FONTDATA`, `FONTMETA` and `SAMPLE_PDF_B64` come from a separate `<script>` before the app, so they're globals.
- Editors may flag names from other files as undefined. That's expected.

`window.__app` (set in `wiring.js`) exposes `buildPdf`, `auditBytes` and the app state for the smoke test and for debugging in the browser console.

## Build files

```
build/
├── build.py          Compiler, font build and checks (Python)
├── fonts.json        Font families, weights and character set
├── requirements.txt  Python dependencies (fontTools, for fonts and check only)
├── smoke-test.mjs    Optional export test in headless Chromium (Node)
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
- `SAMPLE_PDF_B64` matches `examples/riverside-sample-with-problems.pdf`

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

## Before a release

1. `python build/build.py all` if `fonts.json` changed. Otherwise `python build/build.py compile`, then `check`.
2. `npm test` in `build/`.
3. Export a document with the editor and validate it with [veraPDF](https://verapdf.org) (PDF/UA-1 profile) or [PAC](https://pac.pdf-accessibility.org/).
4. Update the test build number in the `<title>` in `src/index.html` and in `README.md`.
5. Commit `src/`, `index.html` and any other changes together. `build/.cache/` is not committed.

## Runtime dependencies

Two resources are not built into `index.html` and load from public CDNs:

- **PDF.js 3.11.174** from `cdnjs.cloudflare.com`
- **IBM Plex** (interface only) from Google Fonts

The build scripts don't change these. To make an offline copy, download both and point the `<script>` and `<link>` tags in `src/index.html` at local copies, then compile, as described in the [README](../README.md#getting-started).
