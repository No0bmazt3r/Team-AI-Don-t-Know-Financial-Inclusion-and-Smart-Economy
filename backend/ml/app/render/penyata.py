"""Renders the rider's documents (FR-SLIP-2/3): the Loan pack (Penyata Pendapatan) and the Tax year summary.
HTML for the officer view and the verify page, PDF via fpdf2 (pure Python, so no system libraries). Both are drawn
from the same LABELS and figures, so an officer sees exactly what the PDF says. The figures arrive already computed by
the API; nothing here adds them up except the column totals shown on the page."""

import base64
import io
from datetime import date
from functools import cache
from pathlib import Path

import segno
from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES = Path(__file__).parent / "templates"
# A copy of frontend/public/logo.png, so the backend deploys on its own (`pnpm icons` updates both)
LOGO = Path(__file__).parent / "logo.png"
_env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=select_autoescape(["html"]))

LABELS = {
    "ms": {"title": "Penyata Pendapatan", "loan_for": "Untuk permohonan pinjaman", "period": "Tempoh",
           "generated": "Dijana", "name": "Nama", "month": "Bulan", "weeks": "Minggu", "net": "Pendapatan bersih",
           "gross": "Pendapatan kasar", "fees": "Caj platform", "avg": "Purata seminggu", "hours": "Jam online",
           "summary": "Ringkasan", "min": "Minggu terendah", "max": "Minggu tertinggi", "trend": "Arah aliran",
           "up": "Meningkat", "down": "Menurun", "flat": "Stabil", "platforms": "Platform", "source": "Sumber",
           "self": "Dilapor sendiri", "checked": "Disemak silang", "verified": "Disahkan", "total": "Jumlah",
           "legend": "Dilapor sendiri: daripada gambar skrin atau catatan penunggang. Disemak silang: dipadankan "
                     "dengan penyata bank atau e-dompet. Disahkan: data terus daripada platform.",
           "not_credit": "Ini bukan skor kredit. Coinvoy tidak memberi pinjaman dan tidak menilai kelayakan.",
           "disclaimer": "Angka berdasarkan data yang dikongsi oleh penunggang. Pemberi pinjaman membuat keputusan "
                         "sendiri.", "expires": "Pautan tamat", "weeks_logged": "minggu direkod",
           "contrib": "Caruman", "isaraan": "i-Saraan (KWSP) dibayar", "isaraan_match": "padanan kerajaan",
           "perkeso": "PERKESO (SKSPS)", "perkeso_deducted": "dipotong oleh platform",
           "perkeso_est": "anggaran, belum dipotong",
           "verify": "Semak dokumen ini", "verify_body": "Imbas kod QR atau buka {url} dan masukkan kod {code}. "
                     "Halaman itu menunjukkan angka asal dokumen ini. Kod sah selama 90 hari.",
           "code": "Kod semakan", "verified_banner": "Kod sah. Ini angka asal dokumen yang dijana pada {date}. "
                   "Bandingkan dengan PDF yang anda terima.", "valid_until": "Sah hingga",
           # Tax year
           "tax_title": "Ringkasan Pendapatan Tahunan {year}",
           "tax_for": "Rekod untuk membantu mengisi Borang B (pendapatan perniagaan)",
           "year": "Tahun taksiran (YA)", "recorded": "{n} daripada {of} minggu direkod",
           "income": "Pendapatan daripada platform", "fares": "Tambang dan bayaran penghantaran (kasar)",
           "extras": "Insentif dan tip", "receipts": "Jumlah penerimaan", "net_platform": "Bersih daripada platform",
           "costs": "Kos", "business": "Kemungkinan kos perniagaan", "asset": "Bayaran ansuran motor (aset)",
           "asset_note": "Motor ialah aset: ansuran biasanya bukan potongan terus, tetapi mungkin layak elaun "
                         "modal. Tanya ejen cukai atau LHDN.",
           "personal": "Kos peribadi (tidak dimasukkan)", "phone_note": "Telefon: jika juga untuk kegunaan "
                       "peribadi, tuntut bahagian kerja sahaja.",
           "after_costs": "Bersih selepas kemungkinan kos perniagaan",
           "after_costs_note": "Titik permulaan untuk Borang B, bukan pendapatan bercukai muktamad.",
           "costs_recorded": "Kos direkod dalam {n} minggu.", "no_costs": "Tiada kos direkod untuk tahun ini.",
           "relief": "Caruman (mungkin layak pelepasan cukai: semak had LHDN)",
           "not_tax": "Ini bukan borang cukai dan bukan nasihat cukai. Semak setiap angka di MyTax sebelum "
                      "memfailkan. Simpan resit selama 7 tahun.",
           "tax_disclaimer": "Angka berdasarkan data yang direkod oleh penunggang dalam Coinvoy. Minggu yang tidak "
                             "direkod tiada dalam jumlah ini."},
    "en": {"title": "Income Statement", "loan_for": "For a loan application", "period": "Period",
           "generated": "Generated", "name": "Name", "month": "Month", "weeks": "Weeks", "net": "Net earnings",
           "gross": "Gross earnings", "fees": "Platform fees", "avg": "Weekly average", "hours": "Hours online",
           "summary": "Summary", "min": "Lowest week", "max": "Highest week", "trend": "Trend", "up": "Rising",
           "down": "Falling", "flat": "Steady", "platforms": "Platforms", "source": "Source",
           "self": "Self-reported", "checked": "Cross-checked", "verified": "Verified", "total": "Total",
           "legend": "Self-reported: from the rider's screenshots or entries. Cross-checked: matched against a bank "
                     "or e-wallet statement. Verified: data directly from the platform.",
           "not_credit": "This is not a credit score. Coinvoy does not lend and does not assess eligibility.",
           "disclaimer": "Figures are based on data the rider shared. Lenders make their own decisions.",
           "expires": "Link expires", "weeks_logged": "weeks logged",
           "contrib": "Contributions", "isaraan": "i-Saraan (EPF) paid", "isaraan_match": "government match",
           "perkeso": "PERKESO (SKSPS)", "perkeso_deducted": "deducted by the platform",
           "perkeso_est": "estimate, not yet deducted",
           "verify": "Verify this document", "verify_body": "Scan the QR code or open {url} and enter the code "
                     "{code}. That page shows this document's original figures. The code is valid for 90 days.",
           "code": "Verify code", "verified_banner": "Valid code. These are the original figures of the document "
                   "generated on {date}. Compare them with the PDF you received.", "valid_until": "Valid until",
           "tax_title": "Yearly Income Summary {year}",
           "tax_for": "Records to help fill in Borang B (business income)",
           "year": "Year of assessment (YA)", "recorded": "{n} of {of} weeks recorded",
           "income": "Income from platforms", "fares": "Fares and delivery fees (gross)",
           "extras": "Incentives and tips", "receipts": "Total receipts", "net_platform": "Net from platforms",
           "costs": "Costs", "business": "Likely business costs", "asset": "Motorbike instalments (an asset)",
           "asset_note": "The bike is an asset: instalments usually aren't a direct deduction, but may qualify for "
                         "capital allowance. Ask a tax agent or LHDN.",
           "personal": "Personal costs (not included)", "phone_note": "Phone: if it's also for personal use, "
                       "claim only the work share.",
           "after_costs": "Net after likely business costs",
           "after_costs_note": "A starting point for Borang B, not the final taxable income.",
           "costs_recorded": "Costs recorded in {n} weeks.", "no_costs": "No costs recorded for this year.",
           "relief": "Contributions (may qualify for tax relief: check LHDN limits)",
           "not_tax": "This is not a tax return and not tax advice. Check every figure on MyTax before you file. "
                      "Keep receipts for 7 years.",
           "tax_disclaimer": "Figures are based on what the rider recorded in Coinvoy. Weeks not recorded are not "
                             "in these totals."},
}
MONTHS = {"ms": ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"],
          "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]}
CATEGORY = {
    "ms": {"minyak": "Minyak", "servis": "Servis motor", "telefon": "Telefon dan data", "parking": "Parkir",
           "tol": "Tol", "motor_tahunan": "Cukai jalan dan insurans", "ansuran": "Ansuran motor", "makan": "Makan",
           "sewa": "Sewa", "keluarga": "Keluarga", "lain": "Lain-lain"},
    "en": {"minyak": "Fuel", "servis": "Bike service", "telefon": "Phone and data", "parking": "Parking",
           "tol": "Toll", "motor_tahunan": "Road tax and insurance", "ansuran": "Bike instalment", "makan": "Food",
           "sewa": "Rent", "keluarga": "Family", "lain": "Other"},
}


def rm(sen: int) -> str:
    return f"RM{sen / 100:,.2f}"


@cache
def _logo() -> str:
    return "data:image/png;base64," + base64.b64encode(LOGO.read_bytes()).decode() if LOGO.exists() else ""


def _qr_png(url: str) -> bytes:
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="png", scale=8, border=2)
    return buf.getvalue()


