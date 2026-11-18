# 🛡️ SharVin: Comprehensive QA Audit Report
**Audit Date:** 2026-10-24
**Remediation Completed:** 2026-10-26
**Auditor:** Senior QA Engineer (Expert Persona)
**Project Status:** Backend hardening complete (typecheck green) / Web MVP complete / Moving to Android

---

## 🔴 CRITICAL: Security & Data Integrity
*These issues can lead to unauthorized access, financial discrepancies, or permanent data loss.*

| Bug / Observation | Impact | Status & Fix |
| :--- | :--- | :--- |
| **Hardcoded Owner PIN** (`auth.middleware.ts:122`) | **Severe.** Every store uses `1234` as the PIN. Anyone knowing this can bypass cashier restrictions. | ✅ **FIXED** — `bcrypt.compare` against `ownerPinHash` in the retailer/wholesaler profile. |
| **In-Memory State in Cluster** (`chat.service.ts:34`, `ledger.service.ts:39`) | **High.** Confirmation states and ledger fallbacks are in-memory. In PM2 cluster mode, users hit different servers and lose confirmations/balances. | ✅ **FIXED** — all authoritative negotiation state and ledger balances live in PostgreSQL (`NegotiationState`, `LedgerAccount`, `LedgerTransaction`); in-memory maps are dev fallbacks only. |
| **Floating Point Money Math** (`ledger.service.ts`) | **Medium.** Using `number` for financial balances leads to precision errors. | ✅ **FIXED** — every monetary calculation uses `Prisma.Decimal`; DB columns are `Decimal(15,2)`; balance writes are row-locked. |
| **Demo Token Bypass** (`auth.middleware.ts:22`) | **High.** Sending `demo-token` allows anyone to impersonate any role. | ✅ **FIXED** — demo tokens are rejected unless `NODE_ENV !== 'production'`. |

---

## 🟡 HIGH: Workflow & System Integrity
*These issues can cause business logic failures or user frustration.*

| Bug / Observation | Impact | Status & Fix |
| :--- | :--- | :--- |
| **Lack of Payment Idempotency** (`ledger.service.ts`) | **High.** Network retries can record the same payment twice. | ✅ **FIXED** — `PaymentRecord.idempotencyKey` with a pre-check that returns the existing receipt. |
| **Cross-Tenant Parameter Tampering** | **Medium.** A retailer could guess another retailer's `userId`/`orderId`/`invoiceId`. | ✅ **FIXED** — `enforceOrderScoping` + `enforceInvoiceScoping` applied to ledger/chat/invoice routes; credit-note ownership checks added; invoice listing leak fixed. |
| **OTP Brute-Force Lockout Window** | **Medium.** Restarting the server clears in-memory lockout windows. | ✅ **FIXED** — `Delivery.otpAttempts` + `Delivery.lockedUntil` persisted in PostgreSQL; verification and status endpoints read the DB as source of truth. |

---

## 🟢 MEDIUM: UX & Real-World Edge Cases
*These issues affect the "premium" feel and reliability in harsh environments (slow internet).*

| Bug / Observation | Impact | Status & Fix |
| :--- | :--- | :--- |
| **Race Condition: Price Confirmation** | **Medium.** Two parties clicking "Confirm" at the same millisecond could trigger two "Deal Locked" events. | ✅ **FIXED** — `SELECT ... FOR UPDATE` on `NegotiationState` + optimistic `clientVersion` check; final-offer guard enforced inside the locked transaction. |
| **Race Conditions: Ledger / POS / Inventory** | **High.** Concurrent payments, POS sales, QuickRestock clicks, and threshold edits could overwrite balances, oversell stock, or duplicate draft orders. | ✅ **FIXED** — row-level locks + atomic conditional SQL; see `docs/EDGE_CASES_AND_CONFLICTS.md`. |
| **Slow Network: UI Loading States** | **Low.** Repeated clicks during a slow `POST /api/v1/pos/sales`. | ⏳ **PENDING UI VERIFICATION** — backend rejects duplicate/invalid state; confirm every action button disables on first click in the web client. |
| **Mobile Viewport Occlusion** | **Low.** Bottom-nav hidden by mobile browser toolbars. | ⏳ **PENDING UI VERIFICATION** — use `svh`/`dvh` in the main layout container. |

---

## ⚪ LOW: Polish & Maintenance
*Minor improvements for long-term stability.*

| Bug / Observation | Impact | Status & Fix |
| :--- | :--- | :--- |
| **Generic Error Messages** | **Low.** Some errors returned "Internal Server Error". | ✅ **FIXED** — typed `AppError`/`AppErrorCode` domain errors, Zod/Prisma mapping, and centralized `errorHandler` + `notFoundHandler` middleware with a consistent `{ success, data, error }` envelope. |
| **Logging Gaps** | **Low.** `console.warn` used for DB fallbacks. | ✅ **FIXED** — structured `Logger` (`utils/logger.ts`) used across server modules and the API error middleware. |
| **Ambiguous Ledger Account Resolution** | **Critical.** Wholesaler-only lookup could return the wrong retailer's Khata when one wholesaler served multiple retailers; a ₹5,000 payment posted to another tenant's ledger. | ✅ **FIXED** — order-derived exact pair locking (`getLockedAccountForOrder`) plus authenticated counterparty pair resolution for partner-based calls. |
| **Persisted Proposal Prices** | **High.** Negotiation JSON price maps were saved before they were populated, so a later confirmation locked quoted instead of proposed rates. | ✅ **FIXED** — proposal maps persist after line processing; `OrderItem` updates only run for real persisted items. |

---

### ✅ Test Verification (2026-10-26)
- All 11 integration suites pass against PostgreSQL: `test_b2b_loophole_audit` 8/8, `test_b2b_extended_matrix` 5/5, and 6/6 for every feature suite (payment idempotency, multi-item negotiation/vouchers, GST invoicing/export, godown stock/expiry, dispute/partial delivery, driver tracking, credit limit/overdue freeze, role sub-accounts, velocity reorder).
- `npm run typecheck` and `npm run build` pass with zero errors.
- Seed now provisions the demo Khata account and the default bcrypt owner PIN (`1234`) when absent.

---

### 🚀 Final Summary for Developer:
All backend audit blockers are resolved: tenant isolation, financial precision, idempotency, persisted OTP lockouts, concurrency-safe negotiation/ledger/stock flows, and standardized error handling are implemented, typechecked, built, and verified by the full integration suite. Remaining pre-launch steps are frontend UI verification (loading states / mobile viewport).
