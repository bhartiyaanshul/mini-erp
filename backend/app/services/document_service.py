"""Branded PDF generation for the documents a business has to hand out:
Sale Order / Quotation, Tax Invoice, Delivery Note, Purchase Order and the
Manufacturing Order traveler.

Built on reportlab's Platypus (a pure-python wheel — no native toolchain, in
line with the project's no-Rust constraint). Each builder consumes the dicts our
existing serializers already produce (``sale_order_out``, ``purchase_order_out``,
``mo_out``), enriched by the documents router with the partner's postal details,
plus the company branding dict from ``company_out``.

Money is printed with an ``Rs.`` prefix and Indian digit grouping: the built-in
Helvetica font has no ``₹`` glyph and would render a tofu box, so the UI keeps
``₹`` while paper uses ``Rs.``.
"""

from __future__ import annotations

import base64
import io
import re
from datetime import datetime
from xml.sax.saxutils import escape as _xml_escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

PAGE = A4
MARGIN = 18 * mm
CONTENT_W = PAGE[0] - 2 * MARGIN
DEFAULT_ACCENT = "#0f766e"
INK = colors.HexColor("#0f172a")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748b")
HAIRLINE = colors.HexColor("#e2e8f0")
ZEBRA = colors.HexColor("#f8fafc")


# --------------------------------------------------------------------------- #
# Formatting helpers
# --------------------------------------------------------------------------- #
def _esc(value) -> str:
    """XML-escape a value for use inside a Platypus Paragraph (mini-HTML)."""
    return _xml_escape("" if value is None else str(value))


def _inr(value) -> str:
    """Indian-grouped money with an ``Rs.`` prefix (e.g. ``Rs. 1,23,456.00``)."""
    n = float(value or 0)
    sign = "-" if n < 0 else ""
    intpart, dec = f"{abs(n):.2f}".split(".")
    if len(intpart) > 3:
        last3, rest = intpart[-3:], intpart[:-3]
        rest = re.sub(r"(?<=\d)(?=(\d\d)+$)", ",", rest)
        intpart = f"{rest},{last3}"
    return f"{sign}Rs. {intpart}.{dec}"


def _qty(value) -> str:
    """Trim trailing zeros: ``3.0`` -> ``3``, ``2.50`` -> ``2.5``."""
    n = float(value or 0)
    if n == int(n):
        return str(int(n))
    return f"{n:.2f}".rstrip("0").rstrip(".")


def _rate_str(value) -> str:
    n = float(value or 0)
    return str(int(n)) if n == int(n) else f"{n:g}"


