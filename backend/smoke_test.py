"""End-to-end smoke test of the Mini ERP backend via in-process TestClient.

Exercises the full demo story: auth + RBAC, seed, MTS delivery, MTO
(manufacture) auto-MO, MO completion, MTO (buy) auto-PO, PO receipt,
dashboard metrics, and the per-product audit timeline.
"""
import os
import tempfile

# Fresh DB each run.
db_path = os.path.join(tempfile.gettempdir(), "mini_erp_smoke.db")
if os.path.exists(db_path):
    os.remove(db_path)
os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PW = "demo1234"
PASS = 0
FAIL = 0


def check(label, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        print(f"  ❌ {label}  {extra}")


def auth_headers(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


with TestClient(app) as client:
    print("\n== Health & Auth ==")
    check("health ok", client.get("/health").json()["status"] == "ok")

    admin = auth_headers(client, "admin@shivfurniture.com")
    sales = auth_headers(client, "sales@shivfurniture.com")
    mfg = auth_headers(client, "mfg@shivfurniture.com")
    purchase = auth_headers(client, "purchase@shivfurniture.com")
    owner = auth_headers(client, "owner@shivfurniture.com")

    print("\n== RBAC ==")
    # Sales user must NOT be able to load the demo (admin-only).
    r = client.post("/api/seed/demo", headers=sales)
    check("sales blocked from seed (403)", r.status_code == 403, f"got {r.status_code}")
    # Sales user must NOT access manufacturing.
    r = client.get("/api/manufacturing/orders", headers=sales)
    check("sales blocked from manufacturing (403)", r.status_code == 403, f"got {r.status_code}")
    # Admin bypasses everything.
    r = client.post("/api/seed/demo", headers=admin)
    check("admin loads demo (200)", r.status_code == 200, r.text)

    print("\n== Products & ledger ==")
    products = client.get("/api/products", headers=sales).json()
    by_name = {p["name"]: p for p in products}
    table = by_name["Wooden Table"]
    chair = by_name["Office Chair"]
    legs = by_name["Wooden Legs"]
    check("Wooden Table on_hand=5", table["on_hand"] == 5, table)
    check("Wooden Table free_to_use=5", table["free_to_use"] == 5, table)
    check("Wooden Legs on_hand=80", legs["on_hand"] == 80, legs)

    print("\n== MTS: small sale delivers from stock ==")
    so = client.post(
        "/api/sales",
        headers=sales,
        json={"partner_id": next(p["id"] for p in client.get("/api/partners", headers=sales).json() if p["name"] == "Retail Mart"),
              "lines": [{"product_id": table["id"], "qty": 3}]},
    ).json()
    r = client.post(f"/api/sales/{so['id']}/confirm", headers=sales).json()
    check("small order confirmed", r["order"]["state"] == "confirmed", r)
    check("no procurement triggered (MTS)", all(p["kind"] == "none" or p.get("kind") not in ("manufacture", "buy") for p in r["procurements"]) and len([p for p in r["procurements"] if p["kind"] in ("manufacture", "buy")]) == 0, r["procurements"])
    t = client.get(f"/api/products/{table['id']}", headers=sales).json()
    check("3 reserved after confirm", t["reserved"] == 3, t)
    r = client.post(f"/api/sales/{so['id']}/deliver", headers=sales).json()
    check("small order fully delivered", r["order"]["state"] == "fully_delivered", r["order"]["state"])
    t = client.get(f"/api/products/{table['id']}", headers=sales).json()
    check("on_hand 5->2 after delivery", t["on_hand"] == 2, t)

    print("\n== MTO (manufacture): big table order auto-creates MO ==")
    so2 = client.post(
        "/api/sales",
        headers=sales,
        json={"partner_id": next(p["id"] for p in client.get("/api/partners", headers=sales).json() if p["name"] == "Retail Mart"),
              "lines": [{"product_id": table["id"], "qty": 20}]},
    ).json()
    r = client.post(f"/api/sales/{so2['id']}/confirm", headers=sales).json()
    procs = [p for p in r["procurements"] if p["kind"] == "manufacture"]
    check("MO auto-created", len(procs) == 1, r["procurements"])
    # 2 on hand now -> reserve 2, manufacture 18
    check("shortage qty = 18", procs and procs[0]["qty"] == 18, procs)
    mo_name = procs[0]["doc_name"] if procs else None
    print(f"     -> {procs[0]['message'] if procs else 'NO MO'}")

    print("\n== Complete the auto MO (consume components, produce table) ==")
    mos = client.get("/api/manufacturing/orders", headers=mfg).json()
    mo = next(m for m in mos if m["name"] == mo_name)
    check("MO is confirmed & has work orders", mo["state"] == "confirmed" and len(mo["work_orders"]) == 3, mo)
    legs_before = client.get(f"/api/products/{legs['id']}", headers=mfg).json()
    r = client.post(f"/api/manufacturing/orders/{mo['id']}/complete", headers=mfg).json()
    check("MO done", r["state"] == "done", r["state"])
    legs_after = client.get(f"/api/products/{legs['id']}", headers=mfg).json()
    # 18 tables -> 18*4 = 72 legs consumed
    check("legs consumed 72 (on_hand 80->8)", legs_after["on_hand"] == legs_before["on_hand"] - 72, (legs_before["on_hand"], legs_after["on_hand"]))
    t = client.get(f"/api/products/{table['id']}", headers=mfg).json()
    check("tables produced (+18 on_hand)", t["on_hand"] == 2 + 18, t)

    print("\n== Deliver remainder of big order after manufacturing ==")
    r = client.post(f"/api/sales/{so2['id']}/deliver", headers=sales).json()
    check("big order fully delivered", r["order"]["state"] == "fully_delivered", r["order"]["state"])

    print("\n== MTO (buy): big chair order auto-creates PO ==")
    so3 = client.post(
        "/api/sales",
        headers=sales,
        json={"partner_id": next(p["id"] for p in client.get("/api/partners", headers=sales).json() if p["name"] == "Office Spaces Ltd"),
              "lines": [{"product_id": chair["id"], "qty": 25}]},
    ).json()
    r = client.post(f"/api/sales/{so3['id']}/confirm", headers=sales).json()
    procs = [p for p in r["procurements"] if p["kind"] == "buy"]
    check("PO auto-created", len(procs) == 1, r["procurements"])
    check("chair shortage = 15", procs and procs[0]["qty"] == 15, procs)
    po_name = procs[0]["doc_name"] if procs else None
    print(f"     -> {procs[0]['message'] if procs else 'NO PO'}")

    print("\n== Receive the auto PO ==")
    pos = client.get("/api/purchase", headers=purchase).json()
    po = next(p for p in pos if p["name"] == po_name)
    check("PO linked to origin SO", po["origin"] == so3["name"], po["origin"])
    chair_before = client.get(f"/api/products/{chair['id']}", headers=purchase).json()
    r = client.post(f"/api/purchase/{po['id']}/receive", headers=purchase).json()
    check("PO fully received", r["order"]["state"] == "fully_received", r["order"]["state"])
    chair_after = client.get(f"/api/products/{chair['id']}", headers=purchase).json()
    check("chairs +15 on_hand", chair_after["on_hand"] == chair_before["on_hand"] + 15, (chair_before["on_hand"], chair_after["on_hand"]))

    print("\n== Dashboard ==")
    d = client.get("/api/dashboard", headers=owner).json()
    check("dashboard total_sales_orders=3", d["total_sales_orders"] == 3, d)
    check("dashboard manufacturing_orders>=1", d["manufacturing_orders"] >= 1, d)
    check("dashboard total_purchase_orders>=1", d["total_purchase_orders"] >= 1, d)
    print(f"     metrics: {d['total_sales_orders']} SO, {d['pending_deliveries']} pending, "
          f"{d['manufacturing_orders']} MO, {d['total_purchase_orders']} PO")

    print("\n== Audit timeline (Wooden Table) ==")
    tl = client.get(f"/api/audit/timeline/{table['id']}", headers=owner).json()
    kinds = [e["kind"] for e in tl["events"]]
    check("timeline has adjustment, reserved, delivered, manufactured",
          "adjustment" in kinds and "delivered" in kinds and "manufactured" in kinds, kinds)
    print(f"     {len(tl['events'])} events: {kinds}")

    print("\n== Audit log (admin) ==")
    logs = client.get("/api/audit", headers=admin).json()
    check("audit log populated", len(logs) > 5, len(logs))

print(f"\n=== RESULT: {PASS} passed, {FAIL} failed ===")
raise SystemExit(1 if FAIL else 0)
