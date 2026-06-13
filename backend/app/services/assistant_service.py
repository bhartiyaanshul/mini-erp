"""ERP Copilot: a natural-language assistant powered by Groq tool-calling.

The LLM can read freely (read tools auto-execute) but can never mutate. To
change anything it calls a `propose_*` tool that only validates and previews; the
real write happens later in `execute()` via the existing services, after the user
clicks Confirm in the UI. Numbers always come from the ledger/services; the model
is instructed never to invent them.
"""

import inspect
import json
import logging
import re

from sqlmodel import Session, desc, select

from app.core.config import settings
from app.core.deps import has_access
from app.models import ManufacturingOrder, Partner, Product, PurchaseOrder, SaleOrder, SaleOrderLine, User
from app.models.enums import ModuleName, PartnerType
from app.events.bus import emit
from app.serializers import (
    mo_out,
    partner_out,
    products_list_out,
    purchase_order_out,
    sale_order_out,
)
from app.services import (
    audit_service,
    dashboard_service,
    forecast_service,
    inventory_service,
    manufacturing_service,
    procurement_service,
    purchase_service,
    sales_service,
)
from app.services.common import next_seq_name

logger = logging.getLogger(__name__)

MAX_STEPS = 5  # tool-call loop iterations before forcing a final answer


class AssistantError(Exception):
    """Base for assistant failures the router maps to HTTP codes."""


class PermissionDenied(AssistantError):
    """Caller's role may not perform this action -> 403."""


class BadAction(AssistantError):
    """Malformed/unresolvable action -> 400."""


# --------------------------------------------------------------------------- #
# Role helpers + name resolution
# --------------------------------------------------------------------------- #

def _can_act(session: Session, user: User, atype: str | None) -> bool:
    """Whether the user may take a mutating action (the only gate that matters;
    reads are open). Mirrors the per-module access model used by the routers."""
    if atype is None:
        return True  # read tool
    if atype == "sale_order":
        return has_access(session, user, ModuleName.SALES, "create")
    if atype == "purchase_order":
        return has_access(session, user, ModuleName.PURCHASE, "create")
    if atype == "manufacturing_order":
        return has_access(session, user, ModuleName.MANUFACTURING, "create")
    if atype == "forecast_action":
        return has_access(session, user, ModuleName.PURCHASE, "approve") or has_access(
            session, user, ModuleName.MANUFACTURING, "approve"
        )
    return False


