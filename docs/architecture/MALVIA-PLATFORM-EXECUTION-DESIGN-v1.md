# MALVIA — Platform Execution Design Package v1
**Status:** Design review draft — documentation only  
**Parent baseline:** `docs/architecture/MALVIA-MODULAR-PLATFORM-BASELINE.md`  
**Scope:** resource inventory, website, product discovery, 14-day trials, download center, identity and entitlement contracts  
**No runtime, database, production, or customer-data changes are included.**

## 1. Decisions carried forward

MALVIA is one multi-tenant modular platform. Industry experiences are compositions of shared capabilities and industry-specific workflows. Branches are independent operational scopes; warehouses remain locations under branches. Commercial licensing is user-seat based, not branch-count based. A single tenant can enable one or more industry packs and modules, with server-enforced entitlements.

This package adds the public website and self-service trial/download journey to the architecture. The website is a first-class product surface, not an unrelated marketing microsite.

## 2. Verified current resource inventory

The current `SYNC_RESOURCES` declaration contains 37 synchronized resources. The server accepts 36 array resources and one object resource (`settings`). The tenant service also maintains local identity/session/theme/license keys and a transaction journal outside the business-resource sync list. The registry API stores the current license registry separately under tenant key `_registry/licenses`.

### 2.1 Synchronized business resources and target ownership

| Current resource | Shape | Target domain / primary scope | Migration notes |
|---|---|---|---|
| parts | array | Product catalog (tenant); stock by branch + warehouse | Separate product identity from branch stock balances; preserve IDs/barcodes/cost history |
| invoices | array | Sales (branch) | Preserve invoice numbers, payments, returns, status, cashier and original warehouse reference |
| customers | array | CRM master (tenant); receivable ledger policy TBD | Do not assume customer master balance is the authoritative ledger |
| suppliers | array | Procurement master (tenant); payable ledger policy TBD | Preserve deferred debt and store-credit semantics; reconcile to source movements |
| supplierPayments | array | Payables + treasury (branch/account) | Preserve payment IDs, supplier links, payment method and treasury source |
| supplierPaymentSchedules | array | Payables scheduling (tenant + optional branch) | Preserve plan/installment lineage and settlement references |
| treasury | array | Treasury ledger (branch + cash account) | Immutable transaction history; transfers must be paired clearing legs |
| employees | array | Workforce identity (tenant) + branch assignments | One employee can work at multiple branches; login identity and seat are tenant-wide |
| settings | object | Tenant configuration + industry/module settings | Split shared platform settings from industry-specific configuration gradually |
| salesReturns | array | Sales returns (branch) | Preserve original invoice and line-level quantities/amounts; prohibit over-return |
| purchaseInvoices | array | Procurement (branch) + receipt warehouse | Keep branch separate from warehouse; preserve supplier and stock receipt history |
| purchaseReturns | array | Purchase returns (branch) | Preserve original purchase invoice and settlement/credit treatment |
| expenses | array | Expense ledger (branch or tenant-wide allocated) | Require explicit allocation lines for company-wide expenses |
| partners | array | Ownership/capital (tenant) | Do not duplicate partner capital by branch |
| partnerWithdrawals | array | Partner ledger (tenant; optional branch cash source) | Keep withdrawal/advance distinct from capital reduction and exit |
| partnerCurrentAccountTransactions | array | Partner current accounts (tenant) | Keep separate from capital, profit, and ordinary expense |
| partnerExitSettlements | array | Partner exit settlement (tenant) | Preserve approved/paid state and settlement calculation snapshot |
| partnerSettlementPayments | array | Partner settlement + treasury source | Preserve settlement/payment linkage |
| carModels | array | Auto industry reference catalog (tenant or shared catalog) | Move out of universal core; only auto pack consumes it |
| reservations | array | Auto parts reservation (branch) | Industry-specific; preserve reserved quantities and conversion to invoice |
| inventoryErrors | array | Inventory control (branch + warehouse) | Preserve count evidence, discrepancy and correction action |
| auditLog | array | Platform/business audit (tenant + actor + optional branch) | Move toward append-only server-side events; do not rewrite timestamps |
| stockMovements | array | Inventory ledger (branch + warehouse) | Source of truth for movement history; preserve references and balances for reconciliation |
| shifts | array | POS/cashier operations (branch + register + employee) | Add register identity and branch context; reconcile cash totals |
| warehouses | array | Warehouse master (branch) | Warehouse is never a branch; map legacy warehouse to primary branch |
| stockLevels | array | Inventory balance (branch + warehouse + product) | Treat as derived/controlled balance, reconcile against movement ledger |
| stockTransfers | array | Inter-warehouse / inter-branch transfer | Distinguish same-branch warehouse transfer from inter-branch transfer |
| loyaltyLedger | array | Customer loyalty ledger (tenant; branch attribution optional) | Preserve earn/redeem/reversal references |
| cheques | array | Receivables/payables instruments (explicit branch + bank/cash custody) | Model lifecycle and settlement references; do not flatten into payment method |
| stockBatches | array | Inventory batches (branch + warehouse + product) | Preserve batch, expiry and allocation history |
| serialUnits | array | Serialized inventory (branch + warehouse + product) | Preserve serial identity and sale/return linkage |
| bankAccounts | array | Bank account (tenant-central or branch-owned explicit scope) | Ownership policy remains open; payment method alone does not define ownership |
| cardSettlements | array | Acquiring/card settlement (account + branch context) | Preserve batch reconciliation and settlement references |
| bankLedgerEntries | array | Bank ledger (same scope as bank account) | Preserve immutable ledger entries, source links and reconciliation |
| openingBalances | array | Opening-balance journal (tenant or branch per line) | Preserve approval, source line, balancing and linked entities; no recalculation overwrite |

