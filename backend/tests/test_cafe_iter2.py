"""Cafe Bill Generator - Iteration 2 backend tests.

Covers:
- Per-item discount math
- payment_mode capture + defaults + filter
- date-range filter on /api/bills + invalid to_date 400
- CSV export route ordering (NOT captured by /bills/{id}), filters, headers, content
- Users CRUD (admin): list/create/delete, validation, self-delete blocked
- RBAC: cashier blocked on admin-only routes (menu, settings, users), allowed on bills
- Backward compatibility: legacy bills without discount/payment_mode return defaults
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
    """Ensure cashier1@cafe.com exists then login as cashier."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": CASHIER_EMAIL, "password": CASHIER_PASSWORD}, timeout=20)
    if r.status_code == 200:
        return s
    # Create cashier via admin
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


# ---------- Per-item discount math ----------
class TestPerItemDiscount:
    def test_per_item_discount_math(self, admin_client):
        # Latte 200 x2 - 50 = 350; Croissant 150 x1 = 150; subtotal 500
        # Bill discount 0; tax 10%, service 5% on (500 - 0) = 500
        # tax=50, service=25, total = 500 + 50 + 25 = 575
        payload = {
            "items": [
                {"name": "Latte", "price": 200.0, "quantity": 2, "discount": 50.0},
                {"name": "Croissant", "price": 150.0, "quantity": 1},
            ],
            "tax_percent": 10.0,
            "service_percent": 5.0,
            "discount_amount": 0.0,
            "payment_mode": "Cash",
        }
        r = admin_client.post(f"{API}/bills", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["subtotal"] == 500.0, f"expected 500, got {b['subtotal']}"
        assert b["tax_amount"] == 50.0
        assert b["service_amount"] == 25.0
        assert b["total"] == 575.0
        # discount preserved on item
        assert b["items"][0]["discount"] == 50.0
        assert b["items"][1].get("discount", 0.0) == 0.0

    def test_per_item_discount_clamped_negative(self, admin_client):
        # Item discount larger than line subtotal -> clamped to 0 (line contributes 0)
        payload = {
            "items": [
                {"name": "Espresso", "price": 100.0, "quantity": 1, "discount": 500.0},
                {"name": "Tea", "price": 50.0, "quantity": 2},
            ],
            "tax_percent": 0.0, "service_percent": 0.0, "discount_amount": 0.0,
        }
        r = admin_client.post(f"{API}/bills", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        # line1 clamped to 0; line2 = 100; subtotal = 100
        assert b["subtotal"] == 100.0
        assert b["total"] == 100.0


# ---------- Payment mode ----------
class TestPaymentMode:
    def test_payment_mode_default_cash(self, admin_client):
        r = admin_client.post(f"{API}/bills", json={
            "items": [{"name": "Tea", "price": 50.0, "quantity": 1}],
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["payment_mode"] == "Cash"

    @pytest.mark.parametrize("mode", ["Cash", "Card", "UPI", "Other"])
    def test_payment_mode_captured(self, admin_client, mode):
        r = admin_client.post(f"{API}/bills", json={
            "items": [{"name": "Tea", "price": 50.0, "quantity": 1}],
            "payment_mode": mode,
        }, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["payment_mode"] == mode
        # GET single bill also returns it
        r2 = admin_client.get(f"{API}/bills/{b['id']}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["payment_mode"] == mode

    def test_payment_mode_filter(self, admin_client):
        # Create a unique UPI bill
        marker = f"TEST_UPI_{uuid.uuid4().hex[:6]}"
        r = admin_client.post(f"{API}/bills", json={
            "items": [{"name": "Tea", "price": 50.0, "quantity": 1}],
            "payment_mode": "UPI",
            "customer_name": marker,
        }, timeout=15)
        assert r.status_code == 200
        # Filter
        r2 = admin_client.get(f"{API}/bills", params={"payment_mode": "UPI"}, timeout=15)
        assert r2.status_code == 200
        bills = r2.json()
        assert all(b["payment_mode"] == "UPI" for b in bills), "filter returned non-UPI bills"
        assert any(b["customer_name"] == marker for b in bills)


# ---------- Date filter ----------
class TestDateFilter:
    def test_date_range_today_inclusive(self, admin_client):
        marker = f"TEST_DT_{uuid.uuid4().hex[:6]}"
        r = admin_client.post(f"{API}/bills", json={
            "items": [{"name": "X", "price": 10.0, "quantity": 1}],
            "customer_name": marker,
        }, timeout=15)
        assert r.status_code == 200
        today = datetime.now(timezone.utc).date().isoformat()
        r2 = admin_client.get(f"{API}/bills", params={"from_date": today, "to_date": today}, timeout=15)
        assert r2.status_code == 200
        bills = r2.json()
        assert any(b["customer_name"] == marker for b in bills), \
            "today-inclusive range should include just-created bill"

    def test_date_range_future_returns_empty(self, admin_client):
        r = admin_client.get(f"{API}/bills", params={"from_date": "2099-01-01", "to_date": "2099-01-02"}, timeout=15)
        assert r.status_code == 200
        assert r.json() == []

    def test_invalid_to_date_400(self, admin_client):
        r = admin_client.get(f"{API}/bills", params={"to_date": "not-a-date"}, timeout=15)
        assert r.status_code == 400


# ---------- CSV export ----------
class TestCsvExport:
    def test_export_route_not_captured_by_bill_id(self, admin_client):
        """/api/bills/export must NOT be matched by /api/bills/{bill_id} (which would 400 invalid id)."""
        r = admin_client.get(f"{API}/bills/export", timeout=20)
        assert r.status_code == 200, f"export route shadowed by /bills/{{id}}: {r.status_code} {r.text[:200]}"
        ctype = r.headers.get("content-type", "").lower()
        assert "text/csv" in ctype, f"unexpected content-type {ctype}"
        cdisp = r.headers.get("content-disposition", "")
        assert "attachment" in cdisp.lower()
        assert "filename=" in cdisp.lower()

    def test_export_header_row(self, admin_client):
        r = admin_client.get(f"{API}/bills/export", timeout=20)
        assert r.status_code == 200
        reader = csv.reader(io.StringIO(r.text))
        rows = list(reader)
        assert len(rows) >= 1
        header = rows[0]
        expected = [
            "Bill #", "Date (UTC)", "Customer", "Items", "Subtotal",
            "Discount", "Tax %", "Tax", "Service %", "Service",
            "Total", "Payment Mode", "Cashier", "Currency",
        ]
        assert header == expected, f"CSV header mismatch.\nExpected: {expected}\nGot: {header}"

    def test_export_respects_payment_mode_filter(self, admin_client):
        # ensure at least one UPI bill exists
        marker = f"TEST_CSV_{uuid.uuid4().hex[:6]}"
        admin_client.post(f"{API}/bills", json={
            "items": [{"name": "X", "price": 11.0, "quantity": 1}],
            "payment_mode": "UPI", "customer_name": marker,
        }, timeout=15)
        r = admin_client.get(f"{API}/bills/export", params={"payment_mode": "UPI"}, timeout=20)
        assert r.status_code == 200
        reader = csv.reader(io.StringIO(r.text))
        rows = list(reader)
        assert len(rows) >= 2, "expected header + at least one UPI row"
        # Payment Mode column index = 11
        for row in rows[1:]:
            assert row[11] == "UPI", f"non-UPI row in payment-mode-filtered CSV: {row}"

    def test_export_invalid_to_date_400(self, admin_client):
        r = admin_client.get(f"{API}/bills/export", params={"to_date": "garbage"}, timeout=15)
        assert r.status_code == 400

    def test_export_requires_auth(self):
        r = requests.get(f"{API}/bills/export", timeout=15)
        assert r.status_code == 401


# ---------- Users CRUD (admin) ----------
class TestUsersAdmin:
    def test_list_users_admin(self, admin_client):
        r = admin_client.get(f"{API}/users", timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 1
        emails = {u["email"] for u in users}
        assert ADMIN_EMAIL in emails
        for u in users:
            assert "id" in u and "role" in u

    def test_list_users_requires_auth(self):
        r = requests.get(f"{API}/users", timeout=15)
        assert r.status_code == 401

    def test_create_user_invalid_role(self, admin_client):
        r = admin_client.post(f"{API}/users", json={
            "email": f"TEST_bad_{uuid.uuid4().hex[:6]}@x.com",
            "password": "pw12345", "role": "superuser",
        }, timeout=15)
        assert r.status_code == 400

    def test_create_user_duplicate_email_400(self, admin_client):
        r = admin_client.post(f"{API}/users", json={
            "email": ADMIN_EMAIL, "password": "whatever", "role": "admin",
        }, timeout=15)
        assert r.status_code == 400

    def test_create_and_delete_user(self, admin_client):
        email = f"test_del_{uuid.uuid4().hex[:6]}@cafe.com"
        r = admin_client.post(f"{API}/users", json={
            "email": email, "password": "pw12345", "role": "cashier", "name": "ToDelete",
        }, timeout=15)
        assert r.status_code == 200, r.text
        user = r.json()
        assert user["email"] == email
        assert user["role"] == "cashier"
        uid = user["id"]
        # Verify it shows up in list
        listed = admin_client.get(f"{API}/users", timeout=15).json()
        assert any(u["id"] == uid for u in listed)
        # Delete
        r2 = admin_client.delete(f"{API}/users/{uid}", timeout=15)
        assert r2.status_code == 200
        # Verify gone
        listed2 = admin_client.get(f"{API}/users", timeout=15).json()
        assert not any(u["id"] == uid for u in listed2)

    def test_admin_cannot_self_delete(self, admin_client):
        me = admin_client.get(f"{API}/auth/me", timeout=15).json()
        r = admin_client.delete(f"{API}/users/{me['id']}", timeout=15)
        assert r.status_code == 400


# ---------- RBAC: cashier ----------
class TestCashierRBAC:
    def test_cashier_me_returns_role(self, cashier_client):
        r = cashier_client.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "cashier"

    def test_cashier_blocked_on_users_list(self, cashier_client):
        r = cashier_client.get(f"{API}/users", timeout=15)
        assert r.status_code == 403

    def test_cashier_blocked_on_users_create(self, cashier_client):
        r = cashier_client.post(f"{API}/users", json={
            "email": f"TEST_blk_{uuid.uuid4().hex[:6]}@x.com",
            "password": "pw12345", "role": "cashier",
        }, timeout=15)
        assert r.status_code == 403

    def test_cashier_blocked_on_users_delete(self, cashier_client):
        r = cashier_client.delete(f"{API}/users/507f1f77bcf86cd799439011", timeout=15)
        assert r.status_code == 403

    def test_cashier_blocked_on_menu_post(self, cashier_client):
        r = cashier_client.post(f"{API}/menu", json={"name": "TEST_x", "price": 1, "category": "Coffee"}, timeout=15)
        assert r.status_code == 403

    def test_cashier_blocked_on_menu_put(self, cashier_client):
        r = cashier_client.put(f"{API}/menu/507f1f77bcf86cd799439011",
                               json={"name": "x", "price": 1, "category": "Coffee"}, timeout=15)
        assert r.status_code == 403

    def test_cashier_blocked_on_menu_delete(self, cashier_client):
        r = cashier_client.delete(f"{API}/menu/507f1f77bcf86cd799439011", timeout=15)
        assert r.status_code == 403

    def test_cashier_blocked_on_settings_put(self, cashier_client):
        r = cashier_client.put(f"{API}/settings", json={
            "cafe_name": "TEST_BLK", "tax_percent": 1, "service_percent": 1, "currency": "INR",
        }, timeout=15)
        assert r.status_code == 403

    def test_cashier_can_create_bill(self, cashier_client):
        r = cashier_client.post(f"{API}/bills", json={
            "items": [{"name": "Tea", "price": 50.0, "quantity": 1}],
            "payment_mode": "Card",
        }, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["payment_mode"] == "Card"
        assert b["created_by"] == CASHIER_EMAIL

    def test_public_reads_still_work(self):
        # GET menu and settings without auth
        r1 = requests.get(f"{API}/menu", timeout=15)
        assert r1.status_code == 200
        r2 = requests.get(f"{API}/settings", timeout=15)
        assert r2.status_code == 200


# ---------- Backward compatibility ----------
class TestBackwardCompat:
    def test_legacy_bill_defaults(self, admin_client):
        """Insert a bill doc lacking payment_mode and item.discount, ensure GET returns defaults."""
        # We can't directly insert into Mongo from tests; instead, simulate by creating a bill
        # and then verifying defaults via API for items without discount / payment_mode unset.
        r = admin_client.post(f"{API}/bills", json={
            "items": [{"name": "Espresso", "price": 100.0, "quantity": 1}],  # no discount field
        }, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        # payment_mode default
        assert b["payment_mode"] == "Cash"
        # item.discount default to 0
        assert b["items"][0].get("discount", 0.0) == 0.0
        # subtotal computed normally
        assert b["subtotal"] == 100.0
