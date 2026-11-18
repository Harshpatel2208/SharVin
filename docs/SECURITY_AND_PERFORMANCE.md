# SharVin: Security & Performance Specifications

**Status:** PROPOSED (Awaiting Developer Approval)
**Last Updated:** 2026-11-05

---

## 1. Security Architecture & Controls `[PROPOSED]`

### 1.1. Tenant Isolation & Authorization
- Every operational query in the shared backend must enforce tenancy scoping via `business_id`.
- Role-Based Access Control (RBAC):
  - Retailers can never access wholesaler internal catalog costs or other retailers' carts.
  - Wholesalers can never access private retail counter POS sales records.
- Owners and tenant staff authenticate through password login protected by a rate limiter. Passwords use bcrypt; owner registrations require 12+ characters. Login identifiers must resolve to exactly one active principal.
- Signup is not authenticated until the email is verified. Email OTPs use a cryptographically secure six-digit code, 10-minute expiration, HMAC-SHA256 storage keyed from `JWT_SECRET`, five per-account attempts, a 60-second resend cooldown, and IP-level rate limits. OTPs are never logged or stored in plaintext.
- Transactional email uses Brevo's `/v3/smtp/email` REST API. `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` are server-only configuration; send failures clear the stored code and return a retryable 503.
- Signup and resend perform DNS MX validation before creating/sending an OTP; absent or invalid MX returns a 400, while transient DNS failures return a retryable 503. Synchronous Brevo recipient rejections delete the still-unverified signup and return a correction prompt instead of auto-retrying. MX validates a receiving domain, not the existence of a specific mailbox; later bounces require provider webhook handling if automated suppression is needed.
- JWT access tokens use HS256, issuer/audience validation, an 8-hour expiry, and a configured `JWT_SECRET` of at least 32 characters. There is no hardcoded secret or demo-token bypass. HTTP and Socket.IO check the active tenant/staff record; server permissions are reloaded from the database for HTTP requests.
- Staff role defaults and per-person permission overrides are resolved server-side. UI route guards only improve navigation; API middleware enforces permissions. Public routes are limited to explicitly tokenized/verification flows.
- Browser access tokens currently use `sessionStorage`; production should evaluate same-site, HttpOnly cookie sessions as an XSS-resistant alternative before launch. Never put bearer tokens in URLs or logs.
- Deploy the additive auth/RBAC migration and regenerate Prisma Client before rollout. Account lifecycle, password reset, refresh-token rotation, MFA, and credential revocation are follow-up hardening tasks.
- The Developer Accounts drawer is compiled into development builds only. Its optional demo endpoint requires explicit development configuration and returns only fixed seeded demo identities with the configured shared demo password. It must never list all users or return customer credentials; the seed command refuses to run outside the opted-in development environment.

### 1.2. Two-Way OTP Verification Hardening
- Retailer OTP is generated using a cryptographically secure random number generator (6 digits).
- The raw OTP is never stored in plaintext in the database; it is stored as an HMAC/bcrypt hash.
- Max 3 consecutive incorrect validation attempts before a temporary 15-minute freeze to eliminate brute-force risk.
- Verification endpoint records the delivery agent timestamp and geo/device signature.

### 1.3. Concurrency & Rate Lock Integrity
- Mutual rate locking involves simultaneous user actions. Database-level row locking (`SELECT FOR UPDATE` or Prisma transactions) prevents race conditions.
- Rate lock status transitions cannot be bypassed: once `is_locked` is `true`, prices and line items become strictly immutable.
- Stock allocation at the wholesaler warehouse occurs within the same atomic transaction as rate locking.

### 1.4. Financial Ledger Non-Repudiation
- Ledger table is strictly append-only (no `UPDATE` or `DELETE` permissions at the application query level).
- Adjustments are recorded as new compensating transactions (`CREDIT_ADJUSTMENT`), maintaining historical auditability.
- Current implementation design adds DB triggers blocking journal updates/deletes, unique source-event idempotency, and deferred balanced-entry checks. Apply least-privilege database roles as a separate deployment hardening task; triggers are defense in depth, not a substitute for removing direct write privileges.
- Credit exposure checks lock the trading relationship and account row, count existing reserved credit, and compute overdue open invoice balances after order-linked credits then FIFO unassigned payments. Test lock contention and payment races against PostgreSQL before rollout.

### 1.5. Input Validation & OWASP Defenses
- Schema validation via Zod / Joi on all API inputs before hitting business controllers.
- CORS configured strictly to authorized origins.
- Rate limiting implemented on authentication, price proposals, and OTP verification endpoints.

### 1.6. Delivery Persistence, Error Surfacing & Statutory Records (P1) `[CONFIRMED; IMPLEMENTED_AND_VERIFIED 2026-11-05]`
- **Fail-closed authorization:** tenant-scoping reads in `delivery.service.ts` (`getDispute`, `getDeliveryStatus`, `getRebalanceSummary`, `getRetailerHandoverCode`, `verifyHandover`) previously ran inside a `try/catch` that re-threw only `Forbidden:` messages, so any other database error silently **skipped** the party check. They now surface the error (500, with the operation name and DB cause) and never fall through unauthenticated.
- **No silent write loss:** the swallow-and-log guard on the dispatch/handover writes is removed. A rejected PostgreSQL write aborts the request with a monitored error instead of returning a success whose state exists only in that process.
- **Statutory immutability:** `credit_notes` and `delivery_disputes` keep `items_snapshot`, `double_entry_journal` and `signature_hash` (SHA-256 seal) as written; foreign keys to orders/users use `onDelete: Restrict` so an order cannot silently erase audit evidence. Sequential `CN-<year>-<serial>` / `DSP-<year>-<serial>` numbers are guarded by unique indexes; a concurrent race returns `409 CONFLICT` rather than duplicating a statutory number.
- **Credit-note read gate:** resolution by credit note id, credit note number, order id or order number always passes the party check (issuing wholesaler or receiving retailer) — cross-tenant identifiers return `403`, unknown ones `404`.
- **OPEN (needs developer decision, deliberately unchanged):** `dispatchOrder` authorizes with `userRole !== 'wholesaler' && dbOrder.wholesalerId !== userId`, which permits any authenticated wholesaler to dispatch another tenant's order. Tightening it also alters the retailer/driver auto-dispatch paths, so it is listed as a known gap rather than silently re-scoped. See `PROJECT_CONTEXT.md` (2026-11-05 handoff, open question 2).
- **Statelessness/performance:** dispute, credit-note and rebalance reads are single indexed lookups (`order_id`, `status`, `credit_note_id` unique) served from PostgreSQL, so any API instance answers them; `GET /rebalance-summary` no longer performs stock writes on read.

---

## 2. Performance SLOs `[PROPOSED]`

- **POS Counter Lookup:** P95 response time < 80ms (optimized barcode and SKU indexes).
- **Cart & Order Retrieval:** P95 response time < 150ms.
- **WebSocket Latency:** Chat and rate lock update delivery < 200ms.
- **Database Indexing:** Indexed foreign keys, status filters, and search fields (`business_id`, `order_id`, `barcode`, `created_at`).
