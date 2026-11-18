# SharVin: Master Implementation Plan

**Last Updated:** 2026-11-05
**Current Focus:** Roadmap item #1 closed (dispute / credit note / rebalance persistence); next up is the WholesalerWorkspace counter-offer wiring (P1.5)

> The milestone list below is the original planning baseline and is not a reliable statement of current completion. Use the latest session handoff in `PROJECT_CONTEXT.md` and task statuses below for current work.

---

## 1. Roadmap & Milestones Overview

- **Milestone 0: Documentation Integrity & Project Foundations** (`IN_PROGRESS`)
- **Milestone 1: Database Schema & Authentication Primitives** (`BACKLOG`)
- **Milestone 2: Retailer POS Billing & Low-Stock Alerts** (`BACKLOG`)
- **Milestone 3: Wholesaler Catalog & 1-Click Supplier Carts** (`BACKLOG`)
- **Milestone 4: Embedded Live Chat & Bilateral Rate Lock Engine** (`BACKLOG`)
- **Milestone 5: Two-Way Delivery Handover OTP & B2B Ledger** (`BACKLOG`)
- **Milestone 6: System Integration, Security Audit & Web MVP Release** (`BACKLOG`)

---

## 2. Milestone 0: Documentation & Foundation Setup

### `TASK-M0-01`: Initialize Core Documentation Suite
- **Objective:** Create and cross-link all 9 core governance and specification documents following the senior engineer protocol.
- **Dependencies:** None.
- **Relevant Files:**
  - `AGENTS.md`
  - `PROJECT_CONTEXT.md`
  - `docs/PRD.md`
  - `docs/TECHNICAL_ARCHITECTURE.md`
  - `docs/DATABASE_DESIGN.md`
  - `docs/API_SPECIFICATION.md`
  - `docs/SECURITY_AND_PERFORMANCE.md`
  - `docs/DECISIONS.md`
  - `docs/IMPLEMENTATION_PLAN.md`
- **Acceptance Criteria:**
  - All 9 documents exist in their specified locations.
  - Documents contain accurate product requirements, technical architecture, database schemas, and status labels (`CONFIRMED`, `PROPOSED`, `NEEDS_CLARIFICATION`).
  - No duplicate files or conflicting guidance.
- **Verification Steps:**
  - Verify file presence and inspect content consistency.
- **Status:** `DONE`

### `TASK-M0-02`: Repository Architecture & Project Scaffolding
- **Objective:** Scaffold the decoupled project structure with a clean monorepo or standard client/server directory structure (`server/` for shared backend, `client/` for Web app).
- **Dependencies:** `TASK-M0-01` (approved).
- **Relevant Files:**
  - `package.json` (root workspace)
  - `server/package.json`
  - `client/package.json`
- **Acceptance Criteria:**
  - Clean directory structure created for shared backend (`server/`) and web frontend (`client/`).
  - Root scripts defined to run server and client concurrently or independently.
  - TypeScript, ESLint, and environment configurations initialized.
- **Verification Steps:**
  - Run build/typecheck commands on both client and server (`npm run typecheck --workspaces`, `npm run build --workspaces`).
  - Verify live HTTP `/api/v1/health` response from shared server.
- **Status:** `DONE`

---

## 3. Milestone 1: Database Schema & Multi-Tenant Auth

### `TASK-M1-01`: PostgreSQL & Prisma Setup
- **Objective:** Configure Prisma ORM with PostgreSQL and write schema definitions for the complete 44-table SharVin domain model based on db for king.txt.
- **Dependencies:** `TASK-M0-02` (verified).
- **Relevant Files:**
  - `server/prisma/schema.prisma`
  - `server/src/db.ts`
  - `server/.env`
  - `.env`
- **Acceptance Criteria:**
  - Prisma CLI installed in workspace.
  - Initialized `prisma/schema.prisma` with models matching `docs/DATABASE_DESIGN.md` and `db for king.txt`.
  - Prisma client generated and typed db export ready for service use at `server/src/db.ts`.
- **Verification Steps:**
  - Run `npx prisma validate --schema=./server/prisma/schema.prisma` -> Verified (valid schema).
  - Run `npx prisma generate --schema=./server/prisma/schema.prisma` -> Verified (generated in 1.79s).
  - TypeScript compilation and typecheck -> Verified (exit code 0).
- **Status:** `DONE`

### `TASK-M1-02`: Multi-Tenant Authentication & Session Engine
- **Objective:** Implement registration, login, JWT issuance, and tenant context middleware for Retailer and Wholesaler entities using the Prisma schema.
- **Dependencies:** `TASK-M1-01` (verified).
- **Relevant Files:**
  - `server/src/types/auth.types.ts`
  - `server/src/modules/auth/auth.validation.ts`
  - `server/src/modules/auth/auth.service.ts`
  - `server/src/modules/auth/auth.controller.ts`
  - `server/src/middleware/auth.middleware.ts`
  - `server/src/routes/auth.routes.ts`
  - `server/src/index.ts`
- **Acceptance Criteria:**
  - Password hashing (bcrypt) and atomic user + profile creation (`RetailerProfile`, `WholesalerProfile`).
  - JWT token generation carrying `userId`, `userType`, and business context.
  - Authentication middleware (`authenticate`, `authorizeRoles`) protecting private endpoints (`GET /api/v1/auth/me`).
- **Verification Steps:**
  - Run `npm run typecheck --workspaces` -> Verified (exit code 0).
  - Run `npm run build --workspace=server` -> Verified (exit code 0).
  - HTTP curl tests: Verified input validation rejects malformed data (400) and unauthorized requests to `/me` are rejected (401).
- **Status:** `DONE`

---

## 4. Milestone 2: Retailer POS Billing & Low-Stock Alerts