def _fmt_date(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d %b %Y")
    except ValueError:
        return str(iso)


def _titleize(value) -> str:
    return str(value or "").replace("_", " ").title()


def _accent(company: dict) -> colors.Color:
    raw = (company.get("brand_color") or DEFAULT_ACCENT).strip()
    try:
        return colors.HexColor(raw)
    except (ValueError, TypeError):
        return colors.HexColor(DEFAULT_ACCENT)


# --------------------------------------------------------------------------- #
# Styles
# --------------------------------------------------------------------------- #
def _styles(accent: colors.Color) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()["Normal"]

    def mk(name, **kw):
        return ParagraphStyle(name, parent=base, **kw)

    return {
        "BrandName": mk("BrandName", fontName="Helvetica-Bold", fontSize=15, textColor=INK, leading=18),
        "DocTitle": mk("DocTitle", fontName="Helvetica-Bold", fontSize=18, textColor=accent, alignment=TA_RIGHT, leading=21),
        "MetaRight": mk("MetaRight", fontSize=9, alignment=TA_RIGHT, textColor=SLATE, leading=13),
        "Small": mk("Small", fontSize=8.5, textColor=MUTED, leading=12),
        "Body": mk("Body", fontSize=9.5, textColor=SLATE, leading=13),
        "PartyLabel": mk("PartyLabel", fontName="Helvetica-Bold", fontSize=8, textColor=accent, leading=12, spaceAfter=2),
        "ThL": mk("ThL", fontName="Helvetica-Bold", fontSize=9, textColor=colors.white, alignment=TA_LEFT),
        "ThR": mk("ThR", fontName="Helvetica-Bold", fontSize=9, textColor=colors.white, alignment=TA_RIGHT),
        "CellL": mk("CellL", fontSize=9, textColor=SLATE, alignment=TA_LEFT, leading=12),
        "CellR": mk("CellR", fontSize=9, textColor=SLATE, alignment=TA_RIGHT, leading=12),
        "H2": mk("H2", fontName="Helvetica-Bold", fontSize=11, textColor=INK, spaceBefore=8, spaceAfter=5),
        "Note": mk("Note", fontSize=8.5, textColor=MUTED, leading=12),
    }


# --------------------------------------------------------------------------- #
# Shared flowable builders
# --------------------------------------------------------------------------- #
def _logo_flowable(company: dict, max_h=16 * mm, max_w=55 * mm):
    """An Image flowable from the company's base64 logo, scaled to fit a box
    while preserving aspect. Returns None (caller falls back to the wordmark)
    on any decode/format problem."""
    data = company.get("logo") or ""
    if not isinstance(data, str) or not data.startswith("data:image"):
        return None
    try:
        raw = base64.b64decode(data.split(",", 1)[1])
        from PIL import Image as PILImage

        with PILImage.open(io.BytesIO(raw)) as im:
            iw, ih = im.size
        if not iw or not ih:
            return None
        ratio = iw / ih
        h, w = max_h, max_h * ratio
        if w > max_w:
            w, h = max_w, max_w / ratio
        return Image(io.BytesIO(raw), width=w, height=h)
    except Exception:  # noqa: BLE001 — any bad image degrades to the wordmark
        return None


def _seller_block(company: dict, st: dict) -> list:
    bits = []
    logo = _logo_flowable(company)
    if logo:
        bits += [logo, Spacer(1, 4)]
    bits.append(Paragraph(_esc(company.get("name") or "Company"), st["BrandName"]))
    if company.get("address"):
        bits.append(Paragraph(_esc(company["address"]).replace("\n", "<br/>"), st["Small"]))
    contact = " · ".join(p for p in (company.get("phone"), company.get("email"), company.get("website")) if p)
    if contact:
        bits.append(Paragraph(_esc(contact), st["Small"]))
    if company.get("gstin"):
        bits.append(Paragraph(f"GSTIN: {_esc(company['gstin'])}", st["Small"]))
    return bits


def _header(company: dict, title: str, meta_pairs: list[tuple[str, str]], st: dict, accent) -> list:
    """Branded masthead: seller identity (logo/wordmark + contact) on the left,
    document title + metadata on the right, closed by an accent rule."""
    right = [Paragraph(_esc(title).upper(), st["DocTitle"]), Spacer(1, 4)]
    for label, value in meta_pairs:
        right.append(
            Paragraph(f'<font color="#64748b">{_esc(label)}</font>&nbsp;&nbsp;<b>{_esc(value)}</b>', st["MetaRight"])
        )
    head = Table([[_seller_block(company, st), right]], colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45])
    head.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [head, Spacer(1, 8), HRFlowable(width="100%", thickness=2, color=accent, spaceAfter=12)]


def _parties(blocks: list[tuple[str, list[str]]], st: dict) -> list:
    """One or more party columns (e.g. 'Bill To'). Empty lines are dropped, but
    the heading + name always show."""
    cells = []
    for heading, lines in blocks:
        col = [Paragraph(_esc(heading).upper(), st["PartyLabel"])]
        shown = [ln for ln in lines if ln]
        for ln in shown or ["—"]:
            col.append(Paragraph(_esc(ln).replace("\n", "<br/>"), st["Body"]))
        cells.append(col)
    n = len(cells)
    widths = [CONTENT_W * 0.6] if n == 1 else [CONTENT_W / n] * n
    t = Table([cells], colWidths=widths)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [t, Spacer(1, 14)]


def _line_table(columns: list[dict], rows: list[list], st: dict, accent) -> Table:
    """A styled line-items table. ``columns`` is a list of
    ``{label, align('L'|'R'), width(fraction)}``; ``rows`` are pre-formatted
    strings. Header row uses the accent colour; body rows zebra-stripe."""
    col_w = [CONTENT_W * c["width"] for c in columns]
    header = [Paragraph(_esc(c["label"]), st["ThR" if c["align"] == "R" else "ThL"]) for c in columns]
    data = [header]
    for r in rows:
        data.append([Paragraph(_esc(v), st["CellR" if c["align"] == "R" else "CellL"]) for v, c in zip(r, columns)])
    t = Table(data, colWidths=col_w, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), accent),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, HAIRLINE),
    ]
    for i in range(2, len(data), 2):  # zebra-stripe alternate body rows
        style.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    t.setStyle(TableStyle(style))
    return t


def _totals(pairs: list[tuple], st: dict, accent) -> Table:
    """Right-aligned totals stack. Each pair is ``(label, value)`` or
    ``(label, value, emphasize)``."""
    data = []
    for p in pairs:
        label, value = p[0], p[1]
        emph = len(p) > 2 and p[2]
        lab = Paragraph(f"<b>{_esc(label)}</b>" if emph else _esc(label), st["CellR"])
        val = Paragraph(f"<b>{_esc(value)}</b>" if emph else _esc(value), st["CellR"])
        data.append([lab, val])
    t = Table(data, colWidths=[CONTENT_W * 0.26, CONTENT_W * 0.20])
    t.hAlign = "RIGHT"
    style = [
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEABOVE", (0, len(data) - 1), (-1, len(data) - 1), 1, accent),
    ]
    t.setStyle(TableStyle(style))
    return t


