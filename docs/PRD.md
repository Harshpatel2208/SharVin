# SharVin: Product Requirements Document (PRD)

**Status:** IN REVIEW
**Last Updated:** 2026-10-12

---

## 1. Executive Summary `[CONFIRMED]`

SharVin is a connected B2B commerce and smart POS platform designed to digitize the physical trust, bargaining, and credit relationships between local retail shopkeepers and their wholesale suppliers. It eliminates fragmented manual phone calls, untracked cash disputes, and stockout emergencies by uniting point-of-sale inventory tracking with instant wholesale restocking.

---

## 2. Platform Sequencing `[CONFIRMED]`

1. **Phase 1: Website First** - Highly responsive, modern Web application supporting Retailer POS/Restocking and Wholesaler fulfillment interfaces.
2. **Phase 2: Android Application Second** - Mobile native/hybrid app targeting shopkeeper mobile handsets and delivery drivers.
3. **Phase 3: Windows Application Third** - Desktop native/hybrid application optimized for high-volume retail counter billing setups.
- **Rule:** All three clients interface with one shared backend API and database.

---

## 3. User Personas `[PROPOSED]`

### Persona 1: The Retailer ("Dukandaar")
- Operates a local retail shop.
- Needs fast, keyboard/touch-friendly counter sales billing (POS).
- Faces frequent stockouts due to delayed or manual reordering via phone calls.
- Bargains on unit price based on volume, market fluctuations, and existing relationship.
- Needs an accurate record of payments made, outstanding credit (udhaar), and deliveries received.

### Persona 2: The Wholesaler ("Distributor/Dealer")
- Supplies goods to dozens of retail shops across local clusters.
- Manages inventory in bulk units (cases, cartons, pallets).
- Negotiates rates per customer based on historical volume and creditworthiness.
- Requires reliable delivery confirmation so drivers cannot misreport drops.
- Needs transparent cash collection and ledger settlements to prevent payment reconciliation disputes.

---

## 4. MVP Core User Workflows `[CONFIRMED]`

### Workflow 1: POS Inventory Tracking & 1-Click Wholesale Restocking
- Retailer scans/enters items sold at the POS counter.
- Inventory levels deplete in real time.
- When an item falls below a configurable reorder threshold:
  - System raises an automatic low-stock badge.
  - Retailer can click **"Restock"** directly from the inventory or POS view.
  - The item is automatically added to a **wholesaler-specific cart** (grouping items by their linked wholesale supplier).

### Workflow 2: Embedded Live Chat & Rate Bargaining
- Retailer opens the wholesaler cart and initiates an embedded negotiation chat session for the order.
- Both parties communicate in real-time inside the order context (no external messaging needed).
- The chat displays the proposed items, baseline catalog prices, requested quantities, and counter-offered unit rates.

### Workflow 3: Matching Price Confirmation (Rate Lock)
- Wholesaler or Retailer proposes a formal unit price adjustment / final total.
- The order status switches to **Pending Mutual Rate Confirmation**.
- Once both parties click **"Confirm Rate"**, the prices and quantities are locked into a binding purchase order.
- Inventory allocation is reserved at the wholesaler warehouse.

### Workflow 4: Secure Delivery Handover with Two-Way OTP
- Wholesaler marks order as "Dispatched" with delivery personnel details.
- System generates a secure **Two-Way Handover OTP**:
  - Retailer receives a delivery verification code.
  - At physical handover, the delivery agent and retailer exchange/verify the OTP on-site.
  - Prevents dispute over whether goods arrived or who accepted them.

### Workflow 5: Cash & Credit Ledger Tracking
- At delivery confirmation, the transaction logs to the shared B2B ledger:
  - Amount Paid (Cash, UPI/Online, or partial payment).
  - Amount Added to Credit (Udhaar).
- Both retailer and wholesaler have a synchronized view of ledger balance, timestamped audit log, and payment receipts.

---

## 5. Non-Functional Requirements `[PROPOSED]`

- **Aesthetics & Usability:** Premium modern UI, fast navigation, responsive layout across tablet, desktop, and mobile browsers.
- **Latency:** Real-time chat messages and price-lock updates delivered in < 250ms via WebSockets.
- **Data Integrity:** Strict ACID compliance for ledger entries, stock increments/decrements, and rate lock state transitions.
- **Multi-Tenant Isolation:** Retailers only see their own store data, linked wholesalers, and private negotiation histories. Wholesalers only see orders from connected retailers.

---

## 6. Open Product Clarifications `[NEEDS_CLARIFICATION]`

1. **POS Offline Mode:** Is offline POS billing required for the web MVP, or is an online-only web application acceptable for Phase 1?
2. **Wholesaler Discovery:** In MVP, do retailers manually connect with wholesalers via invite/code, or is there an open marketplace catalog?