### `TASK-M2-01`: Retailer Product Catalog & POS Sales Backend
- **Objective:** Build backend API for retailer inventory management (product search, barcode scanning, POS sale recording with transactional stock decrement).
- **Dependencies:** `TASK-M1-02` (verified).
- **Relevant Files:**
  - `server/src/modules/pos/pos.validation.ts`
  - `server/src/modules/pos/pos.service.ts`
  - `server/src/modules/pos/pos.controller.ts`
  - `server/src/modules/pos/pos.routes.ts`
  - `server/src/index.ts`
- **Acceptance Criteria:**
  - `GET /api/v1/pos/products` - Search products by name or barcode scoped to the retailer.
  - `POST /api/v1/pos/products` - Upsert product into retailer catalog with custom selling price and stock.
  - `POST /api/v1/pos/sales` - Record counter bill and decrement `retailer_inventory` atomically, generating unique bill number, sales audit trails, and automatic low-stock alerts.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - HTTP curl testing: Verified authentication & role enforcement (401 without valid retailer token).
- **Status:** `DONE`

### `TASK-M2-02`: Retailer POS Web Counter Interface
- **Objective:** Build keyboard/touch-friendly POS billing screen in the Web app with item lookup, cart calculation, bill generation, and live inventory feedback.
- **Dependencies:** `TASK-M2-01` (verified).
- **Relevant Files:**
  - `client/src/modules/pos/PosBillingView.tsx`
  - `client/src/modules/pos/types.ts`
  - `client/src/modules/pos/mockPosData.ts`
  - `client/src/App.tsx`
- **Acceptance Criteria:**
  - Barcode scanner simulation and product name search.
  - Interactive counter bill cart with live quantity, discount, and tax calculations.
  - Cash, UPI, Card, and Credit (Udhaar) settlement methods.
  - Bill receipt modal with stock depletion confirmation and automated low-stock badges.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Interactive UI flow verified: Search & barcode quick-add, cart calculation, modal receipt, stock decrement, and reorder warnings.
- **Status:** `DONE`

### `TASK-M2-03`: Low-Stock Thresholds & 1-Click Restock Trigger
- **Objective:** Implement inventory alerts that trigger when stock falls below `low_stock_threshold`, providing a 1-click restock action directly to the linked wholesaler cart.
- **Dependencies:** `TASK-M2-02` (verified).
- **Relevant Files:**
  - `server/src/modules/inventory/inventory.validation.ts`
  - `server/src/modules/inventory/inventory.service.ts`
  - `server/src/modules/inventory/inventory.controller.ts`
  - `server/src/modules/inventory/inventory.routes.ts`
  - `client/src/modules/inventory/types.ts`
  - `client/src/modules/inventory/mockInventoryData.ts`
  - `client/src/modules/inventory/LowStockAlertsView.tsx`
  - `client/src/modules/pos/PosBillingView.tsx`
  - `client/src/App.tsx`
- **Acceptance Criteria:**
  - `GET /api/v1/inventory/low-stock` - Returns items where `currentStock <= lowStockThreshold`.
  - `PATCH /api/v1/inventory/threshold` - Allows custom reorder thresholds and batch quantities.
  - `POST /api/v1/inventory/restock/quick-add` - 1-click addition into wholesaler draft cart.
  - Interactive Web dashboard with threshold gauges, supplier badge, inline adjustments, 1-click restock action, and cart feedback.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - HTTP verification: Tested `GET /api/v1/inventory/low-stock` and `POST /api/v1/inventory/restock/quick-add` returning HTTP 401 on unauthorized requests.
  - Frontend interactive verification: Gauge percentages, threshold tuning, single & batch 1-click restock, and draft order drawer confirmed working.
- **Status:** `DONE`

---

## 5. Milestone 3: Wholesaler Catalog & 1-Click Restock Carts

### `TASK-M3-01`: Wholesaler Catalog & Bulk Pricing Backend
- **Objective:** Build backend API for wholesaler catalog management, bulk unit prices, minimum order quantities (MOQ), and retailer-wholesaler relationship validation.
- **Dependencies:** `TASK-M2-03` (verified).
- **Relevant Files:**
  - `server/src/modules/wholesaler/wholesaler.validation.ts`
  - `server/src/modules/wholesaler/wholesaler.service.ts`
  - `server/src/modules/wholesaler/wholesaler.controller.ts`
  - `server/src/modules/wholesaler/wholesaler.routes.ts`
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Curl authorization tests on `GET /api/v1/wholesaler/catalog` and `GET /api/v1/wholesaler/suppliers` -> Verified 401 Unauthorized without bearer token.
- **Status:** `DONE`

### `TASK-M3-02`: Multi-Supplier Wholesale Cart Engine
- **Objective:** Implement supplier-isolated cart storage where depleted items from 1-click restock are grouped strictly by wholesaler, calculating MOQs, tier pricing, and subtotal estimates.
- **Dependencies:** `TASK-M3-01` (verified).
- **Relevant Files:**
  - `server/src/modules/cart/cart.validation.ts`
  - `server/src/modules/cart/cart.service.ts`
  - `server/src/modules/cart/cart.controller.ts`
  - `server/src/modules/cart/cart.routes.ts`
- **Acceptance Criteria:**
  - `GET /api/v1/cart` - Returns all active draft carts for authenticated retailer, segregated by wholesaler with MOQ checks and line totals.
  - `POST /api/v1/cart/items` - Adds item to wholesaler draft cart or increments quantity.
  - `PATCH /api/v1/cart/items/:orderItemId` - Updates item quantity with automatic recalculations.
  - `DELETE /api/v1/cart/items/:orderItemId` - Removes item from cart.
  - `DELETE /api/v1/cart/wholesaler/:wholesalerId` - Clears entire draft cart for a wholesaler.
  - `POST /api/v1/cart/wholesaler/:wholesalerId/submit` - Validates MOQs and prepares draft order for price negotiation.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Curl authorization tests on `GET /api/v1/cart` and `POST /api/v1/cart/items` -> Verified 401 Unauthorized without bearer token.