### 2.2 Non-sync state and platform records

| Current state / API | Current purpose | Target |
|---|---|---|
| `malvia_tenant_licenses_v1` local key | Device-side cached license list | Remove authority from browser; cache only safe entitlement snapshot |
| `malvia_active_tenant_id_v1` | Active tenant selection | Authenticated tenant context, server validated |
| `malvia_user_session_v1` | Local session cache | Opaque server session; secure cookie/token storage policy |
| `malvia_device_saved_license_key_v1` | Saved license key | Replace with account sign-in and device/session registration |
| `malvia_app_theme_v1` | UI preference | User/device preference; not tenant authorization data |
| `malvia_master_owner_pin_v1` | Local owner PIN | Never treat browser-only PIN as owner authentication |
| `__transaction_journal` per tenant | Recoverable local multi-resource write journal | Retain equivalent crash-safe outbox/journal semantics for offline mode |
| `demo_cleared` per tenant | Local demo reset marker | Replace with isolated trial/demo tenant lifecycle; do not use as a data migration shortcut |
| `/api/registry` `_registry/licenses` | Admin-token-protected license registry | Subscription, trial and entitlement service; no public admin token |
| `malvia_docs` | Versioned JSONB resource documents | Transitional compatibility store; relational domain migration is phased |
| `malvia_employee_sessions` | Server employee sessions | Unified user/tenant membership sessions with revocation |
| `malvia_backups` | Tenant JSON document backups | Tenant-scoped backups and restore/audit policy |
| `malvia_agent_ops` | AI operation idempotency | Keep idempotency under same tenant/branch/actor authorization |

**Inventory boundary:** this is the complete resource list exposed by the current `SYNC_RESOURCES` and `ARRAY_RESOURCES` declarations inspected for this package, plus state explicitly seen in `tenantService`, `_security`, `_db` and registry/bootstrap routes. It is not yet a complete field-level ERD. Nested child records and all report/API read paths still require code-level mapping before executable migrations.

## 3. Public MALVIA website

### 3.1 Product surfaces

1. **Public website:** brand, product explanation, industries, modules, pricing, security, integrations, support and contact.
2. **Account portal:** registration, verification, login, company profile, trial status, subscriptions, invoices/payment status, users/seats, branches and support requests.
3. **Trial workspace:** the actual MALVIA application provisioned for a trial tenant, with chosen industry pack and enabled modules.
4. **Download center:** supported web/PWA/desktop/mobile install options and versioned release notes.
5. **MALVIA operations console:** internal-only administration for catalog, trial policy, subscriptions, entitlements, releases and support. It must never expose owner/master credentials or routes to customer users.