def render_html(name: str, data: dict, lang: str, generated: date, expires: str | None = None, kind: str = "loan",
                code: str | None = None, verified: bool = False) -> str:
    template = "cukai.html" if kind == "tax" else "penyata.html"
    return _env.get_template(template).render(
        L=LABELS[lang], M=MONTHS[lang], C=CATEGORY[lang], d=data, rm=rm, name=name.split(" ")[0], lang=lang,
        generated=generated.isoformat(), expires=expires, logo=_logo(), code=code, verified=verified)


def _latin1(value: object) -> str:
    # Simple for now: the built-in PDF font only covers Latin letters, so Chinese or Tamil names print as "?".
    # Add a font file with pdf.add_font() when we need them.
    return str(value).replace("–", "-").replace("’", "'").encode("latin-1", "replace").decode("latin-1")


class _Doc:
    """The shared PDF pieces: header, tables, boxes, the verify block."""

    def __init__(self):
        from fpdf import FPDF

        self.pdf = pdf = FPDF(format="A4")
        pdf.set_margins(16, 18)
        pdf.set_auto_page_break(True, margin=18)
        pdf.add_page()
        pdf.set_text_color(29, 30, 29)
        pdf.set_draw_color(217, 220, 211)

    def text(self, value: object, size: float = 10, style: str = "", h: float = 5, grey: bool = False) -> None:
        self.pdf.set_text_color(*((91, 94, 87) if grey else (29, 30, 29)))
        self.pdf.set_font("helvetica", style, size)
        self.pdf.multi_cell(0, h, _latin1(value), new_x="LMARGIN", new_y="NEXT")
        self.pdf.set_text_color(29, 30, 29)

    def heading(self, value: str) -> None:
        self.pdf.ln(4)
        self.text(value, 12, "B", 7)

    def table(self, rows: list[list[str]], widths: tuple[int, ...], head: bool, bold_last: bool = False) -> None:
        from fpdf import FontFace

        pdf = self.pdf
        pdf.set_font("helvetica", "", 10)
        align = ("LEFT",) + ("RIGHT",) * (len(widths) - 1)
        heading = FontFace(emphasis="BOLD", color=(91, 94, 87), size_pt=9)
        with pdf.table(col_widths=widths, text_align=align, first_row_as_headings=head,
                       borders_layout="HORIZONTAL_LINES", line_height=6, headings_style=heading) as t:
            for i, row in enumerate(rows):
                style = FontFace(emphasis="BOLD") if bold_last and i == len(rows) - 1 else None
                t.row([_latin1(c) for c in row], style=style)

    def header(self, title: str, subtitle: str, meta: list[tuple[str, str]]) -> None:
        pdf = self.pdf
        if LOGO.exists():
            pdf.image(str(LOGO), x=16, y=18, w=12)
        pdf.set_x(31)
        pdf.set_font("helvetica", "B", 18)
        pdf.cell(0, 8, _latin1(title), new_x="LEFT", new_y="NEXT")
        pdf.set_font("helvetica", "", 9)
        pdf.cell(0, 5, _latin1(subtitle), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
        pdf.set_draw_color(29, 30, 29)
        pdf.line(16, pdf.get_y(), 194, pdf.get_y())
        pdf.set_draw_color(217, 220, 211)
        pdf.ln(3)
        self.table([[k, v] for k, v in meta], (1, 2), head=False)

    def boxed(self, value: str) -> None:
        pdf = self.pdf
        pdf.ln(3)
        pdf.set_draw_color(29, 30, 29)
        pdf.set_line_width(0.6)
        pdf.set_font("helvetica", "B", 10)
        pdf.multi_cell(0, 6, _latin1(value), border=1, padding=3, new_x="LMARGIN", new_y="NEXT")
        pdf.set_line_width(0.2)
        pdf.set_draw_color(217, 220, 211)
        pdf.ln(2)

    def verify(self, L: dict, code: str | None, url: str | None) -> None:
        if not code or not url:
            return
        pdf = self.pdf
        pdf.ln(3)
        y = pdf.get_y()
        pdf.set_fill_color(238, 240, 232)
        pdf.rect(16, y, 178, 30, style="F")
        pdf.set_fill_color(255, 255, 255)  # tables below use the current fill colour
        pdf.image(io.BytesIO(_qr_png(url)), x=19, y=y + 3, w=24)
        pdf.set_xy(47, y + 3)
        pdf.set_font("helvetica", "B", 11)
        pdf.cell(0, 6, _latin1(L["verify"]), new_x="LEFT", new_y="NEXT")
        pdf.set_font("courier", "B", 14)
        pdf.cell(0, 7, code, new_x="LEFT", new_y="NEXT")
        pdf.set_font("helvetica", "", 8.5)
        pdf.set_text_color(91, 94, 87)
        pdf.multi_cell(144, 4.2, _latin1(L["verify_body"].format(url=url.rsplit("/", 1)[0], code=code)),
                       new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(29, 30, 29)
        pdf.set_y(y + 31)

    def bytes(self) -> bytes:
        return bytes(self.pdf.output())


def _contrib_rows(L: dict, c: dict) -> list[list[str]]:
    perkeso = L["perkeso_deducted"] if c["perkeso_deducted"] else f"{rm(c['perkeso_sen'])} ({L['perkeso_est']})"
    return [[L["isaraan"], f"{rm(c['isaraan_sen'])} (+{rm(c['isaraan_match_sen'])} {L['isaraan_match']})"],
            [L["perkeso"], perkeso]]


def render_pdf(name: str, data: dict, lang: str, generated: date, kind: str = "loan", code: str | None = None,
               verify_url: str | None = None) -> bytes:
    return (_tax_pdf if kind == "tax" else _loan_pdf)(name, data, lang, generated, code, verify_url)


def _loan_pdf(name: str, d: dict, lang: str, generated: date, code: str | None, url: str | None) -> bytes:
    L, M = LABELS[lang], MONTHS[lang]
    doc = _Doc()
    meta = [(L["name"], name.split(" ")[0]), (L["period"], f"{d['from']} - {d['to']}"),
            (L["weeks"], f"{d['weeks']} {L['weeks_logged']}"), (L["generated"], generated.isoformat())]
    if code:
        meta.append((L["code"], code))
    doc.header(L["title"], f"Coinvoy - {L['loan_for']} - {L['source']}: {L[d['source']]}", meta)
    doc.verify(L, code, url)

    doc.heading(L["summary"])
    src = L[d["source"]]
    rows = [[L["avg"], rm(d["avg_sen"]), src], [L["min"], rm(d["min_sen"]), src], [L["max"], rm(d["max_sen"]), src],
            [L["trend"], L[d["trend"]], ""], [L["platforms"], ", ".join(d["platforms"]), ""]]
    if "totals" in d:
        t = d["totals"]
        rows[:0] = [[L["gross"], rm(t["gross_sen"]), src], [L["fees"], "-" + rm(t["fees_sen"]), src],
                    [L["net"], rm(t["net_sen"]), src]]
    doc.table(rows, (3, 2, 2), head=False)

    doc.heading(L["month"])
    has_gross = bool(d["monthly"]) and "gross_sen" in d["monthly"][0]
    head = ([L["month"], L["weeks"]] + ([L["gross"], L["fees"]] if has_gross else [])
            + [L["net"], L["hours"], L["source"]])
    body = [[f"{M[m['month'] - 1]} {m['year']}", str(m["weeks"])]
            + ([rm(m["gross_sen"]), rm(m["fees_sen"])] if has_gross else [])
            + [rm(m["net_sen"]), str(m["hours"]), L[m["source"]]] for m in d["monthly"]]
    doc.table([head] + body, (3, 2, 3, 3, 3, 2, 3) if has_gross else (3, 2, 3, 2, 3), head=True)

    if "contributions" in d:
        doc.heading(L["contrib"])
        doc.table(_contrib_rows(L, d["contributions"]), (1, 1), head=False)

    doc.pdf.ln(3)
    doc.text(L["legend"], 8.5, grey=True)
    doc.boxed(L["not_credit"])
    doc.text(L["disclaimer"], 8.5, grey=True)
    return doc.bytes()


def _tax_pdf(name: str, d: dict, lang: str, generated: date, code: str | None, url: str | None) -> bytes:
    L, M, C = LABELS[lang], MONTHS[lang], CATEGORY[lang]
    doc = _Doc()
    meta = [(L["name"], name.split(" ")[0]), (L["year"], str(d["year"])),
            (L["weeks"], L["recorded"].format(n=d["weeks"], of=d["weeks_possible"])),
            (L["platforms"], ", ".join(d["platforms"])), (L["generated"], generated.isoformat())]
    if code:
        meta.append((L["code"], code))
    doc.header(L["tax_title"].format(year=d["year"]), f"Coinvoy - {L['tax_for']} - {L['source']}: {L[d['source']]}",
               meta)
    doc.verify(L, code, url)
    doc.boxed(L["not_tax"])  # on page 1, whatever the length

    t = d["totals"]
    doc.heading(L["income"])
    doc.table([[L["fares"], rm(t["fares_sen"])], [L["extras"], rm(t["extras_sen"])],
               [L["receipts"], rm(t["receipts_sen"])], [L["fees"], "-" + rm(t["fees_sen"])],
               [L["net_platform"], rm(t["net_sen"])]], (3, 1), head=False, bold_last=True)

    doc.heading(L["month"])
    doc.table([[L["month"], L["weeks"], L["receipts"], L["fees"], L["net"], L["source"]]]
              + [[M[m["month"] - 1], str(m["weeks"]), rm(m["fares_sen"] + m["extras_sen"]), rm(m["fees_sen"]),
                  rm(m["net_sen"]), L[m["source"]]] for m in d["monthly"]]
              + [[L["total"], str(d["weeks"]), rm(t["receipts_sen"]), rm(t["fees_sen"]), rm(t["net_sen"]), ""]],
              (3, 2, 3, 3, 3, 3), head=True, bold_last=True)

    c = d["costs"]
    doc.heading(L["costs"])
    if c["business"]["items"] or c["asset"]["items"] or c["personal"]["items"]:
        doc.text(L["business"], 10, "B")
        doc.table([[C[i["category"]], rm(i["amount_sen"])] for i in c["business"]["items"]]
                  + [[L["total"], rm(c["business"]["total_sen"])]], (3, 1), head=False, bold_last=True)
        if any(i["category"] == "telefon" for i in c["business"]["items"]):
            doc.text(L["phone_note"], 8.5, grey=True)
        if c["asset"]["items"]:
            doc.pdf.ln(2)
            doc.table([[L["asset"], rm(c["asset"]["total_sen"])]], (3, 1), head=False)
            doc.text(L["asset_note"], 8.5, grey=True)
        if c["personal"]["items"]:
            doc.pdf.ln(2)
            doc.table([[L["personal"], rm(c["personal"]["total_sen"])]], (3, 1), head=False)
        doc.text(L["costs_recorded"].format(n=c["recorded_weeks"]), 8.5, grey=True)
    else:
        doc.text(L["no_costs"], 10, grey=True)

    doc.pdf.ln(2)
    doc.table([[L["after_costs"], rm(d["after_business_costs_sen"])]], (3, 1), head=False, bold_last=True)
    doc.text(L["after_costs_note"], 8.5, grey=True)

    doc.heading(L["relief"])
    doc.table(_contrib_rows(L, d["contributions"]), (1, 1), head=False)

    doc.pdf.ln(2)
    doc.text(L["legend"], 8.5, grey=True)
    doc.text(L["tax_disclaimer"], 8.5, grey=True)
    return doc.bytes()
