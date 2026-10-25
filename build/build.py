#!/usr/bin/env python3
"""PDF Wire build script.

PDF Wire ships as one self-contained file, index.html. The only generated
parts of that file are two JavaScript constants:

  const FONTDATA = {...};   subsetted fonts (base64) plus the metrics the
                            PDF writer needs (cmap, widths, ascent, ...)
  const FONTMETA = {...};   family list for the font picker and the
                            "Font licences" dialog, plus the OFL text
  const SAMPLE_PDF_B64 = "..."; the sample PDF opened from the home screen,
                            copied from examples/riverside-sample-with-problems.pdf

Everything else in index.html is hand-written source and is edited directly.

Commands (run from the repository root):

  python build/build.py fonts    download, instance and subset the fonts
                                 into build/out/fontdata.json
  python build/build.py embed    write FONTDATA, FONTMETA and SAMPLE_PDF_B64
                                 into index.html
  python build/build.py check    verify index.html (fonts, licences, cmaps)
  python build/build.py all      fonts + embed + check

See docs/BUILD.md for details.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
import urllib.request
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
CONFIG = BUILD / "fonts.json"
CACHE = BUILD / ".cache"
OUT = BUILD / "out"
FONTDATA_JSON = OUT / "fontdata.json"
FONTMETA_JSON = OUT / "fontmeta.json"
INDEX = ROOT / "index.html"
OFL_TXT = ROOT / "OFL.txt"
FONT_LICENSES = ROOT / "FONT-LICENSES.md"
SAMPLE_PDF = ROOT / "examples" / "riverside-sample-with-problems.pdf"

RAW = "https://raw.githubusercontent.com/google/fonts/{ref}/ofl/{dir}/{file}"

STYLES = {
    # suffix: (weight key, italic, name ID 2, PostScript suffix)
    "R": ("R", False, "Regular", "Regular"),
    "B": ("B", False, "Bold", "Bold"),
    "I": ("R", True, "Italic", "Italic"),
    "BI": ("B", True, "Bold Italic", "BoldItalic"),
}

# Tables the PDF writer does not use. Removing them keeps index.html small.
DROP_TABLES = [
    "GSUB", "GPOS", "GDEF", "BASE", "JSTF", "MATH", "STAT", "kern",
    "DSIG", "hdmx", "LTSH", "VDMX", "PCLT", "meta", "fpgm", "prep", "cvt ",
]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def log(msg: str) -> None:
    print(msg, flush=True)


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def parse_unicodes(specs: list[str]) -> list[int]:
    out: set[int] = set()
    for spec in specs:
        spec = spec.upper().replace("U+", "")
        if "-" in spec:
            a, b = spec.split("-")
            out.update(range(int(a, 16), int(b, 16) + 1))
        else:
            out.add(int(spec, 16))
    return sorted(out)


def fetch(url: str, dest: Path, refresh: bool = False) -> Path:
    if dest.exists() and not refresh:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"  download {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "pdf-wire-build"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return dest


def metadata_files(meta_text: str) -> dict[str, str]:
    """Return {'normal': filename, 'italic': filename} from METADATA.pb."""
    entries = []
    for block in re.findall(r"fonts\s*\{(.*?)\}", meta_text, re.S):
        style = re.search(r'style:\s*"(\w+)"', block)
        fname = re.search(r'filename:\s*"([^"]+)"', block)
        weight = re.search(r"weight:\s*(\d+)", block)
        if style and fname:
            entries.append((style.group(1), int(weight.group(1)) if weight else 400, fname.group(1)))
    files: dict[str, str] = {}
    # Variable fonts list one entry per style. Static families list one entry
    # per weight: use the 400 file for R/I and the 700 file for B/BI.
    for st, w, fn in entries:
        files[f"{st}-{w}"] = fn
    for st in ("normal", "italic"):
        cands = [fn for s_, w, fn in entries if s_ == st]
        if cands:
            files[st] = files.get(f"{st}-400", cands[0])
    return files


def copyright_from_ofl(ofl_text: str) -> tuple[str, str]:
    first = ofl_text.strip().splitlines()[0].strip()
    m = re.search(r"\((https?://[^)]+)\)", first)
    return first, (m.group(1) if m else "")


def strip_ofl_header(text: str) -> str:
    """OFL.txt files start with copyright line(s); keep only the licence."""
    idx = text.find("This Font Software is licensed under")
    return text[idx:] if idx >= 0 else text


# --------------------------------------------------------------------------
# fonts
# --------------------------------------------------------------------------

def download_family(fam: dict, ref: str, refresh: bool) -> dict:
    d = fam["gf"]
    base = CACHE / ref / d
    meta = fetch(RAW.format(ref=ref, dir=d, file="METADATA.pb"), base / "METADATA.pb", refresh)
    ofl = fetch(RAW.format(ref=ref, dir=d, file="OFL.txt"), base / "OFL.txt", refresh)
    files = metadata_files(meta.read_text(encoding="utf-8"))
    paths = {}
    for st in ("normal", "italic"):
        if st not in files:
            raise SystemExit(f"{fam['name']}: no {st} font listed in METADATA.pb")
        paths[st] = fetch(RAW.format(ref=ref, dir=d, file=files[st]), base / files[st], refresh)
        # static families: also fetch the bold file
        bold = files.get(f"{st}-700")
        if bold and bold != files[st]:
            paths[f"{st}-700"] = fetch(RAW.format(ref=ref, dir=d, file=bold), base / bold, refresh)
    return {"paths": {k: str(v) for k, v in paths.items()}, "ofl": str(ofl)}


def set_names(font, family: str, style_name: str, ps_name: str, bold: bool, italic: bool) -> None:
    """Make the name table and style bits describe the static instance.

    Instancing a variable font leaves the default instance's names in place
    (for example 'Thin' or 'Regular' on a bold instance). Copyright (0),
    trademark, designer, vendor and licence records (7-14) are kept.
    """
    name = font["name"]
    for nid in (16, 17, 21, 22, 25):
        name.removeNames(nameID=nid)
    # drop STAT/fvar-referenced instance names (IDs >= 256)
    name.names = [r for r in name.names if r.nameID < 256]
    version = (name.getDebugName(5) or "Version 1.000").replace("Version ", "")
    full = family if style_name == "Regular" else f"{family} {style_name}"
    for nid, value in (
        (1, family),
        (2, style_name),
        (3, f"{version};{ps_name}"),
        (4, full),
        (6, ps_name),
    ):
        name.setName(value, nid, 3, 1, 0x409)
        if name.getName(nid, 1, 0, 0) is not None:
            name.setName(value, nid, 1, 0, 0)

    os2 = font["OS/2"]
    os2.usWeightClass = 700 if bold else 400
    sel = os2.fsSelection & ~(0x01 | 0x20 | 0x40)  # clear ITALIC, BOLD, REGULAR
    if italic:
        sel |= 0x01
    if bold:
        sel |= 0x20
    if not (bold or italic):
        sel |= 0x40
    os2.fsSelection = sel
    font["head"].macStyle = (0x01 if bold else 0) | (0x02 if italic else 0)


def build_one(job: dict) -> tuple[str, dict]:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools import subset

    fam, suffix, src, weight, unicodes = (
        job["fam"], job["suffix"], job["src"], job["weight"], job["unicodes"]
    )
    _, italic, style_name, ps_suffix = STYLES[suffix]
    bold = suffix in ("B", "BI")

    font = TTFont(src)
    if "fvar" in font:
        loc = {}
        for axis in font["fvar"].axes:
            if axis.axisTag == "wght":
                if not axis.minValue <= weight <= axis.maxValue:
                    raise ValueError(f"{fam['name']}: wght {weight} outside {axis.minValue}-{axis.maxValue}")
                loc["wght"] = weight
            else:
                loc[axis.axisTag] = axis.defaultValue  # pin opsz, wdth, ... at default
        font = instancer.instantiateVariableFont(font, loc, inplace=False)

    opts = subset.Options()
    opts.name_IDs = ["*"]
    opts.name_languages = [0x409]
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.layout_features = []
    opts.hinting = False
    opts.drop_tables = list(set(opts.drop_tables) | set(DROP_TABLES))
    opts.glyph_names = False
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)

    ps_name = fam.get("ps", fam["name"].replace(" ", "")) + "-" + ps_suffix
    set_names(font, fam["name"], style_name, ps_name, bold, italic)

    buf = io.BytesIO()
    font.save(buf)
    data = buf.getvalue()
    font = TTFont(io.BytesIO(data))  # reload to read final glyph order

    upm = font["head"].unitsPerEm
    sc = lambda v: round(v * 1000 / upm)
    order = font.getGlyphOrder()
    gid = {g: i for i, g in enumerate(order)}
    best = font.getBestCmap()
    hmtx = font["hmtx"]
    head = font["head"]
    os2 = font["OS/2"]
    entry = {
        "cmap": {str(u): gid[g] for u, g in sorted(best.items())},
        "widths": [sc(hmtx[g][0]) for g in order],
        "ascent": sc(font["hhea"].ascent),
        "descent": sc(font["hhea"].descent),
        "capHeight": sc(getattr(os2, "sCapHeight", 0) or font["hhea"].ascent * 0.7),
        "bbox": [sc(head.xMin), sc(head.yMin), sc(head.xMax), sc(head.yMax)],
        "italicAngle": float(font["post"].italicAngle),
        "psName": ps_name,
        "ttf": base64.b64encode(data).decode("ascii"),
    }
    return f"{fam['key']}-{suffix}", entry


def cmd_fonts(args) -> None:
    cfg = load_config()
    ref = args.ref or cfg.get("googleFontsRef", "main")
    unicodes = parse_unicodes(cfg["unicodes"])
    weights = cfg["weights"]
    log(f"google/fonts ref: {ref}   code points: {len(unicodes)}")

    jobs, meta_fams = [], []
    for fam in cfg["families"]:
        if args.only and fam["key"] not in args.only:
            continue
        log(f"{fam['name']}")
        dl = download_family(fam, ref, args.refresh)
        ofl_text = Path(dl["ofl"]).read_text(encoding="utf-8")
        if re.search(r"Reserved Font Name", ofl_text.split("PREAMBLE")[0], re.I):
            raise SystemExit(f"{fam['name']} declares a Reserved Font Name; it cannot be subset and redistributed under its own name.")
        copyright_line, source = copyright_from_ofl(ofl_text)
        meta_fams.append({
            "key": fam["key"], "name": fam["name"], "cat": fam["cat"], "blurb": fam["blurb"],
            "copyright": fam.get("copyright", copyright_line),
            "source": fam.get("source", source),
        })
        for suffix, (wkey, italic, _, _) in STYLES.items():
            st = "italic" if italic else "normal"
            src = dl["paths"].get(f"{st}-700") if wkey == "B" and f"{st}-700" in dl["paths"] else dl["paths"][st]
            jobs.append({"fam": fam, "suffix": suffix, "src": src, "weight": weights[wkey], "unicodes": unicodes})

    log(f"building {len(jobs)} font files ...")
    results = {}
    with ProcessPoolExecutor(max_workers=args.jobs) as ex:
        for key, entry in ex.map(build_one, jobs):
            results[key] = entry
            log(f"  {key:18} {len(entry['widths']):4} glyphs  {len(entry['cmap']):4} chars  {len(entry['ttf']) * 3 // 4:7} bytes")

    # keep config order
    ordered = {}
    for fam in cfg["families"]:
        for suffix in STYLES:
            k = f"{fam['key']}-{suffix}"
            if k in results:
                ordered[k] = results[k]

    if args.only and FONTDATA_JSON.exists():
        # partial rebuild: merge into the previous output
        prev = json.loads(FONTDATA_JSON.read_text(encoding="utf-8"))
        prev.update(ordered)
        ordered = {f"{f['key']}-{s}": prev[f"{f['key']}-{s}"] for f in cfg["families"] for s in STYLES if f"{f['key']}-{s}" in prev}
        prev_meta = json.loads(FONTMETA_JSON.read_text(encoding="utf-8"))["families"] if FONTMETA_JSON.exists() else []
        by_key = {f["key"]: f for f in prev_meta}
        by_key.update({f["key"]: f for f in meta_fams})
        meta_fams = [by_key[f["key"]] for f in cfg["families"] if f["key"] in by_key]

    ofl = strip_ofl_header(OFL_TXT.read_text(encoding="utf-8")) if OFL_TXT.exists() else \
        strip_ofl_header(Path(dl["ofl"]).read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    FONTDATA_JSON.write_text(json.dumps(ordered, ensure_ascii=False), encoding="utf-8")
    FONTMETA_JSON.write_text(json.dumps({"families": meta_fams, "ofl": ofl}, ensure_ascii=False), encoding="utf-8")
    log(f"wrote {FONTDATA_JSON.relative_to(ROOT)} and {FONTMETA_JSON.relative_to(ROOT)}")


# --------------------------------------------------------------------------
# embed / check
# --------------------------------------------------------------------------

def find_const(html: str, name: str) -> tuple[int, int]:
    """Return (start, end) of the JSON value assigned to `const NAME = `."""
    marker = f"const {name} = "
    start = html.find(marker)
    if start < 0:
        raise SystemExit(f"index.html: 'const {name} = ' not found")
    start += len(marker)
    # The value is a single JSON object or string on one line ending in ";".
    end = html.find("\n", start)
    end = len(html) if end < 0 else end
    while html[end - 1] in "\r;":
        end -= 1
    json.loads(html[start:end])  # sanity: must parse
    return start, end


def cmd_embed(args) -> None:
    for p in (FONTDATA_JSON, FONTMETA_JSON):
        if not p.exists():
            raise SystemExit(f"{p.relative_to(ROOT)} missing; run 'python build/build.py fonts' first")
    # bytes, not read_text(): keep the file's line endings (LF or CRLF) as they are
    html = INDEX.read_bytes().decode("utf-8")
    for name, path in (("FONTDATA", FONTDATA_JSON), ("FONTMETA", FONTMETA_JSON)):
        value = json.dumps(json.loads(path.read_text(encoding="utf-8")), ensure_ascii=False)
        s, e = find_const(html, name)
        html = html[:s] + value + html[e:]
    if SAMPLE_PDF.exists():
        s, e = find_const(html, "SAMPLE_PDF_B64")
        html = html[:s] + json.dumps(base64.b64encode(SAMPLE_PDF.read_bytes()).decode("ascii")) + html[e:]
    INDEX.write_bytes(html.encode("utf-8"))
    log(f"updated {INDEX.name} ({INDEX.stat().st_size:,} bytes)")


def cmd_check(args) -> None:
    from fontTools.ttLib import TTFont

    cfg = load_config()
    html = INDEX.read_bytes().decode("utf-8")
    s, e = find_const(html, "FONTDATA")
    fontdata = json.loads(html[s:e])
    s, e = find_const(html, "FONTMETA")
    fontmeta = json.loads(html[s:e])
    wanted = set(parse_unicodes(cfg["unicodes"]))
    errors, warnings = [], []
    gaps: dict[str, set[int]] = {}

    keys = [f["key"] for f in cfg["families"]]
    meta_keys = [f["key"] for f in fontmeta["families"]]
    if keys != meta_keys:
        errors.append(f"FONTMETA families {meta_keys} do not match build/fonts.json {keys}")

    for fam in cfg["families"]:
        for suffix in STYLES:
            k = f"{fam['key']}-{suffix}"
            if k not in fontdata:
                errors.append(f"{k}: missing from FONTDATA")
                continue
            v = fontdata[k]
            try:
                f = TTFont(io.BytesIO(base64.b64decode(v["ttf"])))
            except Exception as ex:  # noqa: BLE001
                errors.append(f"{k}: font does not load ({ex})")
                continue
            order = f.getGlyphOrder()
            best = f.getBestCmap()
            if len(v["widths"]) != len(order):
                errors.append(f"{k}: widths has {len(v['widths'])} entries, font has {len(order)} glyphs")
            for u, g in best.items():
                if v["cmap"].get(str(u)) != order.index(g):
                    errors.append(f"{k}: cmap mismatch at U+{u:04X}")
                    break
            if "fvar" in f:
                errors.append(f"{k}: still variable (fvar present)")
            if "glyf" not in f:
                errors.append(f"{k}: no glyf table (PDF writer embeds CIDFontType2/TrueType outlines)")
            missing = sorted(u for u in wanted if u not in best)
            if missing:
                gaps.setdefault(fam["name"], set()).update(missing)
            ps6 = f["name"].getDebugName(6)
            if ps6 != v["psName"]:
                warnings.append(f"{k}: name ID 6 is '{ps6}', FONTDATA psName is '{v['psName']}'")

    if OFL_TXT.exists():
        if strip_ofl_header(OFL_TXT.read_text(encoding="utf-8")).strip() != fontmeta["ofl"].strip():
            errors.append("FONTMETA.ofl differs from OFL.txt")
    if FONT_LICENSES.exists():
        md = FONT_LICENSES.read_text(encoding="utf-8")
        for fam in fontmeta["families"]:
            if f"| {fam['name']} |" not in md:
                errors.append(f"FONT-LICENSES.md has no row for {fam['name']}")
            elif fam["copyright"] not in md:
                warnings.append(f"FONT-LICENSES.md copyright for {fam['name']} differs from FONTMETA")

    # Characters a family's fonts don't have. Not an error: the editor flags
    # them before export. Listed so a font change that loses glyphs is noticed.
    if SAMPLE_PDF.exists():
        s, e = find_const(html, "SAMPLE_PDF_B64")
        if base64.b64decode(json.loads(html[s:e])) != SAMPLE_PDF.read_bytes():
            errors.append(f"SAMPLE_PDF_B64 differs from {SAMPLE_PDF.relative_to(ROOT)}; run 'embed'")

    for name, cps in gaps.items():
        log(f"note: {name} lacks {len(cps)} of the requested characters: "
            + " ".join(f"U+{u:04X}" for u in sorted(cps)))
    for w in warnings:
        log(f"warning: {w}")
    for er in errors:
        log(f"ERROR:   {er}")
    log(f"{len(fontdata)} fonts checked, {len(errors)} errors, {len(warnings)} warnings")
    if errors:
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("fonts", "all"):
        p = sub.add_parser(name)
        p.add_argument("--ref", help="google/fonts branch, tag or commit (default: googleFontsRef in fonts.json)")
        p.add_argument("--only", nargs="+", metavar="KEY", help="rebuild only these family keys, e.g. inter literata")
        p.add_argument("--refresh", action="store_true", help="download again even if cached")
        p.add_argument("--jobs", type=int, default=None, help="parallel workers (default: CPU count)")
    sub.add_parser("embed")
    sub.add_parser("check")
    args = ap.parse_args()

    if args.cmd in ("fonts", "all"):
        cmd_fonts(args)
    if args.cmd in ("embed", "all"):
        cmd_embed(args)
    if args.cmd in ("check", "all"):
        cmd_check(args)


if __name__ == "__main__":
    main()
