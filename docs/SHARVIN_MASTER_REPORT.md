# SharVin: Complete Master Project Report, Codebase Audit & Gap Analysis

**Repository:** `SharVin1`  
**Document Purpose:** Single Source of Truth combining:
1. **Part 1 — Complete Platform Feature Catalog** (All 8 Domains & 32 

---

## Executive Summary & Tech Stack Overview

**SharVin** is a full-stack B2B supply-chain negotiation, wholesale commerce, and retail Point-of-Sale (POS) platform built to connect Indian retail shopkeepers (**Kirana stores**) with wholesale suppliers (**Mandis / Distributors**). It replaces fragmented paper ledgers (*Bahi-Khata*), unrecorded phone/WhatsApp bargaining, and error-prone doorstep deliveries with an auditable, cryptographically verified digital workflow.

### Core Technology Stack
| Layer | Technology / Library | Role in `SharVin1` |
| :--- | :--- | :--- |
| **Frontend Client** | React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons | Multi-role SPA (`client/src/`) supporting Retailer & Wholesaler workspaces, POS terminal, Kanban boards, and mobile driver dispatch views. |
| **Real-Time Engine** | Socket.io (`socket.io` & `socket.io-client`) | Bidirectional WebSocket rooms (`chat.gateway.ts` & `chatSocketService.ts`) for live multi-item rate bargaining and instant status updates. |
| **Backend API** | Node.js, Express.js, TypeScript, Zod / Custom Validators | Modular REST API (`server/src/modules/*`) enforcing strict RBAC, margin floors, OTP handovers, and financial idempotency. |
| **Database & ORM** | PostgreSQL, Prisma ORM (`server/prisma/`) | Relational schema (`schema.prisma`) with 6 sequential SQL migrations covering RBAC, Order Lifecycle, Double-Entry Ledger, and Credit Reservations. |
| **Security & Auth** | JWT, Bcrypt, 4-Digit Owner PIN Guard, SHA-256 Hashing | Sub-account role isolation, counter security locks, rate-limiting middleware, and tamper-proof invoice QR signatures. |
| **DevOps & Deploy** | Docker, Docker Compose, Nginx, PM2 (`ecosystem.config.cjs`) | Containerized multi-service orchestration (`Dockerfile`, `deploy/Dockerfile.client`, `deploy/nginx.conf`) and process clustering. |

---

# PART 1: Complete Platform Feature Catalog (All Features)

The SharVin platform blueprint spans **8 core functional domains** and **32 specialized modules** designed around real-world Kirana and Mandi operations.

---

## 1. Authentication, Role-Based Sub-Accounts & Counter Security (`auth`)
Built to reflect real shop and godown hierarchies where multiple workers share devices under a single business entity:

* **Multi-Tenant Role Contexts:** Distinct operational workspaces for **Retailers** (e.g., *Gupta Kirana*) and **Wholesalers** (e.g., *Kailash Grains*), with instant role/sub-role switching for testing and multi-operator terminals.
* **Retailer Sub-User Hierarchy:**
  * **Owner (`Seth` / `RETAILER_OWNER`):** Full authority over live wholesale rate bargaining, purchase orders, profit margin settings, B2B Khata ledgers, and tax invoices.
  * **Counter Staff (`Chhotu` / `POS_OPERATOR`):** Locked strictly to the Retail Counter POS billing and barcode scanning screen; blocked from viewing wholesale landed costs or supplier ledgers.
* **Wholesaler Sub-User Hierarchy:**
  * **Owner / Accounts Admin (`WHOLESALER_ADMIN`):** Full control over final rate locks, retailer credit limits, overdue dispatch overrides, Khata settlements, and CA GSTR-1 tax exports.
  * **Godown / Stock Manager (`GODOWN_MANAGER`):** Access to incoming order queues, packing verification, godown stock adjustments, batch/expiry logging, and tempo dispatch assignment.
  * **Field Agent (`FIELD_SALESMAN`):** Can draft orders and submit initial rate proposals on behalf of retailers, while final contract locking remains restricted to the Wholesaler Owner.
* **4-Digit Master Owner PIN Guard:** Sensitive screens (Wholesale Bargaining, B2B Khata Ledger, Wholesale Cart, Margin Settings) are gated by an interactive 4-digit PIN lock (`OwnerPinModal` & `ProtectedViewGuard`) with auto-lock on inactivity or tab switch.
* **Email Verification & Account Onboarding:** Full signup, login, and tokenized email verification flow backed by RBAC and email verification migrations, paired with a `DevQuickLogin` toolbar for rapid persona testing.
* **Business Compliance Profile:** Stores Trade Name, verified 15-character GSTIN, state code, registered shop/godown address, primary contact numbers, and local delivery radius.

---

## 2. Smart Retail Counter POS & Predictive Inventory (`pos`, `inventory`)
Directly links daily walk-in customer checkout with automated B2B wholesale replenishment:

* **High-Speed Barcode POS Terminal:** Global hardware barcode scanner and keyboard-wedge listener (`GlobalBarcodeScanner`) paired with manual SKU search, instant cart addition, GST calculation, and live shelf-stock indicators (`PosBillingView`).
* **Multi-Tender Retail Checkout:** Supports Cash, UPI, and walk-in customer billing with atomic inventory deduction on the retail shelf.
* **7-Day Rolling Velocity AI Reorder Predictor:**
  * Continuously computes rolling 7-day counter sales velocity:
    $$\text{Daily Sales Velocity} = \frac{\text{Total Units Sold in Last 7 Days}}{7}$$
  * Calculates exact stockout horizon in days:
    $$\text{Days of Stock Remaining} = \frac{\text{Current Shelf Stock}}{\text{Daily Sales Velocity}}$$
  * Triggers an explainable alert card (`ReorderPredictorCard`) whenever $\text{Days of Stock Remaining} \le 2.5\text{ days}$ (supplier lead-time threshold), showing 7-day sales volume, daily run rate, remaining units, and recommended restock quantity.
* **1-Click Restock Hub:** Converts low-stock alerts (`LowStockAlertsView`) and velocity warnings directly into supplier-grouped wholesale purchase drafts with a single click.

---

## 3. Wholesaler Godown Catalog, Batch & Near-Expiry Control (`wholesaler`, `cart`)
Prevents inventory overselling and eliminates disputes over near-expiry FMCG batches:

* **Live Godown Inventory & Pricing Matrix:** Enables wholesalers to manage physical godown stock, base wholesale rates (Ex-GST), GST percentage slabs, Minimum Order Quantities (MOQ), and strict minimum margin floors (`WarehouseCatalogView`).
* **Real-Time Zero-Stock Synchronization:** Setting a godown SKU's available quantity to $0$ immediately renders an `Out of Stock` badge on the retailer's restock catalog and blocks new cart reservations.
* **Batch Number & Near-Expiry Tracking (60-Day Rule):**
  * Tracks `batchNumber` and `expiryDate` per inventory lot.
  * Automatically flags batches expiring within $\le 60\text{ days}$ with a high-visibility `Near-Expiry Clearance` badge and optional clearance discount so retailers have full transparency before ordering.
* **Supplier-Segregated Wholesale Carts & MOQ Guard:** Automatically partitions retailer restock items by wholesale supplier (`WholesaleCartView`) and validates line-item MOQ constraints before order submission or negotiation.

---

## 4. Bilateral Live Rate Bargaining & Order Lifecycle (`chat`, `orders`)
Digitizes traditional mandi negotiation with strict financial and state-machine guardrails:

* **Bilateral Handshake State Machine:** Orders transition through strictly validated states:
  $$\text{DRAFT} \rightarrow \text{QUOTED / RATE\_PROPOSED} \rightarrow \text{COUNTERED} \rightarrow \text{PRICE\_LOCKED} \rightarrow \text{DISPATCHED} \rightarrow \text{DELIVERED / CANCELLED}$$
  Proposing or editing a price never auto-locks an order; it requires explicit acceptance by the counterparty.
* **Ex-Tax Base Price Negotiation:** All B2B price proposals and counter-offers operate strictly on **Base Price (Exclusive of GST)** to prevent reverse-tax rounding errors, while dynamically displaying the applicable GST slab and final **Landed Cost per unit** for the retailer.
* **Multi-Item Line-by-Line Bargaining:** Supports negotiating multiple SKUs (e.g., *Sharbati Atta*, *Sunflower Oil*, *Toor Dal*) inside a single Purchase Order (`LiveNegotiationView`). Agreed items can be locked individually while contested items are counter-offered, with real-time recalculation of line totals and gross order value.
* **Wholesale Margin Floor Enforcement:** Backend validation rejects any price proposal or lock below the wholesaler's configured minimum cost/margin floor (`marginFloorPrice`).
* **Wholesaler Command Center & Kanban Pipeline:** Visual operational dashboard (`WholesalerWorkspaceView` & `OrdersKanbanView`) organizing active B2B orders across Negotiation, Price-Locked, Packing, Dispatched, and Delivered stages.

---

## 5. Zero-Fraud Logistics, Driver Link & OTP Handover (`delivery`)
Eliminates transit blind spots, driver tampering, and doorstep shortage/damage disputes:

* **Tokenized Temporary Driver Web Link:** When an order is dispatched, the backend generates a unique, tokenized mobile web link (`DriverMobileDispatchView`) for the tempo driver—requiring zero app installation.
* **Distance-Adaptive Transit Tracking:**
  * **Local Transit ($\le 100\text{ km}$ — Live GPS Mode):** Real-time GPS coordinate updates and live distance/ETA tracking for local tempo deliveries.
  * **Regional / Highway Transit ($> 100\text{ km}$ — Hub Milestone Mode):** Battery-efficient checkpoint logging (`Dispatched from Godown` $\rightarrow$ `In Transit Highway Hub` $\rightarrow$ `Out for Local Delivery`).
* **2-Way 6-Digit Cryptographic OTP Handover:** Delivery completion (`DeliveryHandoverView`) requires the driver to submit the retailer's 6-digit handover OTP. Includes a **3-failed-attempt lockout** (10-minute cooldown) and blocks any API attempt to mark an order `DELIVERED` without a verified OTP token.
* **Damaged Goods Boundary Check & Split Credit Note Settlement:**
  * Retailers can log damaged/leaking units during handover with photo evidence and a strict boundary check enforcing:
    $$0 \le \text{damagedQty} \le \text{orderedQty}$$
  * Instead of unrecorded cash deductions with the driver, the full invoice value is posted and an automated **Credit Note / Return Pool adjustment** (`CreditNoteModal`) is credited to the retailer's B2B Khata ledger.

---

## 6. Double-Entry B2B Khata Ledger & Credit Risk Shields (`ledger`)
Replaces paper khata books with an immutable, double-entry financial ledger and automated credit risk enforcement:

* **Double-Entry Running Credit Ledger:** Records every credit reservation, invoice debit, damage credit note, and payment settlement (`B2BLedgerView`) using balanced debit/credit journal entries and automatic reservation rollback on order cancellation.
* **Bilateral Credit Limit & Overdue Freeze (High-Visibility Modals):**
  * Wholesalers configure per-retailer `Credit Limit` (e.g., INR 50,000) and `Payment Terms` (e.g., 7 or 15 days) (`WholesalerCreditTermsModal`).
  * **Retailer Credit Freeze Modal:** If a new order pushes exposure above the credit limit or if past invoices are overdue, checkout triggers a blocking alert modal (`RetailerCreditFreezeModal`) showing exact overdue figures and the minimum payment required to unlock dispatch.
  * **Wholesaler Credit Override Modal:** Wholesalers receive an explicit risk warning (`WholesalerCreditOverrideModal`) with two controlled actions: `[ Override & Allow Dispatch ]` (with audit reason) or `[ Demand Payment First ]`.
* **Idempotent Lump-Sum Khata Settlement & Receipt Vouchers:** Supports periodic bulk settlements via Cash, UPI, or NEFT (`KhataVoucherModal`) protected by idempotency keys (`idempotencyKey`) to prevent double-charging on network retries, generating a printable **Khata Payment Receipt Voucher**.

---

## 7. Tamper-Proof GST Invoicing & CA Tax Export (`invoice`)
Prevents AI/PDF invoice manipulation and automates monthly tax compliance:

* **Automated B2B GST Tax Invoice:** Generated automatically upon OTP-verified delivery (`GstInvoiceModal`), containing Seller/Buyer GSTINs, HSN codes, Ex-GST taxable values, CGST/SGST/IGST breakdowns, credit note adjustments, and OTP handover audit timestamps.
* **Cryptographic SHA-256 Signature & Dynamic QR Verification:**
  * Computes a server-signed deterministic SHA-256 hash over the invoice payload (`invoiceId`, `orderId`, `sellerGstin`, `buyerGstin`, `grandTotal`, `issuedAt`).
  * Embeds a verification QR code pointing to `/verify/invoice/:invoiceId` (`PublicInvoiceVerifyView`), enabling any CA, tax auditor, or merchant to verify the live server record and detect tampered PDFs.
* **1-Click CA GSTR-1 Excel/CSV Export:** Dedicated compliance modal (`CaGstr1ExportModal`) with period filters (`Current Month`, `Last Quarter`, `Custom Date Range`) that exports B2B invoice rows into standard government GSTR-1 CSV/Excel format for direct Tally or GST Portal import.

---

## 8. Real-Time Notifications, Guided E2E Tour & Production Infrastructure (`notifications`, `e2e`, `deploy`)
* **Multi-Channel Notification Engine:** Real-time in-app and WebSocket alerts for rate counters, order locks, low-stock warnings, and OTP dispatches (`notification.service.ts` & `notificationService.ts`), with structured payload hooks for WhatsApp Bot integration.
* **Interactive E2E Workflow Tour:** Built-in guided simulation view (`E2EWorkflowTourView`) that walks evaluators and new users step-by-step through the entire platform lifecycle from POS stock depletion to OTP handover and Khata settlement.
* **Production Hardening & Deployment Suite:** IP/route rate limiting (`rate-limiter.middleware.ts`), centralized error formatting (`error.middleware.ts`), multi-stage Docker builds, Nginx reverse proxy with WebSocket upgrade headers, and PM2 cluster configuration (`ecosystem.config.cjs`).