- **Status:** `DONE`

### `TASK-M3-03`: Web Restock Cart & Order Submission View
- **Objective:** Build responsive retailer wholesale cart screen to review assembled restock orders by supplier, adjust reorder quantities, and submit for live price negotiation.
- **Dependencies:** `TASK-M3-02` (verified).
- **Relevant Files:**
  - `client/src/modules/cart/types.ts`
  - `client/src/modules/cart/mockCartData.ts`
  - `client/src/modules/cart/WholesaleCartView.tsx`
  - `client/src/App.tsx`
- **Acceptance Criteria:**
  - Multi-supplier cart grouping with business details, GST badges, and verified connection status.
  - Interactive quantity steppers with live line total and subtotal calculation.
  - Real-time MOQ validation indicators with 1-click deficit fix button.
  - Order submission modal bridging confirmed restock items directly to Milestone 4 live negotiation.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Frontend interactive verification: Multi-supplier tab switching, item increment/decrement, MOQ deficit alerts, 1-click MOQ bump, delivery method selection, clear cart, and order submission confirmation modal all verified.
- **Status:** `DONE`

---

## 6. Milestone 4: Embedded Live Chat & Bilateral Rate Lock Engine

### `TASK-M4-01`: Socket.io Real-Time Messaging & Order Channel Gateway
- **Objective:** Establish authenticated WebSocket gateway over Socket.io where order-specific bargaining rooms connect the retailer and wholesaler in real-time.
- **Dependencies:** `TASK-M3-03` (verified).
- **Relevant Files:**
  - `server/src/modules/chat/chat.types.ts`
  - `server/src/modules/chat/chat.validation.ts`
  - `server/src/modules/chat/chat.service.ts`
  - `server/src/modules/chat/chat.gateway.ts`
  - `server/src/modules/chat/chat.controller.ts`
  - `server/src/modules/chat/chat.routes.ts`
  - `server/src/index.ts`
  - `client/src/modules/chat/types.ts`
  - `client/src/modules/chat/chatSocketService.ts`
- **Acceptance Criteria:**
  - Authenticated WebSocket gateway with JWT token verification and tenant context attachment.
  - Order room management: `join_order` with participant authorization check, `leave_order`, and presence events (`user_joined`, `user_left`).
  - Real-time message dispatch: `send_message` with persistence in Prisma (`ChatMessage`) and broadcast to room `order:<orderId>`.
  - Typing indicator relays: `typing_start`, `typing_stop` with participant identity.
  - REST endpoints: `GET /api/v1/orders/:orderId/messages` (with tenancy checks & pagination) and `POST /api/v1/orders/:orderId/messages` (fallback with live room broadcast).
  - Client-side type-safe socket wrapper (`chatSocketService.ts`).
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - HTTP auth test: `GET /api/v1/orders/ORD-20261013-8821/messages` -> Verified 401 Unauthorized without bearer token.
- **Status:** `DONE`

### `TASK-M4-02`: Bilateral Rate Proposal & Counter-Offer Engine
- **Objective:** Implement structured price negotiation messages (counter-offer proposals per line item or order total) with validation against wholesaler minimum margins.
- **Dependencies:** `TASK-M4-01` (verified).
- **Relevant Files:**
  - `server/src/modules/chat/chat.types.ts`
  - `server/src/modules/chat/chat.validation.ts`
  - `server/src/modules/chat/chat.service.ts`
  - `server/src/modules/chat/chat.gateway.ts`
  - `server/src/modules/chat/chat.controller.ts`
  - `server/src/modules/chat/chat.routes.ts`
  - `client/src/modules/chat/types.ts`
  - `client/src/modules/chat/chatSocketService.ts`
- **Acceptance Criteria:**
  - Structured counter-offer schema validating line item proposed prices and optional notes.
  - Wholesaler minimum margin floor guardrails: Prevents retailer counter-offers from breaching minimum margin floor (maximum 35% discount off catalog rates).
  - Price audit trail: Persists price modifications into `OrderPriceHistory` records with previous/new prices and change reasons.
  - Real-time proposal broadcast: Generates structured system chat cards and emits `rate_proposed` over Socket.io.
  - Endpoints: `POST /api/v1/orders/:orderId/propose-rate` and `GET /api/v1/orders/:orderId/rate-history`.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Unit tests: Verified valid proposal calculation (savings ₹375), verified margin floor rejection (below 65% catalog floor blocked), and verified `OrderPriceHistory` audit trail.
  - HTTP auth test: `POST /api/v1/orders/ORD-20261013-8821/propose-rate` -> Verified 401 Unauthorized without bearer token.
- **Status:** `DONE`

### `TASK-M4-03`: Mutual Bilateral Rate Lock & Snapshot Confirmation View
- **Objective:** Build two-sided rate locking mechanism requiring explicit matching confirmation from both retailer and wholesaler to freeze order pricing into an immutable contract snapshot before fulfillment dispatch.
- **Dependencies:** `TASK-M4-02` (verified).
- **Relevant Files:**
  - `server/src/modules/chat/chat.types.ts`
  - `server/src/modules/chat/chat.validation.ts`
  - `server/src/modules/chat/chat.service.ts`
  - `server/src/modules/chat/chat.gateway.ts`
  - `server/src/modules/chat/chat.controller.ts`
  - `server/src/modules/chat/chat.routes.ts`
  - `client/src/modules/chat/types.ts`
  - `client/src/modules/chat/chatSocketService.ts`
  - `client/src/modules/chat/LiveNegotiationView.tsx`
  - `client/src/modules/cart/WholesaleCartView.tsx`
  - `client/src/App.tsx`
