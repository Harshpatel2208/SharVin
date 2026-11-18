# SharVin: Architectural Decision Records (ADR)

**Last Updated:** 2026-10-12

This document tracks all key technical and product decisions, their context, status, and superseded records.

---

## ADR-001: Platform Rollout Sequencing
- **Date:** 2026-10-12
- **Status:** `CONFIRMED`
- **Context:** SharVin needs to support local retail shops (counter/mobile) and wholesalers across multiple devices.
- **Decision:** Roll out platforms in the strict order:
  1. Website First (Responsive web app for both Retailer and Wholesaler).
  2. Android Application Second.
  3. Windows Application Third.
- **Consequences:** All clients must interface with a single, decoupled, shared backend API and database. No server-side HTML rendering coupling.
- **Supersedes:** None.

---

## ADR-002: Source of Truth and Documentation Integrity Protocol
- **Date:** 2026-10-12
- **Status:** `CONFIRMED`
- **Context:** Solo developer working ~2 hours/day with AI assistance requires absolute clarity, zero duplicate files, and rigorous change control.
- **Decision:** Adopt the 9-point engineering protocol governed by `AGENTS.md` and tracked in `PROJECT_CONTEXT.md` and `docs/`.
- **Supersedes:** None.

---

## ADR-003: Core Tech Stack Selection
- **Date:** 2026-10-12
- **Status:** `CONFIRMED`
- **Context:** Solo developer needs high velocity, strong typing, low learning curve overhead, and a production-grade relational backend suitable for B2B financial transactions.
- **Decision:**
  - **Language:** TypeScript end-to-end.
  - **Backend:** Node.js + Express with TypeScript.
  - **Database:** PostgreSQL with Prisma ORM.
  - **Realtime:** Socket.io for live chat & instant bilateral price locks.
  - **Frontend:** React + Vite + Tailwind/CSS.
- **Alternative Considered:** Next.js full-stack (rejected for backend decoupling: separating backend API makes Android & Windows client consumption much cleaner and standard).
- **Supersedes:** None.

---

## ADR-004: Bilateral Rate Lock Mechanism
- **Date:** 2026-10-12
- **Status:** `CONFIRMED`
- **Context:** B2B wholesale prices fluctuate based on negotiation. Both parties must formally agree to prevent disputes upon delivery.
- **Decision:** Orders in negotiation cannot be dispatched until both Retailer and Wholesaler confirm the proposed line item rates, producing an immutable rate lock record.
- **Supersedes:** None.

---

## ADR-005: Two-Way Delivery Handover via OTP
- **Date:** 2026-10-12
- **Status:** `CONFIRMED`
- **Context:** Unattended drops and disputed deliveries create friction in traditional wholesale distribution.
- **Decision:** Implement a two-way handover verification where the retailer receives a secure 6-digit OTP that the delivery agent must verify on-site upon physical handover before delivery is marked complete.
- **Supersedes:** None.

---

## ADR-006: Additive OMS Lifecycle During Compatibility Rollout
- **Date:** 2026-10-28
- **Status:** `CONFIRMED`
- **Context:** The existing `orders.order_status` is coupled to editable carts, live price negotiation, and delivery status. Replacing it immediately with the new OMS lifecycle could break these flows.
- **Decision:** Add `orders.lifecycle_status` and `order_events` for the strict OMS lifecycle while retaining the existing `order_status` for compatibility. Lifecycle writes go through a server-side transition service that locks the order and atomically appends an actor/reason event. Migrate legacy integrations incrementally and define a later cutover only after compatibility is verified.
- **Consequences:** During rollout there are two order-state dimensions. Documentation and APIs must name them explicitly; clients must not infer one from the other. Transition rules are centrally enforced by the OMS service. Stock reservations are tied to order items so cancellation/rejection can release stock exactly once and dispatch can consume the reservation.
- **Supersedes:** None.

---

## ADR-007: Unassigned Payment Allocation and Append-Only Ledger
- **Date:** 2026-10-28
- **Status:** `CONFIRMED` (payment allocation policy); `PROPOSED` (implementation pending database deployment and verification)
- **Context:** A retailer may pay without naming an invoice, while open invoices can be overdue and credit checks must reflect outstanding invoice balances.
- **Decision:** Apply payment amounts to explicitly linked invoices first. Allocate any remaining unassigned payment FIFO to the oldest open invoices. Posted ledger transactions and entries are append-only; corrections use reversing postings that reference the original source transaction.
- **Consequences:** Credit decisions use remaining invoice balances rather than invoice age alone. The ledger schema migration must be reviewed and deployed, and legacy journal entries reconciled before production use.
- **Supersedes:** None.

---

## ADR-008: Tenant-Scoped Authentication and Database-Resolved RBAC
- **Date:** 2026-10-31
- **Status:** `CONFIRMED` (requested auth/RBAC behavior); implementation verification pending Prisma Client generation and migration deployment.
- **Context:** Retailer and wholesaler owners and staff need authenticated access with enforceable tenant boundaries. Client role switches or JWT permission claims cannot be trusted as authorization sources.
- **Decision:** Use bcrypt password authentication and short-lived HS256 bearer access tokens with a required environment secret. Identify tenant and principal separately in the token. Revalidate active tenant/staff and resolve effective permissions from PostgreSQL for each API request; apply matching permission checks to relevant HTTP routes and authenticated Socket.IO connections. Browser route guards only control presentation. Do not accept demo or unauthenticated socket identities.
- **Consequences:** Staff users need an owner-provisioned credential and the auth/RBAC migration. Password reset, refresh-token rotation, MFA, and session revocation lists remain follow-up work. The browser currently stores the access token in `sessionStorage`; production should decide on an HttpOnly cookie session after considering existing API and CSRF design.
- **Supersedes:** Any previous demo role switching or demo-token authentication behavior.

