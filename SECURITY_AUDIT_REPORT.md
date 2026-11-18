# SharVin Security Architecture & Application Audit Report

**Assessment status:** Complete (static and safe testing scope)  
**Assessment date:** 2026-11-16  
**Application:** SharVin B2B SaaS  
**Report classification:** Confidential — application security review  
**Change policy:** Audit and reporting only; no application source, schema, dependency, or configuration remediation was performed.

## 1. Executive Summary

SharVin has a meaningful security foundation: tenant-aware JWT claims, eight-hour token expiry, bcrypt cost 12, HMAC-protected email OTPs, attempt and resend controls, rate limiting, Helmet, a restricted CORS origin, Prisma parameterization, idempotency keys, row locking for financial operations, and several resource-scoping middlewares.

The application is **not ready for an Internet-facing production launch in its present state**. The most important risks are concentrated in business authorization rather than conventional SQL injection or reflected XSS:

- delivery inspection fields supplied by the client can determine credit-note value without reconciliation to authoritative order lines;
- a retailer can post a payment as immediately verified and reduce its own debt;
- an order posting can be reversed without proving that the order is cancelled or rejected;
- settlement vouchers can be read across tenants by an authenticated user with `ledger.read`;
- delivery status discloses both the driver access token and retailer handover code to the wholesaler;
- public invoice verification accepts predictable identifiers and returns a full invoice, including business identities, GSTINs, addresses, line items, and amounts;
- staff sessions receive unfiltered tenant profiles containing owner PIN hashes and, for wholesalers, bank details;
- development quick-login behavior fails open when `NODE_ENV` is absent or misspelled;
- production Docker configuration contains usable fallback secrets.

**Overall security maturity:** **Developing / pre-production**. Core controls exist, but authorization is inconsistent at several financial and delivery trust boundaries. Release should be blocked until all High-severity findings are remediated and regression-tested.

## 2. Application Architecture Overview

The inspected implementation differs from the originally suggested PHP/Laravel/MySQL stack. The actual repository contains:

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind-based UI.
- **Backend:** Node.js, Express 4, TypeScript, Socket.IO 4.
- **Database:** PostgreSQL accessed through Prisma 6.
- **Authentication:** Bearer JWTs, bcryptjs password/PIN hashing, email OTP verification through Brevo.
- **Deployment:** Docker Compose, Nginx reverse proxy, PostgreSQL container.
- **Observability:** optional Sentry initialization.
- **External integration:** no OGL Profit4 ERP client, credential flow, or webhook implementation was found in the inspected code.

Trust boundaries are: browser to REST/Socket.IO API; API to PostgreSQL; API to Brevo; unauthenticated driver-link and invoice-verification consumers; retailer/wholesaler tenant boundaries; and owner/staff privilege boundaries.

## 3. Technologies and Components Inspected

- Authentication service, routes, validation, JWT middleware, permissions, OTP behavior, profile and sub-account flows.
- Order lifecycle, wholesaler connection, delivery/handover, invoice, ledger/payment/voucher services and routes.
- Prisma schema constraints and relevant tenant relationships.
- React authentication state, delivery offline queue, and client token storage.
- Express security middleware, Socket.IO initialization, upload abstraction, Docker Compose, Nginx.
- npm dependency tree and `npm audit` advisories.
- Tracked environment examples and secret-pattern results. Real environment files and secret values were not read or printed.

## 4. Security Testing Methodology