These surfaces share one identity, tenant and entitlement backend. Public marketing pages may be cached; authenticated account/trial operations must be server-authorized.

### 3.2 Website information architecture

- Home
- Solutions / Industries
  - Auto parts & service
  - Restaurants & cafés
  - Supermarket & grocery
  - Retail & fashion
  - Pharmacy
  - General business / ERP
- Platform modules
  - POS & sales
  - Inventory & warehouses
  - Procurement & suppliers
  - Finance, treasury & banking
  - HR, payroll & attendance
  - Workflow & approvals
  - Analytics & AI
- Pricing / packages
- 14-day free trial
- Downloads
- Integrations
- Security & data protection
- Resources / help center
- About MALVIA
- Contact / request a demo
- Sign in / Create account

Arabic and English are first-class languages with RTL/LTR layouts. Mobile-first responsive design, accessible forms, clear plan comparisons, SEO metadata and fast public-page performance are required.

### 3.3 Customer journey

1. Visitor selects an industry solution and reviews included capabilities.
2. Visitor selects **Start 14-day free trial**.
3. Registration collects minimum necessary account-owner and company information, verifies email or phone, and accepts terms/privacy notice.
4. Server creates the tenant and owner membership in an idempotent PENDING_SETUP state; trial time has not started.
5. User completes the required setup gate: company profile/timezone, first branch, selected industry pack and trial module bundle.
6. Server atomically activates the 14-day trial and records immutable start/expiry timestamps, policy version and entitlements.
7. User opens the active trial workspace; installation/download is optional, not a prerequisite.
8. User can invite/add users only within the approved trial seat allowance. Branch count is not capped by a hidden fixed limit.
9. Trial banner shows exact start and expiry dates, remaining time and enabled modules using the single server expiry rule.
10. Before expiry, notify the account owner at configured intervals and show the upgrade path.
11. On paid conversion, attach a paid subscription to the same tenant and preserve data, users, branches, IDs and history. Never create a second tenant just to convert.
12. If trial expires without conversion, apply the approved grace/read-only/export policy while retaining customer data for the approved retention window; no automatic deletion.

## 4. Fourteen-day trial model

### 4.1 Recommended entitlement records

- `trial_policy`: policy version, duration (14 days), included modules/packs, seat allowance, feature restrictions, data retention and grace rules.
- `trial_enrollment`: tenant, owner user, selected industry pack, policy version, starts_at, expires_at, status, conversion subscription and audit fields.
- `trial_entitlements`: module/feature, quantity or seat allowance, start/end and status.
- `trial_events`: signup, verification, activation, notification, expiry, extension, conversion, suspension and cancellation events.
- `download_releases`: platform, architecture, version, channel, file checksum, signature metadata, minimum supported version and release notes.
- `download_entitlements` (optional): download access policy and release eligibility; download does not itself grant business-data access.

A trial belongs to a tenant, not to a downloaded binary or device. The tenant may first be provisioned in a pending setup state. The 14-day clock starts only at the server-owned trial activation after required identity verification and the defined first-use setup gate. Downloading an installer is never the start event. Re-downloading, changing devices or reinstalling cannot reset the clock.

### 4.2 Recommended trial defaults — approval required

- Duration: 14 days, stored as UTC timestamps and displayed in the tenant timezone. **OPEN detail:** approve whether this means 14 calendar days in the tenant timezone or exactly 336 elapsed hours; do not implement expiry boundary until this is explicit.
- One active trial per verified company/tenant identity by default; support can approve exceptions. Avoid invasive device fingerprinting as the primary fraud control.
- Trial includes one selected industry pack and a clearly listed starter set of modules; optional cross-industry add-ons can be demonstrated but not silently enabled.
- Seat allowance should be a published small-team number; proposed default: 3 active user seats. This is a commercial policy choice, not a branch limit.
- No fixed branch cap in the platform model. Trial usage limits, if any, must be transparent and independent of paid branch architecture.
- AI usage, storage, messaging and integrations may have disclosed trial quotas.
- No credit card required for starting a trial unless the commercial owner later approves otherwise.
- Trial expiry should move the tenant to read-only/export-access or a limited grace mode, not delete data. Proposed retention after expiry: 30 days before a separately approved archival/deletion process. This duration requires explicit approval and legal review.
- Support may extend a trial with an audited reason; repeated extensions are not automatic.