---

## ADR-009: DB-Backed Activity Badges and Development-Gated Quick Login
- **Date:** 2026-11-01
- **Status:** CONFIRMED (developer-requested workflow and clean-state rules)
- **Context:** The header notification popover and sidebar badges rendered hardcoded strings (`6 Alerts`, `3 POs`, `4 New`, mock activity items), which contradicted clean-state guarantees for newly registered tenants. Separately, manual credential bookkeeping for every locally signup-created test account slowed the developer workflow, and the earlier demo-users drawer only listed two seeded accounts.
- **Decision:** (1) All activity/badge surfaces consume only `GET /api/v1/notifications/activity`, which aggregates the `notifications` table with real `stock_alerts`, `order_events`, `order_price_history`, and `deliveries` rows scoped by `req.user.tenantId`; badge counters are computed counts of live active state, hidden when zero, and an empty feed renders "No recent activity". (2) Add developer-only `GET /auth/dev-users` (all active registered owners), `POST /auth/dev-login` (issues the standard owner JWT for a verified account without a password), and `POST /auth/dev-verify` (skips the emailed OTP and verifies through the production path), active only when `NODE_ENV` is neither `production` nor `test`. Password hashes are never returned; plaintext appears only when it matches the explicitly configured `DEMO_PASSWORD`. The `/login` screen renders a "Quick Test Accounts" card backed by these endpoints.
- **Consequences:** Zero seeded UI state for notifications/badges; real activity appears as soon as workflows run. The dev endpoints narrow the earlier "never enumerate registered users" rule to non-production environments; they must stay 404 in production deployments, and production builds never bundle the quick-login card (`import.meta.env.DEV`).
- **Supersedes:** The "no user enumeration / demo endpoint only" restriction of the 2026-10-31 signup follow-ups for development environments, and the fixed-bottom demo-accounts drawer UI.

---

## ADR-010: PostgreSQL Tables for Disputes, Credit Notes and the Rebalance Report; Strict Delivery Persistence
- **Date:** 2026-11-05
- **Status:** `CONFIRMED` (developer-requested roadmap item #1); `IMPLEMENTED_AND_VERIFIED` on the dev database
- **Context:** Three module-level maps in `delivery.service.ts` (`IN_MEMORY_REBALANCES`, `IN_MEMORY_DISPUTES`, `IN_MEMORY_CREDIT_NOTES`) still held delivery side-effects in process memory, so a second API instance (or a restart) could not serve dispute, credit-note or rebalance reads. The database write in `dispatchOrder` was wrapped in a swallow-and-log `try/catch` that returned a successful-looking response even when PostgreSQL rejected the write, and the same guard pattern existed in `verifyHandover`, `getDispute`, `getDeliveryStatus`, `getRebalanceSummary` and `getRetailerHandoverCode` — where a failed tenant-scoping read silently **skipped** the authorization check (fail-open).
- **Decision:**
  1. Add three tables in one additive migration: `credit_notes`, `delivery_disputes` (1:1 to its credit note through a unique `credit_note_id`) and `delivery_rebalances`. Enum values (`DisputeStatus`, `CreditNoteStatus`) are deliberately lowercase and identical to the existing API DTO strings so no mapping layer is introduced.
  2. Keep `DeliveryDispute` **separate** from the pre-existing, code-unused `damage_claims` table instead of reusing it. `damage_claims` models physical return/warranty logistics (`return_urgency`, `physical_return_status`, `return_scheduled_date`, `refund_credited_to_ledger`); a doorstep dispute must instead bind rejected quantities to an escrow hold and a statutory credit note. Reusing it would have meant overloading a table whose designed purpose is different.
  3. Persist the rebalance report rather than recomputing it. Retailer stock is mutated in place, so before/after figures are unrecoverable afterwards; and the old cache-miss read path re-ran `executeInventoryRebalance`, restocking inventory on every `GET /rebalance-summary`.
  4. Make credit note and dispute numbers sequential (`CN-<year>-<serial>`, `DSP-<year>-<serial>`), matching the existing invoice-numbering convention; the random 6-digit generator collided under concurrency and was not auditable.
  5. Delete all three maps and every swallow-and-log guard on delivery persistence and tenant-scoping reads. Failures now raise `AppError` with the operation name and database cause (500, or 409 on a unique-key race); unknown order identifiers return 404 instead of a phantom record. The Khata escrow-hold/release memo calls stay best-effort (warn) because a ledger account may legitimately not exist for a tenant, and a memo must not roll back a committed handover.
- **Consequences:** The delivery module is fully stateless and horizontally safe; dispute/credit-note reads, CSV export and resolution work from any instance. Dispatch/verify now hard-fail for orders that are not persisted, so the older manual suites had to gain real order fixtures (`server/src/tests/order-fixture.ts`). Remaining known gaps recorded in `PROJECT_CONTEXT.md`: credit note party GSTIN/address are still the existing demo constants, the ledger escrow memo is still warn-only, and the `dispatchOrder` wholesaler-identity check (`userRole !== 'wholesaler' && ...`) permits any authenticated wholesaler to dispatch any order — a pre-existing authorization gap deliberately left untouched pending developer decision.
- **Supersedes:** The "Remaining in-memory (deferred)" note in `docs/DATABASE_DESIGN.md` §6, and the deferred-status decision recorded for ADR-011/P0.3 scope in the 2026-11-04 session (rebalance/dispute/credit-note maps were deferred; they are now closed).
