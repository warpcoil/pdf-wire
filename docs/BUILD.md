# Building PDF Wire

PDF Wire has no bundler, transpiler or package step. `index.html` **is** the source: edit it directly and open it in a browser to test.

A few constants inside `index.html` are generated, because they hold binary data that would be impractical to edit by hand. The scripts in `build/` regenerate them.

| Constant | What it holds | Generated from |
| --- | --- | --- |
| `FONTDATA` | 80 subsetted TrueType fonts (20 families × 4 styles) as base64, plus the metrics the PDF writer uses: `cmap`, `widths`, `ascent`, `descent`, `capHeight`, `bbox`, `italicAngle`, `psName` | Variable fonts from the [Google Fonts repository](https://github.com/google/fonts), configured in `build/fonts.json` |
| `FONTMETA` | Family list for the font picker and the **Font licences** dialog (name, category, description, copyright, source), plus the OFL text | `build/fonts.json`, each family's `OFL.txt` in Google Fonts, and `OFL.txt` in this repository |
| `SAMPLE_PDF_B64` | The PDF opened by **Try the sample PDF** and **Open sample PDF** | `examples/riverside-sample-with-problems.pdf` |

Everything else in `index.html` (HTML, CSS, the editor, PDF writer and audit engine) is hand-written.

## Files

```
build/
├── build.py          Font build, embed and check (Python)
├── fonts.json        Font families, weights and character set
├── requirements.txt  Python dependencies (fontTools)
├── smoke-test.mjs    Optional export test in headless Chromium (Node)
├── package.json      Dependencies for the smoke test (Playwright)
├── .gitignore        Ignores .cache/, out/ and node_modules/
├── .cache/           Downloaded source fonts (not committed)
└── out/              fontdata.json and fontmeta.json (not committed)
```

## Requirements

- **Python 3.9 or later**, with fontTools: `pip install -r build/requirements.txt`
- **Internet access** for the first font build. Source fonts are downloaded from `raw.githubusercontent.com` and cached in `build/.cache/`.
- Optional, for the smoke test: **Node.js 18 or later**.

On Windows, use `py` in place of `python` if `python` isn't on your path.

## Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `python build/build.py fonts` | Downloads, instances and subsets the fonts. Writes `build/out/fontdata.json` and `build/out/fontmeta.json`. Takes about a minute. |
| `python build/build.py embed` | Writes `FONTDATA`, `FONTMETA` and `SAMPLE_PDF_B64` into `index.html`. Nothing else in the file is touched, and its line endings are kept. |
| `python build/build.py check` | Checks the fonts and licence data currently in `index.html`. Exits with status 1 on any error. |
| `python build/build.py all` | `fonts`, then `embed`, then `check`. |

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

Existing drafts may still use it. The editor replaces an unknown font key with the default font, or with a replacement listed in `OLD_FONT_KEYS` (see `famKey()` in `index.html`). Add the removed key to `OLD_FONT_KEYS` if a close substitute exists. Remove the entry from `fonts.json`, run `python build/build.py all`, and update `FONT-LICENSES.md` and `README.md`.

## What `check` verifies

Errors (the command fails):

- every family in `fonts.json` has all four styles in `FONTDATA`, and `FONTMETA` lists the same families in the same order
- every font loads, has TrueType (`glyf`) outlines and is no longer variable
- `widths` has one entry per glyph and `cmap` matches the font's own cmap
- `FONTMETA.ofl` matches `OFL.txt`
- `FONT-LICENSES.md` has a row for every family
- `SAMPLE_PDF_B64` matches `examples/riverside-sample-with-problems.pdf`

Warnings:

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

1. `python build/build.py all` if fonts, `fonts.json` or the sample PDF changed. Otherwise `python build/build.py check`.
2. `npm test` in `build/`.
3. Export a document with the editor and validate it with [veraPDF](https://verapdf.org) (PDF/UA-1 profile) or [PAC](https://pac.pdf-accessibility.org/).
4. Update the test build number in `README.md`.
5. Commit `index.html` with the other changes. `build/.cache/` and `build/out/` are not committed.

## Runtime dependencies

Two resources are not built into `index.html` and load from public CDNs:

- **PDF.js 3.11.174** from `cdnjs.cloudflare.com`
- **IBM Plex** (interface only) from Google Fonts

The build scripts don't change these. To make an offline copy, download both and point the `<script>` and `<link>` tags in `index.html` at local copies, as described in the [README](../README.md#getting-started).
