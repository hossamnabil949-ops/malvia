# MALVIA Company Management — Phase B0 Design Lock & Decision Closure v1

**Status:** B0 design baseline prepared; **NOT APPROVED FOR IMPLEMENTATION**.  
**Branch:** `docs/malvia-platform-design-package-v1`  
**Related:** [Company Management Design](MALVIA-COMPANY-MANAGEMENT-DESIGN-v1.md) · [Phase B Scope](MALVIA-COMPANY-MANAGEMENT-PHASE-B-SCOPE-v1.md) · [Logical ERD](MALVIA-COMPANY-MANAGEMENT-PHASE-B-LOGICAL-ERD-v1.md) · [API Contracts](MALVIA-COMPANY-MANAGEMENT-PHASE-B-API-CONTRACTS-v1.md) · [Traceability Matrix](MALVIA-COMPANY-MANAGEMENT-PHASE-B-TRACEABILITY-MATRIX-v1.md) · [Architecture Decision Register](MALVIA-ARCHITECTURE-DECISION-REGISTER-v1.md)

## 1. Purpose

This document consolidates the B0 design-lock baseline for MALVIA Company Management Phase B. It separates:
- confirmed product/company requirements already stated by the owner;
- architectural constraints that are safe to lock for design;
- policies that still require an explicit owner, accountant, legal or security decision;
- evidence required before any implementation authorization.

**“B0 prepared” is not “B0 approved.”** The user's instruction to proceed authorizes preparation of this design record, not approval of every unresolved policy listed below.

## 2. B0 outcome

| Area | Current disposition | Implementation consequence |
|---|---|---|
| MALVIA structure | Lock for design: Company / shared Platform / independently selectable Products are distinct layers | Do not merge corporate internal operations with tenant product operations |
| Phase B scope | **APPROVED BY OWNER on 2026-11-12:** the seven PB capabilities listed in Section 3, including their stated boundaries and exclusions | Scope approval only; unresolved policies and implementation/release gates remain separate |
| Identity boundary | Lock: InternalUser and tenant user/member are separate identity realms | No shared principal, token audience or implicit identity mapping |
| Tenant data boundary | Lock: Phase B tenant registry is approved metadata/read-model only | No customer operational records, impersonation or tenant DB reads/writes |
| Platform authority | Lock: Platform remains authoritative for tenant, trial, subscription and effective entitlement lifecycle | Company Management consumes approved read models; no lifecycle mutation |
| Product maturity | Lock: Planned / In Development / Private Pilot / Available / Deprecated; Available requires evidence and authorized approval | No public availability claim based only on a catalogue edit |
| Commercial records | Lock: Quote, Contract, CommercialOrder, Subscription, Invoice and Payment remain distinct concepts | An accepted order does not provision, activate, invoice or collect payment |
| Trial | Confirmed duration: 14 days; server-owned timestamps; download/reinstall/device change cannot reset it | Exact counting, expiry, grace and retention semantics remain blocked |
| Basic package | Confirmed: one owner account + two employee accounts; owner is separate from employee allowance | Do not count branches as seats; no unapproved extra-seat pricing |
| Branches | Confirmed: no fixed branch-count cap; branch count is independent of seat count | Branch-only change must not consume a user seat |
| Company finance | Lock boundary: MALVIA company finance is separate from each customer's tenant ledger | No cross-ledger posting or customer finance data in internal company books |
| Audit | Lock for design: sensitive commands need actor, target, time, reason and correlation trace | Audit access separately permissioned; no secrets in logs |
| Production | No authorization granted | No merge, migration, deployment or changes to Sales/Restaurant runtime |

## 3. Proposed B0 screen and capability baseline

The Phase B capability inventory is retained as seven capabilities:
- **PB-01** Executive overview, KPI definitions, freshness and exception drill-down.
- **PB-02** Product catalogue, version/evidence records and maturity governance.
- **PB-03** CRM: leads, customer organizations, contacts, activities and opportunities.
- **PB-04** Tenant registry references, verified organization mapping and metadata-only view.
- **PB-05** Quotes, immutable quote versions, contracts, orders and approval workflow.
- **PB-06** Product plans, immutable plan versions, entitlement catalogue and seat allowances.
- **PB-07** Trial/subscription/entitlement visibility from Platform read models only.

