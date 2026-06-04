"""Cafe Bill Generator - Iteration 3 backend tests.

Covers:
- Split-payment validation on POST /api/bills (sum mismatch 400, empty 400)
- Split-payment success persistence (payments[] saved, primary mode = first entry)
- Backward compatibility: bill without payments field synthesizes payments=[{mode, total}]
- POST /api/bills/{id}/void: admin-only, valid void, double-void 400, invalid id 400, non-existent 404
- Audit log: created on void; GET /api/audit-log admin-only and descending by 'at'
- /api/stats/summary excludes voided bills
- /api/analytics?days=N shape + zero-fill + top_items + payment_breakdown + summary
- Analytics uses split-payment breakdown (1 bill 2 payments -> 2 breakdown entries)
- Voided bills excluded from analytics aggregates but counted in voided_count
- Per-item discount regression
- Date/payment filters + CSV export regression (smoke)
- Cashier blocked on /void and /audit-log; cashier CAN post split-payment bills
"""
import os
import io
import csv
import uuid
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass

API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@cafe.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
CASHIER_EMAIL = os.environ.get("TEST_CASHIER_EMAIL", "cashier1@cafe.com")
CASHIER_PASSWORD = os.environ.get("TEST_CASHIER_PASSWORD", "cashier123")


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="session")
def cashier_client(admin_client):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": CASHIER_EMAIL, "password": CASHIER_PASSWORD}, timeout=20)
    if r.status_code == 200:
        return s
    create = admin_client.post(f"{API}/users", json={
        "email": CASHIER_EMAIL, "password": CASHIER_PASSWORD,
        "name": "Cashier One", "role": "cashier",
    }, timeout=20)
    if create.status_code not in (200, 400):
        pytest.skip(f"Cashier creation failed: {create.status_code} {create.text}")
    r = s.post(f"{API}/auth/login", json={"email": CASHIER_EMAIL, "password": CASHIER_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Cashier login failed: {r.status_code} {r.text}")
    return s


def _create_bill(client, items=None, payments=None, payment_mode=None,
                 tax=0.0, service=0.0, discount=0.0, customer=None):
    payload = {
        "items": items or [{"name": "Tea", "price": 100.0, "quantity": 1}],
        "tax_percent": tax,
        "service_percent": service,
        "discount_amount": discount,
    }
    if payments is not None:
        payload["payments"] = payments
    if payment_mode is not None:
        payload["payment_mode"] = payment_mode
    if customer is not None:
        payload["customer_name"] = customer
    return client.post(f"{API}/bills", json=payload, timeout=15)


# ---------- Split-payment validation ----------
class TestSplitPaymentValidation:
    def test_split_sum_mismatch_returns_400(self, admin_client):
        # total = 100; payments 50+30 = 80 -> 400
        r = _create_bill(admin_client,
                         items=[{"name": "Tea", "price": 100.0, "quantity": 1}],
                         payments=[{"mode": "Cash", "amount": 50.0},
                                   {"mode": "UPI", "amount": 30.0}])
        assert r.status_code == 400, r.text
        assert "sum" in r.text.lower() or "payment" in r.text.lower()

    def test_split_empty_after_filter_returns_400(self, admin_client):
        # All amounts zero -> filtered out -> empty -> 400
        r = _create_bill(admin_client,
                         items=[{"name": "Tea", "price": 100.0, "quantity": 1}],
                         payments=[{"mode": "Cash", "amount": 0.0},
                                   {"mode": "UPI", "amount": 0.0}])
        assert r.status_code == 400, r.text

    def test_split_tolerance_within_one_cent(self, admin_client):
        # total = 100; payments = 50.005 + 49.995 -> rounded to 50.0 + 50.0 = 100.0, OK
        r = _create_bill(admin_client,
                         items=[{"name": "Tea", "price": 100.0, "quantity": 1}],
                         payments=[{"mode": "Cash", "amount": 50.005},
                                   {"mode": "UPI", "amount": 49.995}])
        assert r.status_code == 200, r.text


class TestSplitPaymentSuccess:
    def test_split_success_persists_payments(self, admin_client):
        # total = 200; Cash 120 + UPI 80
        r = _create_bill(admin_client,
                         items=[{"name": "Latte", "price": 200.0, "quantity": 1}],
                         payments=[{"mode": "Cash", "amount": 120.0},
                                   {"mode": "UPI", "amount": 80.0}])
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["total"] == 200.0
        assert len(b["payments"]) == 2
        assert b["payments"][0]["mode"] == "Cash"
        assert b["payments"][0]["amount"] == 120.0
        assert b["payments"][1]["mode"] == "UPI"
        assert b["payments"][1]["amount"] == 80.0
        # primary mode = first entry
        assert b["payment_mode"] == "Cash"
        # GET round-trip
        r2 = admin_client.get(f"{API}/bills/{b['id']}", timeout=15)
        assert r2.status_code == 200
        b2 = r2.json()
        assert len(b2["payments"]) == 2
        assert b2["payment_mode"] == "Cash"

    def test_split_first_entry_drives_payment_mode_filter(self, admin_client):
        marker = f"TEST_SPLIT_{uuid.uuid4().hex[:6]}"
        r = _create_bill(admin_client,
                         items=[{"name": "X", "price": 100.0, "quantity": 1}],
                         payments=[{"mode": "UPI", "amount": 60.0},
                                   {"mode": "Cash", "amount": 40.0}],
                         customer=marker)
        assert r.status_code == 200, r.text
        # Filter by UPI should include this bill
        r2 = admin_client.get(f"{API}/bills", params={"payment_mode": "UPI"}, timeout=15)
        assert r2.status_code == 200
        assert any(b["customer_name"] == marker for b in r2.json())

    def test_split_zero_amount_entries_filtered(self, admin_client):
        # total = 100; payments include a zero entry that should be removed; remaining must equal total
        r = _create_bill(admin_client,
                         items=[{"name": "Tea", "price": 100.0, "quantity": 1}],
                         payments=[{"mode": "Cash", "amount": 100.0},
                                   {"mode": "UPI", "amount": 0.0}])
        assert r.status_code == 200, r.text
        b = r.json()
        assert len(b["payments"]) == 1
        assert b["payments"][0]["amount"] == 100.0


# ---------- Backward compat ----------
class TestBackwardCompatPayments:
    def test_no_payments_field_synthesizes_single_entry(self, admin_client):
        r = _create_bill(admin_client,
                         items=[{"name": "Espresso", "price": 120.0, "quantity": 1}],
                         payment_mode="Card")
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["payment_mode"] == "Card"
        assert len(b["payments"]) == 1
        assert b["payments"][0]["mode"] == "Card"
        assert b["payments"][0]["amount"] == b["total"]

    def test_no_payment_field_defaults_to_cash(self, admin_client):
        r = _create_bill(admin_client, items=[{"name": "Tea", "price": 50.0, "quantity": 1}])
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["payment_mode"] == "Cash"
        assert b["payments"] == [{"mode": "Cash", "amount": 50.0}]


# ---------- Void + Audit log ----------
class TestVoidAndAudit:
    def test_void_requires_admin_cashier_403(self, cashier_client, admin_client):
        r = _create_bill(admin_client, items=[{"name": "Tea", "price": 50.0, "quantity": 1}])
        assert r.status_code == 200
        bid = r.json()["id"]
        r2 = cashier_client.post(f"{API}/bills/{bid}/void", json={"reason": "test"}, timeout=15)
        assert r2.status_code == 403

    def test_void_invalid_id_400(self, admin_client):
        r = admin_client.post(f"{API}/bills/not-an-oid/void", json={"reason": "x"}, timeout=15)
        assert r.status_code == 400

    def test_void_nonexistent_404(self, admin_client):
        # Valid OID format but no such bill
        r = admin_client.post(f"{API}/bills/507f1f77bcf86cd799439011/void",
                              json={"reason": "x"}, timeout=15)
        assert r.status_code == 404

    def test_void_success_sets_metadata(self, admin_client):
        r = _create_bill(admin_client, items=[{"name": "Tea", "price": 50.0, "quantity": 1}])
        assert r.status_code == 200
        b = r.json()
        bid = b["id"]
        assert b["voided"] is False
        r2 = admin_client.post(f"{API}/bills/{bid}/void",
                               json={"reason": "TEST_void_reason"}, timeout=15)
        assert r2.status_code == 200, r2.text
        v = r2.json()
        assert v["voided"] is True
        assert v["voided_by"] == ADMIN_EMAIL
        assert v["voided_reason"] == "TEST_void_reason"
        assert v["voided_at"] is not None
        # GET still reflects voided
        r3 = admin_client.get(f"{API}/bills/{bid}", timeout=15)
        assert r3.status_code == 200
        assert r3.json()["voided"] is True

    def test_double_void_400(self, admin_client):
        r = _create_bill(admin_client, items=[{"name": "Tea", "price": 50.0, "quantity": 1}])
        bid = r.json()["id"]
        assert admin_client.post(f"{API}/bills/{bid}/void", json={"reason": "first"}, timeout=15).status_code == 200
        r2 = admin_client.post(f"{API}/bills/{bid}/void", json={"reason": "second"}, timeout=15)
        assert r2.status_code == 400
        assert "already" in r2.text.lower()

    def test_audit_log_entry_on_void(self, admin_client):
        marker_reason = f"TEST_AUDIT_{uuid.uuid4().hex[:6]}"
        r = _create_bill(admin_client, items=[{"name": "Tea", "price": 75.0, "quantity": 1}])
        b = r.json()
        bid = b["id"]; bnum = b["bill_number"]
        rv = admin_client.post(f"{API}/bills/{bid}/void",
                               json={"reason": marker_reason}, timeout=15)
        assert rv.status_code == 200
        # Audit log
        la = admin_client.get(f"{API}/audit-log", timeout=15)
        assert la.status_code == 200
        logs = la.json()
        assert isinstance(logs, list) and len(logs) >= 1
        # Descending by 'at'
        ats = [e.get("at", "") for e in logs]
        assert ats == sorted(ats, reverse=True), "audit log not sorted desc by 'at'"
        # Find our entry
        match = [e for e in logs if e.get("reason") == marker_reason]
        assert match, f"audit entry with reason {marker_reason} not found"
        entry = match[0]
        assert entry["action"] == "bill.void"
        assert entry["bill_id"] == bid
        assert entry["bill_number"] == bnum
        assert entry["actor_email"] == ADMIN_EMAIL
        # _id excluded (replaced with id)
        assert "_id" not in entry
        assert "id" in entry

    def test_audit_log_requires_admin(self, cashier_client):
        r = cashier_client.get(f"{API}/audit-log", timeout=15)
        assert r.status_code == 403


# ---------- Stats summary excludes voided ----------
class TestStatsExcludesVoided:
    def test_stats_excludes_voided(self, admin_client):
        before = admin_client.get(f"{API}/stats/summary", timeout=15).json()
        # Create bill total=500
        r = _create_bill(admin_client,
                         items=[{"name": "X", "price": 500.0, "quantity": 1}])
        assert r.status_code == 200
        bid = r.json()["id"]
        after_create = admin_client.get(f"{API}/stats/summary", timeout=15).json()
        assert after_create["grand_total"] >= before["grand_total"] + 500 - 0.01
        assert after_create["total_count"] == before["total_count"] + 1
        # Void it
        rv = admin_client.post(f"{API}/bills/{bid}/void", json={"reason": "stats-test"}, timeout=15)
        assert rv.status_code == 200
        after_void = admin_client.get(f"{API}/stats/summary", timeout=15).json()
        # Voided bill is excluded -> totals match the pre-create snapshot
        assert abs(after_void["grand_total"] - before["grand_total"]) < 0.01
        assert after_void["total_count"] == before["total_count"]


# ---------- Analytics ----------
class TestAnalytics:
    def test_shape_and_zero_fill(self, admin_client):
        r = admin_client.get(f"{API}/analytics", params={"days": 7}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("revenue_by_day", "top_items", "payment_breakdown", "summary"):
            assert k in d, f"missing {k}"
        assert len(d["revenue_by_day"]) == 7, "revenue_by_day must equal days"
        # Each day entry has date/total/count and dates are unique & sorted ascending
        dates = [x["date"] for x in d["revenue_by_day"]]
        assert dates == sorted(dates), "revenue_by_day dates not ascending"
        assert len(set(dates)) == 7
        for x in d["revenue_by_day"]:
            assert {"date", "total", "count"} <= set(x.keys())
        # top_items <=10 sorted desc by revenue
        assert len(d["top_items"]) <= 10
        revs = [it["revenue"] for it in d["top_items"]]
        assert revs == sorted(revs, reverse=True)
        for it in d["top_items"]:
            assert {"name", "qty", "revenue"} <= set(it.keys())
        # payment_breakdown sorted desc by total
        pb_totals = [p["total"] for p in d["payment_breakdown"]]
        assert pb_totals == sorted(pb_totals, reverse=True)
        for p in d["payment_breakdown"]:
            assert {"mode", "total", "count"} <= set(p.keys())
        # summary keys
        assert {"total_revenue", "total_bills", "avg_bill", "voided_count"} <= set(d["summary"].keys())

    def test_analytics_split_bill_creates_two_breakdown_entries(self, admin_client):
        # Snapshot
        before = admin_client.get(f"{API}/analytics", params={"days": 1}, timeout=20).json()
        pb_before = {p["mode"]: p for p in before["payment_breakdown"]}
        cash_total_before = pb_before.get("Cash", {}).get("total", 0.0)
        cash_count_before = pb_before.get("Cash", {}).get("count", 0)
        upi_total_before = pb_before.get("UPI", {}).get("total", 0.0)
        upi_count_before = pb_before.get("UPI", {}).get("count", 0)

        # Create one split bill: Cash 70 + UPI 30 = 100
        r = _create_bill(admin_client,
                         items=[{"name": "Tea", "price": 100.0, "quantity": 1}],
                         payments=[{"mode": "Cash", "amount": 70.0},
                                   {"mode": "UPI", "amount": 30.0}])
        assert r.status_code == 200, r.text

        after = admin_client.get(f"{API}/analytics", params={"days": 1}, timeout=20).json()
        pb_after = {p["mode"]: p for p in after["payment_breakdown"]}
        assert pb_after["Cash"]["total"] - cash_total_before >= 70.0 - 0.01
        assert pb_after["Cash"]["count"] == cash_count_before + 1
        assert pb_after["UPI"]["total"] - upi_total_before >= 30.0 - 0.01
        assert pb_after["UPI"]["count"] == upi_count_before + 1

    def test_analytics_excludes_voided_from_revenue_but_counts_voided(self, admin_client):
        before = admin_client.get(f"{API}/analytics", params={"days": 1}, timeout=20).json()
        before_rev = before["summary"]["total_revenue"]
        before_voided = before["summary"]["voided_count"]
        before_bills = before["summary"]["total_bills"]

        # Create + void a bill total=500
        r = _create_bill(admin_client, items=[{"name": "Y", "price": 500.0, "quantity": 1}])
        bid = r.json()["id"]
        admin_client.post(f"{API}/bills/{bid}/void", json={"reason": "an-test"}, timeout=15)

        after = admin_client.get(f"{API}/analytics", params={"days": 1}, timeout=20).json()
        assert abs(after["summary"]["total_revenue"] - before_rev) < 0.01, \
            "voided bill must not be in total_revenue"
        assert after["summary"]["total_bills"] == before_bills, \
            "voided bill must not be in total_bills"
        assert after["summary"]["voided_count"] == before_voided + 1

    def test_analytics_top_items_increases_after_sale(self, admin_client):
        unique_name = f"TEST_ITEM_{uuid.uuid4().hex[:6]}"
        # Two sales of the same unique item: qty 3 @ 50 = 150 each => 300 total revenue
        for _ in range(2):
            r = _create_bill(admin_client,
                             items=[{"name": unique_name, "price": 50.0, "quantity": 3}])
            assert r.status_code == 200
        d = admin_client.get(f"{API}/analytics", params={"days": 1}, timeout=20).json()
        names = {it["name"]: it for it in d["top_items"]}
        # Either inside top_items (if revenue high enough) or aggregated correctly when present
        if unique_name in names:
            assert names[unique_name]["qty"] >= 6
            assert names[unique_name]["revenue"] >= 300.0 - 0.01

    def test_analytics_days_param_30(self, admin_client):
        r = admin_client.get(f"{API}/analytics", params={"days": 30}, timeout=20)
        assert r.status_code == 200
        assert len(r.json()["revenue_by_day"]) == 30

    def test_analytics_requires_auth(self):
        r = requests.get(f"{API}/analytics", timeout=15)
        assert r.status_code == 401


# ---------- RBAC / regressions ----------
class TestRbacAndRegressions:
    def test_cashier_can_create_split_bill(self, cashier_client):
        r = _create_bill(cashier_client,
                         items=[{"name": "Tea", "price": 100.0, "quantity": 1}],
                         payments=[{"mode": "Cash", "amount": 60.0},
                                   {"mode": "UPI", "amount": 40.0}])
        assert r.status_code == 200, r.text
        b = r.json()
        assert len(b["payments"]) == 2
        assert b["payment_mode"] == "Cash"

    def test_per_item_discount_regression(self, admin_client):
        # subtotal: 200*2 - 50 + 150 = 500
        r = _create_bill(admin_client, items=[
            {"name": "Latte", "price": 200.0, "quantity": 2, "discount": 50.0},
            {"name": "Croissant", "price": 150.0, "quantity": 1},
        ], tax=10.0, service=5.0)
        assert r.status_code == 200
        b = r.json()
        assert b["subtotal"] == 500.0
        assert b["total"] == 575.0

    def test_csv_export_still_works(self, admin_client):
        r = admin_client.get(f"{API}/bills/export", timeout=20)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "").lower()
        rows = list(csv.reader(io.StringIO(r.text)))
        assert len(rows) >= 1
        assert rows[0][0] == "Bill #"

    def test_payment_mode_filter_still_works(self, admin_client):
        marker = f"TEST_FLT_{uuid.uuid4().hex[:6]}"
        _create_bill(admin_client,
                     items=[{"name": "X", "price": 10.0, "quantity": 1}],
                     payment_mode="Card", customer=marker)
        r = admin_client.get(f"{API}/bills", params={"payment_mode": "Card"}, timeout=15)
        assert r.status_code == 200
        bills = r.json()
        assert all(b["payment_mode"] == "Card" for b in bills)
        assert any(b["customer_name"] == marker for b in bills)

    def test_date_filter_still_works(self, admin_client):
        today = datetime.now(timezone.utc).date().isoformat()
        r = admin_client.get(f"{API}/bills", params={"from_date": today, "to_date": today}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
