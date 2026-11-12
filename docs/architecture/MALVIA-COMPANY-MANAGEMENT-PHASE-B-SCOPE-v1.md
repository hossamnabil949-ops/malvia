# MALVIA Company Management — Phase B Scope & Acceptance Criteria v1

**Status:** Owner-authorized design elaboration; implementation not yet authorized.  
**Parent design:** [MALVIA Company Management — Internal Operating System Design](MALVIA-COMPANY-MANAGEMENT-DESIGN-v1.md)  
**Phase:** B — Minimum Internal Control Plane  
**Repository branch:** `docs/malvia-platform-design-package-v1`

## 1. Phase B objective

Deliver the first coherent internal control plane that allows MALVIA's authorized team to understand its product portfolio, manage prospective and active customer relationships, track commercial opportunities and orders, and view the state of products, plans, seats, trials, subscriptions and tenant references.

Phase B is an internal MALVIA operations workspace. It is not a customer-facing tenant product, not the public marketing website, and not a replacement for MALVIA Sales.

The phase is designed as vertical slices with explicit source-of-truth boundaries. It must not invent live business figures or create side effects in customer tenants.

## 2. Included capabilities

### PB-01 — Executive overview

A permission-filtered dashboard with:
- Product portfolio status and release maturity.
- CRM counts by lifecycle stage.
- Opportunity pipeline by stage, product and expected close period.
- Customer organizations and linked tenant-reference counts.
- Trials by state and upcoming expiry.
- Subscriptions by state, product and plan.
- Seat allowance versus assigned-seat usage, where an authoritative source exists.
- Approval tasks, stale records, sync/integration exceptions and operational risks.

Dashboard cards must drill into the underlying filtered records. Every KPI must display its reporting period, last refresh time and source status. Missing or stale source data must be visibly marked; it must never be replaced with fabricated zeroes.

### PB-02 — Product catalogue and maturity

Manage product records independently from product modules, plans and marketing bundles.

Initial portfolio labels:
- MALVIA Sales — operating product; public availability remains subject to release verification.
- MALVIA Restaurant — in preparation.
- MALVIA Pharmacy — planned.
- MALVIA Fashion — planned.
- MALVIA Market — planned.
- MALVIA Construction — planned.
- MALVIA Real Estate — planned.
- MALVIA HR & Enterprise — planned / staged development.

Required product fields:
- Stable product ID, display name, short description, industry, target customer segment.
- Product owner and responsible team.
- Maturity state: Planned, In Development, Private Pilot, Available, Deprecated.
- Current verified release/version reference, supported channels and regions.
- Dependencies, enabled modules, commercial eligibility and internal notes.
- Created/updated timestamps and audit actor.

Rules:
1. A roadmap item or repository branch does not make a product Available.
2. Transition to Available requires a release reference, QA evidence, support readiness and authorized release approval.
3. Product, ProductModule, Plan and entitlement are distinct records.
4. No public download or trial CTA is published by this internal catalogue in Phase B.

### PB-03 — CRM and customer organizations

Support:
- Lead capture and qualification.
- Contacts and communication/activity history.
- Customer organizations, industry, account owner and relationship status.
- Opportunities linked to one organization and one or more proposed products.
- Lead source, expected users, estimated branch count, requested integrations and onboarding needs.
- Duplicate warnings and a reviewed merge workflow with full audit history.
- Lifecycle: Lead → Qualified → Opportunity → Proposal → Negotiation → Won/Lost → Onboarding → Active → At Risk → Churned.

Required safeguards:
- A person/contact is not automatically a login identity.
- CustomerOrganization is not the same entity as a Platform Tenant.
- A customer organization may link to multiple legal entities or tenant references only through an explicit verified relationship.
- Never merge two organizations automatically based only on similar names or phone numbers.
- Customer business records and tenant operational data are outside this phase.

### PB-04 — Tenant registry reference (read-only)

Provide an internal reference view of tenant metadata from an approved Platform API or a controlled imported snapshot.

