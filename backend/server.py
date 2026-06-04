from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import csv
import io
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict


# --- MongoDB connection ---
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# --- Pydantic helpers ---
def _validate_object_id(v):
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, str):
        return v
    raise ValueError("Invalid ObjectId")

PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]


# --- App ---
app = FastAPI(title="Cafe Bill Generator")
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


# --- Auth utils ---
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60 * 12),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=False,
                        samesite="lax", max_age=60 * 60 * 12, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=False,
                        samesite="lax", max_age=60 * 60 * 24 * 7, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_super_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user


# --- Multi-tenancy helpers ---
def _rid(user: dict) -> Optional[str]:
    """Return restaurant_id, None for super_admin (sees all)."""
    return user.get("restaurant_id")


def _tq(user: dict, extra: Optional[dict] = None) -> dict:
    """Build tenant-scoped MongoDB query dict."""
    q: dict = {}
    rid = _rid(user)
    if rid:
        q["restaurant_id"] = rid
    if extra:
        q.update(extra)
    return q


def _td(user: dict, doc: dict) -> dict:
    """Inject restaurant_id into a document before insert."""
    rid = _rid(user)
    if rid:
        doc["restaurant_id"] = rid
    return doc


# --- Subscription plans ---
PLANS = {
    "free":       {"name": "Free",       "max_branches": 1,  "max_bills_per_month": 100,  "price_inr": 0},
    "starter":    {"name": "Starter",    "max_branches": 1,  "max_bills_per_month": 500,  "price_inr": 999},
    "pro":        {"name": "Pro",        "max_branches": 5,  "max_bills_per_month": -1,   "price_inr": 2999},
    "enterprise": {"name": "Enterprise", "max_branches": -1, "max_bills_per_month": -1,   "price_inr": -1},
}


# --- Pydantic models ---
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    role: str = "cashier"
    restaurant_id: Optional[str] = None
    created_at: Optional[str] = None


class UserCreateIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    role: str = "cashier"


class MenuItemIn(BaseModel):
    name: str
    price: float
    category: str
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    stock: Optional[int] = None
    low_stock_threshold: int = 5
    hsn_code: Optional[str] = ""      # GST HSN / SAC code
    available: bool = True             # visible on public QR menu


class MenuItemOut(MenuItemIn):
    id: str
    created_at: str


class BillItemIn(BaseModel):
    menu_item_id: Optional[str] = None
    name: str
    price: float
    quantity: int
    discount: float = 0.0
    hsn_code: Optional[str] = ""


class PaymentEntry(BaseModel):
    mode: str
    amount: float


class BillIn(BaseModel):
    items: List[BillItemIn]
    tax_percent: float = 0.0
    service_percent: float = 0.0
    discount_amount: float = 0.0
    tip_amount: float = 0.0
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    notes: Optional[str] = ""
    payment_mode: str = "Cash"
    payments: Optional[List[PaymentEntry]] = None
    promo_code: Optional[str] = ""
    loyalty_points_redeemed: float = 0.0
    table_id: Optional[str] = None
    branch_id: Optional[str] = None


class VoidIn(BaseModel):
    reason: str = ""


class BillOut(BaseModel):
    id: str
    bill_number: str
    items: List[BillItemIn]
    subtotal: float
    tax_percent: float
    tax_amount: float
    cgst_amount: float = 0.0
    sgst_amount: float = 0.0
    igst_amount: float = 0.0
    service_percent: float
    service_amount: float
    discount_amount: float
    tip_amount: float = 0.0
    promo_code: Optional[str] = ""
    promo_discount: float = 0.0
    loyalty_points_redeemed: float = 0.0
    loyalty_points_earned: float = 0.0
    total: float
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    notes: Optional[str] = ""
    payment_mode: str = "Cash"
    payments: List[PaymentEntry] = []
    table_id: Optional[str] = None
    table_name: Optional[str] = ""
    branch_id: Optional[str] = None
    branch_name: Optional[str] = ""
    payment_status: str = "unpaid"
    voided: bool = False
    voided_at: Optional[str] = None
    voided_by: Optional[str] = None
    voided_reason: Optional[str] = None
    created_at: str
    created_by: str
    cafe_name: str
    cafe_address: str
    currency: str
    gstin: Optional[str] = ""
    gst_type: Optional[str] = "cgst_sgst"
    receipt_footer: Optional[str] = ""


class SettingsIn(BaseModel):
    cafe_name: str
    cafe_address: Optional[str] = ""
    currency: str = "INR"
    tax_percent: float = 5.0
    service_percent: float = 10.0
    # GST & compliance
    gstin: Optional[str] = ""
    gst_type: str = "cgst_sgst"          # cgst_sgst | igst
    pan: Optional[str] = ""
    fssai_license: Optional[str] = ""
    # Thermal print
    receipt_footer: Optional[str] = "Thank you! Please visit again."
    print_width: str = "80mm"            # 58mm | 80mm


class SettingsOut(SettingsIn):
    pass


# --- Restaurant models ---
class RestaurantRegisterIn(BaseModel):
    restaurant_name: str
    owner_email: EmailStr
    owner_name: Optional[str] = None
    password: str


class RestaurantOut(BaseModel):
    id: str
    name: str
    owner_email: str
    plan: str
    max_branches: int
    max_bills_per_month: int
    price_inr: int
    plan_expires_at: Optional[str] = None
    created_at: str
    active: bool


# --- Helpers ---
def _menu_to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "price": float(doc["price"]),
        "category": doc["category"],
        "description": doc.get("description", ""),
        "image_url": doc.get("image_url", ""),
        "stock": doc.get("stock") if isinstance(doc.get("stock"), int) else None,
        "low_stock_threshold": int(doc.get("low_stock_threshold", 5)),
        "hsn_code": doc.get("hsn_code", ""),
        "available": bool(doc.get("available", True)),
        "created_at": doc.get("created_at", datetime.now(timezone.utc).isoformat()),
    }


async def _check_and_decrement_stock(items: List[BillItemIn], restaurant_id: Optional[str] = None) -> List[dict]:
    needs: dict[str, int] = {}
    for it in items:
        if it.menu_item_id:
            needs[it.menu_item_id] = needs.get(it.menu_item_id, 0) + it.quantity

    insufficient: list[str] = []
    plans: list[tuple[ObjectId, int, str]] = []
    for mid, qty in needs.items():
        try:
            oid = ObjectId(mid)
        except Exception:
            continue
        q: dict = {"_id": oid}
        if restaurant_id:
            q["restaurant_id"] = restaurant_id
        mi = await db.menu_items.find_one(q)
        if not mi:
            continue
        stock = mi.get("stock")
        if not isinstance(stock, int):
            continue
        if stock < qty:
            insufficient.append(f"{mi.get('name', mid)} (need {qty}, have {stock})")
        else:
            plans.append((oid, qty, mi.get("name", "")))

    if insufficient:
        raise HTTPException(status_code=400, detail="Insufficient stock: " + "; ".join(insufficient))

    applied: list[dict] = []
    for oid, qty, name in plans:
        q_update: dict = {"_id": oid, "stock": {"$gte": qty}}
        if restaurant_id:
            q_update["restaurant_id"] = restaurant_id
        res = await db.menu_items.find_one_and_update(
            q_update,
            {"$inc": {"stock": -qty}},
        )
        if res is None:
            for prev in applied:
                await db.menu_items.update_one({"_id": prev["_id"]}, {"$inc": {"stock": prev["qty"]}})
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {name}")
        applied.append({"_id": oid, "qty": qty})
    return applied


