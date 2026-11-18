# Report 3: Pending Work, Gap Analysis & Master Tracking Task List

Use this checklist (`[ ]`) to track every remaining backend persistence migration, frontend-to-backend wiring task, security upgrade, and UI polish item required before production launch.

---

## Priority 0 (P0): Database Persistence & Prisma Schema Sync
Several Phase-2/Phase-3 modules (`invoice`, `delivery` tracking links, `inventory` expiry/velocity, and sub-user PINs) use service-level or in-memory state alongside the core Prisma tables so automated tests run fast[cite: 3]. To make data 100% persistent across server restarts, complete these tasks:

- [ ] **Task P0.1 — Add `GstInvoice` & `KhataVoucher` Models to `schema.prisma`:**
  - **Where:** `server/prisma/schema.prisma` and `server/src/modules/invoice/invoice.service.ts`[cite: 3].
  - **What is Pending:** Create a dedicated migration (`add_invoices_and_vouchers`) storing `invoiceNumber`, `orderId`, `sellerGstin`, `buyerGstin`, `taxableValue`, `cgst`, `sgst`, `igst`, `signatureHash`, `qrPayload`, and `KhataSettlementVoucher` records directly in PostgreSQL instead of service-memory maps[cite: 3].
- [ ] **Task P0.2 — Persist `batchNumber`, `expiryDate`, & `marginFloor` in Prisma Inventory Table:**
  - **Where:** `server/prisma/schema.prisma` and `server/src/modules/wholesaler/wholesaler.service.ts`[cite: 3].
  - **What is Pending:** Ensure `batchNumber`, `expiryDate`, `clearanceDiscountPct`, and `marginFloor` columns are migrated into the PostgreSQL `Inventory` / `Product` schema so godown edits persist permanently[cite: 3].
- [ ] **Task P0.3 — Persist Driver Tracking Tokens & GPS/Hub Checkpoints in Database:**
  - **Where:** `server/src/modules/delivery/delivery.service.ts`[cite: 3].
  - **What is Pending:** Move temporary driver dispatch tokens, `distanceKm`, tracking mode (`LOCAL_GPS` vs `HIGHWAY_HUB`), and checkpoint logs into a Prisma `DeliveryDispatch` table so active driver links survive backend restarts[cite: 3].
- [ ] **Task P0.4 — Persist Retailer Credit Terms (`creditLimit`, `paymentTermDays`) & Master Owner PIN:**
  - **Where:** `server/src/modules/ledger/ledger.service.ts` and `server/src/modules/auth/auth.service.ts`[cite: 3].
  - **What is Pending:** Store per-retailer credit limits, payment cycle days, overdue override audit logs, and the hashed 4-digit Owner Master PIN in PostgreSQL user/relationship tables[cite: 3].

---

## Priority 1 (P1): Frontend-to-Backend Live API Integration
- [ ] **Task P1.1 — Connect `PosBillingView` & `ReorderPredictorCard` to Live 7-Day Velocity Endpoint:**
  - **Where:** `client/src/modules/pos/PosBillingView.tsx` and `client/src/modules/inventory/ReorderPredictorCard.tsx`[cite: 3].
  - **What is Pending:** Ensure every retail POS checkout immediately triggers a backend velocity recalculation and refreshes the live `ReorderPredictorCard` without relying on static fallback demo data[cite: 3].
- [ ] **Task P1.2 — Wire Multi-Item Negotiation Socket Events End-to-End:**
  - **Where:** `client/src/modules/chat/LiveNegotiationView.tsx`, `chatSocketService.ts`, and `server/src/modules/chat/chat.gateway.ts`[cite: 3].
  - **What is Pending:** Verify that line-item counter-offers emit real-time Socket.io events (`line_rate_proposed`, `line_rate_locked`) and update both Retailer and Wholesaler split-screen windows simultaneously without manual page refresh[cite: 1, 3].