- **Acceptance Criteria:**
  - Two-sided rate locking mechanism where both Retailer and Wholesaler must explicitly confirm agreed unit prices / subtotal before an order transitions to `deal_locked`.
  - Transitions order state to `deal_locked`, stamps `finalPrice`, `finalPriceAcceptedAt`, `priceLockedAt` on each line item, and creates an audit record in `OrderPriceHistory`.
  - Real-time WebSocket broadcasts via Socket.io: `rate_locked` when mutual confirmation is reached, and `rate_confirmation_pending` when one party confirms awaiting the other.
  - REST endpoints: `POST /api/v1/orders/:orderId/confirm-rate` and `GET /api/v1/orders/:orderId/negotiation-status`.
  - Interactive Web client Live Negotiation & Chat screen (`LiveNegotiationView.tsx`) with real-time bargaining feed, counter-offer proposal modal with margin floor guardrail indicator, live typing indicators, and Bilateral Rate Lock confirmation controls.
  - Integrated into `WholesaleCartView` order submission flow and mounted directly in `client/src/App.tsx`.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Service verification test: Tested proposal generation, pending rate confirmation (1 party), bilateral agreement trigger (both parties), deal lock transition, immutable final snapshot generation, celebratory system message emission, and minimum margin floor guardrail rejection.
- **Status:** `DONE`

---

## 7. Milestone 5: Delivery Handover (Two-Way OTP) & B2B Ledgers

### `TASK-M5-01`: Cryptographic Two-Way Delivery OTP Generation & Verification Engine
- **Objective:** Build two-sided delivery handover verification system where the retailer receives a delivery verification code (OTP) and the delivery driver/wholesaler validates it on-site upon handover before delivery is marked complete.
- **Dependencies:** `TASK-M4-03` (verified).
- **Relevant Files:**
  - `server/src/modules/delivery/delivery.types.ts`
  - `server/src/modules/delivery/delivery.validation.ts`
  - `server/src/modules/delivery/delivery.service.ts`
  - `server/src/modules/delivery/delivery.controller.ts`
  - `server/src/modules/delivery/delivery.routes.ts`
  - `server/src/index.ts`
  - `client/src/modules/delivery/types.ts`
  - `client/src/modules/delivery/deliveryService.ts`
  - `client/src/modules/delivery/DeliveryHandoverView.tsx`
  - `client/src/App.tsx`
- **Acceptance Criteria:**
  - Cryptographic 6-digit numeric OTP generation via Node `crypto.randomInt` upon order dispatch with SHA-256 secure hashing.
  - Multi-tenant gate: Confidential OTP code is accessible exclusively to the retailer recipient (`GET /api/v1/orders/:orderId/handover-code`).
  - Driver/Wholesaler on-site verification endpoint (`POST /api/v1/orders/:orderId/verify-handover`) with timing-safe hash comparison and brute-force lockout protection (5 maximum attempts).
  - Real-time updates: Broadcasts `delivery_status_changed` and celebratory chat message over Socket.io upon verification.
  - Generates tamper-evident digital Delivery Handover Certificate (`CERT-...`) freezing delivered timestamp, driver name, and confirmed order amount.
  - Interactive Web client screen (`DeliveryHandoverView.tsx`) with Retailer OTP display, security advisory, Driver on-site verification terminal, and simulated perspective switcher.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Automated test script: Verified 6-digit OTP generation, confidential retrieval, invalid OTP rejection with remaining attempt counter, successful on-site verification, idempotent completion, and max attempt brute-force lockout.
- **Status:** `DONE`

### `TASK-M5-02`: Real-Time Inventory Stock Rebalancing on Delivery Handover
- **Objective:** Atomically increment retailer inventory levels and decrement wholesaler warehouse stock upon successful OTP verification.
- **Dependencies:** `TASK-M5-01` (verified).
- **Relevant Files:**
  - `server/src/modules/delivery/delivery.types.ts`
  - `server/src/modules/delivery/delivery.service.ts`
  - `server/src/modules/delivery/delivery.controller.ts`
  - `server/src/modules/delivery/delivery.routes.ts`
  - `client/src/modules/delivery/types.ts`
  - `client/src/modules/delivery/deliveryService.ts`
  - `client/src/modules/delivery/DeliveryHandoverView.tsx`
  - `client/src/App.tsx`
- **Acceptance Criteria:**
  - Atomically increments retailer inventory (`RetailerInventory.currentStock += quantity`, updates `lastRestockedAt = now`, updates `costPrice = finalUnitPrice`) upon successful two-way delivery OTP verification.
  - Decrements wholesaler warehouse stock (`WholesalerProduct.stockQuantity -= quantity`).
  - Auto-resolves active `StockAlert` records for the retailer when `newStock > lowStockThreshold` (`actionTaken = 'reordered'`, `actionTakenAt = now`).
  - Exposes `GET /api/v1/orders/:orderId/rebalance-summary` endpoint returning complete rebalance audit report.
  - Includes `inventoryRebalanced: InventoryRebalanceItem[]` in `HandoverVerificationResult`.
  - Interactive Web client UI (`DeliveryHandoverView.tsx`) displays **"Live Inventory Rebalance Impact"** section detailing stock transitions, updated cost bases, resolved alerts, and a 1-click bridge back to the Retailer POS counter.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Automated test script (`test_inventory_rebalance.ts`): Verified retailer stock increment, wholesaler stock decrement, cost price update, low-stock alert auto-resolution, summary endpoint report, and verification idempotency.
- **Status:** `DONE`

