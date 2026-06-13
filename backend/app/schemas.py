from pydantic import BaseModel, EmailStr, Field

from app.models.enums import PartnerType, ProcurementType, UserRole


# --- Auth -----------------------------------------------------------------
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)
    full_name: str = ""
    role: UserRole = UserRole.SALES


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole


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