Permitted fields, subject to API availability and authorization:
- Tenant ID and display name.
- Customer organization link and verification state.
- Tenant lifecycle/status.
- Product/entitlement summary.
- Owner membership reference and aggregate user/seat counts.
- Branch count as informational metadata only.
- Created/activated timestamps and last platform-reported activity.

Rules:
- This is not a tenant data browser.
- No direct database access or writes to tenant/product schemas.
- No customer invoice, inventory, employee, financial, HR or transaction details.
- If the Platform API is unavailable, show “not connected / stale” rather than guessing.
- Tenant provisioning, suspension, impersonation and entitlement mutation are excluded from Phase B.

### PB-05 — Opportunities, proposals, contracts and orders

Track the commercial lifecycle:
- Opportunity with stage, estimated value/currency, close date, probability and owner.
- Product-specific quotation lines and versioned pricing references.
- Proposal scope, optional implementation services, integrations, support level, exclusions and expiry.
- Approval request and decision history.
- Contract metadata and lifecycle state.
- Order record linking the approved commercial commitment to selected products and plan.
- Signed-document metadata and controlled file reference.

Contract states:
Draft, Review, Approved, Sent, Signed, Active, Suspended, Expired, Terminated.

Rules:
- Phase B records commercial intent and approvals; it does not create legally binding e-signatures.
- No payment collection, statutory invoice posting, VAT determination or accounting entry.
- No contract/order automatically provisions or changes a tenant.
- Price overrides and contract deviations remain subject to the owner-approved authority matrix; until approved, sensitive exceptions must be blocked or flagged for manual owner approval.
- Keep Quote, Contract, Order, Subscription, Invoice and Payment separate.

### PB-06 — Plan, product entitlement and seat catalogue

Provide versioned internal catalogue records for:
- Plans and plan versions.
- Product entitlements and optional module entitlements.
- Included owner account and employee-seat allowance.
- Additional-seat add-on definition (price remains unset until approved).
- Billing interval and commercial status.
- Effective dates and historical versions.

Confirmed baseline:
- Basic package: one owner account plus two employee accounts.
- Owner is included and does not consume one of the two employee seats.
- Branch count is not a billable seat and there is no fixed branch-count cap.

Not approved yet:
- Additional-seat price and billing/proration rules.
- Larger plan tiers and their seat allowances.
- Treatment of admins, temporary users, service accounts and inactive users.
- Product/module bundle prices and discount thresholds.

No catalogue edit may silently rewrite a customer's existing subscription. A plan change creates a new version or a separately approved subscription amendment.

### PB-07 — Trial and subscription visibility

Read-only operational visibility for:
- Trial state: Pending Verification, Ready, Active, Expired, Converted, Cancelled, Suspended.
- Trial start/end timestamps as supplied by the authoritative Platform service.
- Product and starter entitlement bundle.
- Owner/account reference and seat quota, where approved.
- Upcoming expiry reminders and conversion state.
- Subscription state, plan version, effective dates and entitlement reconciliation status.

Confirmed:
- Trial duration is 14 days.
- Trial authority and timestamps must be server-owned.
- Download, reinstall or device change must not create or reset a trial.

Still open:
- Exact 14-day clock semantics and expiry boundary.
- Trial seat allowance and module/industry bundle.
- Verification provider and verification requirements.
- Expiry grace/read-only/export behavior and retention/deletion policy.

Phase B must show unresolved policy labels and must not activate trials, extend expiry, convert subscriptions, collect payment or delete customer data.

## 3. Navigation and workspace layout

Proposed internal navigation:
1. Executive Overview
2. Product Portfolio
3. CRM
   - Leads
   - Customer Organizations
   - Contacts & Activities
   - Opportunities
4. Commercial
   - Proposals / Quotes
   - Contracts
   - Orders
   - Approval Inbox
5. Platform Operations (read-only in Phase B)
   - Tenant Registry
   - Trials
   - Subscriptions
   - Seat / Entitlement Catalogue
