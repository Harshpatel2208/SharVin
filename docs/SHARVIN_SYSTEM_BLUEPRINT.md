# Report 2: Implemented & Verified Features in Code (Where & How It Is Built)

This section maps every implemented feature in the `SharVin1` repository to its exact database migrations, backend services, API controllers, frontend React views, and automated test suites.

---

## 1. Database Schema & Sequential SQL Migrations (`server/prisma/`)
The PostgreSQL data layer is managed via Prisma ORM (`server/prisma/schema.prisma`) and seeded with realistic Kirana and Wholesale Mandi data (`server/prisma/seed.ts`) across 6 sequential migrations:

* **Migration 1 (`20261014153803_init/migration.sql`):** Establishes the core multi-tenant entities for Users, Retailer/Wholesaler profiles, Products/SKUs, Inventory records, Carts, and base Orders[cite: 3].
* **Migration 2 (`20261028100000_add_order_lifecycle/migration.sql`):** Implements the B2B order state machine transitions, negotiation rate history, and delivery OTP handover tracking fields[cite: 3].
* **Migration 3 (`20261028120000_add_double_entry_ledger/migration.sql`):** Adds immutable double-entry B2B Khata ledger tables for tracking debits, credits, running balances, and order-linked financial entries[cite: 3].
* **Migration 4 (`20261028130000_add_ledger_credit_reservations/migration.sql`):** Introduces atomic credit reservations and rollback locks so pending B2B orders reserve credit capacity before dispatch[cite: 3].
* **Migration 5 (`20261031100000_auth_rbac/migration.sql`):** Adds Role-Based Access Control (RBAC) roles, sub-account permissions, and security structures[cite: 3].
* **Migration 6 (`20261031120000_email_verification/migration.sql`):** Adds email verification tokens, expiry timestamps, and verified account status flags[cite: 3].

---

## 2. Authentication, Sub-Account Roles & Counter PIN Security (`auth`)
* **Backend Implementation:**
  * `server/src/modules/auth/auth.service.ts` & `auth.controller.ts`: Handles user registration, JWT token issuance, password hashing, email verification token checks, and sub-user role resolution[cite: 3].
  * `server/src/modules/auth/permissions.ts` & `server/src/middleware/auth.middleware.ts`: Enforces route-level RBAC permissions separating Retailer (`Owner`, `Counter Staff`) and Wholesaler (`Owner/Admin`, `Godown Manager`, `Field Agent`) capabilities[cite: 3].
  * `server/src/services/email.service.ts`: Manages verification and transactional email dispatch[cite: 3].
* **Frontend Implementation:**
  * `client/src/context/RoleContext.tsx`: Manages active workspace role switching (`Retailer: Gupta Kirana` vs. `Wholesaler: Kailash Grains`) and sub-role state[cite: 1, 3].
  * `client/src/components/auth/OwnerPinModal.tsx` & `ProtectedViewGuard.tsx`: Locks sensitive tabs (Bargaining, Khata Ledger, Margins) behind a 4-digit Owner PIN when operating in `Counter Staff (Chhotu)` mode[cite: 3].
  * `client/src/modules/auth/LoginView.tsx`, `SignupView.tsx`, & `DevQuickLogin.tsx`: Full authentication screens plus 1-click developer role login[cite: 3].
* **Verification Suite:** `server/src/tests/test_role_subaccounts_and_counter_security.ts`[cite: 3].

---

## 3. Retail Counter POS & Global Barcode Scanning (`pos`)
* **Backend Implementation:**
  * `server/src/modules/pos/pos.service.ts`, `pos.controller.ts`, `pos.routes.ts`, & `pos.validation.ts`: Processes retail counter checkouts (Cash/UPI), validates available shelf quantities, atomically decrements retail stock, and logs daily sales velocity[cite: 3].
* **Frontend Implementation:**
  * `client/src/components/scanner/GlobalBarcodeScanner.tsx`: Global keyboard-wedge barcode listener that captures rapid scanner input (`8901030000014`, etc.) and auto-adds items to the POS bill[cite: 1, 3].
  * `client/src/modules/pos/PosBillingView.tsx` & `posService.ts`: Renders the live counter terminal, quick-pick SKU cards (`Fortune Oil`, `Aashirvaad Atta`, `Tata Salt`, `Maggi`), cart calculation, and instant checkout[cite: 1, 3].

---

## 4. Inventory Alerts, 7-Day Velocity AI Predictor & Godown Catalog (`inventory`, `wholesaler`)
* **Backend Implementation:**
  * `server/src/modules/inventory/inventory.service.ts` & `inventory.controller.ts`: Computes low-stock thresholds and rolling 7-day sales velocity (`dailyVelocity = unitsSoldLast7Days / 7`, `daysRemaining = currentStock / dailyVelocity`), generating recommended buffer reorder quantities[cite: 3].
  * `server/src/modules/wholesaler/wholesaler.service.ts` & `wholesaler.controller.ts`: Manages wholesaler godown stock updates, base Ex-GST rates, margin floors, `batchNumber`, and `expiryDate` tracking (flagging lots expiring within 60 days as `Near-Expiry Clearance`)[cite: 3].
* **Frontend Implementation:**
  * `client/src/modules/inventory/LowStockAlertsView.tsx`: Displays depleted retail SKUs with 1-click transfer to wholesaler carts[cite: 3].
  * `client/src/modules/inventory/ReorderPredictorCard.tsx`: Renders the medium-length explainable 7-day velocity alert card on the POS & Restock views[cite: 3].
  * `client/src/modules/wholesaler/WarehouseCatalogView.tsx`: Provides wholesalers with a live catalog table to edit godown stock, base rates, batch numbers, and expiry dates, immediately toggling `Out of Stock` badges when stock hits `0`[cite: 3].
