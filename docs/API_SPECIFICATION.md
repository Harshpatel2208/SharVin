# SharVin: API Specification

**Status:** PROPOSED (Awaiting Developer Approval)
**Last Updated:** 2026-10-31
**Base URL:** `/api/v1`

All responses follow a standard envelope:
```json
{
  "success": true,
  "data": {},
  "error": null,
  "timestamp": "2026-10-12T10:00:00Z"
}
```

---

## 1. Authentication & Tenant Context `[CONFIRMED REQUIREMENT; IMPLEMENTATION IN_REVIEW]`

- `POST /api/v1/auth/register` - Register a Retailer or Wholesaler business + owner account; passwords require at least 12 characters.
- `POST /api/v1/auth/signup` - Validates the email domain's MX records, atomically provisions the tenant/profile/owner, stores an OTP hash, sends a 6-digit email code, and returns `PENDING_VERIFICATION` (no session until verified). Missing/invalid MX returns HTTP 400 with `This email domain cannot receive emails. Please check your address.`
- `POST /api/v1/auth/verify-email` - Accepts `{ email, otp }`; validates the 10-minute code and returns the owner session on success. Five incorrect attempts invalidate the code.
- `POST /api/v1/auth/resend-otp` - Accepts `{ email }`; validates MX, uses an account-level 60-second cooldown and IP rate limit, and maps Brevo recipient rejections to a user-facing 400. Response does not confirm whether an account exists.
- `POST /api/v1/auth/login` - Authenticate a business owner or tenant staff member using phone/email and password. Returns an 8-hour HS256 bearer JWT; JWT_SECRET must be configured (32+ characters). Login is rate-limited.
- `GET /api/v1/auth/me` - Fetch the active principal, tenant, role, and permissions; active tenant/staff status and permissions are resolved server-side.
- `POST /api/v1/auth/sub-accounts` - Owner-only staff creation; returns a generated temporary password once when no password is supplied.
- `GET /api/v1/auth/sub-accounts` - Owner-only staff listing; credential hashes are never returned.
- `PATCH /api/v1/auth/update-owner-pin` - Owner-only PIN update.
- `GET /api/v1/auth/demo-users` - Development only, and requires `ENABLE_DEMO_CREDENTIALS=true` plus `DEMO_PASSWORD`. Returns only the two explicitly seeded local demo accounts. This endpoint never enumerates real tenant users and returns 404 outside the opted-in development environment.
- `GET /api/v1/auth/dev-users` - Developer workflow endpoint (developer-confirmed 2026-11-01). Returns every active registered owner account (name, email, role, business name, verification state) for the `/login` Quick Test Accounts card. Active only when `NODE_ENV` is neither `production` nor `test`; returns 404 otherwise. Password hashes are never returned; the plain password is included only for accounts whose hash matches the explicitly configured `DEMO_PASSWORD`.
- `POST /api/v1/auth/dev-login` - Same development gate. Accepts `{ userId }` for an already email-verified active owner and issues the identical 8-hour owner JWT that password login would produce (no password transmission).
- `POST /api/v1/auth/dev-verify` - Same development gate. Accepts `{ userId }`, skips the emailed OTP, marks the account email-verified, and returns the owner session the production verification flow issues.

Clients send `Authorization: Bearer <token>`. The token identifies both tenant (`userId`) and principal (`principalId`, `principalKind`); API authorization is based on the active database principal and permissions, not client role claims. Staff permission overrides are stored per tenant staff account. A login identifier matching multiple principals fails closed.

---

## 2. Retailer POS & Inventory Endpoints `[PROPOSED]`

- `GET /api/v1/pos/products` - Search and fetch products for counter billing (with barcode lookup).
- `POST /api/v1/pos/sales` - Record counter sale, instantly decrements local product inventory.
- `GET /api/v1/inventory/alerts` - List products below `min_reorder_threshold`.
- `POST /api/v1/inventory/restock-trigger` - 1-Click action: adds low-stock product to the linked wholesaler cart.

---

## 3. Wholesale Orders & Supplier Carts `[PROPOSED]`