Navigation, exact field-level UX and dashboard visual design can be refined in B1/B2 without changing these bounded contexts. Adding a new capability, lifecycle command or customer-data access path requires a recorded scope change and explicit approval.

## 4. Canonical architecture invariants to carry into implementation

1. **Separate identities:** InternalUser is not Contact, TenantUser or TenantMember. No implicit linking.
2. **Server authorization:** every request checks resource + action + scope. UI hiding is not authorization.
3. **Tenant isolation:** internal MCM services never query tenant operational databases.
4. **Platform source of truth:** tenant status, trial timestamps, subscription status and effective entitlements come from Platform; MCM stores only scoped references/snapshots.
5. **Read-only lifecycle boundary:** no Phase B command provisions a tenant or mutates trial, subscription or entitlement lifecycle.
6. **Commercial separation:** a quote, contract or order is not a subscription, invoice or payment.
7. **Version immutability:** sent quote versions, approved contract versions and approved plan versions are not overwritten; changes create new versions/events.
8. **Approval integrity:** approver identity comes from authenticated principal; self-approval is rejected where policy requires separation; decisions are immutable.
9. **Idempotent commands:** safe retries return stable receipts; same key with different payload conflicts.
10. **Optimistic concurrency:** stale versions/ETags are rejected; no silent last-write-wins for governed records.
11. **Freshness truthfulness:** missing/stale upstream values remain Unknown/Stale/Unavailable, not inferred Active or fabricated zero.
12. **Currency integrity:** unlike currencies are not aggregated without an approved FX policy.
13. **Seat integrity:** basic allowance = owner 1 + employees 2; branch count is not a seat.
14. **Audit integrity:** sensitive actions are traceable; audit data excludes credentials and unnecessary sensitive payloads.
15. **No implicit publication:** product maturity transition does not publish a website listing or download artifact.
16. **No hidden side effects:** order acceptance and approval decisions do not provision tenants, activate trials, change entitlements, issue invoices or collect payments.

## 5. Role model — design baseline only

Proposed role families:
- Company Owner
- Executive
- Portfolio Manager
- Sales / Account Manager
- Subscription Operations
- Auditor

**Approved access-control baseline (owner, 2026-11-12):** internal permissions are role-based according to each employee's job role (RBAC), with the ability to grant additional individual permissions to a specific employee above the role baseline. The Company Owner remains the final authority. Individual grants and permission changes must be auditable. This approval establishes the policy direction only; the exact permission catalogue and scopes, who may grant/revoke individual permissions, delegation, conflict-of-interest handling and detailed audit controls remain open for explicit design approval.

**Approved department access baseline (owner, 2026-11-12):** Company Owner has company-wide final authority; General Manager / Executive has company-wide management visibility and assigned operational scope; Product Portfolio manages product catalogue/roadmap/maturity evidence; Sales & CRM manages leads, customers, opportunities and quote preparation; Subscription Operations manages catalogue and read-only licensing visibility within approved authority; Customer Success manages assigned customer onboarding, adoption and renewals; Technical Support manages tickets and approved diagnostics without automatic customer-content access; Implementation & Projects manages assigned delivery work; Product Development & Engineering manages assigned engineering work but cannot self-authorize QA or Production release; QA & Release Management manages test/release evidence while Production promotion remains separately authorized; Finance & Accounting manages MALVIA company finance only; HR & People Operations manages employee information with restricted HR-sensitive scopes; Audit is read-only for authorized evidence and reports.

This is the approved departmental responsibility/default-access baseline, not a completed field-level permission matrix. Least-privilege scoping by department, product, customer, project and record still needs detailed design. Individual grants follow the approved RBAC baseline and must be auditable. Exact permission catalogue, scope filters, grant/revoke authority, delegation and separation-of-duties rules remain open.

The capability-level mapping remains in the Traceability Matrix. Role names are not account assignments and do not grant access until an owner-approved resource/action/scope policy exists.

