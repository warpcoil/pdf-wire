# PDF Wire

A web application for creating PDFs that conform to **WCAG 2.2 AA** and **PDF/UA-1**, for checking existing PDFs against the same rules, and for remediating existing PDFs.

> [!WARNING]
> Caution Advised: Built with AI using newer vibe coding technologies.

Most PDF tools treat accessibility as a clean-up step after the document is finished. This editor works the other way round: the document's structure (headings, lists, tables, images with alternative text) is built as you write. Every export is re-checked, and a PDF is only released when it passes.

> **Status:** test build 6. The app is usable for creating simple accessible documents, for auditing existing PDFs, and for remediating simple existing PDFs (tagging in place is experimental). See [Roadmap](#roadmap).

The project website, [pdfwire.com](https://pdfwire.com), is a WordPress site. Its theme and pages are in [`wordpress/`](wordpress/README.md).

## Features

### New in test build 6

- **New design, with a toolbar along the top.** The header has tabs for the four modes (Write, Pages, Check, Remediate) and a labelled toolbar for each: History, Insert, Text and Arrange in the editor; History, Tag as, Arrange, Images, View and Layout when tagging in place.
- **Light and dark** follow your computer's setting. Pages are always drawn as white paper.
- **Combine blocks and tags**, including ones that aren't next to each other. Select them with Ctrl-click (or Shift-click for a range), then **Combine**. Blocks that aren't text, such as an image between two heading lines, stay where they are, after the combined block.
- **Drag and drop:**
  - drag a block or tag by its grip to move it
  - drop it onto the middle of another block to combine them
  - drag a button from the Insert toolbar into the page
  - drop image files into the page
- **Undo and redo** (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y) in the editor and when tagging in place.
- **Original and tagged side by side** when tagging in place, with zoom.
- **Downloads work wherever the app is hosted.** Exports, drafts and reports fall back to an ordinary download link.

Every drag-and-drop action also has a button, so nothing needs a mouse.

### Create accessible PDFs

- Write with **headings (H1–H6), paragraphs, lists, images, tables and page breaks**.
- **Text properties:** font, size, bold, italic, colour, alignment and line spacing.
- **Images:** informative images need alternative text; decorative images are saved as artifacts, so screen readers skip them.
- **Tables:** header rows and columns are tagged with the correct scope. An optional caption, shading and striping are available, and the header row can repeat on each page.
- **Lists:** bullet, dash, numbers, letters or Roman numerals. The numbering style is stored in the PDF, so screen readers announce it.
- **20 embedded font families** under the SIL Open Font License, including Atkinson Hyperlegible Next, which was designed for readers with low vision.
- **Live checks** for skipped heading levels, missing alternative text, tables without headers, text contrast, characters a font can't display, and more. Errors block export.
- **Release gate:** every exported file is parsed again and audited before it can be downloaded.
- **Drafts** autosave in the browser and can be saved as `.pwj` files.

### Remediate existing PDFs

- **Two methods, from one analysis.** Choose either:
  - **Rebuild:** the content moves into the editor and is exported as a new PDF that passes every check.
  - **Tag in place** (experimental): the original pages stay exactly as they are, and tags, reading order, alternative text, a title and a language are added.
- **Automatic analysis:**
  - reading order across columns and sidebars
  - headings ranked by size and weight
  - paragraphs, and bullet and numbered lists
  - tables, from their rules or from aligned text
  - images, with their captions, and charts drawn as shapes
  - repeated headers, footers and page numbers, which are left out
- **You're prompted to describe every image**, with the nearby text for context and the original's alternative text as a suggestion.
- **Tables can be adjusted:** insert, delete, merge and shift rows, columns and cells, choose header cells, or turn a table back into paragraphs.
- **A review checklist** covers tables, heading levels, title and language, and layout warnings. **Compare with original** outlines where each block came from.

> **Complex layouts may cause problems.** Multiple columns, sidebars, text over images, footnotes, forms, and charts drawn as shapes can come out in the wrong order or lose their structure. Always compare the result with the original.

See [docs/REMEDIATION.md](docs/REMEDIATION.md) for how the two methods compare.

### Check existing PDFs

- Shows the tag tree, reading order and untagged content, drawn over the rendered page.
- Runs 19 automated rules mapped to WCAG success criteria and Matterhorn Protocol checkpoints.
- Lists the checks that need a person, and exports an HTML accessibility report.

### What every exported PDF contains

| Item | Purpose |
| --- | --- |
| Tagged structure tree in reading order | Screen readers can navigate headings, lists and tables |
| `/Alt` text on every informative figure | Images are described (WCAG 1.1.1) |
| `TH` cells with `/Scope` | Data cells are read with their headers (WCAG 1.3.1) |
| `ListNumbering` on lists | List type is announced |
| Embedded fonts with `ToUnicode` maps | Text can be read aloud and extracted |
| Page numbers, rules and shading as artifacts | Decoration is skipped |
| XMP `dc:title`, `/Lang`, `DisplayDocTitle` | Title and language are announced (WCAG 2.4.2, 3.1.1) |
| `pdfuaid:part = 1` | PDF/UA-1 identifier |
| Bookmarks generated from headings | Fast navigation in long documents |
| `/Tabs /S` on every page | Tab order follows the structure |

## Getting started

The app is a single self-contained file, `index.html`. Open it in a current version of Chrome, Edge, Firefox or Safari. Nothing is uploaded: PDFs are read and written entirely in the browser.

Three resources load from public CDNs at runtime:

- **PDF.js 3.11.174** from `cdnjs.cloudflare.com`, which renders and parses PDFs.
- **pdf-lib 1.17.1** from `cdnjs.cloudflare.com`, which reads and writes files tagged in place. It loads only the first time you tag a PDF in place.
- **Inter** and **JetBrains Mono** from Google Fonts, used only for the app's own interface. They are never embedded in exported PDFs.

To work offline, download them and change the `<script>` and `<link>` URLs and `PDFLIB_URL` in `index.html` to point at local copies.

The hosted copy also counts page views with [GoatCounter](https://www.goatcounter.com/), which sets no cookies and never sees your documents. Remove its `<script>` tag from `src/index.html` if you host the app yourself.

For how to use the app, see the [user guide](docs/USER-GUIDE.md).

`index.html` is compiled from the sources in `src/`. To change the app, edit `src/` and run `python build/build.py compile`; see [docs/BUILD.md](docs/BUILD.md).

## Draft files (`.pwj`)

Drafts are UTF-8 JSON files with the `.pwj` extension. The format is documented in [docs/PWJ-FORMAT.md](docs/PWJ-FORMAT.md).

> **Hosting note:** some hosting platforms only allow downloads of a fixed list of file types. If a `.pwj` download is refused, the app offers to save the draft as `.json` instead. The editor opens both.

## How it works

```
Browser
├── UI (vanilla JS)        Write view, Pages view, audit view, dialogs
├── Authoring model        Blocks + document settings, autosaved to localStorage
├── PDF writer             Lays out blocks, writes a tagged PDF/UA-1 file
│                          (structure tree, MCIDs, ParentTree, Type0 fonts, XMP)
├── Audit engine (PDF.js)  Reads the tag tree, marked content and metadata,
│                          runs the rules, draws overlays
└── Remediation            Reads an existing PDF's text, images and rules (PDF.js),
                           works out the layout, then either rebuilds it as a draft
                           or rewrites its content streams with tags (pdf-lib)
```

1. **Authoring.** The document is a list of blocks. Reading order is always the block order.
2. **Layout and writing.** On export, the writer:
   - flows the blocks onto A4 or US Letter pages
   - wraps text using each font's real glyph widths
   - writes every piece of content inside marked content linked to a structure element
   - marks everything decorative as an artifact
3. **Fonts.** Each font is a subset covering Latin‑1, Latin Extended‑A and common punctuation. It is embedded as a `CIDFontType2` with `Identity-H` encoding and a `ToUnicode` map.
4. **Verification.** The generated bytes go back through the audit engine. If any error is found, the export is stopped and reported as an editor bug rather than a problem with the user's document.

### Validation

The in-app checks cover the machine-checkable rules listed in the user guide. They are **not** a replacement for [veraPDF](https://verapdf.org) or [PAC](https://pac.pdf-accessibility.org/). Run exported files through one of those before relying on a conformance claim.

The planned architecture adds a veraPDF validation service to the export step.

## Fonts and licensing

Every font bundled for embedding is licensed under the **SIL Open Font License 1.1** and declares **no Reserved Font Name**. This matters because the editor distributes subsetted copies, which the licence treats as modified versions; a modified version may not use a reserved name. For that reason, families such as IBM Plex, Lexend, Lato, Merriweather, Lora and Source Sans are deliberately not bundled.

The 20 bundled families:

| Sans serif | Serif | Monospaced |
| --- | --- | --- |
| Atkinson Hyperlegible Next, Inter, Open Sans, Noto Sans, Roboto, Public Sans, Work Sans, Figtree, Red Hat Text, Libre Franklin, Nunito Sans | Literata, Source Serif 4, Noto Serif, EB Garamond, Newsreader, Alegreya | JetBrains Mono, Roboto Mono, Red Hat Mono |

Copyright notices and the full licence text are shown in the app under **Font licences**. They are also kept in each font file's name table.

## Limitations

- **Existing PDFs** can be checked and remediated, but not edited directly. Remediation has its own limits: see [docs/REMEDIATION.md](docs/REMEDIATION.md#7-limitations).
- **Formatting** such as bold, italic and font applies to a whole block, not to individual words.
- **No links,** footnotes, form fields or multi-level lists yet.
- **Fonts** cover Latin scripts only. Characters a font can't display are flagged before export.
- **Images** are converted to JPEG, so transparent areas become white.
- **Password-protected PDFs** can't be opened.
- **Some checks** can't be done when auditing existing PDFs: table header scope, font embedding, tab order and contrast.

## Roadmap

| Phase | Scope |
| --- | --- |
| 1 | Audit existing PDFs (done) |
| 2 | Create accessible PDFs (current), with veraPDF validation on export |
| 3 | Remediation of existing PDFs: rebuild, and tagging in place by content-stream rewriting and layout detection (first version in this build) |
| 4 | OCR for scanned pages, form fields, text edits and PDF/UA-2 output |

The planned production engine is **MuPDF.js** (AGPL), behind an engine interface, in place of PDF.js.

## Contributing

Issues and pull requests are welcome. When reporting a problem with an exported PDF:

- attach the `.pwj` draft (remove anything confidential first)
- include the veraPDF or PAC report if you have one

Accessibility of the editor itself matters as much as accessibility of its output. It should work with a keyboard alone, with screen readers (NVDA, JAWS, VoiceOver) and at 400% zoom. Please report anywhere it falls short.

## Licence

The editor is released under the **GNU Affero General Public License v3.0** (AGPL‑3.0). Bundled fonts remain under the SIL Open Font License 1.1, PDF.js is under the Apache License 2.0, and pdf-lib is under the MIT License.