### `TASK-M5-03`: B2B Khata & Double-Entry Ledger Engine
- **Objective:** Immutable credit and cash transaction tracking between retailer and wholesaler, recording payment terms, outstanding balances, and credit limits.
- **Dependencies:** `TASK-M5-02` (verified).
- **Relevant Files:**
  - `server/src/modules/ledger/ledger.types.ts`
  - `server/src/modules/ledger/ledger.validation.ts`
  - `server/src/modules/ledger/ledger.service.ts`
  - `server/src/modules/ledger/ledger.controller.ts`
  - `server/src/modules/ledger/ledger.routes.ts`
  - `server/src/index.ts`
  - `client/src/modules/ledger/types.ts`
  - `client/src/modules/ledger/ledgerService.ts`
  - `client/src/modules/ledger/B2BLedgerView.tsx`
  - `client/src/App.tsx`
- **Acceptance Criteria:**
  - Synchronized double-entry accounting engine computing total debit, total credit, current net balance, credit available, and utilization percentage against credit limits.
  - Multi-tenant query endpoints: `GET /api/v1/ledger/accounts/:partnerId` and `GET /api/v1/ledger/transactions/:partnerId`.
  - Payment settlement recording endpoint: `POST /api/v1/ledger/payments` supporting Cash, UPI, Bank Transfer, and Cheque with atomic credit decrement and receipt number generation.
  - Real-time Socket.io broadcast: emits `ledger_updated` event to partner and order rooms upon payment recording with system notification message.
  - Idempotent order posting: `POST /api/v1/ledger/orders/:orderId/post` guarantees duplicate submissions do not inflate debtor balances.
  - Interactive Web client screen (`B2BLedgerView.tsx`) with Indian Kirana Khata styling, Retailer vs Wholesaler perspective switcher, credit line health meter, chronological journal statement, interactive payment settlement modal, and cross-module navigation bridges.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Automated test script (`test_b2b_ledger.ts`): Verified account initialization, initial order debit balance (₹16,600), partial settlement via UPI (₹5,000 -> balance ₹11,600), second settlement via Cash (₹6,600 -> balance ₹5,000), chronological transaction journal order, and idempotent order posting.
- **Status:** `DONE`

---

## 8. Milestone 6: Testing, Polish & Release Prep

### `TASK-M6-01`: End-to-End Core Workflow Integration & Smoke Verification
- **Objective:** Automated end-to-end integration test spanning the full MVP loop: POS sale -> low-stock trigger -> wholesale cart grouping -> live bargaining -> bilateral rate lock -> 2-way OTP delivery handover -> ledger settlement.
- **Dependencies:** `TASK-M5-03` (verified).
- **Relevant Files:**
  - `client/src/modules/e2e/E2EWorkflowTourView.tsx`
  - `client/src/App.tsx`
  - `server/src/modules/pos/pos.service.ts`
  - `server/src/modules/inventory/inventory.service.ts`
  - `server/src/modules/cart/cart.service.ts`
  - `server/src/modules/chat/chat.service.ts`
  - `server/src/modules/delivery/delivery.service.ts`
  - `server/src/modules/ledger/ledger.service.ts`
- **Acceptance Criteria:**
  - Full-cycle execution covering all 9 MVP business phases:
    1. POS Counter Sale & Stock Depletion (billing counter sale, bill generation, inventory decrement).
    2. Low-Stock Real-Time Alert Trigger (threshold breach, real-time alert creation).
    3. 1-Click Restock Wholesale Cart Sync (supplier-segregated cart, MOQ validation).
    4. Wholesale Purchase Order Submission (restock PO transition to negotiating, channel room setup).
    5. Live Bargaining & Bilateral Rate Proposal (counter-offer within margin floor, price history audit).
    6. Mutual Bilateral Rate Lock Confirmation (two-sided confirmation, atomic transition to `deal_locked`, price snapshot).
    7. Two-Way Delivery OTP Handover Verification (6-digit cryptographic OTP generation, confidential retrieval, driver on-site verification, tamper-evident certificate).
    8. Atomic Inventory Stock Rebalancing (retailer stock increment, cost price update, wholesaler godown deduction, active alert auto-resolution).
    9. B2B Khata Double-Entry Ledger Posting & Settlement (order debit posting, partial payment settlement via UPI/Cash, serial receipt generation, running balance update).
  - Interactive Web client screen (`E2EWorkflowTourView.tsx`) with 9-phase visual pipeline, status pills, run full smoke test suite launcher, per-phase test runners, live log console, and direct launch links into each module screen.
  - Integration into `client/src/App.tsx` top navigation, hero quick-launch, and all 5 workflow cards clickable and interactive.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Automated smoke test script (`test_e2e_core_workflow.ts`): Verified all 9 phases executed end-to-end with full state transitions, assertions passed (exit code 0).
- **Status:** `DONE`

### `TASK-M6-02`: Multi-Tenant Security & Rate Limiting Hardening
- **Objective:** Cross-tenant isolation auditing, JWT expiry handling, brute force throttling on authentication and OTP verification, OWASP headers.
- **Dependencies:** `TASK-M6-01` (verified).
- **Relevant Files:**
  - `server/src/middleware/rate-limiter.middleware.ts`
  - `server/src/middleware/auth.middleware.ts`
  - `server/src/index.ts`
  - `server/src/modules/auth/auth.routes.ts`
  - `server/src/modules/delivery/delivery.routes.ts`
  - `server/src/modules/delivery/delivery.service.ts`
  - `server/src/modules/chat/chat.routes.ts`
  - `server/src/modules/cart/cart.service.ts`
  - `scratch/test_security_hardening.ts`