- `GET /api/v1/wholesale/carts` - Retrieve active draft carts grouped by wholesaler.
- `POST /api/v1/wholesale/carts/:wholesalerId/items` - Add/modify items in a specific wholesaler's cart.
- `POST /api/v1/wholesale/carts/:wholesalerId/initiate-order` - Convert cart into a negotiation order, open negotiation channel.
- `GET /api/v1/wholesale/orders/:orderId` - Fetch order details, line items, and current status.
- `GET /api/v1/wholesale/orders` - Filter orders by status (`NEGOTIATING`, `RATE_LOCKED`, `DISPATCHED`, `DELIVERED`).

---

## 4. Live Negotiation & Rate Lock Endpoints `[PROPOSED]`

- `GET /api/v1/orders/:orderId/messages` - Fetch chat history and past price proposals.
- `POST /api/v1/orders/:orderId/propose-rate` - Submit a formal price counter-offer with revised line items.
- `POST /api/v1/orders/:orderId/confirm-rate` - Confirm agreed pricing. When both parties confirm, triggers automatic rate-lock state transition.

---

## 5. Delivery Handover & Two-Way OTP `[PROPOSED]`

- `POST /api/v1/orders/:orderId/dispatch` - Wholesaler assigns delivery agent and generates 2-way OTP hash.
- `GET /api/v1/orders/:orderId/handover-code` - Retailer retrieves their confidential handover OTP.
- `POST /api/v1/orders/:orderId/verify-handover` - Delivery agent inputs the retailer OTP on-site to verify physical handover.

### 5.1 Dispute, Credit Note & Rebalance Endpoints (P1) `[CONFIRMED; IMPLEMENTED_AND_VERIFIED 2026-11-05]`

All of the following are backed exclusively by PostgreSQL (`delivery_disputes`, `credit_notes`, `delivery_rebalances`) — see `docs/DATABASE_DESIGN.md` §7. Response shapes are unchanged; only the storage moved out of process memory.

- `GET /api/v1/orders/:orderId/rebalance-summary` (`delivery.read`) — returns the stored rebalance report. Pure read: it no longer re-executes the stock mutation when the report is missing.
- `GET /api/v1/orders/:orderId/dispute` (`delivery.read`) — latest dispute for the order (`id` or `order number` accepted) with its linked credit note and inspection snapshot; `404` when none exists.
- `POST /api/v1/orders/:orderId/dispute/resolve` (`credit.manage`) — `{ action: 'approve_credit_note' | 'reject_claim' | 'negotiate_allowance', resolutionNotes?, allowanceAmount? }`. Updates the dispute row (status, `resolution_notes`, `resolved_at`, `escrow_hold_amount` → 0) and the linked credit note (`approved_by_wholesaler`) in one transaction. Wholesaler-of-record only.
- `GET /api/v1/delivery/credit-notes/:id` and `.../credit-notes/:id/csv` (`ledger.read`) — `:id` resolves by credit note id, credit note number, order id or order number; only the issuing wholesaler or receiving retailer may read it.
- `POST /api/v1/deliveries/driver-portal/:token/verify-otp` (public, tokenized) — partial deliveries here create the same dispute + credit note rows with `reported_by = 'driver-link-session'`.

Contract details:
- `creditNoteId`/`disputeId` are now the PostgreSQL row UUIDs (previously fabricated `cn-<timestamp>`/`disp-<timestamp>` values); `creditNoteNumber` and `disputeNumber` are sequential (`CN-<year>-<serial>`, `DSP-<year>-<serial>`).
- Re-issuing `verify-handover` on a delivered order is idempotent: it replays the persisted figures (same accepted/damaged units, same credit note) instead of returning first-instance-only defaults.
- Error contract: `404 NOT_FOUND` when the order identifier is not persisted ("... does not exist in PostgreSQL ..."), `403 FORBIDDEN` on tenant mismatch, `409 CONFLICT` on a sequential-number race, `500 INTERNAL_SERVER_ERROR` naming the failed operation and the database cause. Delivery writes are never silently skipped anymore.

---

## 6. B2B Cash & Credit Ledger Endpoints `[PROPOSED]`

- `GET /api/v1/ledger/relationships/:partnerBusinessId` - View outstanding balance, credit limit, and summary with a partner.
- `GET /api/v1/ledger/transactions/:partnerBusinessId` - View chronological, append-only statement of ledger transactions.
- `POST /api/v1/ledger/settlements` - Record a cash or UPI payment settlement between retailer and wholesaler against pending balance.

---

## 7. Realtime WebSocket Events (Socket.io) `[PROPOSED]`