def _footer(company: dict):
    note = (company.get("invoice_footer") or "").strip()

    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        y = 12 * mm
        if note:
            canvas.drawCentredString(PAGE[0] / 2, y + 11, note[:180])
        stamp = "Generated by Mini ERP · " + datetime.utcnow().strftime("%d %b %Y %H:%M UTC")
        canvas.drawCentredString(PAGE[0] / 2, y, stamp)
        canvas.drawRightString(PAGE[0] - MARGIN, y, f"Page {doc.page}")
        canvas.restoreState()

    return draw


def _render(title: str, story: list, company: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=PAGE, title=title,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=16 * mm, bottomMargin=22 * mm,
    )
    footer = _footer(company)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def _party_lines(rec: dict) -> list[str]:
    """Counterparty address block from an enriched serializer dict."""
    return [
        rec.get("partner_name") or "—",
        rec.get("partner_address") or "",
        " · ".join(p for p in (rec.get("partner_phone"), rec.get("partner_email")) if p),
    ]


# Priced product columns, shared by Sale Order / Invoice / Purchase Order.
_PRICED_COLS = [
    {"label": "Product", "align": "L", "width": 0.46},
    {"label": "Qty", "align": "R", "width": 0.14},
    {"label": "Unit Price", "align": "R", "width": 0.20},
    {"label": "Amount", "align": "R", "width": 0.20},
]


# --------------------------------------------------------------------------- #
# Document builders — each returns PDF bytes
# --------------------------------------------------------------------------- #
def build_sale_order_pdf(company: dict, so: dict) -> bytes:
    accent = _accent(company)
    st = _styles(accent)
    draft = so.get("state") == "draft"
    title = "Quotation" if draft else "Sale Order"
    meta = [("Order No.", so.get("name") or "—"), ("Date", _fmt_date(so.get("order_date")))]
    if so.get("promise_date"):
        meta.append(("Promised", _fmt_date(so.get("promise_date"))))
    meta.append(("Status", _titleize(so.get("state"))))

    story = _header(company, title, meta, st, accent)
    story += _parties([("Customer", _party_lines(so))], st)
    rows = [[ln["product_name"], _qty(ln["qty"]), _inr(ln["unit_price"]), _inr(ln["subtotal"])] for ln in so.get("lines", [])]
    story.append(_line_table(_PRICED_COLS, rows, st, accent))
    story.append(Spacer(1, 12))
    story.append(_totals([("Total", _inr(so.get("total", 0)), True)], st, accent))
    if draft:
        story += [Spacer(1, 16), Paragraph("This is a quotation, not a confirmed order. Prices valid for 30 days.", st["Note"])]
    return _render(f"{so.get('name')}-{title}", story, company)


def build_invoice_pdf(company: dict, so: dict) -> bytes:
    accent = _accent(company)
    st = _styles(accent)
    taxed = bool(company.get("gstin"))
    title = "Tax Invoice" if taxed else "Invoice"
    inv_no = re.sub(r"^SO", "INV", so.get("name") or "INV")
    meta = [
        ("Invoice No.", inv_no),
        ("Invoice Date", _fmt_date(so.get("order_date"))),
        ("Order Ref", so.get("name") or "—"),
    ]
    story = _header(company, title, meta, st, accent)
    story += _parties([("Bill To", _party_lines(so))], st)
    rows = [[ln["product_name"], _qty(ln["qty"]), _inr(ln["unit_price"]), _inr(ln["subtotal"])] for ln in so.get("lines", [])]
    story.append(_line_table(_PRICED_COLS, rows, st, accent))

    subtotal = float(so.get("total", 0) or 0)
    rate = float(company.get("gst_rate") or 0)
    totals = [("Subtotal", _inr(subtotal))]
    grand = subtotal
    if rate > 0:
        tax = round(subtotal * rate / 100, 2)
        grand = round(subtotal + tax, 2)
        totals.append((f"GST @ {_rate_str(rate)}%", _inr(tax)))
    totals.append(("Total", _inr(grand), True))
    story.append(Spacer(1, 12))
    story.append(_totals(totals, st, accent))
    story += [Spacer(1, 16), Paragraph("Thank you for your business.", st["Note"])]
    return _render(f"{inv_no}-{title}", story, company)