async def _restore_stock(items: list) -> None:
    needs: dict[str, int] = {}
    for it in items:
        mid = it.get("menu_item_id") if isinstance(it, dict) else None
        qty = int(it.get("quantity", 0) or 0) if isinstance(it, dict) else 0
        if mid and qty > 0:
            needs[mid] = needs.get(mid, 0) + qty
    for mid, qty in needs.items():
        try:
            oid = ObjectId(mid)
        except Exception:
            continue
        await db.menu_items.update_one(
            {"_id": oid, "stock": {"$type": ["int", "long"]}},
            {"$inc": {"stock": qty}},
        )


def _bill_to_out(doc: dict) -> dict:
    tax_amount = float(doc.get("tax_amount", 0))
    gst_type = doc.get("gst_type", "cgst_sgst")
    if gst_type == "igst":
        cgst = 0.0
        sgst = 0.0
        igst = round(tax_amount, 2)
    else:
        cgst = round(tax_amount / 2, 2)
        sgst = round(tax_amount / 2, 2)
        igst = 0.0

    return {
        "id": str(doc["_id"]),
        "bill_number": doc["bill_number"],
        "items": doc["items"],
        "subtotal": doc["subtotal"],
        "tax_percent": doc["tax_percent"],
        "tax_amount": tax_amount,
        "cgst_amount": cgst,
        "sgst_amount": sgst,
        "igst_amount": igst,
        "service_percent": doc["service_percent"],
        "service_amount": doc["service_amount"],
        "discount_amount": doc["discount_amount"],
        "tip_amount": float(doc.get("tip_amount", 0.0) or 0.0),
        "promo_code": doc.get("promo_code", ""),
        "promo_discount": float(doc.get("promo_discount", 0.0) or 0.0),
        "loyalty_points_redeemed": float(doc.get("loyalty_points_redeemed", 0.0) or 0.0),
        "loyalty_points_earned": float(doc.get("loyalty_points_earned", 0.0) or 0.0),
        "total": doc["total"],
        "customer_name": doc.get("customer_name", ""),
        "customer_phone": doc.get("customer_phone", ""),
        "notes": doc.get("notes", ""),
        "payment_mode": doc.get("payment_mode", "Cash"),
        "payments": doc.get("payments") or [
            {"mode": doc.get("payment_mode", "Cash"), "amount": doc.get("total", 0.0)}
        ],
        "table_id": doc.get("table_id"),
        "table_name": doc.get("table_name", ""),
        "branch_id": doc.get("branch_id"),
        "branch_name": doc.get("branch_name", ""),
        "payment_status": doc.get("payment_status", "unpaid"),
        "voided": bool(doc.get("voided", False)),
        "voided_at": doc.get("voided_at"),
        "voided_by": doc.get("voided_by"),
        "voided_reason": doc.get("voided_reason"),
        "created_at": doc["created_at"],
        "created_by": doc.get("created_by", ""),
        "cafe_name": doc.get("cafe_name", "Cafe"),
        "cafe_address": doc.get("cafe_address", ""),
        "currency": doc.get("currency", "INR"),
        "gstin": doc.get("gstin", ""),
        "gst_type": gst_type,
        "receipt_footer": doc.get("receipt_footer", ""),
    }


async def _get_settings(restaurant_id: Optional[str] = None) -> dict:
    q: dict = {}
    if restaurant_id:
        q["restaurant_id"] = restaurant_id
    else:
        q["_id"] = "default"
    doc = await db.settings.find_one(q)
    if not doc:
        doc = {
            "_id": "default" if not restaurant_id else None,
            "restaurant_id": restaurant_id,
            "cafe_name": "Brew & Bean Cafe",
            "cafe_address": "12 Maple Street, Downtown",
            "currency": "INR",
            "tax_percent": 5.0,
            "service_percent": 10.0,
            "gstin": "",
            "gst_type": "cgst_sgst",
            "pan": "",
            "fssai_license": "",
            "receipt_footer": "Thank you! Please visit again.",
            "print_width": "80mm",
        }
        if restaurant_id:
            doc.pop("_id")
        await db.settings.insert_one(doc)
    return doc


def _restaurant_to_out(doc: dict) -> dict:
    plan_key = doc.get("plan", "free")
    plan_info = PLANS.get(plan_key, PLANS["free"])
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "owner_email": doc.get("owner_email", ""),
        "plan": plan_key,
        "max_branches": plan_info["max_branches"],
        "max_bills_per_month": plan_info["max_bills_per_month"],
        "price_inr": plan_info["price_inr"],
        "plan_expires_at": doc.get("plan_expires_at"),
        "created_at": doc.get("created_at", ""),
        "active": bool(doc.get("active", True)),
    }


# --- Auth routes ---
@api_router.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name or email.split("@")[0],
        "role": "cashier",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(user_doc)
    uid = str(result.inserted_id)
    set_auth_cookies(response, create_access_token(uid, email), create_refresh_token(uid))
    return {"id": uid, "email": email, "name": user_doc["name"], "role": user_doc["role"]}


@api_router.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    set_auth_cookies(response, create_access_token(uid, email), create_refresh_token(uid))
    return {
        "id": uid,
        "email": email,
        "name": user.get("name"),
        "role": user.get("role", "cashier"),
        "restaurant_id": user.get("restaurant_id"),
    }


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name"),
        "role": user.get("role", "cashier"),
        "restaurant_id": user.get("restaurant_id"),
    }


# --- Restaurant registration (public) ---
@api_router.post("/auth/register-restaurant")
async def register_restaurant(payload: RestaurantRegisterIn, response: Response):
    """Onboard a new restaurant — creates restaurant + admin account in one step."""
    email = payload.owner_email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create restaurant
    restaurant_doc = {
        "name": payload.restaurant_name.strip(),
        "owner_email": email,
        "plan": "free",
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r_res = await db.restaurants.insert_one(restaurant_doc)
    rid = str(r_res.inserted_id)

    # Create admin user belonging to this restaurant
    user_doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.owner_name or email.split("@")[0],
        "role": "admin",
        "restaurant_id": rid,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    u_res = await db.users.insert_one(user_doc)
    uid = str(u_res.inserted_id)

    # Seed default settings for this restaurant
    await db.settings.insert_one({
        "restaurant_id": rid,
        "cafe_name": payload.restaurant_name.strip(),
        "cafe_address": "",
        "currency": "INR",
        "tax_percent": 5.0,
        "service_percent": 10.0,
        "gstin": "",
        "gst_type": "cgst_sgst",
        "pan": "",
        "fssai_license": "",
        "receipt_footer": "Thank you! Please visit again.",
        "print_width": "80mm",
    })

    set_auth_cookies(response, create_access_token(uid, email), create_refresh_token(uid))
    return {
        "id": uid,
        "email": email,
        "name": user_doc["name"],
        "role": "admin",
        "restaurant_id": rid,
        "restaurant_name": payload.restaurant_name,
    }


# --- Users routes (admin only) ---
def _user_to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "email": doc["email"],
        "name": doc.get("name"),
        "role": doc.get("role", "cashier"),
        "restaurant_id": doc.get("restaurant_id"),
        "created_at": doc.get("created_at"),
    }