def _resolve_product(session: Session, user: User, ref) -> Product:
    if isinstance(ref, int) or (isinstance(ref, str) and ref.isdigit()):
        p = session.get(Product, int(ref))
        if p and p.company_id == user.company_id:
            return p
        raise BadAction(f"No product with id {ref}")
    q = str(ref).strip().lower()
    products = list(session.exec(select(Product).where(Product.company_id == user.company_id)).all())
    exact = [p for p in products if p.name.lower() == q or p.sku.lower() == q]
    if exact:
        return exact[0]
    matches = [p for p in products if q in p.name.lower() or q in p.sku.lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise BadAction(f"'{ref}' matches multiple products: {', '.join(p.name for p in matches)}. Be more specific.")
    raise BadAction(f"No product matching '{ref}'.")


def _resolve_partner(session: Session, user: User, ref, *, want: PartnerType | None = None) -> Partner:
    if isinstance(ref, int) or (isinstance(ref, str) and ref.isdigit()):
        p = session.get(Partner, int(ref))
        if p and p.company_id == user.company_id:
            return p
        raise BadAction(f"No partner with id {ref}")
    q = str(ref).strip().lower()
    partners = list(session.exec(select(Partner).where(Partner.company_id == user.company_id)).all())

    def ok(p: Partner) -> bool:
        if want is None:
            return True
        return p.type == want or p.type == PartnerType.BOTH

    pool = [p for p in partners if ok(p)]
    exact = [p for p in pool if p.name.lower() == q]
    if exact:
        return exact[0]
    matches = [p for p in pool if q in p.name.lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise BadAction(f"'{ref}' matches multiple partners: {', '.join(p.name for p in matches)}. Be more specific.")
    raise BadAction(f"No {'partner' if want is None else want.value} matching '{ref}'.")


# --------------------------------------------------------------------------- #
# Read tool handlers (auto-execute; never mutate)
# --------------------------------------------------------------------------- #

def _t_list_products(session, user, query=None):
    products = list(session.exec(select(Product).where(Product.company_id == user.company_id)).all())
    if query:
        q = query.lower()
        products = [p for p in products if q in p.name.lower() or q in p.sku.lower()]
    return products_list_out(session, products)


def _t_get_availability(session, user, product):
    p = _resolve_product(session, user, product)
    avail = inventory_service.get_availability(session, p.id)
    return {"product": p.name, "sku": p.sku, "sales_price": p.sales_price, **avail}


def _t_dashboard_metrics(session, user):
    return dashboard_service.get_metrics(session, user.company_id)


def _t_low_stock(session, user, threshold=10.0):
    return dashboard_service.low_stock(session, user.company_id, threshold)


def _t_demand_forecast(session, user):
    # Compact shape: small models summarise this far better than the full rows.
    return [
        {
            "product": r["name"],
            "urgency": r["urgency"],
            "days_of_cover": r["days_of_cover"],
            "suggested_qty": r["suggested_qty"],
            "strategy": r["strategy"],
        }
        for r in forecast_service.forecast_all(session, user.company_id)
    ]


def _t_list_sales_orders(session, user, state=None):
    rows = session.exec(
        select(SaleOrder).where(SaleOrder.company_id == user.company_id).order_by(desc(SaleOrder.id)).limit(20)
    ).all()
    out = [sale_order_out(session, so) for so in rows]
    return [o for o in out if not state or o["state"] == state]


def _t_list_purchase_orders(session, user, state=None):
    rows = session.exec(
        select(PurchaseOrder).where(PurchaseOrder.company_id == user.company_id).order_by(desc(PurchaseOrder.id)).limit(20)
    ).all()
    out = [purchase_order_out(session, po) for po in rows]
    return [o for o in out if not state or o["state"] == state]


def _t_list_manufacturing_orders(session, user, state=None):
    rows = session.exec(
        select(ManufacturingOrder)
        .where(ManufacturingOrder.company_id == user.company_id)
        .order_by(desc(ManufacturingOrder.id))
        .limit(20)
    ).all()
    out = [mo_out(session, mo) for mo in rows]
    return [o for o in out if not state or o["state"] == state]


def _t_list_partners(session, user, type=None):
    partners = list(session.exec(select(Partner).where(Partner.company_id == user.company_id)).all())
    if type:
        partners = [p for p in partners if p.type.value == type or p.type == PartnerType.BOTH]
    return [partner_out(p) for p in partners]


# --------------------------------------------------------------------------- #
# Propose tool handlers (validate + preview only; append to pending_actions)
# --------------------------------------------------------------------------- #

def _price(p: Product) -> float:
    return p.sales_price


def _propose_sale_order(session, user, customer, items, confirm=False):
    partner = _resolve_partner(session, user, customer, want=PartnerType.CUSTOMER)
    lines, total = [], 0.0
    for it in items:
        p = _resolve_product(session, user, it["product"])
        qty = float(it.get("qty", 1))
        unit_price = p.sales_price  # from the product master, never model-supplied
        total += qty * unit_price
        lines.append({"product_id": p.id, "product_name": p.name, "qty": qty, "unit_price": unit_price})
    preview = {
        "title": f"Sale Order for {partner.name}",
        "lines": [f"{l['qty']:g} × {l['product_name']} @ ₹{l['unit_price']:g}" for l in lines],
        "total": round(total, 2),
        "confirm": bool(confirm),
        "note": "Will be confirmed (may trigger procurement)." if confirm else "Created as draft.",
    }
    action = {
        "type": "sale_order",
        "args": {
            "partner_id": partner.id,
            "lines": [{"product_id": l["product_id"], "qty": l["qty"], "unit_price": l["unit_price"]} for l in lines],
            "confirm": bool(confirm),
        },
        "preview": preview,
    }
    return action


def _propose_purchase_order(session, user, vendor, items):
    partner = _resolve_partner(session, user, vendor, want=PartnerType.VENDOR)
    lines, total = [], 0.0
    for it in items:
        p = _resolve_product(session, user, it["product"])
        qty = float(it.get("qty", 1))
        unit_price = p.cost_price  # from the product master, never model-supplied
        total += qty * unit_price
        lines.append({"product_id": p.id, "product_name": p.name, "qty": qty, "unit_price": unit_price})
    preview = {
        "title": f"Purchase Order to {partner.name}",
        "lines": [f"{l['qty']:g} × {l['product_name']} @ ₹{l['unit_price']:g}" for l in lines],
        "total": round(total, 2),
        "note": "Will be created and confirmed.",
    }
    action = {
        "type": "purchase_order",
        "args": {
            "vendor_id": partner.id,
            "lines": [{"product_id": l["product_id"], "qty": l["qty"], "unit_price": l["unit_price"]} for l in lines],
        },
        "preview": preview,
    }
    return action


def _propose_manufacturing_order(session, user, product, qty):
    p = _resolve_product(session, user, product)
    if not p.bom_id:
        raise BadAction(f"{p.name} has no Bill of Materials, so it can't be manufactured.")
    qty = float(qty)
    preview = {
        "title": f"Manufacturing Order: {qty:g} × {p.name}",
        "lines": [f"{qty:g} × {p.name}"],
        "note": "Will be created and confirmed (reserves components).",
    }
    return {"type": "manufacturing_order", "args": {"product_id": p.id, "qty": qty}, "preview": preview}


def _propose_forecast_action(session, user, product, qty=None):
    p = _resolve_product(session, user, product)
    if qty is None:
        rows = forecast_service.forecast_all(session, user.company_id)
        row = next((r for r in rows if r["product_id"] == p.id), None)
        qty = row["suggested_qty"] if row else 0
    qty = float(qty)
    if qty <= 0:
        raise BadAction(f"No replenishment needed for {p.name} (suggested quantity is 0).")
    verb = "Manufacture" if p.procurement_type.value == "manufacture" else "Buy"
    preview = {
        "title": f"Replenish {p.name}",
        "lines": [f"{verb} {qty:g} {p.uom}"],
        "note": "Creates the recommended Manufacturing/Purchase Order.",
    }
    return {"type": "forecast_action", "args": {"product_id": p.id, "qty": qty}, "preview": preview}


# --------------------------------------------------------------------------- #
# Tool registry
# --------------------------------------------------------------------------- #

TOOLS = [
    {
        "name": "list_products", "kind": "read", "act": None, "handler": _t_list_products,
        "description": "List products with prices and live on-hand / reserved / free-to-use stock. Optional 'query' filters by name or SKU.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
    },
    {
        "name": "get_availability", "kind": "read", "act": None, "handler": _t_get_availability,
        "description": "Get on-hand, reserved and free-to-use stock for one product (by name, SKU or id).",
        "parameters": {"type": "object", "properties": {"product": {"type": "string"}}, "required": ["product"]},
    },
    {
        "name": "dashboard_metrics", "kind": "read", "act": None, "handler": _t_dashboard_metrics,
        "description": "Operational counters: sales/purchase/manufacturing order totals, pending deliveries, delayed orders, open MOs/POs.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "low_stock", "kind": "read", "act": None, "handler": _t_low_stock,
        "description": "Products whose free-to-use stock is at or below a threshold (default 10).",
        "parameters": {"type": "object", "properties": {"threshold": {"type": "number"}}},
    },
    {
        "name": "demand_forecast", "kind": "read", "act": None, "handler": _t_demand_forecast,
        "description": "Predictive procurement: per-product average daily usage, days of cover, projected stockout date, suggested reorder quantity, urgency and strategy (buy/manufacture).",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "list_sales_orders", "kind": "read", "act": None, "handler": _t_list_sales_orders,
        "description": "Recent sale orders with lines, totals and state. Optional 'state' filter (draft, confirmed, partially_delivered, fully_delivered, cancelled).",
        "parameters": {"type": "object", "properties": {"state": {"type": "string"}}},
    },
    {
        "name": "list_purchase_orders", "kind": "read", "act": None, "handler": _t_list_purchase_orders,
        "description": "Recent purchase orders with lines, totals and state. Optional 'state' filter.",
        "parameters": {"type": "object", "properties": {"state": {"type": "string"}}},
    },
    {
        "name": "list_manufacturing_orders", "kind": "read", "act": None, "handler": _t_list_manufacturing_orders,
        "description": "Recent manufacturing orders with components and work orders. Optional 'state' filter.",
        "parameters": {"type": "object", "properties": {"state": {"type": "string"}}},
    },
    {
        "name": "list_partners", "kind": "read", "act": None, "handler": _t_list_partners,
        "description": "List customers/vendors. Optional 'type' filter ('customer' or 'vendor').",
        "parameters": {"type": "object", "properties": {"type": {"type": "string", "enum": ["customer", "vendor"]}}},
    },
    {
        "name": "propose_sale_order", "kind": "propose", "act": "sale_order", "handler": _propose_sale_order,
        "description": "Draft a sale order for the user to confirm. Set confirm=true to also confirm it (reserves stock and may trigger automatic procurement). Does NOT execute until the user confirms.",
        "parameters": {
            "type": "object",
            "properties": {
                "customer": {"type": "string", "description": "Customer name or id"},
                "items": {"type": "array", "items": {"type": "object", "properties": {
                    "product": {"type": "string"}, "qty": {"type": "number"}},
                    "required": ["product", "qty"]}},
                "confirm": {"type": "boolean"},
            },
            "required": ["customer", "items"],
        },
    },
    {
        "name": "propose_purchase_order", "kind": "propose", "act": "purchase_order", "handler": _propose_purchase_order,
        "description": "Draft a purchase order to a vendor for the user to confirm. Does NOT execute until the user confirms.",
        "parameters": {
            "type": "object",
            "properties": {
                "vendor": {"type": "string", "description": "Vendor name or id"},
                "items": {"type": "array", "items": {"type": "object", "properties": {
                    "product": {"type": "string"}, "qty": {"type": "number"}},
                    "required": ["product", "qty"]}},
            },
            "required": ["vendor", "items"],
        },
    },
    {
        "name": "propose_manufacturing_order", "kind": "propose", "act": "manufacturing_order", "handler": _propose_manufacturing_order,
        "description": "Draft a manufacturing order for a product with a BoM, for the user to confirm. Does NOT execute until the user confirms.",
        "parameters": {"type": "object", "properties": {"product": {"type": "string"}, "qty": {"type": "number"}}, "required": ["product", "qty"]},
    },
    {
        "name": "propose_forecast_action", "kind": "propose", "act": "forecast_action", "handler": _propose_forecast_action,
        "description": "Draft the recommended replenishment for a product (uses the forecast's suggested quantity if qty is omitted), for the user to confirm.",
        "parameters": {"type": "object", "properties": {"product": {"type": "string"}, "qty": {"type": "number"}}, "required": ["product"]},
    },
]

_TOOLS_BY_NAME = {t["name"]: t for t in TOOLS}


def _tool_schemas_for(session: Session, user: User) -> list[dict]:
    return [
        {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}}
        for t in TOOLS
        if _can_act(session, user, t["act"])
    ]


def _system_prompt(user: User) -> str:
    kind = "System Administrator" if user.is_system_admin else "team member"
    return (
        "You are the Copilot for a Mini ERP (Sales, Purchase, "
        "Manufacturing, Inventory, all on an immutable stock ledger). "
        f"The current user is {user.full_name}, a {kind}. Currency is INR (₹).\n"
        "RULES:\n"
        "- Always use tools to get real data. NEVER invent numbers, names, IDs or statuses.\n"
        "- For anything that changes data (orders, procurement), call the matching propose_* "
        "tool. These only DRAFT the action — they do not execute. After proposing, reply with ONE "
        "short sentence telling the user you've drafted it to confirm below. Do NOT restate the "
        "line items, prices or totals — the confirmation card already shows them.\n"
        "- If a name is ambiguous or missing, say so; don't guess.\n"
        "- When you call a tool, output ONLY the tool call with no extra prose.\n"
        "- Be concise, warm, and reassuring. Sound like a capable operations teammate, not a generic chatbot.\n"
        "- Start with the direct answer in one sentence. Then add one useful detail or next step when it helps.\n"
        "- Use plain language and business context: stock available, risk, blocker, next action.\n"
        "- Avoid long paragraphs, robotic phrasing, and unnecessary apologies. If something is unavailable, explain calmly what the user can do next.\n"
        "- Prefer short bullets only when comparing multiple items. Keep the answer easy to scan."
    )


# --------------------------------------------------------------------------- #
# Groq call + Llama "tool_use_failed" recovery
# --------------------------------------------------------------------------- #

def _extract_json(s: str) -> str | None:
    """Return the first balanced {...} JSON object substring, or None."""
    start = s.find("{")
    if start == -1:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, len(s)):
        c = s[i]
        if in_str:
            esc = (c == "\\" and not esc)
            if c == '"' and not esc:
                in_str = False
        elif c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return s[start:i + 1]
    return None


