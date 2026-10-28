"""Generate the untagged test PDFs used by build/remediate-test.mjs.

    pip install reportlab pillow
    python build/remediation-fixtures.py

Writes examples/remediation/*.pdf. The files are committed, so this only needs
running again if you change the fixtures.
"""
import io, os, sys
from reportlab.lib.pagesizes import A4, letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'examples', 'remediation')
os.makedirs(OUT, exist_ok=True)


def picture(w, h, seed):
    im = Image.new('RGB', (w, h), (214, 228, 240))
    d = ImageDraw.Draw(im)
    d.rectangle([0, int(h * .62), w, h], fill=(96, 140, 92))
    d.ellipse([int(w * .68), int(h * .12), int(w * .86), int(h * .38)], fill=(246, 206, 90))
    d.polygon([(int(w * .1), int(h * .62)), (int(w * .32), int(h * .22)), (int(w * .55), int(h * .62))], fill=(120, 120, 140))
    d.rectangle([int(w * .58), int(h * .40), int(w * .80), int(h * .62)], fill=(178, 74, 58 + seed))
    b = io.BytesIO(); im.save(b, 'PNG'); b.seek(0)
    return ImageReader(b)


def logo():
    im = Image.new('RGB', (64, 64), (33, 72, 192))
    ImageDraw.Draw(im).ellipse([14, 14, 50, 50], fill=(255, 255, 255))
    b = io.BytesIO(); im.save(b, 'PNG'); b.seek(0)
    return ImageReader(b)


def report():
    """Untagged two-page report: standard (non-embedded) fonts, ruled table, lists, header/footer, link."""
    path = os.path.join(OUT, 'untagged-council-report.pdf')
    c = canvas.Canvas(path, pagesize=A4, pageCompression=1)
    c.setTitle('Riverside Council Annual Report 2026')
    W, H = A4
    L = 64
    lg = logo()

    def chrome(n):
        c.drawImage(lg, L, H - 50, 18, 18)
        c.setFont('Helvetica', 8.5); c.setFillGray(0.3)
        c.drawString(L + 24, H - 44, 'Riverside Council  |  Annual Report 2026')
        c.drawCentredString(W / 2, 30, 'Page %d of 2' % n)
        c.setFillGray(0)

    def para(y, text, size=10.5, font='Helvetica', width=W - 2 * L, lead=None):
        lead = lead or size * 1.4
        c.setFont(font, size)
        words, line = text.split(), ''
        for w in words:
            cand = (line + ' ' + w).strip()
            if pdfmetrics.stringWidth(cand, font, size) > width:
                c.drawString(L, y, line); y -= lead; line = w
            else:
                line = cand
        if line:
            c.drawString(L, y, line); y -= lead
        return y - size * 0.6

    chrome(1)
    y = H - 100
    c.setFont('Helvetica-Bold', 22); c.drawString(L, y, 'Annual Report 2026'); y -= 34
    y = para(y, 'This report sets out what Riverside Council delivered for residents during 2026, how the budget was spent, and the priorities for the year ahead.')
    c.setFont('Helvetica-Bold', 15); c.drawString(L, y, 'Highlights'); y -= 24
    for item in ['Library opening hours extended to seven days a week.',
                 'Two new playgrounds opened in the east of the borough.',
                 'Recycling rate rose to 58 per cent, the highest on record.']:
        c.setFont('Helvetica', 10.5); c.drawString(L + 4, y, '•'); c.drawString(L + 18, y, item); y -= 16
    y -= 8
    c.setFont('Helvetica-Bold', 12); c.drawString(L, y, 'How to get involved'); y -= 20
    for i, item in enumerate(['Read the draft plan on our website.', 'Come to a drop-in session at the library.', 'Send us your comments by 31 January.']):
        c.setFont('Helvetica', 10.5); c.drawString(L + 4, y, '%d. %s' % (i + 1, item)); y -= 16
    y -= 10
    c.drawImage(picture(600, 300, 0), L, y - 180, 360, 180); y -= 196
    c.setFont('Helvetica-Oblique', 9); c.drawString(L, y, 'The new east playground, opened in June.'); y -= 26
    y = para(y, 'The council works with community groups, schools and local businesses on every project. More information is on the council website, including the full accounts and the minutes of every meeting held during the year.')
    c.setFont('Helvetica', 10.5); c.setFillColorRGB(0.13, 0.28, 0.75)
    c.drawString(L, y, 'Visit riverside.example/annual-report'); c.linkURL('https://riverside.example/annual-report', (L, y - 3, L + 190, y + 11), relative=0)
    c.setFillGray(0)
    c.showPage()

    chrome(2)
    y = H - 100
    c.setFont('Helvetica-Bold', 15); c.drawString(L, y, 'Budget'); y -= 24
    y = para(y, 'Spending stayed within the agreed budget for the third year running. The table shows the main service areas.')
    rows = [['Service', 'Budget (£k)', 'Spent (£k)', 'Change'],
            ['Libraries', '1,240', '1,198', '-3%'],
            ['Parks and playgrounds', '2,050', '2,210', '+8%'],
            ['Waste and recycling', '4,800', '4,655', '-3%'],
            ['Community grants', '600', '600', '0%']]
    cw = [170, 100, 100, 97]; rh = 22; tw = sum(cw); top = y
    c.setFillColorRGB(0.91, 0.93, 0.96); c.rect(L, top - rh, tw, rh, stroke=0, fill=1); c.setFillGray(0)
    for r, row in enumerate(rows):
        x = L
        for k, cell in enumerate(row):
            c.setFont('Helvetica-Bold' if r == 0 else 'Helvetica', 10)
            c.drawString(x + 6, top - r * rh - 15, cell); x += cw[k]
    c.setLineWidth(0.6)
    for r in range(len(rows) + 1):
        c.line(L, top - r * rh, L + tw, top - r * rh)
    x = L
    for k in range(len(cw) + 1):
        c.line(x, top, x, top - len(rows) * rh); x += cw[k] if k < len(cw) else 0
    y = top - len(rows) * rh - 30
    c.setFont('Helvetica-Bold', 15); c.drawString(L, y, 'Next year'); y -= 24
    y = para(y, 'In 2027 the council will focus on housing repairs, safer walking routes to school and a long-term plan for the river- side park, working closely with residents at every stage of the process.')
    c.save()
    return path


