from datetime import datetime

from sqlmodel import Field, SQLModel


class Company(SQLModel, table=True):
    """A tenant. Every business record carries this company's id and is only
    ever read back through queries scoped to it.

    Beyond the name, a company carries the branding/identity printed on the
    documents it issues (invoices, POs, delivery notes, MO travelers): a logo,
    postal + contact details, an accent colour, and tax identity. All of these
    are optional — a brand-new tenant prints cleanly with just its name.
    """

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # --- Branding / document identity (all optional) ----------------------
    address: str = ""
    email: str = ""
    phone: str = ""
    website: str = ""
    logo: str = ""  # base64 image data-URL, rendered on document headers
    brand_color: str = "#0f766e"  # accent hex (defaults to the app's teal-700)
    gstin: str = ""  # seller tax id; when set, invoices are titled "Tax Invoice"
    gst_rate: float = 0.0  # default GST % applied on invoices (0 = no tax line)
    invoice_footer: str = ""  # free-text terms / thank-you note on the footer