def _recover_tool_calls(err: Exception) -> list[tuple[str, str, str]] | None:
    """Llama models sometimes emit `<function=name>{args}</function>` as text and
    the API rejects it with `tool_use_failed`. Salvage those into tool calls."""
    body = getattr(err, "body", None)
    if not isinstance(body, dict):
        return None
    e = body.get("error", {})
    if e.get("code") != "tool_use_failed":
        return None
    fg = e.get("failed_generation") or ""
    calls: list[tuple[str, str, str]] = []
    for idx, m in enumerate(re.finditer(r"<function=([a-zA-Z_]\w*)>", fg)):
        blob = _extract_json(fg[m.end():])
        if blob:
            calls.append((f"call_{idx}", m.group(1), blob))
    return calls or None


def _clean_reply(text: str | None) -> str:
    """Strip any leaked `<function=...>` tool-call syntax from a final reply."""
    if not text:
        return ""
    text = re.sub(r"<function=[a-zA-Z_]\w*>.*?(?:</?function>|$)", "", text, flags=re.DOTALL)
    return text.strip()


def _create(client, **kwargs) -> tuple[str | None, list[tuple[str, str, str]]]:
    """Call Groq; return (content, [(id, name, args_json)]). Recovers tool_use_failed."""
    try:
        comp = client.chat.completions.create(**kwargs)
        msg = comp.choices[0].message
        tcs = [(tc.id, tc.function.name, tc.function.arguments) for tc in (msg.tool_calls or [])]
        return msg.content, tcs
    except Exception as e:  # noqa: BLE001
        recovered = _recover_tool_calls(e)
        if recovered is None:
            raise
        return None, recovered