6. Audit & Exceptions

Navigation is permission-driven. A user must not see or access an action merely because its menu item is hidden or visible; every API action independently enforces authorization.

## 4. Proposed role-to-capability matrix

This is a design proposal, not a final employee assignment or permission grant.

| Capability | Company Owner | Executive | Portfolio Manager | Sales / Account Manager | Subscription Ops | Auditor |
|---|---|---|---|---|---|---|
| Executive dashboard | Full | Scoped | Product KPIs | Sales KPIs | Subscription KPIs | Read-only |
| Product catalogue | Approve all | Read | Create/edit | Read | Read | Read |
| CRM organizations/contacts | Full | Scoped | Read | Create/edit | Read | Read |
| Opportunities/proposals | Approve exceptions | Scoped | Read | Create/edit | Read | Read |
| Contract/order approval | Approve | Scoped approval if delegated | Read | Prepare | Read | Read |
| Plan/seat catalogue | Approve | Read | Read | Read | Prepare changes | Read |
| Tenant registry | Metadata only | Metadata only | Product metadata | Account metadata | Subscription metadata | Metadata only |
| Trial/subscription visibility | Full metadata | Scoped | Product summary | Account summary | Operational metadata | Read-only |
| Trial activation / subscription mutation | Separate later approval | Not in Phase B | No | No | Not in Phase B | No |
| Audit log | Full | Scoped | Scoped | Own records | Subscription records | Read-only |

Role permissions must be decomposed into resource/action/scope permissions. “Full” never means unrestricted customer tenant data access.

## 5. KPI dictionary and calculation contracts

Every dashboard KPI must be backed by a documented query/contract and a named source. Phase B must not display any KPI as authoritative until its source and reconciliation are available.

| KPI | Definition | Source of truth | Guardrail |
|---|---|---|---|
| Leads created | Distinct leads created in selected period | CRM | Exclude deleted/test records by explicit status |
| Qualified leads | Leads currently or historically moved to Qualified, with period basis declared | CRM stage history | Do not mix current-state and period-flow counts |
| Open opportunities | Distinct opportunities in non-terminal stages at snapshot time | CRM | Snapshot timestamp visible |
| Pipeline value | Sum of open opportunity amounts in one currency or separated by currency | CRM opportunity versions | Never sum unlike currencies without approved FX |
| Won opportunities | Distinct opportunities reaching Won during selected period | CRM stage history | Count transition date, not record creation date |
| Active customer organizations | Distinct verified organizations in Active lifecycle | CRM | Not equivalent to active tenants |
| Active tenant references | Tenants reported Active by Platform at refresh time | Platform API | Show source freshness |
| Active trials | Trials reported Active by Platform | Platform API | No client-side inferred status |
| Trials expiring soon | Active trials whose server end timestamp falls within configurable window | Platform API | Window and timezone displayed |
| Active subscriptions | Subscriptions reported Active by subscription authority | Subscription service | Do not infer from contract status |
| Employee-seat utilization | Assigned employee seats / allowed employee seats | Entitlement service | Owner excluded from employee-seat numerator/denominator |
| Product availability count | Products with verified Available state and release evidence | Product catalogue + release evidence | Never infer from roadmap status |
| Approval backlog | Pending approvals not yet decided | Approval service | Include age and responsible approver |

Currency conversion, recurring revenue (MRR/ARR), churn, collections, company cash and profitability are excluded from authoritative Phase B KPIs until billing/accounting sources and calculation policies are approved.

## 6. Core logical relationships

- CustomerOrganization 1—N Contact.
- CustomerOrganization 1—N Lead / Opportunity / Contract / Order.
- Opportunity 1—N Quote versions; Quote 1—N QuoteLine.
- Contract 1—N ContractVersion; approved Contract may reference one or more Orders.
- Product 1—N ProductVersion and ProductModule.
- Plan 1—N PlanVersion; PlanVersion references Product/Module entitlements and SeatAllowance.
- CustomerOrganization 1—N TenantReference (verified links only).
- TenantReference 1—N Subscription / Trial references as supplied by Platform authority.
- Subscription references one immutable PlanVersion for its effective commercial period.
- AuditEvent references actor, action, target type/ID, timestamp and correlation ID.