* **Verification Suites:** `server/src/tests/test_velocity_reorder_predictor.ts` & `server/src/tests/test_godown_stock_and_expiry_tracking.ts`[cite: 3].

---

## 5. Supplier Carts, Multi-Item Live Bargaining & Order Pipeline (`cart`, `chat`, `orders`)
* **Backend Implementation:**
  * `server/src/modules/cart/cart.service.ts` & `cart.validation.ts`: Segregates restock items by wholesale supplier and enforces Minimum Order Quantity (MOQ) rules[cite: 3].
  * `server/src/modules/chat/chat.service.ts`, `chat.gateway.ts` (Socket.io), & `chat.validation.ts`: Powers the bilateral negotiation state machine (`RATE_PROPOSED`, `COUNTERED`, `FINAL_OFFER`, `PRICE_LOCKED`) across multi-line item orders while enforcing wholesaler margin floors on Ex-GST base prices[cite: 3].
  * `server/src/modules/orders/order-lifecycle.service.ts` & `order-lifecycle.controller.ts`: Manages order state transitions, stock reservation upon price lock, and cancellation rollbacks[cite: 3].
* **Frontend Implementation:**
  * `client/src/modules/cart/WholesaleCartView.tsx`: Supplier-grouped cart management and RFQ draft submission[cite: 3].
  * `client/src/modules/chat/LiveNegotiationView.tsx` & `chatSocketService.ts`: Real-time multi-item line-by-line rate negotiation UI with base price + GST landed cost breakdown[cite: 3].
  * `client/src/modules/wholesaler/WholesalerWorkspaceView.tsx` & `client/src/modules/orders/OrdersKanbanView.tsx`: Wholesaler Command Center showing active pipeline metrics and Kanban stages[cite: 1, 3].
* **Verification Suites:** `server/src/tests/test_multi_item_negotiation_and_khata_vouchers.ts`, `test_b2b_loophole_audit.ts`, & `test_b2b_extended_matrix.ts`[cite: 3].

---

## 6. Driver Dispatch Link, Distance-Adaptive Tracking & OTP Handover (`delivery`)
* **Backend Implementation:**
  * `server/src/modules/delivery/delivery.service.ts`, `delivery.controller.ts`, & `delivery.validation.ts`: Generates tokenized temporary driver links on dispatch, switches tracking mode based on the `100 km` distance threshold (`< 100 km` live GPS polling vs. `> 100 km` hub checkpoints), verifies the 6-digit cryptographic handover OTP (with 3-attempt / 10-minute lockout), caps damaged units at `deliveredQty`, and issues split credit notes[cite: 3].
* **Frontend Implementation:**
  * `client/src/modules/delivery/DriverMobileDispatchView.tsx`: No-install mobile web view for delivery drivers with route navigation, damage logging, and OTP entry[cite: 3].
  * `client/src/modules/delivery/DeliveryHandoverView.tsx` & `CreditNoteModal.tsx`: Retailer/Wholesaler delivery tracking dashboard, OTP display, and damaged goods credit note modal[cite: 3].
* **Verification Suites:** `server/src/tests/test_delivery_driver_tracking_link.ts` & `server/src/tests/test_dispute_resolution_and_partial_delivery.ts`[cite: 3].

---

## 7. Double-Entry B2B Khata, Credit Freeze & Settlement Vouchers (`ledger`)
* **Backend Implementation:**
  * `server/src/modules/ledger/ledger.service.ts`, `ledger.controller.ts`, & `ledger.validation.ts`: Manages double-entry debit/credit postings, credit reservations, per-retailer credit limits and payment terms, overdue dispatch blocks, wholesaler overrides, idempotent lump-sum repayments, and Khata payment receipt vouchers[cite: 3].
* **Frontend Implementation:**
  * `client/src/modules/ledger/B2BLedgerView.tsx` & `KhataVoucherModal.tsx`: Running Khata statement view, 7/15-day bulk payment recording modal, and printable payment voucher[cite: 3].
  * `client/src/modules/ledger/WholesalerCreditTermsModal.tsx`, `RetailerCreditFreezeModal.tsx`, & `WholesalerCreditOverrideModal.tsx`: High-visibility credit limit configuration and bilateral overdue blocking/override modals[cite: 3].
* **Verification Suites:** `server/src/tests/test_credit_limit_and_overdue_freeze.ts` & `server/src/tests/test_payment_idempotency.ts`[cite: 3].

---

## 8. Tamper-Proof GST Invoicing & CA GSTR-1 Export (`invoice`)
* **Backend Implementation:**
  * `server/src/modules/invoice/invoice.service.ts`, `invoice.controller.ts`, & `invoice.routes.ts`: Generates immutable GST tax invoices on `DELIVERED` status with HSN codes, CGST/SGST/IGST splits, SHA-256 signature hashes, `/verify/invoice/:invoiceId` verification endpoints, and GSTR-1 tabular exports[cite: 3].
* **Frontend Implementation:**
  * `client/src/modules/invoice/GstInvoiceModal.tsx`: Printable GST tax invoice preview with embedded dynamic QR code and cryptographic hash footer[cite: 3].
  * `client/src/modules/invoice/PublicInvoiceVerifyView.tsx`: Public tamper-detection page comparing scanned QR payloads against live server records[cite: 3].
  * `client/src/modules/invoice/CaGstr1ExportModal.tsx`: Date-range filtered CA GSTR-1 CSV/Excel export modal[cite: 3].
* **Verification Suite:** `server/src/tests/test_gst_invoicing_and_export.ts`[cite: 3].

---
---