# --------------------------------------------------------------------------- #
# Chat loop
# --------------------------------------------------------------------------- #

def chat(session: Session, user: User, messages: list[dict]) -> dict:
    if not settings.GROQ_API_KEY:
        return {"reply": "The assistant is unavailable — no GROQ_API_KEY is configured.", "pending_actions": [], "tool_trace": []}

    try:
        from groq import Groq

        client = Groq(api_key=settings.GROQ_API_KEY)
        tool_schemas = _tool_schemas_for(session, user)

        convo = [{"role": "system", "content": _system_prompt(user)}]
        for m in messages:
            if m.get("role") in ("user", "assistant") and m.get("content"):
                convo.append({"role": m["role"], "content": m["content"]})

        pending_actions: list[dict] = []
        tool_trace: list[str] = []
        executed: set[str] = set()
        force_finish = False

        for _ in range(MAX_STEPS):
            content, tool_calls = _create(
                client,
                model=settings.GROQ_ASSISTANT_MODEL,
                messages=convo,
                tools=tool_schemas,
                tool_choice="auto",
                temperature=0.2,
                max_tokens=1024,
            )
            if not tool_calls:
                reply = _clean_reply(content) or "Done — anything else?"
                return {"reply": reply, "pending_actions": pending_actions, "tool_trace": tool_trace}

            convo.append({
                "role": "assistant",
                "content": content,
                "tool_calls": [
                    {"id": cid, "type": "function", "function": {"name": cname, "arguments": cargs}}
                    for cid, cname, cargs in tool_calls
                ],
            })

            for cid, name, cargs in tool_calls:
                tool_trace.append(name)
                sig = f"{name}:{cargs}"
                if sig in executed:
                    # Small models can loop on the same call: short-circuit and force an answer.
                    force_finish = True
                    convo.append({"role": "tool", "tool_call_id": cid, "content": json.dumps(
                        {"note": "Already retrieved above. Answer the user now using that data; do not call tools again."})})
                    continue
                executed.add(sig)
                spec = _TOOLS_BY_NAME.get(name)
                try:
                    args = json.loads(cargs or "{}")
                    if not spec:
                        result = {"error": f"unknown tool {name}"}
                    elif not _can_act(session, user, spec["act"]):
                        result = {"error": f"you do not have access to use {name}"}
                    else:
                        # Drop kwargs the handler doesn't accept (small models
                        # sometimes pass spurious args to no-arg tools).
                        params = inspect.signature(spec["handler"]).parameters
                        if not any(p.kind == p.VAR_KEYWORD for p in params.values()):
                            args = {k: v for k, v in args.items() if k in params}
                        out = spec["handler"](session, user, **args)
                        if spec["kind"] == "propose":
                            pending_actions.append(out)
                            result = {"proposed": True, "preview": out["preview"]}
                        else:
                            result = out
                except AssistantError as e:
                    result = {"error": str(e)}
                except Exception as e:  # noqa: BLE001
                    logger.warning("tool %s failed: %s", name, e)
                    result = {"error": f"tool failed: {e}"}
                convo.append({"role": "tool", "tool_call_id": cid, "content": json.dumps(result, default=str)})

            if force_finish:
                break

        # Force a final, tool-free answer from the data already gathered.
        convo.append({"role": "user", "content": "Answer my previous question using the information above. Do not call any tools."})
        final = client.chat.completions.create(model=settings.GROQ_ASSISTANT_MODEL, messages=convo, temperature=0.2, max_tokens=512)
        reply = _clean_reply(final.choices[0].message.content) or "I gathered the data but couldn't summarise it — please try rephrasing."
        return {"reply": reply, "pending_actions": pending_actions, "tool_trace": tool_trace}

    except Exception as e:  # noqa: BLE001
        logger.warning("assistant chat failed: %s", e)
        return {"reply": "Sorry — I hit an error talking to the assistant. Please try again.", "pending_actions": [], "tool_trace": []}