- **Acceptance Criteria:**
  - OWASP security headers configured with `helmet`: strict Content Security Policy, `frameguard: { action: 'deny' }` (anti-clickjacking), `noSniff: true` (MIME sniffing prevention), HSTS (31536000 with subdomains), and `hidePoweredBy: true`.
  - Multi-tier rate limiting with `express-rate-limit`:
    - `authLimiter`: 10 req/15m per IP on `/login` and `/register`.
    - `otpVerificationLimiter`: 5 req/15m per IP on `/orders/:orderId/verify-handover`.
    - `rateProposalLimiter`: 30 req/10m per IP on `/orders/:orderId/propose-rate`.
    - `apiGeneralLimiter`: 300 req/15m per IP baseline DDoS protection on `/api/v1/*`.
  - Enhanced JWT error discrimination in `auth.middleware.ts`:
    - `TokenExpiredError` returns HTTP 401 with `code: 'TOKEN_EXPIRED'` and `expiredAt`.
    - `JsonWebTokenError` returns HTTP 401 with `code: 'INVALID_TOKEN'`.
    - `enforceTenantScoping` middleware to prevent cross-tenant parameter tampering.
  - Multi-tenant boundary isolation:
    - Wholesalers blocked with HTTP 403 `FORBIDDEN_ROLE` from retailer POS, inventory alerts, and wholesale cart.
    - Wholesalers blocked with HTTP 403 from confidential retailer delivery handover OTPs (`getRetailerHandoverCode`).
    - Participants strictly authorized per order negotiation channel.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Automated test suite (`test_security_hardening.ts`): 14/14 tests passed (100%), verifying OWASP headers, JWT error codes, cross-tenant 403 rejection, and OTP 429 rate limit triggers.
- **Status:** `DONE`

### `TASK-M6-03`: Web Launch Polish & Production Packaging
- **Objective:** Final UI micro-interactions, responsive mobile testing, deployment configurations (Docker / PM2 / Nginx).
- **Dependencies:** `TASK-M6-02` (verified).
- **Relevant Files:**
  - `client/index.html`
  - `client/src/App.tsx`
  - `Dockerfile`
  - `deploy/Dockerfile.client`
  - `deploy/nginx.conf`
  - `docker-compose.yml`
  - `ecosystem.config.cjs`
  - `.env.production.example`
  - `deploy/README.md`
- **Acceptance Criteria:**
  - Responsive Mobile Navigation & Viewport:
    - Sticky glassmorphic mobile bottom navigation bar (`fixed bottom-0`) for 1-thumb touch access to Home, POS Counter, Restock Hub, Live Chat, and Khata Ledger.
    - Responsive mobile drawer menu (`Menu` / `X` toggle) displaying all 8 integrated modules with badges and descriptions.
    - Adjusted mobile padding preventing bottom bar content occlusion.
  - Web Launch SEO & PWA Meta:
    - Optimized `client/index.html` with `viewport-fit=cover`, theme-color `#020617`, Apple touch metadata, Open Graph / social sharing tags, and Kirana commerce meta description.
  - Production Multi-Stage Dockerfile (`Dockerfile`):
    - Stage 1: Client Vite production bundle build.
    - Stage 2: Server TypeScript compilation & Prisma engine generation.
    - Stage 3: Minimal unprivileged Node.js 22 Alpine runtime (`USER node`), production-only dependencies, health check via `GET /api/v1/health`.
  - Production Nginx Reverse Proxy (`deploy/nginx.conf` & `deploy/Dockerfile.client`):
    - Gzip compression for static assets and API payloads.
    - Immutable caching for hashed assets (`/assets/`) and no-cache revalidation for `index.html`.
    - Reverse proxying for REST `/api/` and bidirectional WebSocket `/socket.io/` with connection upgrade headers.
  - Docker Compose Orchestration (`docker-compose.yml`):
    - Multi-container orchestration: PostgreSQL 16 Alpine with healthcheck, SharVin Backend API, and Nginx Web proxy.
  - PM2 Cluster Configuration (`ecosystem.config.cjs`):
    - Process manager setup supporting cluster mode (`instances: 'max'`), auto-restart, memory caps, and logging.
  - Operational Runbook (`deploy/README.md` & `.env.production.example`):
    - Complete deployment guide for Docker Compose, Bare-Metal VPS, and Nginx host configuration.
- **Verification Steps:**
  - `npm run typecheck --workspaces` -> Verified (exit code 0).
  - `npm run build --workspace=server` -> Verified (exit code 0).
  - `npm run build --workspace=client` -> Verified (exit code 0).
  - Deployment configuration verification -> Verified Dockerfile, docker-compose.yml, nginx.conf, ecosystem.config.cjs.
- **Status:** `DONE`

---

## 9. Master Task Registry Summary

