# Remediating existing PDFs

PDF Wire can take an inaccessible PDF and make it accessible in one of two ways. Both start from the same automatic analysis, and both need a person to review the result. This document explains how each works, how they compare, and what they can't do, so you can choose between them.

> **Complex layouts may cause problems.** Automatic remediation is reliable for simple, single-column documents. Multiple columns, sidebars, text over images, footnotes, forms, and charts drawn as shapes can come out in the wrong order or lose their structure. Always compare the result with the original before relying on it.

## Contents

1. [The two methods at a glance](#1-the-two-methods-at-a-glance)
2. [Which one to use](#2-which-one-to-use)
3. [The analysis](#3-the-analysis)
4. [The review](#4-the-review)
5. [Rebuild: how it works](#5-rebuild-how-it-works)
6. [Tag in place: how it works](#6-tag-in-place-how-it-works)
7. [Limitations](#7-limitations)
8. [Testing](#8-testing)
9. [Next steps](#9-next-steps)

---

## 1. The two methods at a glance

| | Rebuild | Tag in place (experimental) |
| --- | --- | --- |
| What you get | A new PDF made by PDF Wire's writer | The original file, with tags and metadata added |
| How the pages look | PDF Wire's layout and fonts. Text reflows; colours, positions and fonts aren't kept. | Exactly as before. Checked pixel by pixel in the tests. |
| Editing | Everything the editor can do: change text, fix typos, add or remove content, restructure tables freely | Tags only: change what each item is, reading order, alternative text, merge rows and columns. The content itself can't change. |
| Tables | Fully adjustable: insert, delete, merge and shift cells | Header row and column, merge rows or columns. Cells can't be split, because the page can't move. |
| Images | Copied as pictures, each with the alternative text you write | Kept in place, tagged as figures with your alternative text |
| Charts drawn as shapes | Copied as a picture of that area | Tagged as one figure |
| Links | Become plain text (the editor has no links yet) | Kept and tagged, with a description |
| Headers, footers, page numbers | Left out; PDF Wire adds its own page numbers | Kept, marked as artifacts |
| Fonts | PDF Wire's embedded fonts | The original's. If they aren't embedded, the file can't claim PDF/UA. |
| Contrast, small text | Fixed by the editor's checks | Can't be fixed |
| Scanned pages | Become a picture only (no OCR yet) | Become a figure only (no OCR yet) |
| PDF/UA claim | Yes, after the release-gate audit passes | Only when every font is embedded and there are no form fields or scanned pages |
| Release gate | The normal one: no export while any error remains | The written file is re-audited and the result shown; it is still offered for download |
| Saved work | A `.pwj` draft, including the review list | Not saved; finish in one sitting |

## 2. Which one to use

- **Rebuild** when the content matters more than the exact look: reports, letters, guides, minutes, newsletters. It is the only way to a file that passes every check when the original has problems in its content (low contrast, missing fonts, link text such as "click here"). It is the recommended method.
- **Tag in place** when the look must not change: published or signed documents, designed brochures, forms people print. It is also quicker for long, well-made documents whose only problem is missing tags.

If you're not sure, try both. They use the same analysis and nothing is downloaded until you choose to.

## 3. The analysis

`remediate-extract.js` reads each page with PDF.js:

- **text runs** with position, size, and whether the font is bold or italic
- **images**, with their position on the page
- **ruling lines and filled boxes** from the drawing operations
- **links** and other annotations
- **alternative text** from an existing tag tree, offered as a suggestion

`remediate-layout.js` then works out the structure:

1. **Lines and runs.** Text on one baseline becomes a line. A wide gap splits it into runs. Superscripts and subscripts join their line. Text drawn twice to fake bold is counted once.
2. **Artifacts.** Text in the top or bottom margin that repeats on at least half the pages, page numbers, images repeated in the same place, whole-page backgrounds and tiny specks are left out as decoration. Anything the original already marked as an artifact stays one.
3. **Tables with rules.** Groups of horizontal rules with text between them. Columns come from vertical rules or from gaps in the text. A header row above the first rule is included. A list or note under the last rule is left out.
4. **Charts drawn as shapes.** Clusters of shapes holding only short labels, numbers in particular, become one figure.
5. **Reading order.** The page is split at column gutters, a strip that almost nothing covers. A title over two columns doesn't stop a gutter counting. Where there's no gutter, the page is split at its widest horizontal gap and each part is looked at again, which finds sidebars.
6. **Tables without rules.** Three or more lines whose short runs line up in columns.
7. **Paragraphs and lists.** Lines join into paragraphs by spacing, size and indent. Lines starting with a bullet or a number, or with a small round shape just before them, become list items.
8. **Captions.** A short line just under an image.
9. **Headings.** Short paragraphs larger or bolder than the body text. Their styles are ranked by size into H1 to H6, and skipped levels are closed up.

Every text run and image ends up in exactly one block or artifact. Tag in place depends on that.

## 4. The review

Both methods start by **asking you to describe each image**, one at a time, with the text around it for context. You can mark an image as decorative instead. If the original already had alternative text, it is shown as a suggestion, never used without you seeing it.

Then you check what the analysis couldn't be sure of:

| Item | Why |
| --- | --- |
| Each table | Header cells, and every value in the right cell |
| Heading levels | Worked out from size, so a large pull quote can become a heading |
| Title and language | The language is a guess if the original didn't say |
| Layout warnings | Columns, sidebars, rotated text, text over images, many shapes, form fields, possible undetected tables, scanned pages |
| Lists | Nested lists are flattened in Rebuild |
| Links | Rebuild turns them into plain text |

In **Rebuild**, the review is a checklist in the left panel. Unchecked items show as warnings in **Checks before export**, and any image without alternative text is an error that blocks export. **Compare with original** shows the source page with the selected block outlined.

In **Tag in place**, the original page is shown with every tag drawn over it, in reading order. Missing alternative text, a missing title or a missing language block writing; unchecked tables are warnings.

## 5. Rebuild: how it works

`remediate-rebuild.js` turns each block into an editor block:

| Found | Becomes |
| --- | --- |
| Heading | Heading block at the detected level |
| Paragraph | Paragraph block; whole-paragraph bold, italic and centring are kept |
| List | List block with the detected numbering |
| Image or chart | Image block: the area is cut from the page rendered at 2.5× and saved as JPEG, at most 2000 px |
| Caption | The image's caption |
| Table | Table block, first row as headers unless the first column looks like the header |

Each block remembers where it came from (`src`), so **Compare with original** can outline it. The review list is saved in the draft (`remediation`), so you can stop and continue later. See [PWJ-FORMAT.md](PWJ-FORMAT.md#10-remediation-fields).

The editing tools added for remediation work in any document:

- **Type** for headings and paragraphs: Paragraph or Heading 1–6
- **Join with next block**
- **Not a list: turn into paragraphs**
- for tables: **Insert row above/below**, **Delete row**, **Merge row with next**, **Insert column left/right**, **Delete column**, **Merge column with next**, **Shift cells right/left**, and **Not a table: turn into paragraphs**

## 6. Tag in place: how it works

`remediate-tag.js` uses [pdf-lib](https://pdf-lib.js.org) 1.17.1 (MIT) to read and write the file. It is downloaded from cdnjs the first time you tag a file, so normal use of the editor doesn't load it.

1. **Split the content.** Each page's content stream is decoded and split into operations by a small lexer. It understands strings with nested and escaped brackets, hex strings, dictionaries, arrays, comments and inline images. Old structure marking (`BDC`/`BMC`/`EMC`) is removed; optional content (`/OC`) is kept. The pieces that draw something are the units: each text-showing operator (`Tj`, `TJ`, `'`, `"`), each path with its painting operator, each image, form or shading.
2. **Probe.** Every unit is wrapped in its own numbered marked-content sequence and the file is saved in memory. PDF.js reads the probe, so the analysis learns exactly which unit drew each run of text, image and shape. The probe looks identical to the original.
3. **Model.** The analysis runs on the probe and becomes the tag model you review. A unit that drew text for two blocks belongs to the one with more of its characters.
4. **Write.** The content is rewritten from the original bytes. Each unit is wrapped as its element's tag (`/P <</MCID n>> BDC … EMC`) or as an artifact (`/Artifact BMC`, or `/Pagination` with `/Header` or `/Footer`). Neighbouring units of the same element share one sequence, but a sequence is never left open across `q`, `Q`, `BT` or `ET`. Then:
   - a new structure tree: `Document` › `H1`–`H6`, `P`, `L` › `LI` › `Lbl`/`LBody`, `Table` › `TR` › `TH`/`TD` with `/Scope`, `Figure` with `/Alt` and a bounding box
   - `Link` elements around the text under each link annotation, with an `OBJR`, a `/StructParent` on the annotation and `/Contents` if it had none; other annotations, apart from pop-ups and form fields, become `Annot` elements
   - a new parent tree, `/StructParents` and `/Tabs /S` on every page
   - old marked content removed from form XObjects, with their `StructParent(s)`
   - `/MarkInfo`, `/Lang`, the title in the Info dictionary and XMP, `DisplayDocTitle`, and the PDF 1.7 header
   - `pdfuaid:part 1` only if PDF/UA can honestly be claimed (see [section 7](#7-limitations)); an existing PDF/A identifier is kept

The page content is only ever wrapped, never changed. The tests confirm this by rendering every page of the original and the tagged file and comparing them pixel by pixel.

## 7. Limitations

**Both methods**

- **Complex layouts**: see the warning at the top. The review flags pages with columns, sidebars, rotated text, text over images or many shapes.
- **Scanned pages** have no text to work with. OCR is on the roadmap.
- **Form fields** are not made accessible.
- **Right-to-left and vertical text** are not supported.
- **Text extraction depends on the PDF.** Fonts without a Unicode mapping give wrong or empty text, and then both methods get it wrong.
- **Heading levels** are a guess from size and weight.

**Rebuild**

- The original's look is not kept.
- Links become plain text. Nested lists are flattened. Footnotes become ordinary paragraphs where they sit.
- Fonts cover Latin scripts only; other characters are flagged before export.

**Tag in place**

- **Content problems can't be fixed:** contrast, small text, text that is really a picture, link text such as "click here", reflow.
- **PDF/UA is only claimed** when every font is embedded and there are no form fields or scanned pages. Otherwise the file is still tagged, but says nothing about PDF/UA.
- **Cells can't be split.** If one text operator drew two cells, both go into one cell. Merging is possible.
- **Encrypted files** can't be tagged. Remove the protection first, or rebuild.
- **Work isn't saved.** Finish in one sitting.
- **Structure across pages:** a paragraph or table that continues onto the next page is tagged as two.
- Language of individual passages, abbreviations, formulas and notes aren't tagged.

## 8. Testing

Test files are in [`examples/remediation/`](../examples/remediation/README.md). Two automated checks run on them:

- **`build/remediate-test.mjs`** runs both methods on every file in headless Chromium, using the app's own code. The person is stood in for by a placeholder description on every image and English as the language when none is set. Each output goes through the app's audit, and any error fails the test.
- **`build/check-tagged.py`** checks the tagged files independently with pikepdf, sharing no code with the app:
  - every drawing operation is tagged or an artifact
  - every MCID is in the parent tree, and that element lists it
  - no MCID is used twice, and no form XObject still carries one
  - Figures have `/Alt`, and TH cells have a `/Scope`
  - every Link annotation is in a Link element with an `OBJR`
  - with `--original … --render`, every page renders identically

Results for this build:

| File | Rebuild | Tag in place | Pages identical |
| --- | --- | --- | --- |
| untagged-council-report.pdf | 0 errors | 0 errors, no PDF/UA claim (fonts not embedded) | yes |
| two-column-newsletter.pdf | 0 errors | 0 errors, PDF/UA claimed | yes |
| web-page-print.pdf | 0 errors | 0 errors, PDF/UA claimed | yes |
| vector-chart.pdf | 0 errors | 0 errors, PDF/UA claimed | yes |
| content-edge-cases.pdf | 0 errors | 0 errors, no PDF/UA claim (fonts not embedded) | yes |
| riverside-sample-with-problems.pdf | 0 errors | 0 errors, 1 warning (link text), no PDF/UA claim | yes |
| font-sampler.pdf | 0 errors | 0 errors, PDF/UA claimed | yes |

These checks cover the machine-checkable rules. **They are not veraPDF.** Before relying on a conformance claim, run the files through [veraPDF](https://verapdf.org) or [PAC](https://pac.pdf-accessibility.org/) and listen to them with a screen reader.

Quality of the analysis is the part most worth testing with your own documents. On the test files, the common mistakes were:

- a floating sidebar read in the middle of the paragraph that flows round it
- a running header on a one-page document read as a paragraph, because there's no second page to show it repeats

## 9. Next steps

- veraPDF validation on export (already planned)
- OCR for scanned pages
- links in the editor, so Rebuild keeps them
- saving tag-in-place work as a draft
- splitting a text operator between table cells in tag in place
- nested lists
- a footnote and sidebar detector, to move them after the text they belong to
