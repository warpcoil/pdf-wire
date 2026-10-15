# User guide

This guide explains how to use the Accessible PDF Editor (test build 5) to create accessible PDFs and to check existing ones.

## Contents

1. [The home screen](#1-the-home-screen)
2. [Creating a document](#2-creating-a-document)
3. [The editing screen](#3-the-editing-screen)
4. [Adding and editing content](#4-adding-and-editing-content)
5. [Properties panel](#5-properties-panel)
6. [Checks before export](#6-checks-before-export)
7. [Pages view](#7-pages-view)
8. [Saving and opening drafts](#8-saving-and-opening-drafts)
9. [Exporting a PDF](#9-exporting-a-pdf)
10. [Checking an existing PDF](#10-checking-an-existing-pdf)
11. [Keyboard reference](#11-keyboard-reference)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. The home screen

The home screen offers two paths:

- **Create a new PDF** opens the new-document dialog.
- **Check an existing PDF** lets you open a PDF from your computer, or try the built-in sample PDF.

If a draft is kept in this browser, a **Continue your draft** card appears as well.

You can also drop a PDF or a `.pwj` draft anywhere on the main area. Files are read in your browser and are never uploaded.

The **New** and **Open** buttons in the top bar are available on every screen.

## 2. Creating a document

Choose **New** or **New document** to open the **Create a new PDF** dialog.

| Field | Required | Notes |
| --- | --- | --- |
| Document title | Yes | Shown in the PDF viewer's title bar and announced first by screen readers. Describe the content, not the file name. |
| Language | Yes | The main language of the document, for example English (Ireland) `en-IE` or Irish `ga`. Screen readers use it to choose a voice. |
| Author | No | Stored in the PDF's metadata. |
| Default font | No | Used by every block unless you choose another font for that block. Atkinson Hyperlegible Next is the default. |
| Page size | Yes | A4 or US Letter. |
| Start from | Yes | **Blank document** starts with the title as an H1 heading. **Report outline** adds an introduction and three H2 sections. |

Select **Create document**. The cursor is placed in the first paragraph, ready to type.

To change these settings later, select **Edit document settings** in the **Checks before export** panel.

> Creating a new document replaces the draft kept in this browser. Use **Save draft** first if you want to keep it.

## 3. The editing screen

The screen has five areas.

- **Top bar:** document title, draft status, and the **New**, **Open**, **Save draft** and **Check & export PDF** buttons.
- **Toolbar:**
  - the **Write / Pages** view switch
  - the **Insert** buttons: **Heading** (with a level picker), **Paragraph**, **List**, **Image**, **Table** and **Page break**
- **Outline (left):** your headings in order. Select one to jump to it. The outline also becomes the PDF's bookmarks.
- **Document (centre):** your content as a list of blocks. A coloured tag to the left of each block shows what it will be in the PDF, for example H1, P, L, Figure or Table.
- **Right panel:** properties of the selected block, then the **Checks before export** list and a summary of the document settings.

The status bar has a **Font licences** link.

> **Reading order is block order.** Screen readers read the PDF in the same order as the blocks in the document. To change the order, use **Move up** and **Move down** in the properties panel.

## 4. Adding and editing content

New blocks are inserted **after the selected block**, and the cursor moves into the new block.

### Headings

1. Choose the level in the picker next to **Heading** (H2 is the default).
2. Select **Heading** and type.

Use one H1 for the document title, H2 for sections, and H3 for sub-sections inside an H2. Don't skip levels: the checker flags a jump from H2 to H4.

### Paragraphs

Select **Paragraph** and type.

- **Enter** starts a new paragraph. If the cursor is in the middle of the text, the text after it moves into the new paragraph.
- **Backspace** in an empty paragraph deletes it.

### Lists

Select **List** and type the first item.

- **Enter** adds a new item.
- **Enter** on an empty last item ends the list and starts a paragraph.
- **Backspace** in an empty item removes it.

Choose the bullet or numbering style in the properties panel.

### Images

Select **Image** and choose a PNG, JPEG, GIF or WebP file. Images are converted to JPEG, scaled to at most 2000 pixels on the longest side, and placed on a white background.

After you add an image, the cursor moves to the **Alternative text** field. Then either:

- **Informative image:** describe what the image tells the reader, not every visual detail. For example: *"Front of Riverside Library: a cream building with a wide central door."*
- **Decorative image:** choose **Decorative**. The image is saved as an artifact and screen readers skip it.

To add a visible caption, tick **Show a caption under the image** and type it under the image.

### Tables

Select **Table** to insert a 3 × 3 table with a header row.

- **Tab** moves between cells; **Enter** moves to the cell below.
- Use the properties panel to add rows and columns, choose header cells, and add a caption.

### Page breaks

Select **Page break** to start the next block on a new page. Page breaks only affect layout; screen readers don't announce them.

### Moving and deleting blocks

Select a block, then use **Move up**, **Move down** or **Delete** at the bottom of the properties panel.

## 5. Properties panel

The panel shows the properties of the selected block. Changes apply immediately.

### All text blocks (headings, paragraphs and lists)

| Property | Options |
| --- | --- |
| Font | **Document default**, or any of the 20 bundled families, grouped as sans serif, serif and monospaced. A one-line description appears under the picker. |
| Size (pt) | 7 to 72. Headings default to 24, 18, 15, 13, 12 and 11 pt for H1 to H6; other text defaults to 11 pt. |
| Style | **B** (bold) and **I** (italic) toggle buttons. Headings are bold by default. |
| Colour | Colour picker. The contrast against the white page is shown next to it, with a tick or a cross. Normal text needs 4.5:1; large text (18 pt, or 14 pt bold) needs 3:1. |
| Alignment | Left, Centre or Right. |
| Line spacing | Tight (1.15), Snug (1.25), Normal (1.45), Relaxed (1.6) or Double (2.0). |

Size, weight and colour are visual only. Screen readers use the **heading level**, so make headings real headings rather than large bold paragraphs.

### Headings

**Heading level:** H1 to H6.

### Lists

- **Bullet or numbering:** Bullet •, Dash –, Numbers 1. 2. 3., Letters a. b. c., Letters A. B. C., Roman i. ii. iii., or Roman I. II. III.
- **Add item** adds an empty item at the end.

### Images

- **Replace:** choose a different image file.
- **How should this image be read?** Informative or Decorative.
- **Alternative text:** required for informative images. Aim for under about 250 characters; a counter shows the length.
- **Width:** 10% to 100% of the text column.
- **Alignment:** Left, Centre or Right.
- **Show a caption under the image.**

### Tables

- **Rows** (1–200) and **Columns** (1–8).
- **Header cells:**
  - **First row is headers:** tagged as column headers.
  - **First column is headers:** tagged as row headers.
  - **Repeat the header row on each page:** the repeat is visual only, so the headers are not read twice.
- **Caption:** announced before the table. Say what the table contains.
- **Text size (pt):** 7 to 24.
- **Shade header cells:** the shading colour is checked for contrast against the header text.
- **Stripe alternate rows.**
- **Screen reader preview:** how a data row will be announced, for example *"Row 2. Day: Monday to Friday. Opens: 9:00."*

## 6. Checks before export

Checks run as you type. Problems also appear as a badge under the affected block. Select a problem in the list to jump to it.

**Errors** must be fixed before you can export:

- Document has no title, or no language
- Document is empty
- Heading is empty, or a heading level is skipped (for example H2 to H4)
- Image block has no image, or an informative image has no alternative text
- Table is empty, or has no header cells
- Header shading makes the header text contrast too low
- List has no items
- Text contrast is below 4.5:1 (3:1 for large text)
- The chosen font can't display some characters

**Warnings** are worth reviewing but don't block export:

- The first heading isn't H1, or a longer document has no headings
- Alternative text looks like a file name or a placeholder, starts with "image of", or is very long
- A caption or a header cell is empty
- Text is smaller than 9 pt

When there are no errors, the panel shows **Ready to export**.

## 7. Pages view

Select **Pages** in the toolbar to see the exported layout, page by page, exactly as it will appear in the PDF. Select any item on a page to see its properties.

To edit text, switch back to **Write**.

## 8. Saving and opening drafts

- **Autosave:** your draft is kept in this browser as you work. The chip in the top bar shows its status. Very large drafts, usually ones with many images, may be too big for browser storage; save them as a file instead.
- **Save draft:** downloads the draft as a `.pwj` file. The format is described in [PWJ-FORMAT.md](PWJ-FORMAT.md).
- **Open:** opens a `.pwj` draft, an older `.json` draft, or a PDF.

> **Hosting note:** some hosting sites only allow downloads of certain file types. If a `.pwj` download is refused, the app explains why and offers **Save as .json instead**. Rename the file to `.pwj` afterwards if you like; the editor opens both.

Drafts from earlier test builds open automatically and are updated to the current format.

## 9. Exporting a PDF

1. Select **Check & export PDF**.
2. If any errors remain, they are listed. Select one to go straight to it.
3. Otherwise the editor builds the PDF, then reads it back and checks it again. You'll see a summary such as *"Ready: riverside-library-visitor-guide.pdf. 2 pages, 47 KB. The exported file was re-checked: 0 errors."*
4. Select **Download PDF**, or **View its tags** to inspect the exported file in the checking view.

The file name is made from the document title.

**What's in every export:**

- tagged structure in block order, with headings as bookmarks
- alternative text on informative images; decorative images marked as artifacts
- table header cells with scope
- embedded fonts with Unicode mapping
- the title, the language and the PDF/UA-1 identifier in the metadata
- page numbers, table rules and shading marked as artifacts

> **Still check by hand:** read the alternative text aloud and confirm it says what each image means. For full validation, also run the PDF through veraPDF or PAC.

## 10. Checking an existing PDF

Open a PDF with **Open**, or select **Open sample PDF** to try a sample with known problems.

### Screen layout

- **Tags (left):** the PDF's tag tree, page by page. A cross or warning icon marks tags with problems. Select a tag to inspect it.
- **Page (centre):** the rendered page, with tag overlays drawn over it. The toolbar has:
  - page navigation and zoom, including **Fit width**
  - **Show tags:** an outline and tag type for each block
  - **Show reading order:** numbered badges
  - **Show untagged content:** dashed red boxes around content screen readers can't reach
- **Inspector (right):** the selected tag's type, page, reading order, alternative text, language and text.
- **Accessibility check (right):** counts of errors, warnings and rules passed, then each problem with its WCAG criterion and Matterhorn checkpoint. Select a problem to go to it.

### Rules checked automatically

- **Document:** the document is tagged; the title is in XMP metadata and shown in the title bar; the language is set; all tags are standard or role-mapped.
- **Content:** all content is tagged or marked as an artifact; no marked content is orphaned.
- **Images:** they have meaningful alternative text.
- **Headings:** they exist, start at H1, don't skip levels, and don't mix `H` with `H1`–`H6`.
- **Tables:** they have header cells and a regular structure.
- **Lists:** they are structured as `L › LI › Lbl/LBody`.
- **Links:** they are tagged, have a description, and use descriptive link text.

### Not checked by this version

- table header scope
- font embedding
- tab order
- language of individual passages
- contrast
- full veraPDF validation

### Manual checks and report

Under **Needs a human check**, tick the items you've confirmed:

- reading order makes sense when read aloud
- alternative text is accurate
- colour is never the only way information is shown
- text has enough contrast against its background

Select **Accessibility report** to see a summary. You can download it as an HTML file, which includes your manual-check answers.

Existing PDFs are read-only in this build.

## 11. Keyboard reference

The app works with a keyboard alone. Every control is reachable with **Tab**, and the focused item always has a visible outline.

| Where | Key | Action |
| --- | --- | --- |
| Heading or paragraph | Enter | Start a new paragraph (splits the text at the cursor) |
| Heading or paragraph | Backspace in an empty block | Delete the block |
| List item | Enter | New item; on an empty last item, end the list |
| List item | Backspace in an empty item | Remove the item |
| Table cell | Tab / Shift+Tab | Next / previous cell |
| Table cell | Enter | Cell below |
| Checking view | Tab through the page | Visit each tagged block in reading order |
| Dialogs | Escape | Close |

## 12. Troubleshooting

| Problem | What to do |
| --- | --- |
| "The chosen font can't show: …" | The font doesn't include that character. Choose another font for the block, or replace the character. |
| "Text contrast is 2.3:1 (needs 4.5:1)" | Choose a darker text colour. The reading next to the colour picker updates as you change it. |
| "Heading level skipped" | Change the heading level in the properties panel, or add the missing level above it. |
| Export button shows problems | Errors must be fixed first. Select each one in the export dialog to go to it. |
| "Draft too large to keep in this browser" | Use **Save draft** to keep a file. Images take the most space. |
| A PDF won't open | Password-protected and badly damaged PDFs aren't supported yet. |
| `.pwj` download refused | Use **Save as .json instead**; see [section 8](#8-saving-and-opening-drafts). |