| Task ID | Title | Milestone | Status |
| :--- | :--- | :--- | :--- |
| `TASK-M0-01` | Initialize Core Documentation Suite | M0 | `DONE` |
| `TASK-M0-02` | Repository Architecture & Project Scaffolding | M0 | `DONE` |
| `TASK-M1-01` | PostgreSQL & Prisma Setup | M1 | `DONE` |
| `TASK-M1-02` | Multi-Tenant Authentication Engine | M1 | `DONE` |
| `TASK-M2-01` | Retailer Product Catalog & POS Sales Backend | M2 | `DONE` |
| `TASK-M2-02` | Retailer POS Web Counter Interface | M2 | `DONE` |
| `TASK-M2-03` | Low-Stock Thresholds & 1-Click Restock Trigger | M2 | `DONE` |
| `TASK-M3-01` | Wholesaler Catalog & Bulk Pricing Backend | M3 | `DONE` |
| `TASK-M3-02` | Multi-Supplier Wholesale Cart Engine | M3 | `DONE` |
| `TASK-M3-03` | Web Restock Cart & Order Submission View | M3 | `DONE` |
| `TASK-M4-01` | Socket.io Real-Time Messaging & Order Gateway | M4 | `DONE` |
| `TASK-M4-02` | Bilateral Rate Proposal & Counter-Offer Engine | M4 | `DONE` |
| `TASK-M4-03` | Mutual Bilateral Rate Lock Confirmation View | M4 | `DONE` |
| `TASK-M5-01` | Two-Way Delivery OTP Handover Engine | M5 | `DONE` |
| `TASK-M5-02` | Inventory Stock Rebalancing on Delivery | M5 | `DONE` |
| `TASK-M5-03` | B2B Khata & Double-Entry Ledger Engine | M5 | `DONE` |
| `TASK-M6-01` | End-to-End Core Workflow Integration | M6 | `DONE` |
| `TASK-M6-02` | Multi-Tenant Security & Rate Limiting Hardening | M6 | `DONE` |
| `TASK-M6-03` | Web Launch Polish & Production Packaging | M6 | `DONE` |
| `TASK-AUTH-02` | Tenant Signup and Development Demo Account Drawer | Auth follow-up | `IN_REVIEW` |
| `TASK-AUTH-03` | Brevo Email Verification for Signup | Auth follow-up | `IN_REVIEW` |
| `TASK-P1-01` | Dispute, Credit Note & Rebalance Persistence + Strict Delivery Writes | P1 statelessness | `DONE` |
| `TASK-P1-02` | Live POS 7-Day Velocity Reorder Predictor & Public QR Verification | P1 Frontend Integration | `DONE` |
| `TASK-B2B-CONNECT` | B2B Network Discovery & Connection Request Workflow | B2B Network | `DONE` |

## 10. Authentication Follow-up: Signup and Local Demo Credentials

### `TASK-AUTH-02`: Tenant Signup and Development Demo Account Drawer
- **Status:** `IN_REVIEW`
- **Requirement:** `CONFIRMED` by the current user request.
- **Objective:** Provision retailer/wholesaler tenant owners through signup and provide fast login for deliberately seeded local demo identities.
- **Implementation:** `POST /api/v1/auth/signup` validates required identity fields and creates the owner, tenant profile, password hash, and pending email OTP in one transaction. `/signup` transitions to OTP verification. The development drawer obtains only fixed seeded demo accounts from `/api/v1/auth/demo-users`; the endpoint is development-only and opt-in.
- **Security boundary:** Never enumerate all customers or return their passwords. New signups must verify their email before a session is issued and are excluded from the demo credential endpoint.
- **Verification:** Prisma validation and client/server TypeScript checks passed. Automated tests and database-backed signup verification remain outstanding.
- **Dependencies:** Existing owner authentication and `authLimiter`.

### `TASK-AUTH-03`: Brevo Email Verification for Signup
- **Status:** `IN_REVIEW`
- **Requirement:** `CONFIRMED` by the current user request.
- **Objective:** Verify owner email before issuing an authenticated session.
- **Implementation:** MX DNS preflight, Brevo REST mail delivery, HMAC-hashed 6-digit OTP, 10-minute expiry, maximum five attempts, 60-second resend cooldown, IP rate limits, user-friendly handling of synchronous recipient rejection, and OTP verification/resend endpoints.
- **Compatibility:** Existing email/password accounts are backfilled as verified by the additive migration; verify this backfill for the target database. The schema default for new users remains unverified.
- **Verification:** Prisma validation and client/server typechecks passed after MX and Brevo recipient-error handling. Prisma Client generation failed with a Windows `EPERM` while replacing its query engine. Migration review/deployment and database-backed signup/verification/resend checks remain outstanding.

---

## 11. Persistence Roadmap: Stateless Delivery Module