The review used source-assisted threat modeling, route/middleware tracing, data-flow review, schema/constraint review, configuration review, secret-pattern checks, and `npm audit --ignore-scripts`. Findings were mapped to the [OWASP Top 10:2025](https://top10.owasp.org/), [OWASP API Security Top 10:2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/), and relevant CWE categories.

No destructive SQL, live customer-data mutation, denial-of-service testing, external ERP testing, credential attacks, or exploit automation was performed. No CVSS 4.0 base score is assigned to application findings because environmental and live exploitability metrics were not validated; this avoids presenting speculative scores as measured risk. npm advisory scores are reported exactly as published and are CVSS 3.1 where supplied.

## 5. Overall Security Assessment

| Domain | Assessment | Summary |
|---|---|---|
| Authentication | Needs improvement | Strong hashing/OTP controls; fail-open dev endpoints and identifier-collision DoS remain. |
| Authorization/RBAC | High risk | Multiple permission and tenant/resource-scoping gaps. |
| Financial integrity | High risk | Self-posted verified payments and lifecycle-independent reversals. |
| Delivery integrity | High risk | Client-authoritative credit values and leaked handover credentials. |
| API/data exposure | High risk | Voucher IDOR and excessive public invoice response. |
| Frontend | Moderate risk | JWT is session-scoped, but offline handover secrets persist in localStorage. |
| Database/query safety | Generally sound | Prisma parameterization and transactions are positive; business authorization is the dominant issue. |
| File upload | Incomplete | Safe abstraction exists but is not integrated; arbitrary proof strings are accepted. |
| Infrastructure | Needs hardening | Default secrets, host-published services, and HTTP-only reference proxy config. |
| Dependencies | Needs patching | One High and two Moderate published advisories. |

## 6. Vulnerability Summary

| ID | Finding | Severity | Status |
|---|---|---:|---|
| SV-001 | Client-controlled damage lines can forge credit/dispute value | High | Confirmed by source |
| SV-002 | Retailer can self-post a verified payment and reduce debt | High | Confirmed by source |
| SV-003 | Ledger rollback does not verify cancelled/rejected lifecycle | High | Confirmed by source |
| SV-004 | Settlement voucher cross-tenant IDOR and financial PII disclosure | High | Confirmed by source |
| SV-005 | Delivery status exposes handover credentials to wholesaler | High | Confirmed by source |
| SV-006 | Public invoice enumeration returns excessive business data | High | Confirmed by source |
| SV-007 | Staff sessions receive owner PIN hash and sensitive profile fields | High | Confirmed by source |
| SV-008 | Development quick-login protection fails open outside explicit prod/test | High | Confirmed; exploitation is environment-dependent |
| SV-009 | Production Compose contains functional fallback secrets | High | Confirmed configuration weakness |
| SV-010 | Wholesaler staff can accept connections and set credit terms without capability check | High | Confirmed by source |
| SV-011 | Cross-table account identifiers enable targeted login denial | Medium | Confirmed by source |
| SV-012 | Order lifecycle route has malformed authorization/scoping middleware | Medium | Confirmed by source |
| SV-013 | Ephemeral invoice keys break verification after restart | Medium | Confirmed conditional behavior |
| SV-014 | Offline queue persists delivery token and OTP in localStorage | Medium | Confirmed by source |
| SV-015 | Upload security abstraction is not integrated into delivery proof flow | Medium | Confirmed control gap |
| SV-016 | Vulnerable npm dependencies (`body-parser`, `qs`, Vite) | High/Medium | Confirmed by npm audit |
| CM-001 | Reference Nginx configuration is HTTP-only | Conditional | Exposure not verified |
| CM-002 | PostgreSQL and API ports are published to the Docker host | Conditional | Internet reachability not verified |

## 7. Detailed Vulnerability Findings

### SV-001 — Client-controlled damage lines can forge credit/dispute value

- **Severity:** High
- **CVSS 4.0:** Not assigned; no live exploit validation.
- **OWASP/CWE:** API3:2023 Broken Object Property Level Authorization; CWE-602 Client-Side Enforcement of Server-Side Security; CWE-20 Improper Input Validation.
- **Affected component:** Delivery handover, partial fulfillment, credit notes.
- **Affected files:** `server/src/modules/delivery/delivery.validation.ts:18-36,43,65`; `server/src/modules/delivery/delivery.service.ts:1217-1229,1271-1274,1381-1397,1492-1499`.
- **Technical explanation:** The schema accepts client-supplied order item IDs, product identity, ordered/accepted/rejected quantities, unit price, and rejected amount. The service validates only the separate aggregate `damagedQuantity` against total order units. It then replaces that value with the sum of `lineItemInspections.rejectedQuantity` and calculates credits from client-supplied quantity and unit price. It does not join each inspection to the authoritative order item or enforce accepted + rejected = ordered.
- **Attack scenario:** A caller possessing a valid delivery link/OTP, or an authorized participant, submits fabricated line IDs, excessive rejected quantities, and inflated unit prices. The service creates a credit note, dispute, and escrow hold using those values.
- **Business impact:** Fraudulent credits, incorrect GST/ledger records, stock and settlement disputes, direct financial loss.
- **Evidence:** The calculation at service lines 1381-1397 reads `it.rejectedQuantity * it.unitPrice` directly from the request-derived object.
- **Recommended solution:** Accept only `{orderItemId, acceptedQuantity, rejectedQuantity, reason}`; load locked order lines server-side; enforce identity, quantity conservation, and total limits; use persisted price/tax snapshots; calculate all amounts server-side in one transaction.
- **Verification method:** Negative integration tests must reject unknown/duplicate line IDs, price fields, over-rejection, and quantity mismatches; a valid partial delivery must reconcile exactly to persisted order lines.

### SV-002 — Retailer can self-post a verified payment and reduce debt

- **Severity:** High
- **CVSS 4.0:** Not assigned.
- **OWASP/CWE:** API1:2023 BOLA; API5:2023 Broken Function Level Authorization; CWE-862 Missing Authorization.
- **Affected files:** `server/src/modules/ledger/ledger.routes.ts:11-12`; `server/src/modules/ledger/ledger.controller.ts:83-92`; `server/src/modules/ledger/ledger.service.ts:494-499,504-518,552-559,584-607`.
- **Technical explanation:** The payment endpoint requires `ledger.manage` but does not restrict which party can attest receipt. `userRole` is passed into the service but unused. The account lookup permits either connected party, and the new record is immediately assigned `paymentStatus: 'verified'` before reducing the receivable balance.
- **Attack scenario:** A retailer owner, whose wildcard permission satisfies `ledger.manage`, submits a fabricated payment against its wholesaler relationship and reduces the outstanding balance without wholesaler or payment-provider confirmation.
- **Business impact:** Receivables understatement, fraudulent settlement vouchers, reconciliation failure, and financial loss.
- **Recommended solution:** Separate “payment intent/claim” from “payment verified”; only the creditor, an authorized collector, or a verified payment webhook may finalize it. Bind payer/payee from the authenticated tenant and ledger relationship, not request intent.
- **Verification method:** Integration tests must prove a retailer cannot finalize its own payment; duplicated provider events remain idempotent; only authorized creditor/provider confirmation posts balanced entries.

### SV-003 — Ledger rollback does not verify cancelled/rejected lifecycle

- **Severity:** High
- **OWASP/CWE:** API5:2023; CWE-863 Incorrect Authorization; CWE-840 Business Logic Errors.
- **Affected files:** `server/src/modules/ledger/ledger.routes.ts:14`; `server/src/modules/ledger/ledger.service.ts:916-990`.
- **Technical explanation:** Although the route requires a participating owner, the service finds the original ledger posting and creates a full reversing entry without loading the order or requiring a terminal cancellation/rejection state. Either party owner can invoke it.
- **Attack scenario:** A retailer owner reverses a valid delivered-order receivable while the order remains delivered.
- **Business impact:** Debt erasure, false books, settlement disputes, and audit/compliance failure.
- **Recommended solution:** Make reversal an internal reaction to a validated lifecycle event; lock and verify order status, transition event, actor authority, and unreversed posting in the same transaction. Do not expose a generic party-triggered rollback.
- **Verification method:** Delivered/accepted/in-transit orders must reject rollback; only a unique cancellation/rejection event can create one immutable reversing entry.

### SV-004 — Settlement voucher cross-tenant IDOR and financial PII disclosure

- **Severity:** High
- **OWASP/CWE:** API1:2023 BOLA; CWE-639 Authorization Bypass Through User-Controlled Key.
- **Affected files:** `server/src/modules/ledger/ledger.routes.ts:16-17`; `server/src/modules/ledger/ledger.controller.ts:305-333`; `server/src/modules/ledger/ledger.service.ts:715-770`.
- **Technical explanation:** Voucher GET/CSV routes check only `ledger.read`. The controller passes an attacker-controlled ID/number, and the service searches by ID, voucher number, receipt number, or transaction ID without asserting the authenticated tenant is the retailer or wholesaler. The DTO includes names, GSTIN, PAN, addresses, phone numbers, amount, and balances.
- **Attack scenario:** An authenticated staff user with `ledger.read` requests a discovered or guessed receipt/voucher identifier belonging to another relationship.
- **Business impact:** Cross-tenant disclosure of financial and regulated business identity data.
- **Recommended solution:** Pass `tenantId` into every lookup and add `OR: [{retailerId: tenantId}, {wholesalerId: tenantId}]`; use a dedicated voucher scoping middleware; authorize CSV identically; avoid predictable public identifiers as authorization evidence.
- **Verification method:** Two-tenant IDOR tests for every identifier alias must return 403/404 for nonparticipants and never disclose whether the voucher exists.

### SV-005 — Delivery status exposes handover credentials to wholesaler

- **Severity:** High
- **OWASP/CWE:** API3:2023; CWE-200 Exposure of Sensitive Information; CWE-522 Insufficiently Protected Credentials.
- **Affected file:** `server/src/modules/delivery/delivery.service.ts:1668-1702`.
- **Technical explanation:** Participant-scoped delivery status returns `driverAccessToken` to callers and returns the retailer OTP when the role is either retailer or wholesaler. These are the two credentials used by the delivery acceptance path.
- **Attack scenario:** A wholesaler owner or permitted wholesaler staff reads status, obtains the driver link token and buyer handover code, and completes buyer acceptance without the buyer's independent action.
- **Business impact:** Forged proof of delivery, premature revenue/ledger posting, repudiation disputes, and bypass of a key segregation-of-duties control.
- **Recommended solution:** Never return OTP values after issuance. Return driver tokens only to the assigned driver through a one-time delivery channel. Use distinct, audience-bound, expiring, hashed capabilities and redact all secrets from status DTOs/logs.
- **Verification method:** Retailer, wholesaler, staff, and driver response-contract tests must confirm secrets are absent; only a driver-bound capability plus buyer-supplied OTP can complete delivery.

### SV-006 — Public invoice enumeration returns excessive business data

- **Severity:** High
- **OWASP/CWE:** API3:2023; CWE-200; CWE-359 Exposure of Private Personal Information.
- **Affected files:** `server/src/modules/invoice/invoice.routes.ts:13-15`; `server/src/modules/invoice/invoice.service.ts:193-224,505-529,623-649`.
- **Technical explanation:** Public GET and POST verification routes accept a general identifier. The service resolves IDs, sequential invoice numbers (`INV-<year>-0001`), order IDs, or order numbers and returns the complete invoice object. That object includes both businesses' IDs, names, GSTINs, addresses, items, tax, and totals.
- **Attack scenario:** An unauthenticated party enumerates sequential invoice numbers and collects commercial relationships, addresses, purchases, and turnover details.
- **Business impact:** Large-scale business intelligence and privacy exposure; targeted fraud and social engineering.
- **Recommended solution:** Public verification should require an unguessable verifier embedded in the QR code and return a minimal authenticity DTO. Full invoices must require participant authentication and tenant scoping. Rate-limit and monitor public verification.
- **Verification method:** Sequential invoice/order aliases must not resolve publicly; a valid verifier returns only authenticity, invoice number, issuer, date, and total fields approved for public disclosure.

### SV-007 — Staff sessions receive owner PIN hash and sensitive profile fields

- **Severity:** High
- **OWASP/CWE:** API3:2023; CWE-200; CWE-312 Cleartext Storage of Sensitive Information (bank data exposure in API representation).
- **Affected files:** `server/src/modules/auth/auth.service.ts:502-542,590-645`; `server/prisma/schema.prisma:380-393,403-417`.
- **Technical explanation:** Staff login and `/auth/me` include the complete retailer or wholesaler profile. The Prisma profile contains `ownerPinHash`; the wholesaler profile also contains bank account number, IFSC, holder name, and bank name. A four-digit PIN hash has only 10,000 possible inputs and can be cracked offline despite bcrypt.
- **Attack scenario:** Any staff account retrieves the profile, cracks the PIN hash offline, and uses the PIN to unlock owner-only UI/business operations; bank details are unnecessarily disclosed.
- **Business impact:** Privilege escalation, financial-data exposure, and weakened owner-control separation.
- **Recommended solution:** Define explicit owner/staff response DTOs with allowlisted fields. Never serialize password, PIN, OTP, key, or bank-secret fields. Consider a longer owner credential or server-side step-up token with attempt limits.
- **Verification method:** Snapshot/API tests must assert sensitive property names never appear in login or `/me` responses for any role.

### SV-008 — Development quick-login protection fails open outside explicit production/test

- **Severity:** High
- **OWASP/CWE:** A05:2025 Security Misconfiguration; CWE-489 Active Debug Code; CWE-306 Missing Authentication for Critical Function.
- **Affected files:** `server/src/modules/auth/auth.routes.ts:16-20`; `server/src/modules/auth/auth.service.ts:378-454`.
- **Technical explanation:** Unauthenticated endpoints enumerate owners, issue owner JWTs without passwords, and mark email accounts verified. The guard rejects only exact `NODE_ENV === 'production'` or `'test'`; missing, misspelled, staging, preview, or other values enable the behavior. It is independent of the stricter `ENABLE_DEMO_CREDENTIALS` check used by `/demo-users`.
- **Attack scenario:** A deployment with unset or nonstandard `NODE_ENV` exposes passwordless owner login and email-verification bypass.
- **Business impact:** Complete tenant-owner account takeover.
- **Recommended solution:** Do not register development routes in production builds. Use an explicit `ENABLE_DEV_AUTH=true` allowlist plus development-only environment assertion, loopback/network restrictions, startup refusal in nonlocal environments, and tests that the routes are absent by default.
- **Verification method:** Start with missing, staging, preview, typo, test, and production values; all except an explicitly enabled local development profile must return 404 with no handler registered.

### SV-009 — Production Compose contains functional fallback secrets

- **Severity:** High
- **OWASP/CWE:** A02:2025 Security Misconfiguration; CWE-798 Use of Hard-coded Credentials.
- **Affected file:** `docker-compose.yml:12-16,36-42`.
- **Technical explanation:** PostgreSQL password, database URL credentials, JWT secret, and OTP salt have fallback values in a production-oriented Compose file. If operators omit environment variables, predictable repository-known values become active. Values are intentionally not reproduced in this report.
- **Attack scenario:** A rushed or incomplete deployment starts successfully with known credentials/signing material; an attacker with network or configuration knowledge authenticates to PostgreSQL or forges/attacks application tokens.
- **Business impact:** Database compromise, account takeover, token forgery, and full data exposure.
- **Recommended solution:** Remove security-sensitive defaults; use `${VAR:?required}` or an external secret manager; fail startup if absent/weak; rotate any fallback value that has ever been deployed.
- **Verification method:** Deployment must fail closed when each secret is absent; secret scanning and runtime checks must pass without exposing values.

### SV-010 — Wholesaler staff can set connection credit terms without capability check

- **Severity:** High
- **OWASP/CWE:** API5:2023; CWE-862.
- **Affected files:** `server/src/modules/wholesaler/wholesaler.routes.ts:27-30`; `server/src/modules/wholesaler/wholesaler.controller.ts:304-326`.
- **Technical explanation:** Routes require only tenant type `wholesaler`; `authorizeRoles` checks `userType`, not owner status or staff permissions. The acceptance endpoint accepts `creditLimit` and `paymentTermDays`, so any active wholesaler staff token can establish financial terms.
- **Attack scenario:** A low-privilege field agent or godown staff account accepts a retailer connection with an excessive credit limit or unfavorable terms.
- **Business impact:** Unauthorized credit exposure and financial loss.
- **Recommended solution:** Require owner or an explicit `connections.manage`/`credit.manage` permission; add server-side policy limits and an approval workflow for large limits.
- **Verification method:** Role matrix tests must deny every staff role without the exact capability and audit actor identity on permitted changes.

### SV-011 — Cross-table account identifiers enable targeted login denial

- **Severity:** Medium
- **OWASP/CWE:** API2:2023 Broken Authentication; CWE-706 Use of Incorrectly-Resolved Name or Reference.
- **Affected files:** `server/src/modules/auth/auth.service.ts:457-467,705-734`; `server/prisma/schema.prisma:427-450,467-485`.
- **Technical explanation:** Signup checks owner and both staff tables, but sub-account creation checks none of the other identity tables. Database uniqueness is per table (and retailer phone can be tenant-composite). Login rejects an identifier when more than one table matches.
- **Attack scenario:** A tenant owner creates a staff account using another owner's email or phone, producing multiple matches and preventing the victim from logging in.
- **Business impact:** Targeted account availability loss and support/recovery burden.
- **Recommended solution:** Maintain one canonical normalized identity table with global uniqueness, or transactionally reserve identifiers across all principal types before staff creation.
- **Verification method:** Attempt cross-principal duplicate creation using case/format variants; the request must fail atomically and the original account must still authenticate.

### SV-012 — Order lifecycle route has malformed authorization/scoping middleware

- **Severity:** Medium
- **OWASP/CWE:** API5:2023; CWE-691 Insufficient Control Flow Management.
- **Affected files:** `server/src/modules/orders/order-lifecycle.routes.ts:8`; `server/src/middleware/auth.middleware.ts:113-125,197-254`.
- **Technical explanation:** The route passes the `enforceOrderScoping` factory itself instead of `enforceOrderScoping('orderId')`, and asks for a permission literally named `orderId`. The factory receives Express arguments as its parameter, returns an async function, and does not advance the current chain. This makes the transition endpoint nonfunctional and bypasses intended scoping execution.
- **Business impact:** Order lifecycle operations can hang/fail, disrupting fulfillment; future refactoring could accidentally turn the malformed chain into an authorization bypass.
- **Recommended solution:** Invoke the scoping factory and remove the incorrect permission middleware; rely on the explicit transition permission plus participant scope. Add route-completion and cross-tenant tests.
- **Verification method:** Authorized participant transitions complete; unauthorized and nonparticipant requests return deterministic 403; no request times out.

### SV-013 — Ephemeral invoice keys break verification after restart

- **Severity:** Medium
- **OWASP/CWE:** A04:2025 Cryptographic Failures; CWE-320 Key Management Errors.
- **Affected file:** `server/src/modules/invoice/invoice.service.ts:14-49,132-155`.
- **Technical explanation:** If no signing keys are configured, the server generates an RSA pair in memory and signs invoices as `v1`. A restart or second instance generates a different pair, so previously signed invoices become unverifiable and replicas disagree.
- **Business impact:** Loss of invoice authenticity verification, false tamper alerts, and audit/compliance disruption.
- **Recommended solution:** Fail closed outside local development when persistent versioned keys are unavailable; use a KMS/HSM or secret manager; define rotation, retention, backup, and compromise procedures.
- **Verification method:** Sign before restart/deployment across replicas and verify afterward with the stored key version; old versions must remain verifiable.

### SV-014 — Offline queue persists delivery token and OTP in localStorage

- **Severity:** Medium
- **OWASP/CWE:** A04:2025 Cryptographic Failures; CWE-922 Insecure Storage of Sensitive Information.
- **Affected file:** `client/src/modules/delivery/DriverMobileDispatchView.tsx:59-76,80-93,276-290`.
- **Technical explanation:** Network failures serialize the driver token and verification payload, including the six-digit OTP and inspection data, into persistent localStorage. It survives reloads and is readable by any script running in the origin and by later users of a shared device.
- **Business impact:** Delivery acceptance credential exposure and customer/order data leakage on compromised or shared driver devices.
- **Recommended solution:** Prefer a service-worker queue backed by encrypted, short-lived IndexedDB records; do not persist the OTP; issue an opaque one-time offline action signed/bound to device/order and expire/delete it aggressively.
- **Verification method:** Offline/reload/logout tests must show no plaintext OTP/token in Web Storage and queued actions cannot be replayed after expiry or success.

### SV-015 — Upload security abstraction is not integrated into delivery proof flow

- **Severity:** Medium
- **OWASP/CWE:** API3:2023; CWE-20; CWE-434 Unrestricted Upload of File with Dangerous Type (preventive control not applied).
- **Affected files:** `server/src/services/upload.service.ts:27-79`; `server/src/modules/delivery/delivery.validation.ts:43,65`; `server/src/modules/delivery/delivery.service.ts:1290,1497`.
- **Technical explanation:** `UploadService` correctly limits size and verifies JPEG/PNG/WebP magic bytes, but no route/service calls it. Delivery accepts an arbitrary string `deliveryProofImageUrl` and stores it directly. Thus the implemented upload safeguards do not protect the actual proof-data path.
- **Business impact:** Untrusted or oversized inline data, external tracking/content URLs, broken evidence retention, and future stored-content hazards depending on renderer behavior.
- **Recommended solution:** Implement an authenticated, order-scoped upload route; enforce body limits, magic-byte decoding, metadata stripping/re-encoding, durable private storage, randomized keys, and authorized retrieval. Store only server-produced object references.
- **Verification method:** Reject arbitrary URLs, MIME spoofing, polyglots, oversized images, wrong-order uploads, and unauthorized reads; prove durable retrieval after restart.

### SV-016 — Vulnerable npm dependencies

- **Severity:** High for `body-parser`; Medium for `qs` and Vite.
- **CVSS:** Published advisories use CVSS 3.1: `body-parser` 7.5; `qs` 5.3; Vite advisory did not publish a score in the audit result. These are not CVSS 4.0 scores.
- **Affected components:** `body-parser@1.20.8` through `express@4.22.3`; `qs@6.16.0`; direct `vite@6.4.4`.
- **Evidence:** `npm audit --json --ignore-scripts` reported GHSA-27r3-jxmh-p828 (`body-parser`, High), GHSA-6pq8-jhm2-2vcw (`qs`, Moderate), and GHSA-8g5g-mxqh-grgj (Vite, Moderate). `npm ls` confirmed the installed paths and versions.
- **Impact:** Published denial/error-handling weaknesses in request parsing; Vite dev-server file-access risk when the development server is exposed to untrusted origins.
- **Recommended solution:** Upgrade to fixed versions through tested dependency updates; never expose Vite dev server publicly; run audit/SCA in CI with a reviewed severity gate.
- **Verification method:** Re-run tests, build, and `npm audit`; confirm the vulnerable versions are absent from the complete dependency tree.

## 8. Risk and Business Impact

The combined attack path is more serious than any isolated defect. Compromise of a low-privilege staff account could expose tenant secrets and financial data; delivery credentials could then be used to assert acceptance; forged inspection values could generate credits; payment and rollback flaws could alter receivables. Public invoice enumeration supplies reconnaissance about counterparties, addresses, products, and transaction values. These risks affect revenue recognition, GST/CA records, customer trust, and tenant confidentiality.

## 9. Affected Files and Code Locations

| Area | Primary locations |
|---|---|
| Authentication/RBAC | `server/src/modules/auth/auth.service.ts:378-454,457-542,590-645,705-734`; `auth.routes.ts:16-30`; `auth.middleware.ts:97-254` |
| Ledger | `server/src/modules/ledger/ledger.routes.ts:11-17`; `ledger.controller.ts:83-92,305-333`; `ledger.service.ts:494-640,715-770,916-990` |
| Delivery | `server/src/modules/delivery/delivery.validation.ts:18-65`; `delivery.service.ts:1217-1499,1668-1702`; `client/src/modules/delivery/DriverMobileDispatchView.tsx:59-93,276-290` |
| Invoice | `server/src/modules/invoice/invoice.routes.ts:13-15`; `invoice.service.ts:14-49,193-224,505-529,623-649` |
| Wholesaler credit | `server/src/modules/wholesaler/wholesaler.routes.ts:27-30`; `wholesaler.controller.ts:304-326` |
| Order lifecycle | `server/src/modules/orders/order-lifecycle.routes.ts:8` |
| Upload | `server/src/services/upload.service.ts:27-79`; delivery validation/service locations above |
| Deployment | `docker-compose.yml:12-16,36-44`; `deploy/nginx.conf:39-94` |
| Dependencies | root lockfile/workspaces: `body-parser@1.20.8`, `qs@6.16.0`, `vite@6.4.4` |

## 10. Evidence and Reproduction Conditions

The report deliberately provides safe, nonweaponized conditions rather than exploit scripts:

1. **SV-001:** authenticated/driver-link handover context plus correct OTP; alter inspection identity, quantity, or price and observe that request-derived values reach credit calculation.
2. **SV-002:** retailer owner token and a connected ledger account; post a payment with a fresh idempotency key and observe immediate `verified` status/balance reduction.
3. **SV-003:** participating owner token and an already posted noncancelled order; call rollback and observe no lifecycle predicate before reversal.
4. **SV-004:** any token with `ledger.read` and another tenant's voucher/receipt/transaction identifier; the query lacks participant scope.
5. **SV-005:** wholesaler participant token; status DTO contains both driver token and handover code.
6. **SV-006:** no token; a valid/predictable invoice alias resolves to a full invoice DTO.
7. **SV-007:** staff login or `/auth/me`; response profile is the unfiltered Prisma profile.
8. **SV-008:** run with unset/non-production/non-test `NODE_ENV`; the unauthenticated dev handlers are enabled.

These conditions are source-verified. They were not exercised against production or seeded business records.

## 11. Recommended Remediation

### Release-blocking priorities

1. Make all financial values server-authoritative; repair delivery line reconciliation.
2. Redesign payment verification and ledger reversal as privileged, event-driven workflows.
3. Add voucher tenant scope and minimize public invoice verification output.
4. Remove delivery secrets and sensitive profile fields from response DTOs.
5. Remove/fail-closed all dev authentication endpoints and deployment secret defaults.
6. Add explicit permission gates to credit-term operations.
7. Patch vulnerable dependencies and regression-test request parsing.

### Next hardening tranche

1. Establish a canonical globally unique principal identifier.
2. Correct lifecycle middleware composition and add route-policy tests.
3. Require durable KMS-backed invoice keys in nonlocal environments.
4. Replace plaintext localStorage offline actions and integrate the upload service.
5. Add automated authorization matrices for owner/staff/retailer/wholesaler/driver roles across two unrelated tenants.

## 12. Security Misconfigurations

### CM-001 — HTTP-only reference Nginx configuration

`deploy/nginx.conf:40-41` listens on port 80 with no TLS server block or redirect. If TLS is not terminated by a trusted upstream load balancer, JWTs, OTPs, invoices, and business data traverse in plaintext. This is **conditional/unverified** because the live edge architecture was not available. Require TLS 1.2/1.3, redirect HTTP, set HSTS only after HTTPS is assured, and document the termination boundary.

### CM-002 — Host-published database and API ports

`docker-compose.yml:15-16,43-44` publishes PostgreSQL and the API to host interfaces. Internet reachability depends on host firewall/cloud rules and was not tested. In production, keep PostgreSQL on a private network with no host publishing; expose only the reverse proxy; restrict management paths by security group.

### Additional observations

- `app.set('trust proxy', 1)` is correct only for exactly one trusted proxy hop; configure Express trusted proxy ranges/topology rather than assuming every deployment has one hop.
- Sentry is conditional and `sendDefaultPii: false`, a positive default; define redaction for authorization, OTP, bank, invoice, and delivery secrets before enabling event breadcrumbs/request capture.
- The Nginx `X-XSS-Protection` header is obsolete. The effective controls are CSP, output encoding, and avoiding unsafe sinks.

## 13. Dependency Vulnerabilities

| Package/path | Installed | Advisory | Severity | Fix |
|---|---:|---|---:|---|
| `express -> body-parser` | 1.20.8 | GHSA-27r3-jxmh-p828 | High (CVSS 3.1 7.5) | Available |
| `express/body-parser -> qs` | 6.16.0 | GHSA-6pq8-jhm2-2vcw | Moderate (CVSS 3.1 5.3) | Available |
| `client -> vite` | 6.4.4 | GHSA-8g5g-mxqh-grgj | Moderate | Available |

No packages were upgraded during this audit.

## 14. Multi-Tenant Security Assessment

Positive controls include tenant IDs in JWT claims, owner/staff principal distinction, relationship-aware tenant middleware, and order/invoice scoping helpers. However, protection is route-by-route rather than enforced by a mandatory repository/data-access layer. SV-004 demonstrates a direct omission; SV-002 and SV-003 demonstrate that being a valid relationship participant is not sufficient authorization for a financial action.

Required architecture improvement: every service query must accept a security context and express tenant/relationship predicates in the database query itself. Add a two-tenant test fixture and systematically test object aliases (UUID, order number, invoice number, receipt number, transaction ID), not only canonical IDs.

## 15. API Security Assessment

- **Authentication:** JWT issuer/audience and eight-hour expiry are positive. No refresh-token/revocation design was observed; deactivation checks on `/me` do not invalidate an already-issued JWT at every API request unless middleware performs a DB check. Treat shorter access tokens plus revocable refresh/session records as a future improvement.
- **Brute force:** login/register (10/15 min/IP), OTP verify (5/15 min/IP), and resend controls exist. Add account/device-aware throttling and distributed storage before horizontal scaling.
- **Injection:** Prisma use materially reduces classic SQL injection risk; no confirmed raw-query injection was found in reviewed paths.
- **CORS/headers:** fixed `CLIENT_URL`, Helmet, frame denial, nosniff, and CSP are positive. Validate production origin at startup and avoid permissive fallback changes.
- **CSRF:** bearer tokens in Authorization headers reduce conventional cookie-CSRF exposure. If cookie authentication is introduced, SameSite and CSRF tokens become mandatory.
- **Error handling:** centralized production error handling is a positive control; continue preventing Prisma/stack details from reaching clients.
- **Mass/property assignment:** the dominant issue is not generic ORM mass assignment but trusting financially significant request properties (SV-001).
- **WebSockets:** ping settings and JWT-based connection logic were inspected in the wider review; apply the same tenant/object authorization to every room join and event, and revalidate authorization on reconnect.

## 16. External Integration Security Assessment

No OGL Profit4 ERP implementation, API client, credential configuration, or webhook verifier was found. Therefore credential protection, webhook signatures, replay prevention, and inventory-update authorization for OGL are **not assessable / not applicable to the current code**. Do not treat absence of findings as approval of a future integration.

Brevo is the implemented external service. API keys are sourced from environment variables; recipient rejection and delivery failure are handled without exposing provider details. Before production, restrict the key to transactional email, rotate it, redact provider errors, and monitor OTP-delivery abuse.

Any future ERP integration must use outbound-only credentials in a secret manager, mTLS or signed requests where supported, timestamp/nonce replay protection, strict schema validation, idempotent event IDs, tenant-bound inventory authorization, an append-only integration audit log, and quarantine/reconciliation for rejected events.

## 17. Recommended Security Improvements

- Create one central policy layer for tenant, relationship, resource, action, and field-level authorization.
- Use explicit response DTOs everywhere; add tests that denylist hashes, OTPs, tokens, keys, bank fields, and internal IDs.
- Add immutable security/audit events for credit-term changes, payments, reversals, delivery verification, dev-auth attempts, and invoice verification anomalies.
- Add CI jobs for dependency audit, secret scanning, TypeScript, lint, authorization integration tests, and migration drift.
- Add SAST rules for unscoped Prisma `findUnique/findFirst`, public routes returning database DTOs, and request-derived prices/taxes.
- Define backup encryption, restore testing, point-in-time recovery, database least-privilege roles, and key/secret rotation runbooks.
- Use a managed, shared rate-limit store at scale; monitor credential stuffing, OTP abuse, invoice enumeration, and voucher-ID probes.
- Conduct an authenticated staging penetration test after remediation, using at least two retailers, two wholesalers, multiple staff roles, and a driver identity.

## 18. Testing Limitations

- Static/source-assisted assessment; no production or destructive exploitation.
- No real customer records or seeded business records were changed.
- No denial-of-service, load, brute-force, or high-volume enumeration testing.
- No external OGL infrastructure or Brevo account was attacked or queried.
- Live cloud firewall, TLS termination, IAM, database grants, backups, logs, and deployed environment variables were unavailable.
- Real `.env` values were not inspected and credentials are not included in this report.
- No mobile Android or Windows client implementation was present in the inspected scope.
- CVSS 4.0 scores were withheld where attack/environmental metrics could not be responsibly validated.

## 19. Final Security Recommendations

Do not launch publicly until SV-001 through SV-010 and the High dependency advisory are remediated and independently regression-tested. Treat financial, delivery, and tenant isolation rules as invariant server-side policies, not controller conventions. After fixes, perform a fresh staging assessment focused on cross-tenant aliases, staff privilege matrices, payment/reversal state machines, delivery capabilities, invoice privacy, restart/key-rotation behavior, and production edge configuration.

### Final Summary

- **Total confirmed vulnerabilities/control failures:** 16
- **Critical:** 0
- **High:** 11 (including one published High dependency advisory)
- **Medium:** 5 application/control findings; two additional Moderate dependency advisories are grouped inside the mixed-severity dependency finding SV-016
- **Low:** 0
- **Conditional/unverified deployment findings:** 2 (live TLS termination and host-port reachability)
- **Not assessable:** OGL Profit4 integration and live cloud/IAM/database operational controls
- **Security improvements required:** remediate all 16 confirmed finding groups, validate both conditional deployment risks, and implement the program-level controls described above
- **Overall security maturity:** Developing / pre-production; strong primitives exist, but release-blocking authorization and financial-integrity defects remain.

---

**Remediation authorization:** Not granted. This report does not authorize fixes. Await the explicit command `START SECURITY FIXING` before modifying source, dependencies, schemas, or configuration.
