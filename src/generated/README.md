# Generated files

Written by `python build/build.py fonts`. Don't edit them by hand.

- `fontdata.json`: the 80 subsetted fonts (base64) and the metrics the PDF writer uses
- `fontmeta.json`: the font picker and **Font licences** dialog data, and the OFL text

They are committed so that `python build/build.py compile` works without fontTools or a network connection. To change the fonts, edit `build/fonts.json` and run `python build/build.py fonts`. See [docs/BUILD.md](../../docs/BUILD.md).
