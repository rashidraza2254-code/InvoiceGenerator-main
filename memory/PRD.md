# PRD — Cafe Bill Generator ("Brew & Bean")

## Original problem statement
"Make a bill generator software for a cafe. Users should be able to add/subtract items from the menu and it should generate the bill."

## User choices (gathered)
- Editable menu (admin manages items)
- Bill features: Tax + Discount + Service charge
- Save bill history (with date / items / total)
- Output: on-screen printable receipt + downloadable PDF
- Auth: Simple JWT-based login (httpOnly cookies)

## Architecture
- **Frontend**: React 19 + React Router + Tailwind + shadcn UI + jsPDF
- **Backend**: FastAPI + Motor (async MongoDB) + PyJWT + bcrypt
- **DB**: MongoDB collections — `users`, `menu_items`, `bills`, `settings`

## User personas
- **Cafe owner / Admin** — manages menu, sets default tax / service / cafe info
- **Cashier** — takes orders at the POS, generates and prints bills

## Core requirements (static)
1. Login / logout with email + password (JWT cookies)
2. Browse menu by category, search, tap to add to cart, adjust quantity (+/−), remove items
3. Apply per-bill: tax %, service %, discount (₹)
4. Generate bill → live totals → save to history
5. Receipt: printable + PDF download
6. Bill history with daily / lifetime stats
7. Settings: cafe name, address, currency, default tax / service %

## What's been implemented (2026-02 — initial build)
- ✅ JWT auth: register / login / logout / me, bcrypt hashed, admin auto-seeded
- ✅ Menu CRUD + 12-item demo seed (Coffee / Tea / Bakery / Food)
- ✅ Settings GET / PUT with currency selector
- ✅ POS page: tabbed menu, search, cart with +/- / remove, live total math, tax / service / discount fields, customer name
- ✅ Bill creation w/ snapshotted items and totals, unique bill_number
- ✅ Bill history page with stats summary cards
- ✅ Bill view page with Receipt component (printable + PDF via jsPDF)
- ✅ Sidebar layout (desktop) + mobile bottom nav
- ✅ Cohesive earthy / warm-toned design (Manrope + DM Sans, cafe palette)
- ✅ 23/23 backend tests passing

## What's been implemented (2026-02 — iteration 2)
- ✅ Per-item discount (flat ₹ amount per cart line, clamped at 0)
- ✅ Payment mode capture (Cash / Card / UPI / Other) on every bill — shown on receipt, PDF, and history
- ✅ Role-based permissions (admin vs cashier) enforced server-side via `require_admin`
  - Menu mutations, Settings PUT, and `/users` endpoints are admin-only (403 for cashier)
  - Layout sidebar hides admin nav items from cashiers; `ProtectedRoute adminOnly` blocks deep links
- ✅ Date-range filter on Bill History (from / to dates, inclusive)
- ✅ Payment-mode filter on Bill History
- ✅ CSV export (`/api/bills/export`) — respects the same filters; downloadable blob in UI
- ✅ Users management page (admin-only): list users, create cashier/admin, delete (self-delete blocked)
- ✅ 56/56 backend tests passing (23 iter-1 + 33 iter-2)

## What's been implemented (2026-02 — iteration 3)
- ✅ Split-bill / multi-payment per bill (Cash + UPI + …) — sum validated == total ±0.01, primary mode = first entry, stored on `bill.payments[]`
- ✅ Bill **void with audit trail** (admin-only) — `voided`, `voided_at`, `voided_by`, `voided_reason`; double-void rejected; voided bills excluded from `/stats/summary` and `/analytics`; UI shows VOID badge + strikethrough in history and a translucent "VOID" stamp on the receipt/PDF
- ✅ Append-only audit log (`/api/audit-log`, admin-only) — every void records `action`, `bill_id`, `actor_email`, `reason`, `at`
- ✅ Analytics dashboard (`/analytics`, admin-only) using **recharts**:
  - Daily revenue area chart (7d / 30d / 90d range toggle, zero-filled)
  - Top items by revenue (vertical bar chart) + breakdown list with rank + qty
  - Payment mode donut chart (fan-out per payment in split bills)
  - KPI cards: total revenue, total bills, avg ticket, voided count
- ✅ Receipt + PDF updated to display split-payment breakdown and VOID stamp
- ✅ 83/83 backend tests passing (23 iter-1 + 33 iter-2 + 27 iter-3)

## Prioritized backlog
### P1
- Inventory tracking (deduct stock on bill, low-stock alerts)
- WhatsApp / SMS bill delivery with customer phone capture
- Tip / gratuity field on bills

### P2
- KOT (kitchen order ticket) printing separated from customer receipt
- Table / floor map module
- Customer loyalty (phone-based) and promo codes

### P3
- Multi-cafe / branches support
- Stripe / Razorpay online payments / QR codes
- Mobile app shell / PWA + offline POS

## Default credentials
admin@cafe.com / admin123 (see `/app/memory/test_credentials.md`)