def newsletter():
    """Untagged one-page newsletter: embedded TrueType font, two columns, unruled table, image with caption."""
    pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    pdfmetrics.registerFont(TTFont('DejaVu-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
    path = os.path.join(OUT, 'two-column-newsletter.pdf')
    c = canvas.Canvas(path, pagesize=letter, pageCompression=1)
    W, H = letter
    M, G = 54, 24
    colw = (W - 2 * M - G) / 2
    c.setFont('DejaVu-Bold', 24); c.drawString(M, H - 80, 'Riverside Library News')
    c.setFont('DejaVu', 10); c.setFillGray(0.3); c.drawString(M, H - 98, 'Autumn 2026'); c.setFillGray(0)

    def col(x, y, blocks):
        for kind, text in blocks:
            if kind == 'h':
                y -= 6; c.setFont('DejaVu-Bold', 13); c.drawString(x, y, text); y -= 20; continue
            c.setFont('DejaVu', 9.5)
            words, line = text.split(), ''
            for w in words:
                cand = (line + ' ' + w).strip()
                if pdfmetrics.stringWidth(cand, 'DejaVu', 9.5) > colw:
                    c.drawString(x, y, line); y -= 13; line = w
                else:
                    line = cand
            if line:
                c.drawString(x, y, line); y -= 13
            y -= 8
        return y

    y0 = H - 130
    y = col(M, y0, [('h', 'New opening hours'),
                    ('p', 'From October the library opens every day of the week. Weekday hours are longer, and the study room stays open until nine in the evening during exam season.'),
                    ('p', 'The hours for each day are shown below.')])
    c.setFont('DejaVu-Bold', 9.5)
    xs = [M, M + 90, M + 170]
    for k, t in enumerate(['Day', 'Opens', 'Closes']):
        c.drawString(xs[k], y, t)
    y -= 15
    c.setFont('DejaVu', 9.5)
    for row in [['Monday', '9:00', '20:00'], ['Tuesday', '9:00', '20:00'], ['Wednesday', '9:00', '20:00'],
                ['Saturday', '10:00', '17:00'], ['Sunday', '12:00', '16:00']]:
        for k, t in enumerate(row):
            c.drawString(xs[k], y, t)
        y -= 14
    y -= 10
    col(M, y, [('h', 'Accessibility'),
               ('p', 'Step-free access is available at the side entrance. Large-print books, audio books and a reading magnifier are on the ground floor.')])
    x2 = M + colw + G
    y = col(x2, y0, [('h', 'Reading challenge'),
                     ('p', 'More than four hundred children took part in this year’s summer reading challenge. Every child who read six books received a medal and a certificate at the celebration event.')])
    c.drawImage(picture(500, 320, 30), x2, y - 140, colw, 140 * 1.0); y -= 152
    c.setFont('DejaVu', 8.5); c.setFillGray(0.3); c.drawString(x2, y, 'Medal winners at the celebration event.'); c.setFillGray(0); y -= 22
    col(x2, y, [('h', 'Volunteer with us'),
                ('p', 'We are looking for volunteers to help with homework clubs and digital skills sessions. Ask at the front desk for an application form.')])
    c.setFont('DejaVu', 8); c.setFillGray(0.35); c.drawCentredString(W / 2, 30, '1'); c.setFillGray(0)
    c.save()
    return path


if __name__ == '__main__':
    for p in (report(), newsletter()):
        print('wrote', os.path.relpath(p))