### `TASK-P1-01`: Dispute, Credit Note & Rebalance Persistence (final in-memory maps)
- **Status:** `DONE`
- **Requirement:** `CONFIRMED` by the current user request (close out roadmap item #1).
- **Objective:** Delete `IN_MEMORY_REBALANCES`, `IN_MEMORY_DISPUTES` and `IN_MEMORY_CREDIT_NOTES` from `server/src/modules/delivery/delivery.service.ts`, back them with PostgreSQL, and remove the swallow-and-log `try/catch` around the `dispatchOrder` database write so failures surface strictly.
- **Dependencies:** `deliveries` persistence (P0.3/P0.4), sequential numbering convention from `invoices`, `LedgerService` escrow hold/release.
- **Relevant Files:**
  - `server/prisma/schema.prisma` (`DisputeStatus`, `CreditNoteStatus`, `CreditNote`, `DeliveryDispute`, `DeliveryRebalance` + back-relations on `Order`, `Delivery`, `Invoice`, `User`)
  - `server/prisma/migrations/20261105120000_add_dispute_and_credit_note_tables/migration.sql`
  - `server/src/modules/delivery/delivery.service.ts` (persistence + read/resolve paths, strict error handling)
  - `server/src/tests/order-fixture.ts` (new), `server/src/tests/test_dispute_and_credit_note_persistence.ts` (new)
  - `server/src/tests/test_b2b_loophole_audit.ts`, `test_delivery_driver_tracking_link.ts`, `test_gst_invoicing_and_export.ts`, `test_b2b_extended_matrix.ts` (create real order rows before dispatching)
  - `docs/DATABASE_DESIGN.md` §7, `docs/API_SPECIFICATION.md` §5.1, `docs/DECISIONS.md` ADR-010
- **Acceptance Criteria:**
  - No delivery side-effect lives in process memory; a fresh process serves dispute/credit-note/rebalance reads for any order.
  - Credit note + dispute written atomically; numbers sequential and unique-indexed.
  - A failed PostgreSQL write aborts the request with a readable, monitored error (no warn-and-continue).
  - `npx tsc --noEmit` clean; automated persistence suite passes against dev PostgreSQL.
- **Verification Steps:**
  - `npx prisma migrate deploy` -> 9 migrations applied; `prisma migrate status` up to date; `migrate diff --from-schema-datasource --to-schema-datamodel` empty (no drift).
  - `npx tsc --noEmit` -> clean (exit 0).
  - Live HTTP partial delivery: `POST /api/v1/deliveries/driver-portal/drv_.../verify-otp` (order `PO-P15-LIVE-0001`, 5 damaged Atta bags) -> `200` with `CN-2026-0002` + `DSP-2026-0002`; raw SQL confirmed one row each in `credit_notes`, `delivery_disputes`, `delivery_rebalances`.
  - `npx tsx src/tests/test_dispute_and_credit_note_persistence.ts` (+ `read <orderNumber>` in a new process) -> both phases passed, including the 404-on-unknown-order and tenant-gate assertions.
- **Outstanding / follow-up (not part of this task):** credit note party GSTIN/address still use the pre-existing demo constants; the Khata escrow memo remains warn-only; no automated coverage for the 409 sequential-number race.

---

## 12. Frontend API Integration (Sub-Modules P1.1 & P1.3)

### `TASK-P1-02`: Live POS 7-Day Velocity Reorder Predictor & Public QR Verification
- **Status:** `DONE`
- **Requirement:** `CONFIRMED` by user request.
- **Objective:** Connect live POS inventory sales to rolling 7-day velocity reorder prediction, update alert cards immediately upon retail checkout, and make the cryptographic invoice QR verification route accessible to public unauthenticated users.
- **Dependencies:** `TASK-P1-01`, POS billing engine, cryptographic invoice generation.
- **Relevant Files:**
  - `server/src/modules/inventory/inventory.service.ts`
  - `server/src/modules/pos/pos.validation.ts`
  - `server/src/modules/invoice/invoice.service.ts`
  - `client/src/modules/inventory/inventoryService.ts`
  - `client/src/modules/inventory/ReorderPredictorCard.tsx`
  - `client/src/modules/pos/PosBillingView.tsx`
  - `client/src/App.tsx`
  - `client/src/modules/invoice/PublicInvoiceVerifyView.tsx`
  - `server/src/tests/test_p1_1_and_p1_3_verification.ts`
- **Acceptance Criteria:**
  - `GET /api/v1/inventory/reorder-predictions` computes rolling 7-day sales velocity and stockout horizon from actual `retailer_sale_items` in the rolling 7-day window.
  - POS checkout triggers instant frontend re-evaluation and refreshes `<ReorderPredictorCard />`.
  - Static demo IDs removed from `<ReorderPredictorCard />`.
  - `/verify/invoice/:invoiceId` mounts outside auth guards and displays verification results and stored tax invoice without requiring authentication.
  - Both workspaces typecheck cleanly; live verification test suite passes.
- **Verification Steps:**
  - `npm run typecheck --workspace=client` -> clean (exit 0).
  - `npm run typecheck --workspace=sharvin-server` -> clean (exit 0).
  - `npm run build --workspace=client` -> clean (exit 0, 1996 modules transformed).
  - `npx tsx src/tests/test_p1_1_and_p1_3_verification.ts` -> all tests passed (authentic invoice verified unauthenticated, tampered invoice detected, POS sale decremented stock and recalculated Days Remaining from 6.3 to 5.1 days).

## 13. B2B Network Discovery & Connection Request Workflow

### `TASK-B2B-CONNECT`: B2B Network Discovery & Connection Request Workflow
- **Status:** `DONE`
- **Requirement:** `CONFIRMED` by user request.
- **Objective:** Enable Retailers to discover unconnected Wholesalers and dispatch connection requests, and enable Wholesalers to review pending retailer requests and accept them with customized credit limits and payment terms.
- **Dependencies:** `TASK-P1-01`, Auth & Multi-Tenancy module.
- **Relevant Files:**
  - `server/prisma/schema.prisma` (`ConnectionStatus.pending`)
  - `server/src/modules/wholesaler/wholesaler.service.ts`
  - `server/src/modules/wholesaler/wholesaler.controller.ts`
  - `server/src/modules/wholesaler/wholesaler.routes.ts`
  - `server/src/index.ts`
  - `client/src/modules/wholesaler/NetworkDiscoveryView.tsx`
  - `client/src/modules/wholesaler/ConnectionRequestsView.tsx`
  - `client/src/components/layout/AppLayout.tsx`
  - `client/src/App.tsx`
  - `server/src/tests/test_b2b_discovery_verification.ts`
- **Acceptance Criteria:**
  - `GET /api/v1/wholesalers/discover` returns all verified wholesalers not yet connected to the retailer.
  - `POST /api/v1/wholesalers/connect/:wholesalerId` creates a `RetailerWholesalerConnection` with `pending` status.
  - `GET /api/v1/wholesalers/requests/pending` returns pending requests for the authenticated wholesaler.
  - `PATCH /api/v1/wholesalers/requests/:id` allows the wholesaler to accept, setting status to `active` and recording `creditLimit` and `paymentTermDays`.
  - Frontend Discovery UI allows one-click connection requests with "Request Sent" state transitions.
  - Frontend Connection Requests UI provides modal for setting terms with immediate optimistic update.
  - All workspace TypeScript compilation checks and automated test suite pass.
- **Verification Steps:**
  - `npx tsc --noEmit` in `server`: exit code 0.
  - `npm run typecheck --workspace=client`: exit code 0.
  - `npx tsx src/tests/test_b2b_discovery_verification.ts`: 8-step live API test suite completed with 100% pass rate.