### 4.3 Trial security and lifecycle

- Server owns the start/expiry timestamps and entitlement state.
- Every API, sync batch, AI action and file/download operation rechecks tenant status and module entitlement server-side.
- Browser clock, local storage, installer configuration and client-side feature flags are never proof of an active trial.
- Expired trial cannot regain write access by changing device time, clearing browser storage, reinstalling or replaying old sync requests.
- Trial data is isolated by tenant ID from all other trial and paid tenants.
- Provisioning, extension and conversion are idempotent and audited.
- Paid conversion updates entitlement records for the same tenant; it must not reset opening balances or business records.

## 5. Download and installation strategy

### 5.1 One product, multiple delivery modes

Industry systems are configurations of the same MALVIA platform, not separate codebases or separate customer databases. The download center offers the correct client for a device, while the tenant's server entitlements decide which industry pack and modules are visible.

| Delivery | Initial recommendation | Notes |
|---|---|---|
| Web application | Launch first | Full product usable in browser; no installation needed |
| PWA install | Enable where supported | Install shortcut/offline shell; not a native signed installer |
| Windows desktop | Phase after web foundation | Package the shared web client (e.g. Tauri/Electron after decision); signed release and auto-update strategy required |
| Android | Phase after web foundation | Signed APK or Play distribution; package must use account login and server entitlements |
| iOS/iPadOS | App Store/TestFlight path | Do not promise a direct public IPA download; Apple distribution rules apply |
| Restaurant POS / kiosk | Industry-specific deployment profile | Same core, role/device configuration and optional peripherals |

Do not label a browser link as a downloadable Windows/Android/iOS application. Until installers are built, signed and tested, the download center must clearly offer **Open in browser** and **Install as app (PWA, where supported)** rather than fabricated binary links.

### 5.2 Release and download controls

- Versioned release channels: stable, preview/beta and internal.
- Build artifacts are immutable and have SHA-256 checksums; desktop/mobile binaries are signed.
- Download page detects platform for convenience but always allows manual selection.
- Each release links to supported OS/architecture, version, file size, checksum, signature and release notes.
- Trial entitlement is validated on sign-in and API access, not embedded in the downloaded file.
- No license keys, admin tokens, database URLs or customer secrets inside public installers.
- Critical security updates can enforce a minimum client version, with an offline-safe update notice.
- Offline POS cache remains tenant/device scoped and syncs through the existing durable outbox model; downloaded client does not create an independent data island.

## 6. Account, subscription and entitlement API contracts

Logical contract only; exact route names and payload schemas require implementation review.

### Public/account operations
- `POST /api/public/trials`: verify signup proof, validate eligibility, provision tenant + owner + trial atomically; return safe workspace redirect/session.
- `GET /api/account`: authenticated account, tenant memberships and safe subscription/trial summary.
- `GET /api/account/entitlements`: enabled industry packs, modules, features and seat limits.
- `POST /api/account/users/invitations`: invite within seat entitlement.
- `POST /api/account/subscription/checkout`: create payment/checkout session through selected payment provider.
- `POST /api/webhooks/billing/{provider}`: verify provider signature and idempotently update subscription.
- `GET /api/downloads/releases`: list published releases and compatibility metadata.
- `GET /api/downloads/{releaseId}`: authorize and redirect to immutable artifact; public or gated policy is explicit.
- `POST /api/trials/{trialId}/extension`: internal support/admin only, reason required.
- `POST /api/trials/{trialId}/convert`: convert the same tenant to paid subscription without data migration/reset.

### Authorization invariant

Resolve session → user → tenant membership → tenant status → trial/subscription status → industry/module entitlement → permission → branch scope → resource ownership. All protected API and sync paths use the same policy. Public registration endpoints receive rate limits, verification, abuse controls and idempotency.

## 7. Data transition and compatibility