**Approved security baseline (owner, 2026-11-12):** MFA is mandatory for every MALVIA internal user account, without exception based on role. The identity provider, supported MFA methods/enrollment and recovery controls, session lifetime, device policy and break-glass procedure remain pending security approval. Do not create production internal credentials as part of B0.

## 6. Source-of-truth contract

| Data domain | Authority | MCM responsibility | Prohibited behavior |
|---|---|---|---|
| Internal staff identity and grants | Approved internal identity/access service | Resolve internal principal and scoped grants | Accept tenant token or client role claim |
| Product catalogue and maturity | MALVIA Company Management governance | Own product descriptions, versions, evidence and approvals | Declare Available without evidence and approval |
| CRM and commercial pipeline | MALVIA Company Management | Own CRM and commercial preparation records | Treat forecast as revenue/accounting |
| Plan/seat catalogue | Approved company commercial catalogue | Maintain immutable plan versions and allowances | Retroactively rewrite tenant entitlements |
| Tenant/trial/subscription status | MALVIA Platform | Consume approved read APIs and retain freshness metadata | Mutate lifecycle or infer state from stale data |
| Effective tenant entitlements | MALVIA Platform | Display read-only snapshots | Authorize tenant actions from MCM snapshot |
| Customer operational data and ledger | Customer tenant product boundary | No Phase B access | Copy into internal company DB or company ledger |
| MALVIA corporate finance | MALVIA Company finance domain | Separate internal books and billing records | Mix with tenant finance or partner balances |

## 7. Decision closure register for B0

Statuses below reflect only decisions explicitly supported by the existing project record. Recommendations are not converted into approvals.

| Decision | Current status | What is safe to lock now | Still required |
|---|---|---|---|
| Phase B scope and exact owner acceptance | **APPROVED — 2026-11-12** | Seven PB capabilities PB-01 through PB-07 and their documented boundaries/exclusions | No further scope acceptance required for this baseline; any added capability or lifecycle/data-access change requires a separately recorded scope change |
| MCM-DEC-01 internal module/role assignment | PARTIALLY RESOLVED | Owner-approved baseline: job-role RBAC, additional auditable employee-specific grants, and Company Owner as final authority (2026-11-12) | Approve exact permission catalogue/scopes, grant/revoke authority, delegation, conflict-of-interest handling and detailed audit controls |
| MCM-DEC-02 internal identity/security | PARTIALLY RESOLVED | Separate identity realm; **MFA mandatory for all MALVIA internal accounts** (owner-approved 2026-11-12) | Security approval still required for identity provider, MFA methods/enrollment and recovery, session/device and break-glass policy |
| MCM-DEC-03 commercial authority | OPEN | Owner is escalation point; no numeric thresholds assumed | Owner approves discount/contract/order thresholds, delegation and maker-checker |
| MCM-DEC-04 support access | OPEN | No standing tenant operational-data access in Phase B | Owner + Security define any future consent, emergency and time-limited access policy |
| DEC-001 trial duration | PARTIALLY RESOLVED | 14-day duration and server-owned start/end timestamps | Decide tenant-local calendar days vs exactly 336 hours, expiry boundary/timezone/DST |
| DEC-002 trial contents | OPEN | Configurable product-specific bundle; no hard-coded quotas | Owner + Commercial approve included products/modules/features, quotas and card requirement |
| DEC-003 expiry/grace/retention | OPEN | No automatic destructive action; preserve state until policy approved | Owner + Legal/Security approve write suspension, read/export grace, retention, deletion and legal hold |
| DEC-004 seats/branches | PARTIALLY RESOLVED | Owner 1 + employees 2; no fixed branch cap; branches do not consume seats | Owner + Commercial approve add-on pricing, higher tiers, admin/service/inactive/temporary user treatment |
| DEC-005 sessions/devices | OPEN | No assumption beyond secure revocation and audit requirement | Owner + Security approve concurrent session/device policy |
| DEC-006 verification/payment | OPEN | Verification/payment provider not selected | Owner + Legal/Operations approve verification method and card requirement |
| CRM privacy/retention | OPEN | Minimize collection; restrict personal data; no unnecessary sensitive identifiers | Owner + Legal/Privacy approve consent, retention, export and deletion schedule |
| Product Available evidence | OPEN | QA/security/support/release evidence required | Owner + Product/QA/Security approve exact checklist and approver separation |
| KPI definitions/timezone/freshness | OPEN | Every KPI exposes definition, period, source and freshness | Owner + Finance/Product approve formulas, timezone and refresh SLA |
| Platform read contract | OPEN | Platform remains authority; stale data is explicit | Platform Engineering + Owner approve API version, allow-list, freshness SLA and link verification evidence |
| Idempotency/audit/attachment retention | OPEN | Stable idempotency and auditable sensitive actions are required | Engineering + Security + Legal approve retention, tamper evidence, storage and classification |
| B1–B5 implementation and Production release | NOT AUTHORIZED | Sequence and DoD are specified | Separate owner approval per implementation slice and separate Production release approval |

