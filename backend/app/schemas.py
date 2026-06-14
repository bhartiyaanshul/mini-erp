import re

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.validation import validate_username, validate_photo, validate_strong_password
from app.models.enums import AccessLevel, ModuleName, PartnerType, ProcurementType


# --- Auth -----------------------------------------------------------------
class SignupRequestIn(BaseModel):
    """Step 1 of signup: full details, validated before an OTP is emailed."""

    company_name: str
    username: str
    email: EmailStr
    full_name: str = ""
    password: str
    photo: str | None = None

    @field_validator("company_name")
    @classmethod
    def _company(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Company name is required.")
        return v

    @field_validator("username")
    @classmethod
    def _login(cls, v: str) -> str:
        return validate_username(v)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return validate_strong_password(v)

    @field_validator("photo")
    @classmethod
    def _photo(cls, v: str | None) -> str:
        return validate_photo(v)


class OtpVerifyIn(BaseModel):
    email: EmailStr
    code: str


class ResendOtpIn(BaseModel):
    email: EmailStr


class LoginIn(BaseModel):
    identifier: str  # username or email
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    company_id: int
    company_name: str = ""
    is_system_admin: bool = False
    photo: str = ""
    access: dict[str, str] = {}  # module value -> level value


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SignupRequestOut(BaseModel):
    pending: bool = True
    email: EmailStr
    dev_otp: str | None = None  # only present when SMTP is not configured


# --- Users (System Administrator management) ------------------------------
class UserCreateIn(BaseModel):
    username: str
    email: EmailStr
    full_name: str = ""
    password: str
    is_system_admin: bool = False
    address: str = ""
    position: str = ""
    mobile_number: str = ""
    photo: str | None = None
    access: dict[ModuleName, AccessLevel] = {}

    @field_validator("username")
    @classmethod
    def _login(cls, v: str) -> str:
        return validate_username(v)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return validate_strong_password(v)

    @field_validator("photo")
    @classmethod
    def _photo(cls, v: str | None) -> str:
        return validate_photo(v)


class UserUpdateIn(BaseModel):
    full_name: str | None = None
    address: str | None = None
    mobile_number: str | None = None
    position: str | None = None  # admin only
    is_system_admin: bool | None = None  # admin only
    is_active: bool | None = None  # admin only
    photo: str | None = None

    @field_validator("photo")
    @classmethod
    def _photo(cls, v: str | None) -> str | None:
        return None if v is None else validate_photo(v)


class AccessUpdateIn(BaseModel):
    access: dict[ModuleName, AccessLevel]


class UserAdminOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    is_system_admin: bool
    address: str = ""
    position: str = ""
    mobile_number: str = ""
    photo: str = ""
    is_active: bool = True
    access: dict[str, str] = {}


class CompanyOut(BaseModel):
    id: int
    name: str
    address: str = ""
    email: str = ""
    phone: str = ""
    website: str = ""
    logo: str = ""
    brand_color: str = "#0f766e"
    gstin: str = ""
    gst_rate: float = 0.0
    invoice_footer: str = ""


class CompanyBrandingIn(BaseModel):
    """Owner-editable company identity. Every field is optional; a field left
    unset (None) is untouched, so the editor can patch one thing at a time."""

    name: str | None = None
    address: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    logo: str | None = None  # data-URL to set, "" to clear, None to leave as-is
    brand_color: str | None = None
    gstin: str | None = None
    gst_rate: float | None = None
    invoice_footer: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("Company name cannot be empty.")
        return v

    @field_validator("logo")
    @classmethod
    def _logo(cls, v: str | None) -> str | None:
        # None = leave unchanged; "" = clear; otherwise must be a valid image data-URL.
        return None if v is None else validate_photo(v)

    @field_validator("brand_color")
    @classmethod
    def _color(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            raise ValueError("Brand colour must be a hex value like #0f766e.")
        return v.lower()

    @field_validator("gst_rate")
    @classmethod
    def _rate(cls, v: float | None) -> float | None:
        if v is None:
            return None
        if not (0 <= v <= 100):
            raise ValueError("GST rate must be between 0 and 100.")
        return float(v)


class DocumentEmailIn(BaseModel):
    """Body for emailing a generated document PDF to a counterparty."""

    to: str | None = None  # override; defaults to the record's partner email
    message: str | None = None  # optional note prepended to the email body


# --- Partners -------------------------------------------------------------
class PartnerIn(BaseModel):
    name: str
    type: PartnerType = PartnerType.CUSTOMER
    email: str = ""
    phone: str = ""
    address: str = ""


# --- Products -------------------------------------------------------------
class ProductIn(BaseModel):
    name: str
    sku: str = ""
    sales_price: float = 0.0
    cost_price: float = 0.0
    uom: str = "Units"
    procure_on_demand: bool = False
    procurement_type: ProcurementType = ProcurementType.BUY
    default_vendor_id: int | None = None
    bom_id: int | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    sales_price: float | None = None
    cost_price: float | None = None
    uom: str | None = None
    procure_on_demand: bool | None = None
    procurement_type: ProcurementType | None = None
    default_vendor_id: int | None = None
    bom_id: int | None = None


class AdjustIn(BaseModel):
    product_id: int
    qty: float  # signed: positive = inbound, negative = outbound
    note: str = "Manual adjustment"


# --- BoM ------------------------------------------------------------------
class BoMLineIn(BaseModel):
    component_product_id: int
    qty: float = 1.0


class BoMOperationIn(BaseModel):
    name: str
    duration_mins: int = 0
    work_center: str = ""
    sequence: int = 1


class BoMIn(BaseModel):
    name: str
    product_id: int
    lines: list[BoMLineIn] = []
    operations: list[BoMOperationIn] = []


# --- Sales ----------------------------------------------------------------
class SaleLineIn(BaseModel):
    product_id: int
    qty: float = 1.0
    unit_price: float | None = None


class SaleOrderIn(BaseModel):
    partner_id: int
    lines: list[SaleLineIn]


# --- Purchase -------------------------------------------------------------
class PurchaseLineIn(BaseModel):
    product_id: int
    qty: float = 1.0
    unit_price: float | None = None


class PurchaseOrderIn(BaseModel):
    partner_id: int
    lines: list[PurchaseLineIn]


class ReceiveLineIn(BaseModel):
    line_id: int
    qty: float


class ReceiveIn(BaseModel):
    lines: list[ReceiveLineIn] | None = None  # None = receive everything outstanding


# --- Returns / RMA --------------------------------------------------------
class ReturnLineIn(BaseModel):
    sale_order_line_id: int
    qty: float = Field(gt=0)  # units coming back on this line
    qty_scrap: float = 0.0  # of which scrapped (0..qty); the remainder restocks


class ReturnIn(BaseModel):
    sale_order_id: int
    reason: str = ""
    lines: list[ReturnLineIn]


# --- Manufacturing --------------------------------------------------------
class MOIn(BaseModel):
    product_id: int
    qty: float = 1.0
    bom_id: int | None = None


# --- Forecast / predictive procurement ------------------------------------
class ForecastActIn(BaseModel):
    product_id: int
    qty: float = Field(gt=0)


# --- Assistant / Copilot --------------------------------------------------
class ChatMessageIn(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    messages: list[ChatMessageIn]


class AssistantActionIn(BaseModel):
    type: str
    args: dict = {}


class AssistantExecuteIn(BaseModel):
    action: AssistantActionIn


TokenOut.model_rebuild()
