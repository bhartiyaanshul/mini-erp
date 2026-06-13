"""AI narration layer for predictive procurement.

The forecast numbers are computed deterministically in `forecast_service`; this
module only turns them into a plain-English briefing. It calls Groq when a key is
configured and degrades gracefully to a templated summary otherwise, so the
feature never breaks the demo, key or no key.
"""

import json
import logging

from app.core.config import settings
from app.services.common import fmt_qty

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are a concise supply-chain analyst for a furniture manufacturer's ERP. "
    "You will receive a JSON array of per-product forecast rows that have ALREADY "
    "been computed (average daily usage, free-to-use stock, days of cover, projected "
    "stockout date, suggested reorder quantity, procurement strategy, and urgency). "
    "Write a brief operational briefing. RULES: use ONLY the numbers provided — never "
    "invent or recompute them; prioritise 'critical' then 'watch' items; ignore 'ok' "
    "items unless nothing else needs attention. 'manufacture' strategy => recommend a "
    "Manufacturing Order; 'buy' => a Purchase Order. "
    "Respond with STRICT JSON of the form: "
    '{"summary": "<=3 sentence overview", "recommendations": '
    '[{"product_id": <int>, "action": "<short imperative, e.g. Manufacture 15 units>", '
    '"reason": "<one line citing days of cover / stockout>"}]}'
)


def _action_verb(strategy: str) -> str:
    return "Manufacture" if strategy == "manufacture" else "Buy"


def _fallback_briefing(rows: list[dict]) -> dict:
    """Deterministic, no-LLM briefing built from the same computed numbers."""
    actionable = [r for r in rows if r.get("suggested_qty", 0) > 0]
    recs = [
        {
            "product_id": r["product_id"],
            "action": f"{_action_verb(r['strategy'])} {fmt_qty(r['suggested_qty'])} {r['uom']}",
            "reason": (
                f"{r['urgency']} — ~{fmt_qty(r['free_to_use'])} free, "
                + (
                    f"{fmt_qty(r['days_of_cover'])} days of cover"
                    + (f", stockout by {r['stockout_date']}" if r.get("stockout_date") else "")
                    if r.get("days_of_cover") is not None
                    else "no recent demand"
                )
            ),
        }
        for r in actionable
    ]

    crit = [r for r in rows if r["urgency"] == "critical"]
    watch = [r for r in rows if r["urgency"] == "watch"]
    if not crit and not watch:
        summary = "Stock levels are healthy — no procurement action needed right now."
    else:
        parts = []
        if crit:
            parts.append(
                f"{len(crit)} product(s) will stock out within lead time: "
                + ", ".join(r["name"] for r in crit)
            )
        if watch:
            parts.append(f"{len(watch)} more approaching their reorder point")
        summary = "; ".join(parts) + ". Suggested replenishments are below."
    return {"summary": summary, "recommendations": recs}


def procurement_briefing(rows: list[dict]) -> dict:
    """Briefing over forecast rows. Live via Groq when keyed; templated otherwise."""
    fallback = _fallback_briefing(rows)
    if not rows or not settings.GROQ_API_KEY:
        return {**fallback, "source": "template"}

    try:
        from groq import Groq

        client = Groq(api_key=settings.GROQ_API_KEY)
        completion = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(rows, default=str)},
            ],
        )
        data = json.loads(completion.choices[0].message.content)
        summary = data.get("summary") or fallback["summary"]
        recs = data.get("recommendations")
        if not isinstance(recs, list) or not recs:
            recs = fallback["recommendations"]
        return {"summary": summary, "recommendations": recs, "source": "groq"}
    except Exception as exc:  # never let the AI path break the endpoint
        logger.warning("Groq briefing failed, using template fallback: %s", exc)
        return {**fallback, "source": "template"}
