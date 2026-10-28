# Remediation test files

Untagged or badly tagged PDFs for trying and testing **Remediate an existing PDF**. None of them contains real information.

| File | Made with | What it exercises |
| --- | --- | --- |
| `untagged-council-report.pdf` | ReportLab, `build/remediation-fixtures.py` | Two pages, no tags, fonts not embedded. Three heading levels, bullet and numbered lists, an image with a caption, a ruled table with a shaded header, a repeated header with a logo, page numbers and a link. Also built into the app as **Try an untagged sample**. |
| `two-column-newsletter.pdf` | ReportLab, `build/remediation-fixtures.py` | Two columns under a full-width title, an embedded TrueType font, a table with no ruling lines, and an image with a caption. |
| `web-page-print.pdf` | Chromium “Save as PDF” (untagged) | Real-world output: text drawn a few words at a time, a floating sidebar, part of the page in CSS columns, list bullets drawn as shapes, a superscript footnote mark, a table whose only rules are under each row, and a link. |
| `vector-chart.pdf` | Matplotlib | A bar chart drawn entirely with lines and shapes, which should become one figure. |
| `content-edge-cases.pdf` | pikepdf | Content-stream edge cases for tag in place: an inline image whose data contains `EI`, a form XObject carrying old marked content, optional content (`/OC`), `TJ` with an escaped bracket, and the `'` and `T*` operators. |

`examples/riverside-sample-with-problems.pdf` (tagged, with problems) and `examples/font-sampler.pdf` (tagged by PDF Wire) are useful too: tag in place replaces their existing tags.

Run both methods on all of them with `node build/remediate-test.mjs`; see [docs/BUILD.md](../../docs/BUILD.md#remediation-tests).