- [ ] **Task P1.3 — Wire Public QR Verification Route (`/verify/invoice/:invoiceId`) in `App.tsx`:**
  - **Where:** `client/src/App.tsx` and `client/src/modules/invoice/PublicInvoiceVerifyView.tsx`[cite: 3].
  - **What is Pending:** Ensure scanning the QR code from a downloaded PDF opens the public verification route directly without requiring an authenticated session guard[cite: 3].
- [ ] **Task P1.4 — Build `/settings/business` Profile & Compliance Screen:**
  - **Where:** `client/src/modules/auth/` and `server/src/modules/auth/`[cite: 3].
  - **What is Pending:** Add a dedicated Business Settings UI where Retailers and Wholesalers can update their Trade Name, 15-digit GSTIN, Store/Godown Address, and Delivery Radius (`km`).

---

## Priority 2 (P2): Cryptographic Security & Split-Screen Responsive UI Polish
- [ ] **Task P2.1 — Upgrade Invoice Hash from Symmetric SHA-256 to Asymmetric RSA/ECDSA Digital Signature:**
  - **Where:** `server/src/modules/invoice/invoice.service.ts`[cite: 3].
  - **What is Pending:** Sign invoice payloads using a server-side **Private Key** (`process.env.INVOICE_PRIVATE_KEY`) and verify them via the **Public Key** on `/verify/invoice/:invoiceId` so no external AI tool can forge a valid hash after altering invoice amounts[cite: 3].
- [ ] **Task P2.2 — Fix Split-Screen (`768px–1024px`) Header Clipping & POS Title Contrast:**
  - **Where:** `client/src/components/layout/AppLayout.tsx`, `client/src/modules/pos/PosBillingView.tsx`, and `client/src/modules/wholesaler/WholesalerWorkspaceView.tsx`[cite: 1, 3].
  - **What is Pending:**
    1. Collapse the top Role Switcher buttons (`Retailer: Gupta Kirana` / `Wholesaler: Kailash Grains`) on viewports `< 1100px` so the notification bell and profile avatar (`RG`, `KA`) do not clip off the right edge[cite: 1].
    2. Fix the "Counter Sales Billing" heading color in `PosBillingView.tsx` so it renders in high-contrast dark slate (`text-slate-900`) on light backgrounds instead of blending into white[cite: 1, 3].
    3. Make the 4 Wholesaler metric cards (`5 Purchase Orders`, `3 In Negotiation`, `1 Ready to Pack`, `Naya Bazar 4B`) and PO status filter pills responsive (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` and `flex-wrap`)[cite: 1, 3].

---

## Priority 3 (P3): Production Hardening & Phase-2 Enhancements
- [ ] **Task P3.1 — Offline Queue for Driver Mobile Web Link:**
  - **Where:** `client/src/modules/delivery/DriverMobileDispatchView.tsx`[cite: 3].
  - **What is Pending:** Cache damage photo logs and OTP submissions in `localStorage` / `IndexedDB` when the driver is in a low-network godown basement or highway zone, auto-syncing when connectivity returns[cite: 3].
- [ ] **Task P3.2 — Server-Side PDF & Native `.xlsx` Binary Generation:**
  - **Where:** `server/src/modules/invoice/invoice.service.ts` and `client/src/modules/invoice/CaGstr1ExportModal.tsx`[cite: 3].
  - **What is Pending:** Add server-side PDF rendering (`pdfkit` / `puppeteer`) and native multi-sheet Excel (`.xlsx`) generation alongside CSV export for CA Tally import[cite: 3].
- [ ] **Task P3.3 — WhatsApp Bot Notification Webhook Integration (Phase 2):**
  - **Where:** `server/src/modules/notifications/notification.service.ts`[cite: 3].
  - **What is Pending:** Connect outbound WhatsApp Cloud API / Twilio templates for instant 6-digit delivery OTPs, temporary driver dispatch links, and 15-day overdue Khata reminders[cite: 3].