# --------------------------------------------------------------------------- #
# Execute (the only mutation path; RBAC-gated per action type)
# --------------------------------------------------------------------------- #

_VALID_ACTIONS = {"sale_order", "purchase_order", "manufacturing_order", "forecast_action"}


def execute(session: Session, user: User, action: dict) -> dict:
    atype = action.get("type")
    args = action.get("args", {})
    if atype not in _VALID_ACTIONS:
        raise BadAction(f"Unknown action '{atype}'")
    if not _can_act(session, user, atype):
        raise PermissionDenied(f"You do not have access to perform '{atype}'.")

    if atype == "sale_order":
        return _exec_sale_order(session, user, args)
    if atype == "purchase_order":
        po = purchase_service.create_po(
            session, company_id=user.company_id, vendor_id=args.get("vendor_id"),
            line_items=[{"product_id": l["product_id"], "qty": l["qty"], "unit_price": l.get("unit_price")} for l in args["lines"]],
            origin="Assistant", user=user, auto_confirm=True, commit=True,
        )
        return {"message": f"Purchase Order {po.name} created and confirmed.", "doc_name": po.name}
    if atype == "manufacturing_order":
        mo = manufacturing_service.create_mo(
            session, company_id=user.company_id, product_id=args["product_id"], qty=args["qty"], origin="Assistant", user=user, auto_confirm=True, commit=True,
        )
        return {"message": f"Manufacturing Order {mo.name} created and confirmed.", "doc_name": mo.name}
    if atype == "forecast_action":
        res = procurement_service.procure(session, company_id=user.company_id, product_id=args["product_id"], qty=args["qty"], origin="Assistant", user=user)
        session.commit()
        if res["kind"] in ("manufacture", "buy"):
            emit("procurement_triggered", {"kind": res["kind"], "doc_name": res["doc_name"], "doc_id": res["doc_id"],
                                            "qty": res["qty"], "product": res["product"], "origin": "Assistant"}, message=res["message"])
        emit("stock_changed", {})
        return res
    raise BadAction(f"Unhandled action '{atype}'")