## 8. B0 acceptance checklist

B0 can be marked **APPROVED FOR B1 DESIGN/IMPLEMENTATION PLANNING** only when all required rows below are explicitly accepted and evidence is recorded:

- [x] Owner accepted the exact seven-capability Phase B scope and exclusions on 2026-11-12. This does not approve unresolved policies or authorize implementation.
- [x] Owner approved the access-control direction on 2026-11-12: job-role RBAC, additional auditable employee-specific grants, and Company Owner as final authority. Exact permission catalogue/scopes, grant/revoke authority, delegation, conflict-of-interest handling and detailed audit controls remain open.
- [ ] Owner approves initial internal role assignments, role owners and resource/action/scope boundaries.
- [ ] Security approves the internal identity provider, MFA methods/enrollment and recovery, session/device and break-glass policy. (The requirement that MFA applies to every internal account is already owner-approved on 2026-11-12.)
- [ ] Owner approves commercial approval authority, thresholds, delegation and maker-checker.
- [ ] Owner and Legal/Security approve the trial clock, expiry, grace, retention and deletion policy.
- [ ] Owner/Commercial approves trial bundle and any included seat/module quotas.
- [ ] Owner/Commercial approves add-on seat and tier policy or explicitly defers all pricing-dependent behavior.
- [ ] Owner/Legal/Privacy approves CRM personal-data handling and retention.
- [ ] Owner/Product/QA/Security approves product maturity evidence and release authority.
- [ ] Owner/Finance/Product approves KPI formulas, timezone and freshness policy.
- [ ] Platform Engineering approves read-only Platform API contracts, metadata allow-list and freshness source.
- [ ] Engineering/Security approves audit, idempotency, attachment and observability retention.
- [ ] All approvals are entered into the decision register with exact selected wording, approver role, date and conditions.

A checkbox is not considered complete based on discussion, recommendation or PR review alone. The approver must explicitly confirm the exact policy.

## 9. Implementation gates after B0

- **B1:** internal identity and workspace shell only after identity/security and role policies are approved.
- **B2:** portfolio and CRM only after data classification, privacy, maturity evidence and CRM retention are approved.
- **B3:** commercial records only after templates, thresholds, delegation, maker-checker and legal dispatch boundaries are approved.
- **B4:** catalogue and Platform visibility only after seat/trial policies and Platform read contract are approved.
- **B5:** executive dashboard only after KPI formulas, currencies, timezone and freshness contracts are approved.

Every slice requires code review, automated authorization/negative tests, audit verification, QA evidence and owner acceptance. Production is a separate approval.

## 10. Explicit boundary

This document authorizes documentation and review only. It does not authorize:
- runtime code or API implementation;
- SQL/DDL, database creation, schema changes or migrations;
- creation of production internal accounts or credentials;
- tenant operational-data access or support impersonation;
- tenant provisioning, trial activation/reset/extension/conversion/suspension;
- subscription or entitlement mutation;
- public product publication, downloads, payments or e-signature;
- merge, deployment or any change to MALVIA Sales/Restaurant production.

**B0 disposition: PREPARED — OWNER / SECURITY / LEGAL / COMMERCIAL / PLATFORM DECISIONS PENDING.**