These are logical relationships only. No physical table, SQL, index, RLS policy or migration is authorized by this scope document.

## 7. State transitions and invariants

### Product maturity
- Planned → In Development → Private Pilot → Available → Deprecated.
- Skipping maturity stages requires documented release evidence and approval.
- Deprecated products remain visible in historical customer records; they are not silently deleted.

### CRM lifecycle
- Every stage transition records actor, timestamp, prior stage, new stage and reason where required.
- Won requires an approved commercial commitment; Active customer requires verified account/tenant linkage or an explicitly documented non-platform customer state.
- Lost requires a reason code.

### Commercial records
- Quote versions are immutable once sent; edits create a new version.
- Contract activation requires recorded approval and signed-document evidence or an explicitly approved non-signature path.
- Order status cannot provision a tenant during Phase B.

### Trial and subscription
- The Platform/subscription authority owns lifecycle state and timestamps.
- Internal console is read-only for lifecycle actions in this phase.
- Owner account and employee-seat allowance remain separate dimensions.
- Branch count never consumes employee seats.

## 8. Acceptance criteria

A Phase B design/build candidate is accepted only when all applicable criteria pass:

1. Internal users and customer tenant users are separate identity types and authorization realms.
2. Role-based navigation and API authorization agree; direct API requests cannot bypass permissions.
3. Product records distinguish Planned, In Development, Private Pilot, Available and Deprecated.
4. A product cannot become Available without release evidence and an authorized approval.
5. CRM can create, update, qualify, assign and search leads, contacts, organizations and opportunities with audit history.
6. Duplicate organization detection warns without automatically merging records.
7. An organization-to-tenant link requires explicit verification and records its source.
8. Tenant Registry displays only approved metadata and contains no customer operational data.
9. Opportunity, quote, contract, order, subscription, invoice and payment remain separate entities.
10. Sent quote versions cannot be edited in place.
11. Contract/order approval is permissioned and auditable; no automatic provisioning occurs.
12. Plan versions preserve history and do not mutate existing subscriptions retroactively.
13. Basic package is represented as one owner + two employee seats; owner is not counted against the two employee seats.
14. Branch count is independent of subscription seat count.
15. Trial duration is shown as 14 days while unresolved clock/expiry semantics remain explicitly marked.
16. Trial status and timestamps are sourced from the authoritative server; client actions cannot reset or extend the trial.
17. Dashboard KPIs expose definitions, period, refresh time and source; missing/stale data is not fabricated.
18. Multi-currency opportunity totals are not combined without an approved conversion policy.
19. Every sensitive action produces an audit event with actor, target, timestamp, reason and correlation ID.
20. Exported reports enforce the caller's scope and permissions.
21. Failure of an external Platform API results in a visible stale/unavailable state and safe retry; no duplicate side effect is produced.
22. No Phase B workflow writes directly to customer tenant/product databases.

## 9. Minimum test scenarios

- Internal Sales user attempts to read an unrelated account: denied.
- Customer tenant user attempts to access internal MCM route/API: denied.
- Product Manager attempts to mark product Available without release evidence: denied.
- Sales user attempts to merge duplicate organizations: approval required; no silent merge.
- User links a tenant ID without verification evidence: rejected.
- Tenant Registry API times out: stale status shown; no fabricated active tenant count.
- Sales user edits a sent quote: new version required.
- User activates an order and expects tenant provisioning: no provisioning command is emitted in Phase B.
- Plan catalogue changes employee-seat allowance: existing subscription remains on its prior plan version.
- Basic package seat calculation: owner + two employee seats; assigning a third employee is rejected or requires a separately approved add-on.
- Adding branches without adding users: no seat consumption is generated.
- Trial download/reinstall/device change: trial start/end timestamps remain unchanged.
- Client attempts to extend or reset trial: no supported command; server state remains unchanged.
- Dashboard opportunity amounts in different currencies: separate totals, not an invalid aggregate.
- Unauthorized user requests an export or audit record: denied and logged.
- Platform source returns stale subscription status: dashboard labels data stale and does not infer Active.

