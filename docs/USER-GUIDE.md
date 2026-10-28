# User guide

This guide explains how to use PDF Wire (test build 6) to create accessible PDFs, to check existing ones, and to remediate existing ones.

The app follows your computer's light or dark setting. Pages are always drawn as white paper, as they will print.

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
11. [Remediating an existing PDF](#11-remediating-an-existing-pdf)
12. [Keyboard reference](#12-keyboard-reference)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. The home screen

The home screen offers three paths:

- **Create a new PDF** opens the new-document dialog.
- **Remediate an existing PDF** turns an inaccessible PDF into an accessible one. Choose a PDF, or select **Try an untagged sample**. See [section 11](#11-remediating-an-existing-pdf).
- **Check an existing PDF** lets you open a PDF from your computer, or try the built-in sample PDF.

If a draft is kept in this browser, a **Continue your draft** card appears as well.

You can also drop a PDF or a `.pwj` draft anywhere on the main area. Files are read in your browser and are never uploaded.

The header is the same on every screen:

- **PDF Wire** returns to the home screen.
- **Write, Pages, Check and Remediate** switch between the four modes. **Pages** needs an open document. **Check** checks the document you're writing, or the PDF that's open, or asks you to choose one. **Remediate** returns to the PDF you're remediating, or asks you to choose one.
- **New** and **Open** are always available.

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

- **Header:** the mode tabs, document title, draft status, and the **New**, **Open**, **Save draft** and **Check & export** buttons.
- **Toolbar,** in labelled groups:
  - **History:** **Undo** and **Redo**
  - **Insert:** **Heading** (with a level picker), **Paragraph**, **List**, **Image**, **Table** and **Page break**. Select a button to add the block after the current one, or drag it to where you want it on the page.
  - **Text:** font, size, **Bold** and **Italic** for the selected block
  - **Arrange:** **Combine**, **Move up**, **Move down** and **Delete**
  - what's selected, at the right
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

Select a block, then use **Move up**, **Move down** or **Delete** in the **Arrange** toolbar or at the bottom of the properties panel. Or drag the block by its grip (⋮⋮, to the left of its tag) and drop it where a blue line shows.

### Selecting several blocks

- **Ctrl-click** (**⌘-click** on a Mac) a block to add it to the selection, or remove it.
- **Shift-click** selects every block from the current one to the one you click. In a text field, Shift-click selects text as usual, so click the block's tag or grip instead.
- Selected blocks are outlined in blue with a tick. **Escape** clears the selection.

**Delete** removes every selected block, after asking.

### Combining blocks

Use **Combine** to join blocks that were split, for example a heading set over two lines, or a paragraph broken by a page.

1. Select the blocks with Ctrl-click or Shift-click. They don't have to be next to each other.
2. Select **Combine** in the **Arrange** toolbar.
3. The dialog lists the blocks in between. Untick any you want to leave out, choose what the result should be (a heading level, a paragraph or a list) and check the **Result**.
4. Select **Combine**.

The text is joined in document order into the first block. Blocks that aren't text, such as an image between two heading lines, aren't joined: they stay where they were, after the combined block.

With one block selected, **Combine** offers the blocks that follow it.

You can also **drag a block onto the middle of another**. The target is outlined with a dashed line, and dropping opens the same dialog.

### Drag and drop

| Drag | Drop | Result |
| --- | --- | --- |
| A block's grip | Between two blocks (a blue line) | Moves the block |
| A block's grip | Onto the middle of another text block (a dashed outline) | Combines them |
| A button in the **Insert** toolbar | Between two blocks | Adds that kind of block there |
| Image files from your computer | Anywhere on the page | Adds the images there, then asks you to describe each one |

Every drag has a button that does the same thing, so you never need a mouse.

### Undo and redo

**Undo** and **Redo** are in the toolbar, or press **Ctrl+Z** and **Ctrl+Shift+Z** (or **Ctrl+Y**); on a Mac use **⌘**. Typing is undone a phrase at a time. Undo history is kept until you open or create another document.

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

### Headings and paragraphs

- **Type:** Paragraph, or Heading 1 to Heading 6. Use it to turn a paragraph into a heading, or the other way round.
- **Join with next block:** adds the next heading or paragraph to the end of this one. Useful when a paragraph was split in two.

### Lists

- **Bullet or numbering:** Bullet •, Dash –, Numbers 1. 2. 3., Letters a. b. c., Letters A. B. C., Roman i. ii. iii., or Roman I. II. III.
- **Add item** adds an empty item at the end.
- **Not a list: turn into paragraphs** makes each item a paragraph.

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
- **Rows and columns:** click a cell, then:
  - **Insert row above** or **below**, **Delete row**, **Merge row with next**
  - **Insert column left** or **right**, **Delete column**, **Merge column with next** (up to 12 columns)
  - **Shift cells right** or **left**, which moves the rest of the row along by one, for a value in the wrong column
  - **Not a table: turn into paragraphs**, one paragraph per row

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

Select the **Pages** tab to see the exported layout, page by page, exactly as it will appear in the PDF. Select any item on a page to see its properties.

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

Select the **Check** tab, or **Open** a PDF. Select **Open sample PDF** to try a sample with known problems.

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

This view only checks the PDF. To fix it, select **Remediate this PDF** in the top bar (see the next section).

## 11. Remediating an existing PDF

Remediation turns an inaccessible PDF into an accessible one. Choose a PDF under **Remediate an existing PDF** on the home screen, or select **Remediate this PDF** while checking one. **Try an untagged sample** opens a two-page report with no tags at all.

The PDF is analysed first: headings, paragraphs, lists, tables, images, and the headers, footers and page numbers to leave out. The dialog shows what was found, any layout warnings, and the two ways to fix it.

> **Complex layouts may cause problems.** Automatic remediation is reliable for simple, single-column documents. Multiple columns, sidebars, text over images, footnotes, forms, and charts drawn as shapes can come out in the wrong order or lose their structure. Always compare the result with the original before you rely on it.

| | Rebuild (recommended) | Tag in place (experimental) |
| --- | --- | --- |
| Result | A new PDF made by this editor | The original file, with tags added |
| Look | The editor's layout and fonts | Exactly as before |
| You can change | Anything | Tags, reading order and alternative text only |
| Passes every check | Yes, it must before export | Only if the original's content has no problems |

[REMEDIATION.md](REMEDIATION.md) compares them in detail.

### Describing images

Whichever you choose, you are asked to **describe each image** straight away, one at a time. The dialog shows the image, the text near it, and the original's alternative text if it had any (select **Use this** to start from it). Choose **Informative** and write the alternative text, or choose **Decorative**. **Skip for now** moves on; an image without a description still blocks export. Select **Describe images** later to come back to them.

### Rebuild

The content opens in the editor as ordinary blocks, and a **Remediation review** checklist appears in the left panel:

- **Describe the image on page N**: ticked off when the image has alternative text or is decorative
- **Check the table on page N**: check every value is in the right cell, and the header cells. Fix it with the table tools in the properties panel (see [Tables](#tables)).
- **Check the heading levels**: they were worked out from text size. Change any that are wrong with **Type** in the properties panel.
- **Check the title and language**: select it to open document settings
- layout warnings, such as more than one column, and things that changed, such as links becoming plain text

Select an item to go to it, and **Mark as checked** when you're happy. Unchecked items appear as warnings in **Checks before export**. **Compare with original** shows the original page with the selected block outlined. It is only available while the original is open; the review list itself is saved with the draft.

When you're done, select **Finish review and hide this panel**, then **Check & export PDF** as usual.

### Tag in place

The original pages are shown with every tag drawn over them, numbered in reading order. Grey dashed outlines are artifacts: decoration that screen readers skip.

- **Structure (left):** every tag in reading order, page by page. A cross means an image with no alternative text; a warning means a table not checked yet. **Artifacts left out** lists the headers, footers and decorations; select **Read it** to have one read after all.
- **Tag (right):** what the selected item is: a heading level, Paragraph, List, Table, Figure or Artifact. Change it here.
  - **Figures** need alternative text, or change the tag to Artifact.
  - **Tables:** choose the header row or column, merge rows or columns that were split, or read the table as paragraphs. Tick **I've checked this table**.
  - **Lists:** choose the numbering screen readers announce.
  - **Move up** and **Move down** change the reading order. **Join with next** joins two paragraphs. The page itself never changes.
- **Toolbar:**
  - **History:** **Undo** and **Redo**, or Ctrl+Z and Ctrl+Shift+Z
  - **Tag as:** H1, H2, H3, P, L, Table, Figure and Artifact, and H4 to H6 from the list. They apply to every selected tag.
  - **Arrange:** **Combine**, **Split** (one tag per line), **Move up** and **Move down**
  - **Images:** **Describe** steps through every figure
  - **View:** page, zoom, and whether to show tags, reading order numbers and artifacts
  - **Layout:** **Original**, **Tagged** or **Side by side**. Side by side shows the untouched original next to the tagged page.
- **Selecting several tags:** tick their checkboxes in the **Structure** list, or Ctrl-click or Shift-click them on the page. **Escape** clears the selection.
- **Combining tags:** select two or more and choose **Combine**, or drag one tag in the list onto the middle of another. Tags on different pages can't be combined yet.
- **Drag** a tag by its grip in the **Structure** list to change the reading order within its page.
- **Document:** the title and the language. Both are required.
- **Before writing:** what still needs doing, and whether the file can claim PDF/UA. It can't when the original's fonts aren't embedded or it has form fields or scanned pages.

Select **Write tagged PDF**. The file is written, read back and checked, and the result is shown. Select **Download tagged PDF**, or **View its tags** to inspect it in the checking view; **Back to tagging** returns to where you were.

Tag-in-place work isn't saved as a draft, so finish in one sitting.

## 12. Keyboard reference

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
| Anywhere except a text field | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y | Undo / redo (⌘ on a Mac) |
| A block or tag | Ctrl-click / Shift-click | Add to the selection / select a range |
| With blocks or tags selected | Escape | Clear the selection |
| Dialogs | Escape | Close |
| Tag in place | Tab through the page | Visit each tag in reading order |

## 13. Troubleshooting

| Problem | What to do |
| --- | --- |
| "The chosen font can't show: …" | The font doesn't include that character. Choose another font for the block, or replace the character. |
| "Text contrast is 2.3:1 (needs 4.5:1)" | Choose a darker text colour. The reading next to the colour picker updates as you change it. |
| A remediated page reads in the wrong order | Rebuild: use **Move up** and **Move down**, and **Compare with original**. Tag in place: use **Move up** and **Move down** on the tag. Pages with columns or sidebars are flagged in the review. |
| A table came out wrong after remediation | Rebuild: fix it with the table tools, or turn it into paragraphs. Tag in place: merge split rows or columns, or read it as paragraphs. |
| "The tagging engine (pdf-lib) could not be downloaded" | Tag in place loads pdf-lib from cdnjs the first time. Check your connection, or rebuild instead. |
| "This PDF is encrypted, so it can't be tagged in place" | Remove the protection with the tool that added it, or rebuild instead. |
| **Combine** is greyed out | Select at least one heading, paragraph or list. Images, tables and page breaks can't be combined. When tagging in place, the tags must be on the same page. |
| "Heading level skipped" | Change the heading level in the properties panel, or add the missing level above it. |
| Export button shows problems | Errors must be fixed first. Select each one in the export dialog to go to it. |
| "Draft too large to keep in this browser" | Use **Save draft** to keep a file. Images take the most space. |
| A PDF won't open | Password-protected and badly damaged PDFs aren't supported yet. |
| `.pwj` download refused | Use **Save as .json instead**; see [section 8](#8-saving-and-opening-drafts). |