@api_router.get("/users", response_model=List[UserOut])
async def list_users(admin: dict = Depends(require_admin)):
    docs = await db.users.find(_tq(admin)).sort("created_at", 1).to_list(1000)
    return [_user_to_out(d) for d in docs]


@api_router.post("/users", response_model=UserOut)
async def create_user(payload: UserCreateIn, admin: dict = Depends(require_admin)):
    email = payload.email.lower().strip()
    if payload.role not in ("admin", "cashier"):
        raise HTTPException(status_code=400, detail="Role must be admin or cashier")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name or email.split("@")[0],
        "role": payload.role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _td(admin, doc)
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _user_to_out(doc)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if str(oid) == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    q = _tq(admin, {"_id": oid})
    res = await db.users.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


# --- Menu routes ---
@api_router.get("/menu", response_model=List[MenuItemOut])
async def list_menu(user: dict = Depends(get_current_user)):
    items = await db.menu_items.find(_tq(user)).sort("category", 1).to_list(1000)
    return [_menu_to_out(d) for d in items]


@api_router.post("/menu", response_model=MenuItemOut)
async def create_menu_item(payload: MenuItemIn, user: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    _td(user, doc)
    result = await db.menu_items.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _menu_to_out(doc)


@api_router.put("/menu/{item_id}", response_model=MenuItemOut)
async def update_menu_item(item_id: str, payload: MenuItemIn, user: dict = Depends(require_admin)):
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    result = await db.menu_items.find_one_and_update(
        _tq(user, {"_id": oid}), {"$set": payload.model_dump()}, return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    return _menu_to_out(result)


@api_router.delete("/menu/{item_id}")
async def delete_menu_item(item_id: str, user: dict = Depends(require_admin)):
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    res = await db.menu_items.delete_one(_tq(user, {"_id": oid}))
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@api_router.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)):
    cats = await db.menu_items.distinct("category", _tq(user))
    return sorted([c for c in cats if c])


@api_router.get("/menu/low-stock", response_model=List[MenuItemOut])
async def low_stock_items(user: dict = Depends(get_current_user)):
    q = _tq(user, {"stock": {"$type": ["int", "long"]}})
    items = await db.menu_items.find(q).to_list(1000)
    out: List[dict] = []
    for d in items:
        thr = int(d.get("low_stock_threshold", 5))
        if int(d.get("stock", 0)) <= thr:
            out.append(_menu_to_out(d))
    out.sort(key=lambda x: x["stock"] if x["stock"] is not None else 0)
    return out