def build_delivery_note_pdf(company: dict, so: dict) -> bytes:
    accent = _accent(company)
    st = _styles(accent)
    meta = [
        ("Reference", so.get("name") or "—"),
        ("Date", _fmt_date(so.get("order_date"))),
        ("Status", _titleize(so.get("state"))),
    ]
    story = _header(company, "Delivery Note", meta, st, accent)
    story += _parties([("Ship To", _party_lines(so))], st)
    cols = [
        {"label": "Product", "align": "L", "width": 0.56},
        {"label": "Ordered", "align": "R", "width": 0.22},
        {"label": "Delivered", "align": "R", "width": 0.22},
    ]
    rows = [[ln["product_name"], _qty(ln["qty"]), _qty(ln.get("qty_delivered", 0))] for ln in so.get("lines", [])]
    story.append(_line_table(cols, rows, st, accent))
    story += [
        Spacer(1, 26),
        Paragraph("Received the above goods in good condition:", st["Note"]),
        Spacer(1, 18),
        Paragraph("Name &amp; Signature: ______________________________     Date: ______________", st["Body"]),
    ]
    return _render(f"{so.get('name')}-Delivery-Note", story, company)


def build_purchase_order_pdf(company: dict, po: dict) -> bytes:
    accent = _accent(company)
    st = _styles(accent)
    meta = [("PO No.", po.get("name") or "—"), ("Date", _fmt_date(po.get("order_date")))]
    if po.get("expected_receipt_date"):
        meta.append(("Expected", _fmt_date(po.get("expected_receipt_date"))))
    meta.append(("Status", _titleize(po.get("state"))))
    if po.get("origin"):
        meta.append(("Origin", po["origin"]))

    story = _header(company, "Purchase Order", meta, st, accent)
    story += _parties([("Vendor", _party_lines(po))], st)
    rows = [[ln["product_name"], _qty(ln["qty"]), _inr(ln["unit_price"]), _inr(ln["subtotal"])] for ln in po.get("lines", [])]
    story.append(_line_table(_PRICED_COLS, rows, st, accent))
    story.append(Spacer(1, 12))
    story.append(_totals([("Total", _inr(po.get("total", 0)), True)], st, accent))
    story += [Spacer(1, 16), Paragraph("Please confirm receipt and advise the expected dispatch date.", st["Note"])]
    return _render(f"{po.get('name')}-Purchase-Order", story, company)


def build_mo_traveler_pdf(company: dict, mo: dict) -> bytes:
    accent = _accent(company)
    st = _styles(accent)
    meta = [
        ("MO No.", mo.get("name") or "—"),
        ("Product", mo.get("product_name") or "—"),
        ("Quantity", _qty(mo.get("qty", 0))),
        ("Status", _titleize(mo.get("state"))),
    ]
    if mo.get("origin"):
        meta.append(("Origin", mo["origin"]))
    if mo.get("planned_start"):
        meta.append(("Planned start", _fmt_date(mo.get("planned_start"))))
    if mo.get("planned_finish"):
        meta.append(("Planned finish", _fmt_date(mo.get("planned_finish"))))

    story = _header(company, "Manufacturing Order — Traveler", meta, st, accent)

    # Components (BoM explosion)
    story.append(Paragraph("Components", st["H2"]))
    comp_cols = [
        {"label": "Component", "align": "L", "width": 0.46},
        {"label": "Per Unit", "align": "R", "width": 0.18},
        {"label": "Required", "align": "R", "width": 0.18},
        {"label": "Free to Use", "align": "R", "width": 0.18},
    ]
    comp_rows = [
        [c["component_name"], _qty(c["qty_per_unit"]), _qty(c["qty_required"]), _qty(c["free_to_use"])]
        for c in mo.get("components", [])
    ]
    if comp_rows:
        story.append(_line_table(comp_cols, comp_rows, st, accent))
    else:
        story.append(Paragraph("No bill of materials linked to this order.", st["Note"]))

    # Work orders with blank sign-off columns for the shop floor
    work_orders = mo.get("work_orders", [])
    if work_orders:
        story.append(Paragraph("Work Orders", st["H2"]))
        wo_cols = [
            {"label": "#", "align": "L", "width": 0.06},
            {"label": "Operation", "align": "L", "width": 0.30},
            {"label": "Work Center", "align": "L", "width": 0.20},
            {"label": "Mins", "align": "R", "width": 0.10},
            {"label": "Operator", "align": "L", "width": 0.18},
            {"label": "QC", "align": "L", "width": 0.16},
        ]
        wo_rows = [
            [str(wo.get("sequence", "")), wo.get("operation_name", ""), wo.get("work_center", "") or "—",
             str(wo.get("duration_mins", 0)), "", ""]
            for wo in work_orders
        ]
        story.append(_line_table(wo_cols, wo_rows, st, accent))
        story += [Spacer(1, 16), Paragraph("Operator and QC columns are for shop-floor sign-off.", st["Note"])]

    return _render(f"{mo.get('name')}-MO-Traveler", story, company)