- **Rooms:** `order:<orderId>`
- **Client to Server:**
  - `join_order_room` (`{ orderId }`)
  - `send_chat_message` (`{ orderId, content }`)
  - `submit_price_proposal` (`{ orderId, proposedItems }`)
- **Server to Client:**
  - `chat_message_received` (`{ messageId, sender, content, timestamp }`)
  - `price_proposal_received` (`{ proposalId, proposedItems }`)
  - `rate_lock_updated` (`{ orderId, retailerConfirmed, wholesalerConfirmed, isLocked }`)
  - `delivery_status_changed` (`{ orderId, status }`)

### 7.1 Multi-Item Line Negotiation Events (P1.2) `[CONFIRMED (developer-confirmed 2026-11-04); IMPLEMENTED]`

Both parties join the `order:<orderId>` room and receive live, per-line negotiation updates. The whole-order events are retained for compatibility and the per-line events are emitted **additionally** (alias approach — no existing consumer breaks):

- Whole-order (existing): `rate_proposed` (full `items[]` array), `rate_locked` (bilateral seal), `rate_confirmation_pending` (one side confirmed).
- Per-line (new): `line_rate_proposed` (`{ orderId, proposalId, version, orderItemId, productName, quantity, originalUnitPrice, proposedUnitPrice, gstRate, lineExGstTotal, lineGstAmount, lineLandedCost, isContested, status, proposerRole, timestamp }`) — emitted once per contested line.
- Per-line (new): `line_rate_locked` (`{ ..., finalUnitPrice, gstRate, lineExGstTotal, lineGstAmount, lineLandedCost, reason: 'uncontested' | 'mutual_confirmation' | 'deal_sealed', timestamp }`) — a per-line "frozen" visual signal (uncontested lines during a proposal; every line at the final seal).
- Whole-order (new alias): `order_price_locked` — same payload as `rate_locked`, emitted when both parties confirm.

Locking remains **bilateral and whole-order** (the seal); `line_rate_locked` is a per-line UI signal, not an independent per-line contract. Per-line `gstRate` and tax amounts are server-sourced from the single invoice HSN/GST convention (`InvoiceService.getHsnAndGstRate`), so negotiation prices stay Ex-GST and the client renders an estimated GST + Landed Cost without re-implementing tax logic. Margin-floor validation (Ex-GST `wholesaler_products.margin_floor_price`, falling back to a derived floor) is enforced before any success event is emitted.

---

## 8. OMS Lifecycle Transitions `[PROPOSED]`

- `PATCH /api/v1/orders/:orderId/lifecycle` - Authenticated participant transition request. The server checks the current lifecycle, authenticated user role and order ownership, business preconditions, optional `expectedFromStatus`, and structured `reason`; the state update and `order_events` append commit atomically.
- Request body:

```json
{
  "toStatus": "submitted",
  "expectedFromStatus": "draft",
  "reason": {
    "code": "retailer_submitted_cart",
    "message": "Retailer submitted the cart for wholesale negotiation"
  }
}
```

- Lifecycle values: `draft`, `submitted`, `accepted`, `picking`, `dispatched`, `delivered`, `rejected`, `cancelled`, `partially_fulfilled`.
- The existing `orderStatus` continues to serve cart, pricing negotiation, and delivery compatibility. OMS transitions use `lifecycleStatus`; do not write it directly from a controller or client.
- Rejections, cancellations, and partial fulfillment require a reason. Partial fulfillment also requires structured `reason.details`.

---

## 9. Notifications & Activity Feed `[CONFIRMED REQUIREMENT; IMPLEMENTED (developer-confirmed 2026-11-01)]`

- `GET /api/v1/notifications/activity` - Authenticated, read-only, tenant-scoped (`req.user.tenantId`). Aggregates the `notifications` table with real business activity (retailer `stock_alerts`, both parties' `order_events`, `order_price_history`, and `deliveries`) from the last 7 days, newest first, capped at 20 items. Also returns sidebar badge counters computed from live state: `activeAlerts` (pending stock alerts), `openPos` (non-draft orders), `activeOrders` (in-progress lifecycle), `pendingDeliveries`, `newOrders` (wholesaler-side), and `unreadNotifications`. The web header popover and sidebar badges consume only this endpoint; no seeded or mocked activity strings are used, and an empty feed renders "No recent activity".