@api_router.put("/menu/{item_id}/stock", response_model=MenuItemOut)
async def adjust_stock(item_id: str, delta: int = Query(...), admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    existing = await db.menu_items.find_one(_tq(admin, {"_id": oid}))
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    if not isinstance(existing.get("stock"), int):
        raise HTTPException(status_code=400, detail="Item is not tracked; enable inventory tracking first")
    new_stock = max(0, int(existing["stock"]) + int(delta))
    res = await db.menu_items.find_one_and_update(
        {"_id": oid}, {"$set": {"stock": new_stock}}, return_document=True
    )
    return _menu_to_out(res)


# --- Public menu (for QR code customer ordering) ---
@app.get("/api/public/menu/{restaurant_id}")
async def public_menu(restaurant_id: str, table_id: Optional[str] = Query(None)):
    """Unauthenticated endpoint for customer QR code menu viewing."""
    restaurant = await db.restaurants.find_one({"_id": ObjectId(restaurant_id)})
    if not restaurant or not restaurant.get("active", True):
        raise HTTPException(status_code=404, detail="Restaurant not found")

    settings = await _get_settings(restaurant_id)
    items = await db.menu_items.find(
        {"restaurant_id": restaurant_id, "available": {"$ne": False}}
    ).sort("category", 1).to_list(1000)

    table_name = ""
    if table_id:
        try:
            tdoc = await db.tables.find_one({"_id": ObjectId(table_id), "restaurant_id": restaurant_id})
            if tdoc:
                table_name = tdoc.get("name", "")
        except Exception:
            pass

    # Group by category
    categories: dict = {}
    for item in items:
        cat = item.get("category", "Other")
        categories.setdefault(cat, []).append({
            "id": str(item["_id"]),
            "name": item["name"],
            "price": float(item["price"]),
            "description": item.get("description", ""),
            "image_url": item.get("image_url", ""),
            "available": bool(item.get("available", True)),
        })

    return {
        "restaurant": {
            "id": restaurant_id,
            "name": settings.get("cafe_name", restaurant.get("name", "")),
            "address": settings.get("cafe_address", ""),
            "currency": settings.get("currency", "INR"),
        },
        "table": {"id": table_id, "name": table_name} if table_id else None,
        "categories": [
            {"name": cat, "items": items_list}
            for cat, items_list in categories.items()
        ],
    }


# --- Settings routes ---
@api_router.get("/settings", response_model=SettingsOut)
async def get_settings(user: dict = Depends(get_current_user)):
    s = await _get_settings(_rid(user))
    return SettingsOut(
        cafe_name=s["cafe_name"],
        cafe_address=s.get("cafe_address", ""),
        currency=s.get("currency", "INR"),
        tax_percent=s.get("tax_percent", 5.0),
        service_percent=s.get("service_percent", 10.0),
        gstin=s.get("gstin", ""),
        gst_type=s.get("gst_type", "cgst_sgst"),
        pan=s.get("pan", ""),
        fssai_license=s.get("fssai_license", ""),
        receipt_footer=s.get("receipt_footer", "Thank you! Please visit again."),
        print_width=s.get("print_width", "80mm"),
    )


@api_router.put("/settings", response_model=SettingsOut)
async def update_settings(payload: SettingsIn, user: dict = Depends(require_admin)):
    update = payload.model_dump()
    rid = _rid(user)
    if rid:
        await db.settings.update_one(
            {"restaurant_id": rid}, {"$set": update}, upsert=True
        )
    else:
        await db.settings.update_one({"_id": "default"}, {"$set": update}, upsert=True)
    return SettingsOut(**update)


# --- Bills routes ---
def _calc_totals(items, tax_percent, service_percent, discount_amount, tip_amount=0.0, promo_discount=0.0, loyalty_redeemed=0.0):
    subtotal = round(
        sum(max(0.0, i.price * i.quantity - max(0.0, i.discount or 0.0)) for i in items),
        2,
    )
    after_disc = max(0.0, subtotal - max(0.0, discount_amount) - max(0.0, promo_discount) - max(0.0, loyalty_redeemed))
    tax_amount = round(after_disc * tax_percent / 100, 2)
    service_amount = round(after_disc * service_percent / 100, 2)
    total = round(after_disc + tax_amount + service_amount + max(0.0, tip_amount), 2)
    return subtotal, tax_amount, service_amount, total


@api_router.post("/bills", response_model=BillOut)
async def create_bill(payload: BillIn, user: dict = Depends(get_current_user)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Bill must have at least one item")
    rid = _rid(user)
    settings = await _get_settings(rid)

    # Resolve branch
    branch_id = payload.branch_id or user.get("branch_id")
    branch_name = ""
    if branch_id:
        try:
            q = {"_id": ObjectId(branch_id)}
            if rid:
                q["restaurant_id"] = rid
            bdoc = await db.branches.find_one(q)
            if bdoc:
                branch_name = bdoc.get("name", "")
        except Exception:
            branch_id = None

    # Resolve table
    table_name = ""
    table_oid = None
    if payload.table_id:
        try:
            table_oid = ObjectId(payload.table_id)
            q = {"_id": table_oid}
            if rid:
                q["restaurant_id"] = rid
            tdoc = await db.tables.find_one(q)
            if tdoc:
                table_name = tdoc.get("name", "")
        except Exception:
            table_oid = None

    # Promo validation
    promo_code = (payload.promo_code or "").strip().upper()
    promo_discount = 0.0
    promo_doc = None
    if promo_code:
        q = {"code": promo_code, "active": True}
        if rid:
            q["restaurant_id"] = rid
        promo_doc = await db.promos.find_one(q)
        if not promo_doc:
            raise HTTPException(status_code=400, detail=f"Promo code '{promo_code}' is invalid or inactive")
        if promo_doc.get("max_uses") and promo_doc.get("uses", 0) >= promo_doc["max_uses"]:
            raise HTTPException(status_code=400, detail=f"Promo code '{promo_code}' has reached its usage limit")
        gross = sum(max(0.0, i.price * i.quantity - max(0.0, i.discount or 0.0)) for i in payload.items)
        if promo_doc.get("discount_type") == "percent":
            promo_discount = round(gross * float(promo_doc["value"]) / 100, 2)
        else:
            promo_discount = round(min(float(promo_doc["value"]), gross), 2)

    # Loyalty redemption
    redeem = max(0.0, float(payload.loyalty_points_redeemed or 0.0))
    customer = None
    if (payload.customer_phone or "").strip():
        q = {"phone": payload.customer_phone.strip()}
        if rid:
            q["restaurant_id"] = rid
        customer = await db.customers.find_one(q)
        if redeem > 0:
            if not customer:
                raise HTTPException(status_code=400, detail="Cannot redeem points: customer not found")
            available = float(customer.get("points", 0) or 0)
            if redeem > available:
                raise HTTPException(status_code=400, detail=f"Customer has only {available:.2f} points; cannot redeem {redeem:.2f}")
    elif redeem > 0:
        raise HTTPException(status_code=400, detail="Customer phone is required to redeem loyalty points")

    subtotal, tax_amount, service_amount, total = _calc_totals(
        payload.items, payload.tax_percent, payload.service_percent,
        payload.discount_amount, payload.tip_amount, promo_discount, redeem
    )

    # Payments validation
    if payload.payments:
        payments = [{"mode": p.mode, "amount": round(p.amount, 2)} for p in payload.payments if p.amount > 0]
        if not payments:
            raise HTTPException(status_code=400, detail="At least one payment with amount > 0 is required")
        if abs(sum(p["amount"] for p in payments) - total) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Sum of payments must equal total ({total}); got {sum(p['amount'] for p in payments):.2f}",
            )
        primary_mode = payments[0]["mode"]
    else:
        primary_mode = payload.payment_mode or "Cash"
        payments = [{"mode": primary_mode, "amount": total}]

    # Inventory check + decrement
    await _check_and_decrement_stock(payload.items, rid)

    # Loyalty points earned
    loyalty_earned = 0.0
    if (payload.customer_phone or "").strip():
        loyalty_earned = round(max(0.0, total - max(0.0, payload.tip_amount or 0.0)) * 0.01, 2)

    bill_number = "B" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + str(uuid.uuid4())[:4].upper()
    doc = {
        "bill_number": bill_number,
        "items": [i.model_dump() for i in payload.items],
        "subtotal": subtotal,
        "tax_percent": payload.tax_percent,
        "tax_amount": tax_amount,
        "service_percent": payload.service_percent,
        "service_amount": service_amount,
        "discount_amount": payload.discount_amount,
        "tip_amount": max(0.0, payload.tip_amount or 0.0),
        "promo_code": promo_code,
        "promo_discount": promo_discount,
        "loyalty_points_redeemed": redeem,
        "loyalty_points_earned": loyalty_earned,
        "total": total,
        "customer_name": payload.customer_name or "",
        "customer_phone": (payload.customer_phone or "").strip(),
        "notes": payload.notes or "",
        "payment_mode": primary_mode,
        "payments": payments,
        "table_id": str(table_oid) if table_oid else None,
        "table_name": table_name,
        "branch_id": branch_id,
        "branch_name": branch_name,
        "payment_status": "unpaid",
        "voided": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.get("email", ""),
        "cafe_name": settings["cafe_name"],
        "cafe_address": settings.get("cafe_address", ""),
        "currency": settings.get("currency", "INR"),
        "gstin": settings.get("gstin", ""),
        "gst_type": settings.get("gst_type", "cgst_sgst"),
        "receipt_footer": settings.get("receipt_footer", ""),
    }
    if rid:
        doc["restaurant_id"] = rid

    res = await db.bills.insert_one(doc)
    doc["_id"] = res.inserted_id

    # Side effects
    if promo_doc:
        await db.promos.update_one({"_id": promo_doc["_id"]}, {"$inc": {"uses": 1}})
    if (payload.customer_phone or "").strip():
        phone = payload.customer_phone.strip()
        q = {"phone": phone}
        if rid:
            q["restaurant_id"] = rid
        await db.customers.update_one(
            q,
            {
                "$setOnInsert": {
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    **({"restaurant_id": rid} if rid else {}),
                },
                "$set": {"name": payload.customer_name or "", "last_visit": datetime.now(timezone.utc).isoformat()},
                "$inc": {
                    "points": loyalty_earned - redeem,
                    "total_spent": total,
                    "visits": 1,
                },
            },
            upsert=True,
        )
    if table_oid:
        await db.tables.update_one({"_id": table_oid}, {"$set": {"active_bill_id": str(res.inserted_id), "status": "occupied"}})

    return _bill_to_out(doc)


@api_router.get("/bills", response_model=List[BillOut])
async def list_bills(
    user: dict = Depends(get_current_user),
    limit: int = 500,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    payment_mode: Optional[str] = Query(None),
):
    q = _tq(user)
    if from_date:
        q.setdefault("created_at", {})["$gte"] = from_date
    if to_date:
        try:
            d = datetime.fromisoformat(to_date).date() + timedelta(days=1)
            q.setdefault("created_at", {})["$lt"] = d.isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid to_date format, expected YYYY-MM-DD")
    if payment_mode:
        q["payment_mode"] = payment_mode
    docs = await db.bills.find(q).sort("created_at", -1).to_list(limit)
    return [_bill_to_out(d) for d in docs]


@api_router.get("/bills/export")
async def export_bills_csv(
    user: dict = Depends(get_current_user),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    payment_mode: Optional[str] = Query(None),
):
    q = _tq(user)
    if from_date:
        q.setdefault("created_at", {})["$gte"] = from_date
    if to_date:
        try:
            d = datetime.fromisoformat(to_date).date() + timedelta(days=1)
            q.setdefault("created_at", {})["$lt"] = d.isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid to_date format, expected YYYY-MM-DD")
    if payment_mode:
        q["payment_mode"] = payment_mode

    docs = await db.bills.find(q).sort("created_at", -1).to_list(10000)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Bill #", "Date (UTC)", "Customer", "Items", "Subtotal",
        "Discount", "Tax %", "Tax", "CGST", "SGST", "IGST",
        "Service %", "Service", "Total", "Payment Mode", "GST Type", "GSTIN", "Cashier", "Currency",
    ])
    for d in docs:
        items_count = sum(int(it.get("quantity", 0)) for it in d.get("items", []))
        tax_a = float(d.get("tax_amount", 0))
        gst_type = d.get("gst_type", "cgst_sgst")
        cgst = round(tax_a / 2, 2) if gst_type != "igst" else 0.0
        sgst = round(tax_a / 2, 2) if gst_type != "igst" else 0.0
        igst = round(tax_a, 2) if gst_type == "igst" else 0.0
        writer.writerow([
            d.get("bill_number", ""),
            d.get("created_at", ""),
            d.get("customer_name", ""),
            items_count,
            d.get("subtotal", 0),
            d.get("discount_amount", 0),
            d.get("tax_percent", 0),
            tax_a,
            cgst,
            sgst,
            igst,
            d.get("service_percent", 0),
            d.get("service_amount", 0),
            d.get("total", 0),
            d.get("payment_mode", "Cash"),
            gst_type,
            d.get("gstin", ""),
            d.get("created_by", ""),
            d.get("currency", "INR"),
        ])

    buf.seek(0)
    filename = f"bills_{from_date or 'all'}_{to_date or 'all'}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.get("/bills/{bill_id}", response_model=BillOut)