- Keep existing `malvia_docs` JSONB resources as a compatibility source during staged migration.
- Add new platform records in a separate schema/domain only after the ERD and field-level mappings are reviewed.
- Existing tenants should be provisioned with a paid/legacy entitlement matching their current license; do not accidentally turn existing customers into trials or expire their access.
- Do not use the new trial signup flow to modify existing tenant records.
- Existing local storage keys are not authoritative for account, trial, subscription or role state.
- Preserve every existing business record ID, timestamp, invoice number, stock movement, return link, opening balance, partner capital/current account, bank ledger and treasury movement.
- A tenant's trial-to-paid conversion changes commercial entitlements only; it must not alter accounting or inventory data.
- Maintain rollback and reconciliation before any runtime cutover.

## 8. Required design artifacts before implementation approval

1. Complete field-level ERD, including nested entities and foreign-key rules.
2. Resource-to-table migration map for all 37 sync resources and all non-sync platform state.
3. Tenant/branch/warehouse/register/account/actor ownership matrix.
4. Company, branch, module, role and permission matrix.
5. Trial policy decision sheet (seat count, included modules, verification, retention, grace mode and abuse controls).
6. Website page wireframes and account/trial/download flows.
7. API request/response/error contracts and threat model.
8. Download packaging/release architecture and signing/update policy.
9. Billing provider selection and webhook/reconciliation design.
10. Read-only migration verifier and accounting/inventory reconciliation tests.

## 9. Acceptance gates

- Visitor can understand each industry solution and start a trial in Arabic or English on mobile and desktop.
- Trial provisioning creates exactly one isolated tenant and owner membership, even on retries.
- Trial begins only after required verification; expiry is server-enforced at exactly 14 days.
- Branch count is independent of seat count; trial seat limit is explicit and paid plan can increase seats.
- Reinstall/download/device changes do not reset trial.
- A trial cannot read another tenant's data, including through sync, AI, files or forged API requests.
- Paid conversion preserves tenant ID, users, branches, records, IDs, balances and history.
- Expired trial follows approved read-only/export/retention policy; no silent deletion.
- Download page never links to nonexistent artifacts; each published installer is signed, checksummed and versioned.
- PWA, desktop and mobile clients all use the same identity and server entitlement authority.
- Website and account portal do not expose internal admin/master routes or secrets.
- Existing production tenants and local offline queues remain unaffected until explicit migration approval.

## 10. Decisions required from product owner

These decisions are intentionally not silently finalized:

1. Trial seat allowance: proposed 3 active users.
2. Trial module scope: one chosen industry pack plus starter shared modules, or full feature access with usage quotas.
3. Trial verification: email, SMS, or both; provider and cost to be selected.
4. Expired-trial access: read-only/export grace period versus immediate read-only.
5. Trial data retention: proposed 30 days after expiry, subject to legal review.
6. Billing provider(s) and supported payment methods for Egypt and future markets.
7. Website CMS/content ownership and support/contact channels.
8. First downloadable native client after browser/PWA: Windows desktop or Android.
9. Bank account ownership and customer/supplier subledger decisions carried from baseline.
10. Exact branch allocation policy for company-wide expenses and central procurement.

**Implementation gate:** This document is a design package for review. It does not authorize SQL execution, production data changes, deployment, publication of download links, or a trial launch. Those follow only after the remaining policy choices and executable design are approved.


## Related backend API and service contract

- [Backend API, domain services and command contracts](MALVIA-BACKEND-API-SERVICES-AND-COMMAND-CONTRACT-v1.md) — shared server request pipeline, domain boundaries, versioned read/command/sync APIs, authorization, idempotency, atomic transaction boundaries, safe responses, legacy compatibility and acceptance tests. Design only; no endpoint implementation is authorized.


## 11. Company identity and product portfolio — governing direction

MALVIA is a software company focused on software engineering, business systems, product development and ongoing technology services. It is **not** a single POS product or a POS-only vendor. The MALVIA name represents the company, its shared platform and a portfolio of independently marketable software products.

### 11.1 Three distinct levels

