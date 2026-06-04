"""Cafe Bill Generator backend tests
Covers: auth, menu CRUD, settings, bills (create + totals), bills history, stats, auth guards.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read from frontend .env as fallback
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


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return s


# ---------- Health ----------
def test_health_root():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_login_success_sets_cookies(self, anon_client):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert "id" in data
        # httpOnly cookies present
        cookie_names = [c.name for c in s.cookies]
        assert "access_token" in cookie_names
        assert "refresh_token" in cookie_names
        # verify httpOnly flag
        for c in s.cookies:
            if c.name in ("access_token", "refresh_token"):
                # requests stores HttpOnly in _rest
                http_only = c._rest.get("HttpOnly") if hasattr(c, "_rest") else None
                # Some servers set it via 'httponly'; just ensure attribute exists
                assert http_only is not None or "HttpOnly" in str(c._rest)

    def test_login_invalid_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_without_cookie_returns_401(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_cookie_returns_user(self, auth_client):
        r = auth_client.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert "id" in data

    def test_logout_clears_cookies(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert s.cookies.get("access_token") is not None
        r = s.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200
        # After logout, /me should be 401 using same session
        me = s.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 401


# ---------- Menu ----------
class TestMenu:
    def test_list_menu_seeded_12(self):
        r = requests.get(f"{API}/menu", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 12, f"Expected at least 12 seeded items, got {len(items)}"
        # Verify some known items
        names = {i["name"] for i in items}
        assert "Espresso" in names
        assert "Masala Chai" in names

    def test_create_menu_requires_auth(self):
        r = requests.post(f"{API}/menu", json={"name": "TEST_NoAuth", "price": 10, "category": "Coffee"}, timeout=15)
        assert r.status_code == 401

    def test_menu_crud_flow(self, auth_client):
        # CREATE
        payload = {"name": "TEST_Mocha", "price": 250.0, "category": "Coffee", "description": "test"}
        r = auth_client.post(f"{API}/menu", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == "TEST_Mocha"
        assert created["price"] == 250.0
        item_id = created["id"]

        # Verify via GET list
        r2 = requests.get(f"{API}/menu", timeout=15)
        names = [i["name"] for i in r2.json()]
        assert "TEST_Mocha" in names

        # UPDATE
        upd = {"name": "TEST_Mocha2", "price": 275.0, "category": "Coffee", "description": "updated"}
        r3 = auth_client.put(f"{API}/menu/{item_id}", json=upd, timeout=15)
        assert r3.status_code == 200, r3.text
        assert r3.json()["price"] == 275.0
        assert r3.json()["name"] == "TEST_Mocha2"

        # DELETE
        r4 = auth_client.delete(f"{API}/menu/{item_id}", timeout=15)
        assert r4.status_code == 200
        # Confirm gone
        r5 = auth_client.put(f"{API}/menu/{item_id}", json=upd, timeout=15)
        assert r5.status_code == 404

    def test_update_invalid_id(self, auth_client):
        r = auth_client.put(f"{API}/menu/not-an-objectid", json={"name": "x", "price": 1, "category": "Coffee"}, timeout=15)
        assert r.status_code == 400


# ---------- Settings ----------
class TestSettings:
    def test_get_settings_default(self):
        r = requests.get(f"{API}/settings", timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert "cafe_name" in s
        assert "tax_percent" in s
        assert "service_percent" in s
        assert "currency" in s

    def test_update_settings_requires_auth(self):
        r = requests.put(f"{API}/settings", json={
            "cafe_name": "TEST_NoAuth", "tax_percent": 1, "service_percent": 1, "currency": "INR"
        }, timeout=15)
        assert r.status_code == 401

    def test_update_settings_persists(self, auth_client):
        # Get current
        r0 = requests.get(f"{API}/settings", timeout=15)
        original = r0.json()

        payload = {
            "cafe_name": "TEST_Cafe_X",
            "cafe_address": "TEST Addr",
            "currency": "INR",
            "tax_percent": 7.5,
            "service_percent": 12.5,
        }
        r = auth_client.put(f"{API}/settings", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["cafe_name"] == "TEST_Cafe_X"

        # GET to verify persistence
        r2 = requests.get(f"{API}/settings", timeout=15)
        assert r2.json()["cafe_name"] == "TEST_Cafe_X"
        assert r2.json()["tax_percent"] == 7.5
        assert r2.json()["service_percent"] == 12.5

        # restore
        restore = {
            "cafe_name": original["cafe_name"],
            "cafe_address": original.get("cafe_address", ""),
            "currency": original.get("currency", "INR"),
            "tax_percent": original.get("tax_percent", 5.0),
            "service_percent": original.get("service_percent", 10.0),
        }
        auth_client.put(f"{API}/settings", json=restore, timeout=15)


# ---------- Bills ----------
class TestBills:
    def test_create_bill_requires_auth(self):
        r = requests.post(f"{API}/bills", json={"items": [{"name": "x", "price": 10, "quantity": 1}]}, timeout=15)
        assert r.status_code == 401

    def test_create_bill_empty_items_400(self, auth_client):
        r = auth_client.post(f"{API}/bills", json={"items": []}, timeout=15)
        assert r.status_code == 400

    def test_create_bill_totals_calculation(self, auth_client):
        # Settings: set tax_percent=10, service_percent=5 via PUT for predictable cafe_name
        # We'll pass explicit tax/service in body so calc is deterministic.
        items = [
            {"name": "Coffee", "price": 100.0, "quantity": 2},  # 200
            {"name": "Muffin", "price": 50.0, "quantity": 3},   # 150
        ]
        # subtotal=350, discount=50 -> after=300, tax=10% -> 30, service=5% -> 15, total=345
        payload = {
            "items": items,
            "tax_percent": 10.0,
            "service_percent": 5.0,
            "discount_amount": 50.0,
            "customer_name": "TEST_Cust",
            "notes": "TEST_Note",
        }
        r = auth_client.post(f"{API}/bills", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["subtotal"] == 350.0
        assert b["tax_amount"] == 30.0
        assert b["service_amount"] == 15.0
        assert b["discount_amount"] == 50.0
        assert b["total"] == 345.0
        assert b["bill_number"].startswith("B")
        assert "created_at" in b and b["created_at"]
        assert b["created_by"] == ADMIN_EMAIL
        assert b["cafe_name"]  # from settings
        assert b["customer_name"] == "TEST_Cust"

        # GET single bill
        bid = b["id"]
        r2 = auth_client.get(f"{API}/bills/{bid}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["bill_number"] == b["bill_number"]
        assert r2.json()["total"] == 345.0

    def test_list_bills_sorted_desc(self, auth_client):
        # Create two bills
        items = [{"name": "Tea", "price": 50.0, "quantity": 1}]
        b1 = auth_client.post(f"{API}/bills", json={"items": items}, timeout=15).json()
        import time
        time.sleep(1)
        b2 = auth_client.post(f"{API}/bills", json={"items": items}, timeout=15).json()

        r = auth_client.get(f"{API}/bills", timeout=15)
        assert r.status_code == 200
        bills = r.json()
        assert len(bills) >= 2
        # newest first -> b2 should appear before b1
        ids = [b["id"] for b in bills]
        assert ids.index(b2["id"]) < ids.index(b1["id"])

    def test_list_bills_requires_auth(self):
        r = requests.get(f"{API}/bills", timeout=15)
        assert r.status_code == 401

    def test_get_bill_invalid_id(self, auth_client):
        r = auth_client.get(f"{API}/bills/not-objectid", timeout=15)
        assert r.status_code == 400

    def test_get_bill_not_found(self, auth_client):
        r = auth_client.get(f"{API}/bills/507f1f77bcf86cd799439011", timeout=15)
        assert r.status_code == 404


# ---------- Stats ----------
class TestStats:
    def test_stats_summary_requires_auth(self):
        r = requests.get(f"{API}/stats/summary", timeout=15)
        assert r.status_code == 401

    def test_stats_summary_shape(self, auth_client):
        r = auth_client.get(f"{API}/stats/summary", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("today_total", "today_count", "grand_total", "total_count"):
            assert k in d
        assert isinstance(d["today_count"], int)
        assert isinstance(d["total_count"], int)
        assert d["total_count"] >= d["today_count"]
        assert d["grand_total"] >= d["today_total"] - 1e-6


# ---------- Bearer token also supported ----------
class TestBearerAuth:
    def test_bearer_token_works(self):
        # Login, extract access_token cookie, send as Bearer
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        token = s.cookies.get("access_token")
        assert token
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
