# 🚩 Edge Cases, Race Conditions & Business Logic Conflicts

This document tracks potential systemic failures and "invisible" conflicts identified during the Enterprise Audit. Each item includes a risk level, the scenario, the implemented fix, and verification status.

**Last updated:** 2026-10-26 — all listed items are `IMPLEMENTED_AND_VERIFIED` (typecheck + targeted test suites).

---

## 💰 Financial & Ledger Module

| Status | Risk | Scenario | Conflict Type | Impact | Implemented Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ FIXED | **CRITICAL** | **Concurrent Payment Overwrite** | Race Condition | Payments can be "lost". If two payments are recorded simultaneously, the `currentBalance` is calculated in JS and overwritten. | `getLockedAccount()` acquires a PostgreSQL `SELECT ... FOR UPDATE` row lock inside `$transaction`; balance read/modify/write is serialized. `recordPaymentSettlement` is idempotent by `idempotencyKey`. |
| ✅ FIXED | **CRITICAL** | **Order Posting Race** | Race Condition | Concurrent order postings overwrite `currentBalance`, corrupting outstanding debt. | `postDeliveredOrderToLedger` runs entirely inside `$transaction` with `FOR UPDATE` on the ledger row. |
| ✅ FIXED | **HIGH** | **Rollback Overwrite** | Race Condition | Concurrent cancellations overwrite each other's balance adjustments. | `rollbackCancelledOrder` uses the same row-locked transaction and relative debit/credit totals. |
| ✅ FIXED | **MEDIUM** | **Split Payment Inconsistency** | State Sync | A split payment could be partially committed (`getAccount` read outside the transaction). | `settleOrderDeliverySplitPayment` fully transactional: account locked, order debit + cash payment + ledger entries created atomically; payment ledger row now links `paymentId`. |
| ✅ FIXED | **MEDIUM** | **Escrow Note Drift** | State Sync | Escrow memo entries recorded a `balanceAfter` that was never persisted, breaking the running-balance audit trail. | `recordEscrowHold` / `releaseEscrowHold` now run in locked transactions and write consistent memo entries (`balanceAfter === balanceBefore`). |
| ✅ FIXED | **CRITICAL** | **Ambiguous Ledger Account Resolution** | Multi-Tenancy | Looking up a ledger by `wholesaler_id` alone returned the first account when one wholesaler served multiple retailers, so a payment could post to the wrong retailer's Khata. | `getLockedAccountForOrder()` derives the exact retailer/wholesaler pair from the order and locks that row; partner-based payment lookups now require the authenticated counterparty, with id/pair resolution only. |

---

## 📦 Inventory & Stock Module

| Status | Risk | Scenario | Conflict Type | Impact | Implemented Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ FIXED | **CRITICAL** | **POS "Ghost Stock" Sale** | Race Condition | Two POS terminals sell the same last unit simultaneously, approving both against stale reads. | Atomic conditional SQL: `UPDATE retailer_inventory SET current_stock = current_stock - qty ... WHERE inventory_id = ? AND current_stock >= qty RETURNING ...`; affected rows re-validated in one statement. Rows are also pre-locked in deterministic ID order to avoid deadlocks. |
| ✅ FIXED | **HIGH** | **QuickRestock Order Duplication** | Race Condition | Rapid double-clicks create two "negotiating" orders instead of adding items to one cart. | `quickRestock` takes a `FOR UPDATE` lock on the retailer↔wholesaler connection row before find-or-create, serializing concurrent restocks for the same pair. |
| ✅ FIXED | **MEDIUM** | **Duplicate Stock Alerts** | Race Condition | Concurrent POS sale + threshold edit can create duplicate pending alerts for the same product. | Both paths check for an existing pending alert while holding the inventory row lock; `updateThreshold` is fully transactional. |
| ✅ FIXED | **MEDIUM** | **Threshold Update Collision** | Lost Update | Stale `reorderQuantity` overwrote concurrent edits; stock check used an outdated value. | `updateThreshold` locks the inventory row, only writes `reorderQuantity` when supplied, and evaluates stock inside the lock. |

---

## 🤝 Chat & Negotiation Module

| Status | Risk | Scenario | Conflict Type | Impact | Implemented Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ FIXED | **CRITICAL** | **Bilateral Deal Lock Conflict** | Race Condition | One party accepts while another changes the price. | Row-Level Locking (`getLockedConfirmationState(... FOR UPDATE)`) + Optimistic Locking (`clientVersion` vs `state.version`) inside the transaction. |
| ✅ FIXED | **MEDIUM** | **Final Offer Bypass** | State Machine | A user tries to propose a new rate after `final_offer_locked` but before the DB update. | `proposeRate` re-reads the locked `NegotiationState` and rejects `state.isFinalOffer` / `deal_locked` inside the transaction; proposer auto-confirmation is persisted atomically. |
| ✅ FIXED | **HIGH** | **Persisted Proposal Prices Lost Between Requests** | State Sync | `activeProposedPrices` / `activeProposedQuantities` were written to the DB before the proposal loop populated them, so a later `confirmRate` in a new transaction locked the original quoted prices (₹21,240 instead of ₹20,840). | Proposal JSON maps are persisted after all line items are evaluated; `confirmRate` only updates `OrderItem` rows that actually exist, leaving demo/fallback items in memory. |

---

## 🛡️ General System Integrity

| Status | Risk | Scenario | Conflict Type | Impact | Implemented Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ FIXED | **HIGH** | **Multi-Tenant Leak (Parameter Tampering)** | Security | A user changing `orderId` / `invoiceId` in a URL accesses another tenant's data. | `enforceOrderScoping` and `enforceInvoiceScoping` applied to ledger/chat/invoice routes; credit-note ownership checks added. |
| ✅ FIXED | **MEDIUM** | **OTP Brute Force Reset** | Security | Restarting the server clears in-memory lockout windows. | `Delivery.otpAttempts` + `Delivery.lockedUntil` are persisted; `verifyHandover` and both status endpoints read the DB as source of truth. |
| ✅ FIXED | **MEDIUM** | **Demo Token Bypass** | Security | `demo-token` impersonates any role in production. | Gated behind `NODE_ENV !== 'production'`. |

---

## 🛠️ Audit Summary

All identified read-modify-write races in financial balances and stock levels have been replaced with atomic SQL or row-locked transactions. Domain failures now surface as typed `AppError` codes through a centralized Express error middleware, and structured `Logger` output replaces ad-hoc `console.*` calls in server modules.

**Verification (2026-10-26):** all 11 integration suites pass against PostgreSQL — `test_b2b_loophole_audit` (8/8), `test_b2b_extended_matrix` (5/5), plus payment idempotency, multi-item negotiation/vouchers, GST invoicing/export, godown stock/expiry, dispute/partial delivery, driver tracking, credit limit/overdue freeze, role sub-accounts, and velocity reorder predictor (6/6 each). `npm run typecheck` and `npm run build` are green.

**Remaining follow-up (non-blocking):** frontend UI verification for loading states and mobile viewport behavior before production deployment.