1. **MALVIA Company (corporate layer):** corporate identity, website, product marketing, sales, customer relationships, support, implementation services, product roadmap and internal company operations.
2. **MALVIA Platform (shared technology layer):** tenant identity, organizations, users, roles, permissions, subscriptions, entitlements, branch scopes, audit, notifications, files, integrations, APIs, offline synchronization, reporting foundations and governed AI capabilities.
3. **MALVIA Products (customer solutions):** independently selectable industry systems and business applications built on shared platform contracts. Each product has its own domain workflows, screens, validations, reports, release lifecycle and optional modules.

These layers must not be conflated in navigation, billing, authorization, code ownership or product messaging. Corporate website visitors are not automatically platform tenants; product trials create customer tenants only after explicit signup and setup.

### 11.2 Product portfolio

The portfolio is intended to include, in staged delivery:
- **MALVIA Sales:** general sales, POS, inventory, purchasing and finance capabilities; currently operating product.
- **MALVIA Restaurant:** restaurant and café operations, orders, tables, kitchen and delivery workflows; in preparation.
- **MALVIA Pharmacy:** pharmacy-specific stock, batches, expiry and regulated workflows subject to compliance approval.
- **MALVIA Fashion:** clothing, sizes, colors, variants and exchanges.
- **MALVIA Market:** supermarket and grocery checkout, barcode/weight and replenishment.
- **MALVIA Construction:** contracting projects, contracts, budgets, BOQs, progress, subcontractors, procurement and project finance.
- **MALVIA Real Estate:** real-estate marketing, leads, projects, units, inventory, reservations, sales pipeline, commissions and customer follow-up.
- **MALVIA HR & Enterprise:** HR, workforce, workflows and broader enterprise management capabilities.

Product names are working portfolio labels, not a claim that every product is implemented or commercially released. The portfolio may expand without changing the shared platform identity.

### 11.3 Product independence and shared contracts

A customer may evaluate, subscribe to and use one product without purchasing every other product. Products may share tenant identity, users, branches, customer/supplier masters and approved business modules where the tenant explicitly enables them. Product-specific workflows remain isolated behind versioned domain boundaries. Cross-product data sharing must be explicit, permissioned, auditable and tenant-scoped; no product may bypass shared authorization, accounting, inventory, sync or entitlement contracts.

A product may contain independently sellable modules. Product entitlement and module entitlement are separate dimensions: selecting an industry product does not silently enable every optional module, and buying a shared module does not silently activate an unrelated industry workflow.

### 11.4 Delivery maturity and claims

The website, sales materials, trial selector and customer portal must distinguish **Available**, **In development**, **Private pilot** and **Planned**. Only verified released capabilities may be advertised as available or offered as a public download. Never imply that pharmacy, construction, real estate or other future products are production-ready before their release gates pass.

### 11.5 Corporate website implications

The corporate website is the front door to the software company and its portfolio, not merely a login page for the Sales POS. It must explain the company, platform, product portfolio, engineering/integration capabilities, customer outcomes, support and contact routes. Each product page must have its own audience, workflow story, screenshots/demo evidence, maturity label and trial/lead CTA appropriate to its actual release state.


## Related internal company operating system

- [MALVIA Company Management — Internal Operating System Design](MALVIA-COMPANY-MANAGEMENT-DESIGN-v1.md) — internal CRM, portfolio, sales/contracts, subscription operations, onboarding, support, engineering delivery, finance, people, governance and dashboards. This is separate from customer-facing tenant products and remains design-only.


## Related internal company Phase B scope

- [MALVIA Company Management — Phase B Scope & Acceptance Criteria](MALVIA-COMPANY-MANAGEMENT-PHASE-B-SCOPE-v1.md) — defines the first internal control-plane slice and its acceptance gates. It does not authorize runtime code, customer-data writes, trial activation or Production deployment.


## Phase B technical design artifacts

- [Phase B Logical ERD](MALVIA-COMPANY-MANAGEMENT-PHASE-B-LOGICAL-ERD-v1.md) — internal company bounded-context entities, cardinalities, ownership boundaries and integrity rules.
- [Phase B API Contracts](MALVIA-COMPANY-MANAGEMENT-PHASE-B-API-CONTRACTS-v1.md) — proposed internal API routes, authorization, request/response envelopes, idempotency, errors, Platform read-only integration and acceptance tests.

Both are design-only. They do not assert that endpoints exist or authorize schema, runtime, tenant lifecycle or Production changes.