async def get_bill(bill_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(bill_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    doc = await db.bills.find_one(_tq(user, {"_id": oid}))
    if not doc:
        raise HTTPException(status_code=404, detail="Bill not found")
    return _bill_to_out(doc)


@api_router.post("/bills/{bill_id}/void", response_model=BillOut)
async def void_bill(bill_id: str, payload: VoidIn, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(bill_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    existing = await db.bills.find_one(_tq(admin, {"_id": oid}))
    if not existing:
        raise HTTPException(status_code=404, detail="Bill not found")
    if existing.get("voided"):
        raise HTTPException(status_code=400, detail="Bill is already voided")
    void_meta = {
        "voided": True,
        "voided_at": datetime.now(timezone.utc).isoformat(),
        "voided_by": admin.get("email", ""),
        "voided_reason": payload.reason or "",
    }
    await db.bills.update_one({"_id": oid}, {"$set": void_meta})
    await _restore_stock(existing.get("items", []))
    phone = (existing.get("customer_phone") or "").strip()
    if phone:
        earned = float(existing.get("loyalty_points_earned", 0) or 0)
        redeemed = float(existing.get("loyalty_points_redeemed", 0) or 0)
        q = {"phone": phone}
        rid = _rid(admin)
        if rid:
            q["restaurant_id"] = rid
        await db.customers.update_one(
            q,
            {"$inc": {"points": -(earned - redeemed), "total_spent": -float(existing.get("total", 0) or 0), "visits": -1}},
        )
    if existing.get("promo_code"):
        await db.promos.update_one({"code": existing["promo_code"]}, {"$inc": {"uses": -1}})
    if existing.get("table_id"):
        try:
            await db.tables.update_one(
                {"_id": ObjectId(existing["table_id"]), "active_bill_id": str(oid)},
                {"$set": {"active_bill_id": None, "status": "free"}},
            )
        except Exception:
            pass
    await db.audit_log.insert_one({
        "action": "bill.void",
        "bill_id": str(oid),
        "bill_number": existing.get("bill_number"),
        "actor_email": admin.get("email", ""),
        "actor_id": admin.get("id"),
        "reason": payload.reason or "",
        "at": void_meta["voided_at"],
        **({"restaurant_id": _rid(admin)} if _rid(admin) else {}),
    })
    updated = await db.bills.find_one({"_id": oid})
    return _bill_to_out(updated)


@api_router.get("/audit-log")
async def list_audit_log(admin: dict = Depends(require_admin), limit: int = 200):
    docs = await db.audit_log.find(_tq(admin)).sort("at", -1).to_list(limit)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs


@api_router.get("/stats/summary")
async def stats_summary(user: dict = Depends(get_current_user)):
    today_iso = datetime.now(timezone.utc).date().isoformat()
    today_total = 0.0
    today_count = 0
    grand_total = 0.0
    total_count = 0
    async for b in db.bills.find(_tq(user, {"voided": {"$ne": True}})):
        grand_total += b.get("total", 0)
        total_count += 1
        if b.get("created_at", "").startswith(today_iso):
            today_total += b.get("total", 0)
            today_count += 1
    return {
        "today_total": round(today_total, 2),
        "today_count": today_count,
        "grand_total": round(grand_total, 2),
        "total_count": total_count,
    }


@api_router.get("/analytics")
async def analytics(user: dict = Depends(get_current_user), days: int = 30):
    today = datetime.now(timezone.utc).date()
    start_date = today - timedelta(days=days - 1)
    start_iso = start_date.isoformat()

    day_buckets: dict[str, dict] = {
        (start_date + timedelta(days=i)).isoformat(): {"date": (start_date + timedelta(days=i)).isoformat(), "total": 0.0, "count": 0}
        for i in range(days)
    }

    item_agg: dict[str, dict] = {}
    payment_agg: dict[str, dict] = {}
    total_revenue = 0.0
    total_bills = 0
    voided_count = 0

    async for b in db.bills.find(_tq(user)):
        if b.get("voided"):
            voided_count += 1
            continue
        total = float(b.get("total", 0) or 0)
        created = b.get("created_at", "")
        day = created[:10] if isinstance(created, str) else ""
        total_revenue += total
        total_bills += 1
        if day in day_buckets and created >= start_iso:
            day_buckets[day]["total"] += total
            day_buckets[day]["count"] += 1
        payments = b.get("payments") or [{"mode": b.get("payment_mode", "Cash"), "amount": total}]
        for p in payments:
            mode = p.get("mode", "Cash")
            amount = float(p.get("amount", 0) or 0)
            pa = payment_agg.setdefault(mode, {"mode": mode, "total": 0.0, "count": 0})
            pa["total"] += amount
            pa["count"] += 1
        for it in b.get("items", []):
            key = it.get("name", "")
            qty = int(it.get("quantity", 0) or 0)
            price = float(it.get("price", 0) or 0)
            disc = float(it.get("discount", 0) or 0)
            revenue = max(0.0, qty * price - disc)
            ia = item_agg.setdefault(key, {"name": key, "qty": 0, "revenue": 0.0})
            ia["qty"] += qty
            ia["revenue"] += revenue

    revenue_by_day = [
        {"date": d["date"], "total": round(d["total"], 2), "count": d["count"]}
        for d in day_buckets.values()
    ]
    top_items = sorted(item_agg.values(), key=lambda x: x["revenue"], reverse=True)[:10]
    top_items = [{"name": i["name"], "qty": i["qty"], "revenue": round(i["revenue"], 2)} for i in top_items]
    payment_breakdown = sorted(
        ({"mode": p["mode"], "total": round(p["total"], 2), "count": p["count"]} for p in payment_agg.values()),
        key=lambda x: x["total"],
        reverse=True,
    )
    avg_bill = round(total_revenue / total_bills, 2) if total_bills else 0.0

    return {
        "revenue_by_day": revenue_by_day,
        "top_items": top_items,
        "payment_breakdown": payment_breakdown,
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "total_bills": total_bills,
            "avg_bill": avg_bill,
            "voided_count": voided_count,
        },
    }


# --- Subscription ---
@api_router.get("/subscription")
async def get_subscription(admin: dict = Depends(require_admin)):
    rid = _rid(admin)
    if not rid:
        return {"plan": "enterprise", "max_branches": -1, "max_bills_per_month": -1, "price_inr": -1, "name": "Enterprise (Platform)"}
    try:
        restaurant = await db.restaurants.find_one({"_id": ObjectId(rid)})
    except Exception:
        restaurant = None
    plan_key = (restaurant or {}).get("plan", "free")
    plan_info = PLANS.get(plan_key, PLANS["free"])
    bills_this_month = await db.bills.count_documents({
        "restaurant_id": rid,
        "voided": {"$ne": True},
        "created_at": {"$gte": datetime.now(timezone.utc).replace(day=1).date().isoformat()},
    })
    return {
        "restaurant_id": rid,
        "restaurant_name": (restaurant or {}).get("name", ""),
        "plan": plan_key,
        "plan_name": plan_info["name"],
        "max_branches": plan_info["max_branches"],
        "max_bills_per_month": plan_info["max_bills_per_month"],
        "price_inr": plan_info["price_inr"],
        "bills_this_month": bills_this_month,
        "plan_expires_at": (restaurant or {}).get("plan_expires_at"),
        "all_plans": [
            {"key": k, **v} for k, v in PLANS.items()
        ],
    }


@api_router.post("/subscription/upgrade")
async def upgrade_subscription(plan: str = Query(...), admin: dict = Depends(require_admin)):
    if plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Unknown plan '{plan}'. Valid: {list(PLANS.keys())}")
    rid = _rid(admin)
    if not rid:
        raise HTTPException(status_code=400, detail="Super admin cannot change plan this way")
    await db.restaurants.update_one(
        {"_id": ObjectId(rid)},
        {"$set": {"plan": plan, "plan_upgraded_at": datetime.now(timezone.utc).isoformat()}},
    )
    plan_info = PLANS[plan]
    return {"ok": True, "plan": plan, "plan_name": plan_info["name"], "price_inr": plan_info["price_inr"]}


# --- Restaurants admin (super_admin only) ---
@api_router.get("/restaurants")
async def list_restaurants(admin: dict = Depends(require_super_admin)):
    docs = await db.restaurants.find().sort("created_at", -1).to_list(1000)
    return [_restaurant_to_out(d) for d in docs]


# --- Startup: seed admin + default menu + indexes ---
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@cafe.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})

    # Ensure a default restaurant exists for the seeded admin
    default_restaurant = await db.restaurants.find_one({"_id": "default"})
    if not default_restaurant:
        await db.restaurants.insert_one({
            "_id": "default",
            "name": "Brew & Bean Cafe",
            "owner_email": admin_email,
            "plan": "pro",
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Cafe Admin",
            "role": "admin",
            "restaurant_id": "default",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        updates: dict = {}
        if not verify_password(admin_password, existing["password_hash"]):
            updates["password_hash"] = hash_password(admin_password)
        if not existing.get("restaurant_id"):
            updates["restaurant_id"] = "default"
        if updates:
            await db.users.update_one({"email": admin_email}, {"$set": updates})


DEFAULT_MENU = [
    {"name": "Espresso",         "price": 120, "category": "Coffee", "description": "Strong single shot",
     "image_url": "https://images.unsplash.com/photo-1507915135761-41a0a222c709?w=500", "hsn_code": "2101"},
    {"name": "Cappuccino",       "price": 180, "category": "Coffee", "description": "Espresso with steamed milk foam",
     "image_url": "https://images.unsplash.com/photo-1607278967703-161b7cc497f9?w=500", "hsn_code": "2101"},
    {"name": "Latte",            "price": 200, "category": "Coffee", "description": "Smooth espresso with milk",
     "image_url": "https://images.unsplash.com/photo-1561882468-9110e03e0f78?w=500", "hsn_code": "2101"},
    {"name": "Americano",        "price": 140, "category": "Coffee", "description": "Espresso with hot water",
     "image_url": "https://images.unsplash.com/photo-1551030173-122aabc4489c?w=500", "hsn_code": "2101"},
    {"name": "Mocha",            "price": 220, "category": "Coffee", "description": "Chocolate latte",
     "image_url": "https://images.unsplash.com/photo-1578314675229-3df8d34c1eaa?w=500", "hsn_code": "2101"},
    {"name": "Green Tea",        "price": 100, "category": "Tea",    "description": "Refreshing green tea",
     "image_url": "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500", "hsn_code": "0902"},
    {"name": "Masala Chai",      "price": 90,  "category": "Tea",    "description": "Spiced Indian tea",
     "image_url": "https://images.unsplash.com/photo-1561598427-89eb3bf21f53?w=500", "hsn_code": "0902"},
    {"name": "Croissant",        "price": 150, "category": "Bakery", "description": "Flaky butter croissant",
     "image_url": "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500", "hsn_code": "1905"},
    {"name": "Blueberry Muffin", "price": 130, "category": "Bakery", "description": "Fresh baked muffin",
     "image_url": "https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=500", "hsn_code": "1905"},
    {"name": "Chocolate Brownie","price": 160, "category": "Bakery", "description": "Rich fudgy brownie",
     "image_url": "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=500", "hsn_code": "1905"},
    {"name": "Avocado Toast",    "price": 260, "category": "Food",   "description": "Sourdough with smashed avocado",
     "image_url": "https://images.unsplash.com/photo-1603046891744-76e6481cf539?w=500", "hsn_code": "1905"},
    {"name": "Club Sandwich",    "price": 280, "category": "Food",   "description": "Triple decker sandwich",
     "image_url": "https://images.unsplash.com/photo-1567234669003-dce7a7a88821?w=500", "hsn_code": "2106"},
]


async def seed_menu():
    count = await db.menu_items.count_documents({"restaurant_id": "default"})
    if count == 0:
        docs = []
        for it in DEFAULT_MENU:
            d = dict(it)
            d["created_at"] = datetime.now(timezone.utc).isoformat()
            d["restaurant_id"] = "default"
            d["available"] = True
            docs.append(d)
        await db.menu_items.insert_many(docs)


async def migrate_legacy_data():
    """Assign restaurant_id='default' to any records that predate multi-tenancy."""
    collections = ["users", "menu_items", "bills", "tables", "branches", "promos", "customers", "audit_log"]
    for col in collections:
        await db[col].update_many(
            {"restaurant_id": {"$exists": False}},
            {"$set": {"restaurant_id": "default"}},
        )
    # Ensure settings doc has restaurant_id
    await db.settings.update_many(
        {"restaurant_id": {"$exists": False}},
        {"$set": {"restaurant_id": "default"}},
    )


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.bills.create_index([("created_at", -1)])
    await db.bills.create_index([("restaurant_id", 1), ("created_at", -1)])
    await db.menu_items.create_index([("restaurant_id", 1), ("category", 1)])
    await db.customers.create_index([("restaurant_id", 1), ("phone", 1)])
    await db.promos.create_index([("restaurant_id", 1), ("code", 1)])
    await db.tables.create_index([("restaurant_id", 1), ("name", 1)])


@app.on_event("startup")
async def on_startup():
    await ensure_indexes()
    await migrate_legacy_data()   # must run before anything reads settings
    await seed_admin()
    await seed_menu()
    await _get_settings("default")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# --- Branches ---
class BranchIn(BaseModel):
    name: str
    address: Optional[str] = ""
    active: bool = True


@api_router.get("/branches")
async def list_branches(user: dict = Depends(get_current_user)):
    docs = await db.branches.find(_tq(user)).sort("name", 1).to_list(200)
    return [{"id": str(d["_id"]), "name": d["name"], "address": d.get("address", ""), "active": d.get("active", True)} for d in docs]


@api_router.post("/branches")
async def create_branch(payload: BranchIn, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    _td(admin, doc)
    res = await db.branches.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {"id": str(doc["_id"]), "name": doc["name"], "address": doc.get("address", ""), "active": doc.get("active", True)}


@api_router.put("/branches/{branch_id}")
async def update_branch(branch_id: str, payload: BranchIn, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(branch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    res = await db.branches.find_one_and_update(
        _tq(admin, {"_id": oid}), {"$set": payload.model_dump()}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Branch not found")
    return {"id": str(res["_id"]), "name": res["name"], "address": res.get("address", ""), "active": res.get("active", True)}


@api_router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(branch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    r = await db.branches.delete_one(_tq(admin, {"_id": oid}))
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Branch not found")
    return {"ok": True}


# --- Promo codes ---
class PromoIn(BaseModel):
    code: str
    discount_type: str = "percent"
    value: float
    max_uses: Optional[int] = None
    active: bool = True
    description: Optional[str] = ""


def _promo_to_out(d: dict) -> dict:
    return {
        "id": str(d["_id"]),
        "code": d["code"],
        "discount_type": d.get("discount_type", "percent"),
        "value": float(d.get("value", 0)),
        "max_uses": d.get("max_uses"),
        "uses": int(d.get("uses", 0) or 0),
        "active": bool(d.get("active", True)),
        "description": d.get("description", ""),
        "created_at": d.get("created_at"),
    }


@api_router.get("/promos")
async def list_promos(admin: dict = Depends(require_admin)):
    docs = await db.promos.find(_tq(admin)).sort("code", 1).to_list(500)
    return [_promo_to_out(d) for d in docs]


@api_router.post("/promos")
async def create_promo(payload: PromoIn, admin: dict = Depends(require_admin)):
    if payload.discount_type not in ("percent", "flat"):
        raise HTTPException(status_code=400, detail="discount_type must be 'percent' or 'flat'")
    code = payload.code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")
    if await db.promos.find_one(_tq(admin, {"code": code})):
        raise HTTPException(status_code=400, detail=f"Promo '{code}' already exists")
    doc = payload.model_dump()
    doc["code"] = code
    doc["uses"] = 0
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    _td(admin, doc)
    res = await db.promos.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _promo_to_out(doc)


@api_router.delete("/promos/{promo_id}")
async def delete_promo(promo_id: str, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(promo_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    r = await db.promos.delete_one(_tq(admin, {"_id": oid}))
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Promo not found")
    return {"ok": True}


@api_router.get("/promos/validate")
async def validate_promo(code: str, subtotal: float = 0.0, user: dict = Depends(get_current_user)):
    code = (code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code required")
    p = await db.promos.find_one(_tq(user, {"code": code, "active": True}))
    if not p:
        raise HTTPException(status_code=404, detail="Code invalid or inactive")
    if p.get("max_uses") and p.get("uses", 0) >= p["max_uses"]:
        raise HTTPException(status_code=400, detail="Code has reached its usage limit")
    if p.get("discount_type") == "percent":
        discount = round(max(0.0, subtotal) * float(p["value"]) / 100, 2)
    else:
        discount = round(min(float(p["value"]), max(0.0, subtotal)), 2)
    return {"code": p["code"], "discount_type": p["discount_type"], "value": float(p["value"]), "discount": discount, "description": p.get("description", "")}


# --- Customers / Loyalty ---
def _customer_to_out(d: dict) -> dict:
    return {
        "id": str(d["_id"]),
        "phone": d["phone"],
        "name": d.get("name", ""),
        "points": float(d.get("points", 0) or 0),
        "total_spent": float(d.get("total_spent", 0) or 0),
        "visits": int(d.get("visits", 0) or 0),
        "last_visit": d.get("last_visit"),
        "created_at": d.get("created_at"),
    }


@api_router.get("/customers")
async def list_customers(user: dict = Depends(get_current_user), limit: int = 500):
    docs = await db.customers.find(_tq(user)).sort("last_visit", -1).to_list(limit)
    return [_customer_to_out(d) for d in docs]


@api_router.get("/customers/by-phone/{phone}")
async def get_customer_by_phone(phone: str, user: dict = Depends(get_current_user)):
    d = await db.customers.find_one(_tq(user, {"phone": phone.strip()}))
    if not d:
        return None
    return _customer_to_out(d)


# --- Tables ---
class TableIn(BaseModel):
    name: str
    capacity: int = 2
    branch_id: Optional[str] = None
    active: bool = True


def _table_to_out(d: dict) -> dict:
    return {
        "id": str(d["_id"]),
        "name": d["name"],
        "capacity": int(d.get("capacity", 2)),
        "branch_id": d.get("branch_id"),
        "active": bool(d.get("active", True)),
        "status": d.get("status", "free"),
        "active_bill_id": d.get("active_bill_id"),
        "restaurant_id": d.get("restaurant_id"),
    }


@api_router.get("/tables")
async def list_tables(user: dict = Depends(get_current_user)):
    docs = await db.tables.find(_tq(user)).sort("name", 1).to_list(500)
    return [_table_to_out(d) for d in docs]


@api_router.post("/tables")
async def create_table(payload: TableIn, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["status"] = "free"
    doc["active_bill_id"] = None
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    _td(admin, doc)
    res = await db.tables.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _table_to_out(doc)


@api_router.put("/tables/{table_id}")
async def update_table(table_id: str, payload: TableIn, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(table_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    res = await db.tables.find_one_and_update(
        _tq(admin, {"_id": oid}), {"$set": payload.model_dump()}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Table not found")
    return _table_to_out(res)


@api_router.delete("/tables/{table_id}")
async def delete_table(table_id: str, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(table_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    r = await db.tables.delete_one(_tq(admin, {"_id": oid}))
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    return {"ok": True}


# --- Stripe payments ---
@api_router.post("/payments/checkout/{bill_id}")
async def stripe_checkout(bill_id: str, request: Request, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(bill_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    bill = await db.bills.find_one(_tq(user, {"_id": oid}))
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Bill is already paid")
    if bill.get("voided"):
        raise HTTPException(status_code=400, detail="Cannot pay a voided bill")

    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    try:
        from emergentintegrations.payments.stripe.checkout import (
            StripeCheckout, CheckoutSessionRequest,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Stripe SDK unavailable: {e}")

    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)

    amount = float(bill["total"])
    currency = (bill.get("currency", "INR") or "INR").lower()
    success_url = f"{origin}/bills/{bill_id}?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/bills/{bill_id}"
    req = CheckoutSessionRequest(
        amount=amount, currency=currency,
        success_url=success_url, cancel_url=cancel_url,
        metadata={"bill_id": bill_id, "bill_number": bill["bill_number"]},
    )
    session = await checkout.create_checkout_session(req)
    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "bill_id": bill_id,
        "amount": amount,
        "currency": currency,
        "metadata": {"bill_number": bill["bill_number"]},
        "payment_status": "pending",
        "status": "open",
        "provider": "stripe",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": session.url, "session_id": session.session_id}


@api_router.get("/payments/status/{session_id}")
async def stripe_status(session_id: str, user: dict = Depends(get_current_user)):
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    checkout = StripeCheckout(api_key=api_key, webhook_url="")
    status = await checkout.get_checkout_status(session_id)
    tx = await db.payment_transactions.find_one({"session_id": session_id})
    if tx and status.payment_status == "paid" and tx.get("payment_status") != "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "status": status.status, "paid_at": datetime.now(timezone.utc).isoformat()}},
        )
        bill_id = tx.get("bill_id")
        if bill_id:
            try:
                await db.bills.update_one({"_id": ObjectId(bill_id)}, {"$set": {"payment_status": "paid"}})
            except Exception:
                pass
    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
    }


@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return {"ok": False, "reason": "stripe-not-configured"}
    body = await request.body()
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        checkout = StripeCheckout(api_key=api_key, webhook_url="")
        evt = await checkout.handle_webhook(body, request.headers.get("Stripe-Signature"))
    except Exception:
        return {"ok": False}
    if evt and evt.payment_status == "paid":
        tx = await db.payment_transactions.find_one({"session_id": evt.session_id})
        if tx and tx.get("payment_status") != "paid":
            await db.payment_transactions.update_one(
                {"session_id": evt.session_id},
                {"$set": {"payment_status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}},
            )
            bill_id = tx.get("bill_id")
            if bill_id:
                try:
                    await db.bills.update_one({"_id": ObjectId(bill_id)}, {"$set": {"payment_status": "paid"}})
                except Exception:
                    pass
    return {"ok": True}


# --- WhatsApp send via Twilio ---
class WhatsAppSendIn(BaseModel):
    phone: str
    message: Optional[str] = None


@api_router.post("/bills/{bill_id}/whatsapp")
async def whatsapp_send(bill_id: str, payload: WhatsAppSendIn, user: dict = Depends(get_current_user)):
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_ = os.environ.get("TWILIO_WHATSAPP_FROM", "")
    if not (sid and token and from_):
        raise HTTPException(status_code=503, detail="WhatsApp is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM to backend .env")
    try:
        oid = ObjectId(bill_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid bill id")
    bill = await db.bills.find_one(_tq(user, {"_id": oid}))
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    phone = payload.phone.strip()
    if not phone.startswith("+"):
        raise HTTPException(status_code=400, detail="Phone must be in E.164 format (e.g. +14155551234)")
    body = payload.message or _format_bill_text(bill)
    try:
        from twilio.rest import Client
        twilio_client = Client(sid, token)
        msg = twilio_client.messages.create(from_=from_, to=f"whatsapp:{phone}", body=body)
        return {"ok": True, "message_sid": msg.sid, "status": msg.status}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Twilio error: {e}")


def _format_bill_text(bill: dict) -> str:
    curr = bill.get('currency', 'INR')
    lines = [
        f"*{bill.get('cafe_name', 'Cafe')}*",
        f"Bill {bill.get('bill_number')}",
        "",
    ]
    for it in bill.get("items", []):
        line_total = max(0.0, it.get("price", 0) * it.get("quantity", 0) - (it.get("discount", 0) or 0))
        lines.append(f"• {it.get('name')} ×{it.get('quantity')} — {curr} {line_total:.2f}")
    lines.append("")
    lines.append(f"Subtotal: {curr} {bill.get('subtotal', 0):.2f}")
    if bill.get("tax_amount", 0):
        gst_type = bill.get("gst_type", "cgst_sgst")
        tax_a = float(bill.get("tax_amount", 0))
        if gst_type == "igst":
            lines.append(f"IGST ({bill.get('tax_percent', 0)}%): {tax_a:.2f}")
        else:
            lines.append(f"CGST ({bill.get('tax_percent', 0)/2}%): {(tax_a/2):.2f}")
            lines.append(f"SGST ({bill.get('tax_percent', 0)/2}%): {(tax_a/2):.2f}")
    if bill.get("service_amount", 0):
        lines.append(f"Service: {bill['service_amount']:.2f}")
    if bill.get("tip_amount", 0):
        lines.append(f"Tip: {bill['tip_amount']:.2f}")
    lines.append(f"*Total: {curr} {bill.get('total', 0):.2f}*")
    if bill.get("gstin"):
        lines.append(f"GSTIN: {bill['gstin']}")
    lines.append("")
    footer = bill.get("receipt_footer", "Thank you! 🙏")
    lines.append(footer or "Thank you! 🙏")
    return "\n".join(lines)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
