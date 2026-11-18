# Roles and Permissions Specification (RBAC)

**Requirement:** `CONFIRMED`. **Implementation task:** `IN_REVIEW`. Generated Prisma Client, migration deployment, and database-backed verification are pending. The enforced app roles are tenant owner, retailer `cashier` / `retailer_manager`, and wholesaler `wholesaler_manager` / `godown_manager` / `field_agent`. Role defaults and per-staff overrides are resolved server-side. Browser route guards are supplemental; they never grant API access. No platform-wide Super Admin role is implemented by this change.

## 1. Actor Definitions & Context

| Role | Scope | Description |
| :--- | :--- | :--- |
| **Super Admin** | Platform-wide | Platform owner with global access across all tenants, financial settlements, KYC validation, system configurations, and dispute resolution. |
| **Wholesaler** | Tenant (Seller) | Supplier organization managing bulk product catalogs, inventory allocations, tiered pricing schemes, MOQ parameters, buyer credit lines, and B2B order fulfillment. |
| **Retailer** | Tenant (Buyer) | Verified commercial buyer purchasing at wholesale rates, utilizing approved credit limits, issuing purchase orders, and tracking bulk shipments. |
| **Sales Executive** | Sub-Tenant (Seller-delegated) | Field representative or account manager assigned to specific retailer accounts; initiates assisted orders, negotiates quotes within margin thresholds, and tracks retailer credit status. |

---

## 2. Granular Access Control Matrix

### Legend
- **`CRUD`** – Create, Read, Update, Delete
- **`CRU`** – Create, Read, Update (No Hard Deletes)
- **`RU`** – Read, Update
- **`R`** – Read-only
- **`A`** – Approve / Reject
- **`C*`** – Create with approval gate / conditionally scoped
- **`R*`** – Scoped strictly to assigned accounts/territory
- **`—`** – No Access (Deny by default)

### Access Matrix Table

| Functional Module | Resource / Action | Super Admin | Wholesaler | Retailer | Sales Executive |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Tenant & Identity** | Onboard/Register Tenant | CRUD | — | — | — |
| | KYC Document Verification | A / RU | R | Submit / R | R* |
| | Sub-user / Staff Management | CRUD | CRUD (Own) | CRUD (Own) | — |
| | Storefront & Profile Settings | RU | CRUD (Own) | CRUD (Own) | — |
| **Catalog & Inventory** | Category & Tax Class Master | CRUD | R | R | R |
| | Product SKU Listing | CRUD | CRUD (Own) | R (Public/Tiered) | R* |
| | MOQ & Increment Step Config | CRUD | CRUD (Own) | R | R* |
| | Stock Allocation & Batches | R | CRUD (Own) | R (Availability only) | R* |
| **Pricing & Terms** | Base Catalog Price | CRUD | CRUD (Own) | R | R* |
| | Tier/Volume Pricing Tables | CRUD | CRUD (Own) | R (Eligible tier) | R* |
| | Custom Retailer Price Overrides | CRUD | CRUD (Own) | R (Own assigned) | C* / R* |
| | Dynamic Quotation / RFQ Engine | A / R | CRU / A | CRU (Own) | CRU* (Assigned) |
| **Credit & Finance** | Retailer Credit Limit Assignment | R | CRU / A | R (Own status) | Recommend / R* |
| | Payment Terms Setup (Net 15/30/60) | R | CRU / A | R (Own terms) | R* |
| | Ledger Statements & Balances | R | R (All Buyers) | R (Own) | R* |
| | Credit Freeze / Account Lock | A | U (Own Buyers) | — | — |
| **Orders & Fulfillment** | Draft / Offline Order Entry | — | CRU | CRU | CRU* (Assigned) |
| | Purchase Order (PO) Issuance | — | — | CRU | CRU* (On behalf) |
| | PO Acceptance & Price Lock | — | A / RU | R (Own) | R* |
| | Partial Fulfillment & Dispatch | — | CRU | R (Tracking) | R* |
| | Cancel Order (Pre-dispatch) | A | U | U (Conditional) | C* |
| **Invoicing & Taxation** | B2B Tax Invoice Generation | R | CRU | R (Own) | R* |
| | E-Way Bill / Dispatch Note | R | CRU | R (Own) | R* |
| | Credit Note (CN) / Debit Note (DN) | A | CRU / A | R (Own) | C* / R* |
| **Analytics & Audit** | Platform Revenue & Settlement | CRUD | — | — | — |
| | Wholesaler Sales & Aging Reports | R | R (Own) | — | R* (Assigned) |
| | Retailer Purchase History | R | R (Related) | R (Own) | R* (Assigned) |
| | System Audit Logs (Security/Price) | R | R (Tenant-level) | — | — |

---

## 3. Workflow Permissions & State Transitions

### 3.1 Quotation / Custom Pricing Override Workflow


- **Sales Executive Restriction:** May offer discounts only within predefined margin bounds (e.g., max 5% below tier price). Deeper concessions auto-escalate to `Wholesaler Admin`.
- **Retailer Visibility:** Active custom rates visible only post-approval.

### 3.2 Credit Checkout Validation Flow


### 3.3 Order Lifecycle State × Actor Permissions

| Order Status | Permitted Actors | Allowed Actions |
| :--- | :--- | :--- |
| `DRAFT` | Retailer, Sales Executive | Add/Remove items, update quantities, convert to PO |
| `SUBMITTED_PO` | Retailer, Sales Executive | Submit for supplier confirmation; Retailer may cancel |
| `UNDER_REVIEW` | Wholesaler | Verify inventory, validate credit, confirm prices |
| `ACCEPTED` | Wholesaler | Generate proforma/sales order; decrement reserved stock |
| `DISPATCHED` | Wholesaler | Attach E-Way bill, carrier details, generate Tax Invoice |
| `DELIVERED` | Retailer, Wholesaler | Retailer acknowledges receipt or raises dispute (48h window) |
| `DISPUTED` | Retailer, Wholesaler, Super Admin | Freeze invoice balance; Super Admin intervenes if unresolved |
| `CLOSED` | Wholesaler, System | Invoice fully settled; ledger entry finalized |

---

## 4. Multi-Tenant Isolation & Boundary Rules

1. **Strict Tenant Separation:** All DB queries for `Wholesaler` and `Retailer` actors must be injected with `tenant_id` at the ORM/repository layer. Cross-tenant reads are prohibited and trigger audit alerts.

2. **Sales Executive Scoping:** Every `Sales Executive` request must validate:
   ```sql
   retailer_id IN (
     SELECT retailer_id FROM sales_rep_assignments
     WHERE rep_id = :current_user_id
   )