## 10. Delivery sequence within Phase B

**B0 — Design lock:** confirm scope, decision owners, field definitions, source-of-truth contracts and role permissions.

**B1 — Internal identity and shell:** internal sign-in boundary, navigation shell, role-scoped access and audit foundation. No customer login changes.

**B2 — Portfolio + CRM:** product catalogue, maturity evidence, leads, contacts, organizations and opportunities.

**B3 — Commercial records:** quotes, approvals, contracts and orders; no e-signature/payment/provisioning side effects.

**B4 — Subscription visibility:** plan/seat catalogue, tenant metadata references, trial/subscription read models and reconciliation indicators.

**B5 — Executive dashboard:** KPI contracts, drill-down, freshness indicators and exception views.

Each slice requires code review, automated tests, QA evidence and owner acceptance before the next slice is promoted. Production deployment remains a separate approval.

## 11. Decisions and explicit pending policies

| Decision | Phase B treatment | Approval still required |
|---|---|---|
| MCM-DEC-01 — Initial internal modules | This document defines the Phase B scope above | Owner acceptance of this exact scope before implementation |
| MCM-DEC-02 — Internal employee accounts | Separate internal identity realm; MFA for privileged roles is proposed | Security/owner approval of provider, MFA and recovery policy |
| MCM-DEC-03 — Commercial authority | Owner approval required for price exceptions, contract deviations and high-risk commitments | Exact thresholds, delegation and dual-control rules |
| MCM-DEC-04 — Support access | No standing customer-data access; any future access is time-limited, reason-coded, approved and audited | Consent, emergency access and approval workflow details |
| Trial seat allowance | Configurable, no fixed value assumed | Owner/commercial approval |
| Trial module bundle | Configurable product-specific bundle | Owner/product approval |
| Trial clock and expiry | Server-owned timestamps; 14-day duration retained | Calendar-day vs 336-hour semantics, expiry boundary |
| Expiry grace and retention | No destructive action in Phase B | Legal/security/owner policy |
| Additional-seat and higher-tier pricing | Catalogue placeholders only | Commercial approval |
| Currency, VAT and statutory billing | No authoritative finance calculations or posting | Egyptian accountant/legal approval |

## 12. Out of scope and safety gates

Phase B does not authorize:
- Runtime implementation, SQL/DDL, migrations or database provisioning.
- Changes to MALVIA Sales, Restaurant or any customer-facing product runtime.
- Production deployment, public website publication or downloadable installer publication.
- Trial activation, extension, conversion or expiry enforcement.
- Tenant provisioning, suspension, impersonation or customer business-data access.
- Payment processing, statutory invoices, VAT decisions, company ledger posting or refunds.
- E-signature, legal contract execution or legally binding document workflows.
- Full support desk, implementation delivery, engineering release automation, internal HR or company accounting (later phases).

Before implementation starts, approve the Phase B scope, internal identity/security policy, role/permission matrix, CRM/tenant relationship rules and all external read API contracts. Implementation, migration and deployment each require separate explicit authorization.

## 13. Definition of done

Phase B design is ready for implementation planning when:
- This scope and its exclusions are accepted.
- Logical ERD and API read/command contracts are reviewed.
- MCM-DEC-01 through MCM-DEC-04 have explicit dispositions.
- KPI definitions and data-source ownership are agreed.
- Role/permission matrix and threat model are reviewed.
- Acceptance and negative-security test cases are traceable to requirements.

Phase B is operationally complete only after every included slice passes its tests, source reconciliation, QA, owner acceptance and separately approved release process.