def _exec_sale_order(session: Session, user: User, args: dict) -> dict:
    """Create the SO (mirrors routers/sales.py:create_order); optionally confirm."""
    so = SaleOrder(
        company_id=user.company_id,
        name=next_seq_name(session, SaleOrder, "SO", user.company_id),
        partner_id=args["partner_id"],
        created_by_id=user.id,
    )
    session.add(so)
    session.flush()
    for ln in args["lines"]:
        product = session.get(Product, ln["product_id"])
        price = ln.get("unit_price")
        if price is None:
            price = product.sales_price if product else 0.0
        session.add(SaleOrderLine(sale_order_id=so.id, product_id=ln["product_id"], qty=ln["qty"], unit_price=price))
    audit_service.log(session, company_id=user.company_id, entity_type="sale_order", entity_id=so.id, action="created",
                      description=f"{so.name} created (assistant)", user_id=user.id)
    session.commit()
    session.refresh(so)
    emit("sale_order_created", {"id": so.id, "name": so.name})

    if not args.get("confirm"):
        return {"message": f"Sale Order {so.name} created (draft).", "doc_name": so.name, "confirmed": False}

    result = sales_service.confirm_order(session, so, user=user)
    procs = [p["message"] for p in result["procurements"] if p["kind"] in ("manufacture", "buy")]
    msg = f"Sale Order {so.name} created and confirmed."
    if procs:
        msg += " Automation: " + "; ".join(procs)
    return {"message": msg, "doc_name": so.name, "confirmed": True, "procurements": result["procurements"]}
