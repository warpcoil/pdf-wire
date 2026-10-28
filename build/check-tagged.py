"""Independent structure check for tagged PDFs (a subset of the PDF/UA machine checks).

    pip install pikepdf pillow           (pdftoppm from poppler for --render)
    python build/check-tagged.py tagged.pdf [--original original.pdf] [--render]

It doesn't use any PDF Wire code, so it catches mistakes the in-app audit
might share with the writer. It is not a substitute for veraPDF or PAC.

Checks:
  * catalogue: MarkInfo/Marked, Lang, StructTreeRoot, DisplayDocTitle, XMP dc:title
  * every text, image, path, shading and form drawn on a page sits inside
    marked content (a tagged MCID or an Artifact); nothing is left untagged
  * every MCID on a page is in the parent tree, and that element lists it
  * no MCID is used twice on a page; no form XObject carries MCIDs
  * Figures have Alt; TH cells have a Scope; every Link annotation has a
    StructParent that leads to a Link element holding an OBJR for it
  * with --original and --render: every page renders identically (pixel diff)
"""
import sys, subprocess, tempfile, os
import pikepdf
from pikepdf import Name

PAINT = {'Tj', 'TJ', "'", '"', 'Do', 'sh', 'INLINE IMAGE', 'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*'}


def check(path, original=None, render=False):
    errs, notes = [], []
    pdf = pikepdf.open(path)
    root = pdf.Root
    if not (root.get('/MarkInfo') and bool(root.MarkInfo.get('/Marked'))): errs.append('MarkInfo /Marked is not true')
    if not str(root.get('/Lang', '')): errs.append('no /Lang in the catalogue')
    if not (root.get('/ViewerPreferences') and bool(root.ViewerPreferences.get('/DisplayDocTitle'))): errs.append('DisplayDocTitle is not true')
    xmp = root.get('/Metadata')
    if xmp is None or b'dc:title' not in xmp.read_bytes(): errs.append('no dc:title in XMP metadata')
    str_root = root.get('/StructTreeRoot')
    if str_root is None:
        return ['no StructTreeRoot'], notes
    # parent tree
    pt = {}
    def nums(node):
        if '/Nums' in node:
            a = node.Nums
            for i in range(0, len(a), 2): pt[int(a[i])] = a[i + 1]
        for k in node.get('/Kids', []): nums(k)
    nums(str_root.ParentTree)
    # walk the structure tree
    elems, kids_mcid = [], {}
    def walk(e, parent):
        if not isinstance(e, pikepdf.Dictionary): return
        if e.get('/Type') == Name.MCR or e.get('/Type') == Name.OBJR: return
        elems.append(e)
        s = str(e.get('/S', ''))
        if s == '/Figure' and not str(e.get('/Alt', '')).strip(): errs.append('Figure without Alt')
        if s == '/TH':
            a = e.get('/A')
            if a is None or '/Scope' not in a: errs.append('TH without Scope')
        k = e.get('/K')
        ks = list(k) if isinstance(k, pikepdf.Array) else ([] if k is None else [k])
        pg = e.get('/Pg')
        for x in ks:
            if isinstance(x, int) or (hasattr(x, 'is_integer') and x.is_integer):
                kids_mcid.setdefault((pg.objgen if pg is not None else None, int(x)), []).append(e)
            elif isinstance(x, pikepdf.Dictionary) and x.get('/Type') == Name.MCR:
                kids_mcid.setdefault((x.Pg.objgen, int(x.MCID)), []).append(e)
            elif isinstance(x, pikepdf.Dictionary):
                walk(x, e)
    k = str_root.K
    for e in (list(k) if isinstance(k, pikepdf.Array) else [k]): walk(e, None)
    notes.append('%d structure elements' % len(elems))
    total_mcids = 0
    for pi, page in enumerate(pdf.pages):
        sp = page.obj.get('/StructParents')
        if sp is None: errs.append('page %d has no StructParents' % (pi + 1)); continue
        arr = pt.get(int(sp))
        ops = pikepdf.parse_content_stream(page)
        stack, seen, untagged = [], set(), 0
        for operands, op in ops:
            o = str(op)
            if o in ('BMC', 'BDC'):
                tag = str(operands[0])
                mcid = None
                if o == 'BDC' and isinstance(operands[1], pikepdf.Dictionary) and '/MCID' in operands[1]: mcid = int(operands[1].MCID)
                stack.append((tag, mcid))
                if mcid is not None:
                    total_mcids += 1
                    if mcid in seen: errs.append('page %d: MCID %d used twice' % (pi + 1, mcid))
                    seen.add(mcid)
                    if arr is None or mcid >= len(arr): errs.append('page %d: MCID %d not in the parent tree' % (pi + 1, mcid))
                    else:
                        el = arr[mcid]
                        if (page.obj.objgen, mcid) not in kids_mcid or not any(x.objgen == el.objgen for x in kids_mcid[(page.obj.objgen, mcid)]):
                            errs.append('page %d: parent tree points MCID %d at an element that does not list it' % (pi + 1, mcid))
            elif o == 'EMC':
                if stack: stack.pop()
            elif o in PAINT:
                if not any(t == '/Artifact' or m is not None for t, m in stack): untagged += 1
        if untagged: errs.append('page %d: %d drawing operations are neither tagged nor artifacts' % (pi + 1, untagged))
        for a in page.obj.get('/Annots', []):
            if a.get('/Subtype') == Name.Link:
                if '/StructParent' not in a: errs.append('page %d: Link annotation without StructParent' % (pi + 1)); continue
                el = pt.get(int(a.StructParent))
                ok = el is not None and str(el.get('/S')) == '/Link' and any(isinstance(x, pikepdf.Dictionary) and x.get('/Type') == Name.OBJR and x.Obj.objgen == a.objgen for x in (el.K if isinstance(el.K, pikepdf.Array) else [el.K]))
                if not ok: errs.append('page %d: Link annotation is not in a Link element with an OBJR' % (pi + 1))
                if not str(a.get('/Contents', '')).strip(): errs.append('page %d: Link annotation has no Contents' % (pi + 1))
        # forms with MCIDs
        res = page.obj.get('/Resources')
        xo = res.get('/XObject') if res is not None else None
        for nm, x in (xo.items() if xo is not None else []):
            if x.get('/Subtype') == Name.Form and b'/MCID' in x.read_bytes(): errs.append('page %d: form %s still has MCIDs' % (pi + 1, nm))
        if page.obj.get('/Tabs') != Name.S: errs.append('page %d: Tabs is not /S' % (pi + 1))
    notes.append('%d marked-content sequences with MCIDs' % total_mcids)
    if original and render:
        with tempfile.TemporaryDirectory() as d:
            subprocess.run(['pdftoppm', '-r', '60', '-png', original, os.path.join(d, 'a')], check=True)
            subprocess.run(['pdftoppm', '-r', '60', '-png', path, os.path.join(d, 'b')], check=True)
            from PIL import Image, ImageChops
            a = sorted(f for f in os.listdir(d) if f.startswith('a')); b = sorted(f for f in os.listdir(d) if f.startswith('b'))
            if len(a) != len(b): errs.append('page count changed')
            for fa, fb in zip(a, b):
                ia, ib = Image.open(os.path.join(d, fa)).convert('RGB'), Image.open(os.path.join(d, fb)).convert('RGB')
                bbox = ImageChops.difference(ia, ib).getbbox()
                if bbox: errs.append('%s renders differently from the original (area %s)' % (fb, bbox))
            notes.append('%d pages compared pixel by pixel' % len(a))
    return errs, notes


if __name__ == '__main__':
    args = sys.argv[1:]
    orig = None
    if '--original' in args: i = args.index('--original'); orig = args[i + 1]; del args[i:i + 2]
    render = '--render' in args
    args = [a for a in args if a != '--render']
    bad = 0
    for p in args:
        errs, notes = check(p, orig, render)
        print(('FAIL ' if errs else 'pass ') + p + '  (' + '; '.join(notes) + ')')
        for e in errs: print('   - ' + e)
        bad += bool(errs)
    sys.exit(1 if bad else 0)
