# MALVIA Company Management — Phase B Traceability Matrix v1

**Status:** Design-only traceability artifact; implementation is not authorized by this document.  
**Branch:** `docs/malvia-platform-design-package-v1`  
**Parent scope:** [Phase B Scope & Acceptance Criteria](MALVIA-COMPANY-MANAGEMENT-PHASE-B-SCOPE-v1.md)  
**Logical model:** [Phase B Logical ERD](MALVIA-COMPANY-MANAGEMENT-PHASE-B-LOGICAL-ERD-v1.md)  
**API contract:** [Phase B API Contracts](MALVIA-COMPANY-MANAGEMENT-PHASE-B-API-CONTRACTS-v1.md)

## 1. Purpose and interpretation

This matrix makes Phase B reviewable end-to-end. Every user-facing capability is traced to:
1. its screen/workspace and user outcome;
2. the logical entities it reads or changes;
3. proposed API operations (not assertions that endpoints exist);
4. required authorization capabilities and scope;
5. the Phase B acceptance criteria and API/security tests;
6. failure, concurrency, freshness and audit expectations.

Identifiers such as `PB-AC-01`, `API-T-01` and capability codes below are traceability labels introduced by this matrix. They map to the numbered criteria/tests in the parent documents; they do not replace or silently amend those source documents.

**No implementation authorization:** this matrix does not authorize runtime code, SQL/DDL, migrations, Platform lifecycle commands, tenant-data access, merge, or Production deployment.

## 2. Canonical authorization vocabulary

Authorization is enforced by the server for every read and command. Navigation visibility is never a security boundary. Every permission must resolve to a resource + action + scope tuple, with the authenticated internal principal and active role grant as the source of authority.

| Capability code | Resource/action | Default role boundary | Scope rule |
|---|---|---|---|
| `mcm.dashboard.read` | Read executive overview, KPIs and exceptions | Owner; Executive scoped; Portfolio Manager product KPIs; Sales account/pipeline KPIs; Subscription Ops subscription KPIs; Auditor read-only | Filter every aggregate and drill-down by the caller's granted organization/product/account scope |
| `mcm.products.read` | Read product catalogue and maturity evidence | All internal roles according to role matrix | Product scope |
| `mcm.products.write` | Create/update product metadata and evidence | Portfolio Manager; Owner | Assigned product scope; no maturity approval implied |
| `mcm.products.maturity.request` | Request maturity transition | Portfolio Manager; Owner | Product scope; evidence required |
| `mcm.products.maturity.approve` | Independently approve maturity transition | Owner or explicitly delegated approver | Must be distinct from requester when policy requires separation |
| `mcm.crm.read` | Read leads, organizations, contacts, activities and opportunities | Owner; Executive scoped; Sales assigned accounts; other roles read-only where specified | Assigned account/lead or delegated organization scope |
| `mcm.crm.write` | Create/update CRM records and activities | Sales / Account Manager; Owner | Assigned accounts; field-level restrictions for personal/restricted data |
| `mcm.crm.convert` | Qualify/convert a lead | Sales / Account Manager; Owner | Lead and destination organization scope; explicit audited conversion |
| `mcm.commercial.prepare` | Prepare quote, contract and order records | Sales / Account Manager; Owner | Opportunity/customer scope; sent versions immutable |
| `mcm.commercial.approve` | Decide commercial approval requests | Owner; Executive only where delegation exists | Approval policy and target scope; self-approval denied where required |
| `mcm.catalog.read` | Read plans, plan versions and entitlements | All roles according to role matrix | Product scope |
| `mcm.catalog.prepare` | Prepare catalogue/seat changes | Subscription Ops; Owner | Draft versions only; cannot activate or mutate Platform entitlements |
| `mcm.catalog.approve` | Approve commercial catalogue version | Owner; explicitly delegated Executive | Independent approval and effective-date policy |
| `mcm.platform.references.read` | Read tenant/trial/subscription/entitlement metadata snapshots | Owner; Executive scoped; Portfolio product summary; Sales account summary; Subscription Ops operational metadata; Auditor read-only | Metadata only; verified organization link and approved Platform source scope |
| `mcm.platform.references.verify` | Verify internal organization ↔ tenant reference association | Owner; explicitly delegated Subscription Ops | Evidence-backed association only; never changes tenant state |
| `mcm.audit.read` | Read audit events | Owner; scoped Executive; Auditor read-only; other roles only own permitted events | Target/resource scope; audit access itself is audited |
| `mcm.attachments.download` | Obtain short-lived attachment download grant | Record-authorized roles | Re-authorize parent record and attachment on every request |

Role names above are proposed role families from Phase B Scope, not final employee assignments. No role receives standing access to customer operational data. Internal users and tenant users remain separate identity realms.

## 3. Screen-to-entity-to-API traceability

| Screen / capability | Scope IDs | Primary entities | Proposed API operations | Required capabilities |
|---|---|---|---|---|
| Executive overview and KPI drill-down | PB-01; PB-AC-17, 18, 20 | Product, Lead, Opportunity, CustomerOrganization, TenantReference, TrialSnapshot, SubscriptionSnapshot, EntitlementSnapshot, ApprovalRequest, AuditEvent | `GET /executive/overview`; `GET /executive/kpis/{kpiCode}`; `GET /executive/exceptions`; permission-filtered source list/detail APIs | `mcm.dashboard.read` plus underlying resource read scope |
| Product portfolio list/detail | PB-02; PB-AC-03 | Product, ProductVersion, ProductModule, ProductEvidence, InternalUser | `GET /products`; `GET /products/{productId}` | `mcm.products.read` |
| Product create/edit and evidence | PB-02; PB-AC-04 | Product, ProductVersion, ProductEvidence, AuditEvent | `POST /products`; `PATCH /products/{productId}`; `POST /products/{productId}/versions`; `POST /products/{productId}/evidence` | `mcm.products.write` |
| Product maturity review/transition | PB-02; PB-AC-04 | Product, ProductVersion, ProductEvidence, ApprovalRequest, ApprovalDecision, AuditEvent | `POST /products/{productId}/maturity-transitions`; `GET /approvals/inbox`; `POST /approvals/{approvalId}/decisions` | `mcm.products.maturity.request`; `mcm.products.maturity.approve` |
| CRM lead workspace | PB-03; PB-AC-05, 6 | Lead, Contact, CustomerOrganization, CRMActivity, InternalUser | `GET/POST /leads`; `GET/PATCH /leads/{leadId}`; `POST /leads/{leadId}/qualify`; `POST /leads/{leadId}/convert` | `mcm.crm.read`; `mcm.crm.write`; `mcm.crm.convert` |
| Customer organization and contacts | PB-03; PB-AC-05, 6, 7 | CustomerOrganization, Contact, CRMActivity, TenantReference, AuditEvent | `GET/POST /organizations`; `GET/PATCH /organizations/{organizationId}`; `GET/POST /organizations/{organizationId}/contacts`; `GET/POST /organizations/{organizationId}/activities` | `mcm.crm.read`; `mcm.crm.write`; `mcm.platform.references.verify` for link verification |
| Opportunity pipeline and detail | PB-03; PB-AC-05, 18 | Opportunity, OpportunityProduct, CustomerOrganization, Product, CRMActivity | `GET/POST /opportunities`; `GET/PATCH /opportunities/{opportunityId}`; `POST /opportunities/{opportunityId}/stage-transitions` | `mcm.crm.read`; `mcm.crm.write` |
| Tenant registry (metadata only) | PB-04; PB-AC-07, 8, 21 | TenantReference, CustomerOrganization, AuditEvent | `GET /platform/tenant-references`; `GET /platform/tenant-references/{referenceId}`; `POST /platform/tenant-references/{referenceId}/verify-link` | `mcm.platform.references.read`; `mcm.platform.references.verify` |
| Quotes and quote versions | PB-05; PB-AC-09, 10, 11 | Quote, QuoteVersion, QuoteLine, Opportunity, CustomerOrganization, ApprovalRequest, AuditEvent | `GET/POST /opportunities/{opportunityId}/quotes`; `GET /quotes/{quoteId}`; `POST /quotes/{quoteId}/versions`; `POST /quotes/{quoteId}/submit-for-approval`; `POST /quotes/{quoteId}/send` | `mcm.commercial.prepare`; `mcm.commercial.approve` |
| Contracts and contract versions | PB-05; PB-AC-09, 11 | Contract, ContractVersion, CustomerOrganization, Opportunity, ApprovalRequest, AuditEvent, AttachmentReference | `GET/POST /contracts`; `GET /contracts/{contractId}`; `POST /contracts/{contractId}/versions`; `POST /contracts/{contractId}/submit-for-approval` | `mcm.commercial.prepare`; `mcm.commercial.approve`; `mcm.attachments.download` |
| Commercial orders | PB-05; PB-AC-09, 11 | CommercialOrder, Contract, QuoteVersion, CustomerOrganization, AuditEvent | `GET/POST /orders`; `GET /orders/{orderId}` | `mcm.commercial.prepare`; approval capability when policy requires |
| Approval inbox and decision detail | PB-05/PB-06; PB-AC-11, 19 | ApprovalRequest, ApprovalDecision, InternalUser, AuditEvent | `GET /approvals/inbox`; `GET /approvals/{approvalId}`; `POST /approvals/{approvalId}/decisions` | `mcm.commercial.approve` or resource-specific independent approval |
| Plan, plan version and entitlement catalogue | PB-06; PB-AC-12, 13, 14 | Plan, PlanVersion, EntitlementDefinition, PlanEntitlement, PlanSeatAllowance, Product | `GET /catalog/products/{productId}/plans`; `POST /catalog/products/{productId}/plans`; `GET /catalog/plans/{planId}/versions`; `POST /catalog/plans/{planId}/versions`; `GET /catalog/entitlements`; submit-for-approval endpoint | `mcm.catalog.read`; `mcm.catalog.prepare`; `mcm.catalog.approve` |
| Trial visibility | PB-07; PB-AC-15, 16, 21 | TenantReference, TrialSnapshot, Product, AuditEvent | `GET /platform/trials`; `GET /platform/trials/{trialReferenceId}` | `mcm.platform.references.read` |
| Subscription and entitlement visibility | PB-07; PB-AC-12, 16, 21 | TenantReference, SubscriptionSnapshot, EntitlementSnapshot, PlanVersion | `GET /platform/subscriptions`; `GET /platform/subscriptions/{subscriptionReferenceId}`; `GET /platform/entitlements` | `mcm.platform.references.read` |
| Audit search | Cross-cutting; PB-AC-19, 20, 22 | AuditEvent, InternalUser | `GET /audit-events` | `mcm.audit.read` |
| Authorized attachment download | Cross-cutting | AttachmentReference and owning record | `GET /attachments/{attachmentId}/download-grant` | `mcm.attachments.download` |

**API naming note:** the catalogue above uses the route families and operations proposed by the API Contracts document. Combined notation such as `GET/POST` means the individual methods listed there, not a new combined HTTP method.

## 4. Acceptance-criteria crosswalk

| Matrix ID | Parent Phase B criterion | Traceability evidence required |
|---|---|---|
| PB-AC-01 | Internal and tenant identities are separate | Internal authentication subject and internal role grant; negative tenant-token tests on every internal route |
| PB-AC-02 | UI and API authorization agree | Screen capability map + server policy tests + direct-ID/query/body scope-bypass tests |
| PB-AC-03 | Product maturity states are distinct | Product maturity enum and list/detail rendering tests |
| PB-AC-04 | Available requires release evidence and approval | ProductVersion/ProductEvidence + independent ApprovalDecision; reject missing evidence/approval |
| PB-AC-05 | CRM create/update/qualify/assign/search with audit | Lead/Contact/CustomerOrganization/Opportunity/CRMActivity write/read contracts and AuditEvent assertions |
| PB-AC-06 | Duplicate warning without automatic merge | Duplicate candidate response with match reasons; assert no merge command or mutation |
| PB-AC-07 | Organization-to-tenant link is verified and sourced | TenantReference link state/source fields; verify-link evidence and audit |
| PB-AC-08 | Tenant registry contains approved metadata only | Allow-listed response schema and data-classification test; deny operational payload fields |
| PB-AC-09 | Commercial record types remain separate | Distinct Quote, Contract, CommercialOrder and Platform subscription references; no entity aliasing |
| PB-AC-10 | Sent quote versions are immutable | Version creation path; update rejection after sent/approved state |
| PB-AC-11 | Approval is permissioned; no provisioning | ApprovalRequest/Decision audit; assert order/approval emits no tenant-provisioning command |
| PB-AC-12 | Plan versions preserve history | Immutable PlanVersion; active subscription snapshots remain unchanged after catalogue revision |
| PB-AC-13 | Basic package is owner + two employees | PlanSeatAllowance owner=1, employee=2; owner excluded from employee count |
| PB-AC-14 | Branch count does not consume seats | Branch count is metadata only; branch-only change leaves seat utilization unchanged |
| PB-AC-15 | Trial duration shown as 14 days; clock semantics open | Trial UI labels 14 days and explicitly identifies pending exact clock/expiry policy |
| PB-AC-16 | Trial values are authoritative server snapshots | Server timestamps/source metadata; no client reset/extend commands |
| PB-AC-17 | KPI definition, period, freshness and source shown | KPI contract and nullable stale/unavailable behavior; no fabricated zero |
| PB-AC-18 | Mixed currencies are not summed without policy | Separate currency buckets in opportunity/KPI responses |
| PB-AC-19 | Sensitive actions create audit events | Actor, target, time, reason, request/correlation IDs asserted for every command |
| PB-AC-20 | Exports enforce caller scope | Export scope and audit tests; no broader record or attachment access |
| PB-AC-21 | Platform outage/staleness is explicit and safely retried | Stale/unavailable read model; retry has no duplicate side effect; CRM writes remain independent |
| PB-AC-22 | Phase B never writes tenant operational databases | Static route/command allow-list and integration test proving no tenant DB write path |

## 5. API test crosswalk

The API test numbers refer to Section 10 of the Phase B API Contracts document.

| API test | Primary coverage | Additional proof |
|---|---|---|
| API-T-01 | PB-AC-01 | Tenant token denied on internal namespace |
| API-T-02–03 | PB-AC-02 | Record-ID guessing and scope-widening denied |
| API-T-04–05 | PB-AC-04 | Maturity evidence and independent approval gates |
| API-T-06 | PB-AC-06 | Duplicate surfaced; merge not performed |
| API-T-07 | PB-AC-07 | Unverified link cannot be used as verified mapping |
| API-T-08–09 | PB-AC-21 | Platform outage/stale snapshot behavior |
| API-T-10 | PB-AC-15–16 | Trial lifecycle mutation route absent/rejected |
| API-T-11–12 | PB-AC-19; command safety | Idempotent replay stable; changed body with same key conflicts |
| API-T-13 | PB-AC-02; concurrency | Stale ETag returns 412 without overwriting latest state |
| API-T-14 | PB-AC-10 | Sent quote version immutable |
| API-T-15–16 | PB-AC-11, 19 | Unauthorized/self approval denied; decision immutable |
| API-T-17 | PB-AC-12 | Catalogue version does not rewrite active subscription |
| API-T-18–19 | PB-AC-13–14 | Owner + two employees; branches do not consume seats |
| API-T-20 | PB-AC-18 | Currency-separated totals |
| API-T-21 | PB-AC-17 | KPI source failure returns null/stale metadata |
| API-T-22 | PB-AC-20 | Export/download authorization and audit |
| API-T-23 | Cross-cutting security | No stack traces, SQL details or secrets |
| API-T-24 | PB-AC-11, 22 | Safe retries; no tenant provisioning side effect |

## 6. Cross-cutting failure and consistency matrix

| Failure / conflict | Required behavior | Never do |
|---|---|---|
| Internal identity provider unavailable | Fail closed for protected routes; preserve correlation ID; show safe sign-in/service error | Fall back to tenant identity or trust a client-supplied role |
| Role grant expired/revoked mid-session | Re-evaluate authorization on each request; deny next protected operation | Trust stale UI navigation state |
| Record outside account/product scope | Return non-disclosing 404/403 according to the common API policy; emit security telemetry | Leak record existence through search, counts or error details |
| Duplicate organization candidates | Return candidates and match reasons for human review | Auto-merge by name, phone or email similarity |
| Stale `expectedVersion` / ETag | Reject with 412 or the documented concurrency error; client reloads and reconciles | Last-write-wins overwrite |
| Repeated command with same idempotency key and body | Return the original stable result/receipt | Create a second quote, approval, activity or order |
| Same idempotency key with different body | Return 409 conflict and log misuse | Reinterpret the key as a new command |
| Platform API timeout/unavailable | Preserve last observation with explicit stale/unavailable state and observed/source timestamps; retry safe reads | Display stale data as current Active or invent zero counts |
| Trial snapshot missing | Display Unknown/Unavailable and source health | Infer not-started, expired or active |
| Plan catalogue update | Create a new immutable version and approval workflow | Retroactively alter tenant subscription or entitlement |
| Attachment storage unavailable | Fail download grant safely; preserve audit trail | Issue public/permanent URL |
| Audit write unavailable for sensitive command | Fail closed or use a proven atomic durable audit/outbox mechanism approved in implementation design | Complete an unaudited privileged action |
| Currency conversion policy absent | Keep amounts in separate currency buckets | Sum unlike currencies |
| Order accepted | Record commercial commitment and audit | Provision tenant, activate trial, alter entitlement, invoice or collect payment |
| Client retries after ambiguous network result | Resolve via idempotency receipt/status before resubmitting | Create duplicate business records |

## 6A. Detailed internal permission matrix — proposal v0.1 (owner review required)

**Status:** Proposed design only. This section translates the approved department baseline into resource/action permissions for the first five governance and commercial roles. It is not an approval of numeric thresholds, legal/accounting authority, or production access. All checks are server-side; UI visibility is not authorization.

### Permission semantics

| Action | Meaning | Control |
|---|---|---|
| Read | View a resource or report | Scope-filtered; aggregate counts must not reveal out-of-scope records |
| Create | Create a draft record | Does not imply send, approve, post or activate |
| Update | Edit a draft or permitted fields | Sent/approved/posted versions are immutable; corrections use a new version or reversal |
| Submit | Send a record into a workflow | Locks the submitted version where applicable |
| Approve | Make an approval decision | Requires explicit approval permission and separation-of-duties checks |
| Execute | Perform the approved business command | Rechecks approval, current state, scope and idempotency on the server |
| Cancel / Reverse | Cancel a draft or create a compensating event | No hard deletion of commercial/financial history; reason and audit required |
| Grant access | Assign or revoke permissions | Separate privileged permission; self-grant prohibited; immutable audit event |

### Role-by-role baseline

| Resource / action | Company Owner | General Manager / Executive | Finance & Accounting | Sales & CRM | Subscription Operations |
|---|---|---|---|---|---|
| Executive dashboard | Read all company scope | Read company overview; drill-down only within delegated scope | Read finance KPIs and assigned finance drill-down | Read assigned pipeline and sales KPIs | Read subscription/trial operational KPIs |
| Department and employee directory | Read / manage | Read; manage only if separately delegated | No default access | No default access | No default access |
| Product catalogue and roadmap | Read / manage | Read; request changes | Read commercial/finance-relevant fields | Read sellable catalogue and approved price versions | Read plan-linked product catalogue |
| CRM leads, contacts, organizations | Read / create / update / assign | Read company-wide; update only if delegated | Read billing identity fields only when needed | Read / create / update assigned records; submit qualification/conversion | Read verified customer reference only where needed for subscription operations |
| Opportunities and activities | Read / manage | Read; reassign/escalate if delegated | Read approved commercial values for finance workflow | Read / create / update assigned opportunities and activities | Read opportunity-to-subscription reference only |
| Quotes and quote versions | Prepare / approve / send / cancel subject to audit | Review and approve only under explicit delegated authority | Read approved quote and tax/finance fields; no commercial edit by default | Create / update draft / submit; send only after required approval | Read approved quote reference for entitlement setup; cannot alter commercial terms |
| Contracts and amendments | Review / approve / authorize execution | Approve only within written delegation | Read executed terms and payment obligations; flag finance exceptions | Prepare draft / submit; no legal signature authority by default | Read executed subscription terms; cannot amend |
| Commercial orders | Read / create / approve / cancel within policy | Read; approve within delegated authority | Read accepted orders; no tenant provisioning | Prepare / submit orders; no provisioning | Read accepted order for subscription workflow; no tenant lifecycle mutation |
| Plan and seat catalogue | Read / prepare / approve / publish | Read; approve only if delegated | Read prices and billing rules | Read current approved offers | Prepare draft versions; submit for approval; cannot publish or change live tenant entitlements |
| Trial / subscription / entitlement snapshots | Read all metadata | Read delegated company overview | Read billing-relevant metadata | Read assigned customer status summary | Read operational metadata; verify internal-to-tenant reference with evidence if separately authorized |
| Customer tenant operational data | No standing access through MCM; use separate audited support process | No standing access | No default access | No default access | No default access |
| Finance: invoices, receipts, expenses, receivables | Read / manage / approve subject to dual-control policy | Read management summaries; approve only by delegation | Read / create / update drafts / submit / post or execute only with separately assigned permissions | Read own commission/quote status only if approved | Read subscription billing status metadata only; no posting |
| Audit events | Read all; sensitive access audited | Read delegated scope | Read finance-relevant audit events | Read own permitted activity trail | Read subscription-operation audit events |
| Role and permission grants | Final authority; grant/revoke | No default grant; may request | No default grant | No default grant | No default grant |
| Sensitive exports | Approve / execute with audit | Only explicitly delegated and scoped | Finance exports within approved scope | CRM exports only with explicit permission and assigned scope | Subscription metadata exports only with explicit permission |

### Mandatory constraints for these roles

1. **Owner:** final company authority does not bypass authentication, audit, legal/accounting controls or immutable history. High-risk actions should use explicit confirmation and, where configured, dual control.
2. **General Manager:** company-wide management visibility is not blanket edit authority. Every write, approval and delegation must be separately granted and scoped.
3. **Finance:** MALVIA company books are separate from customer tenant ledgers. Drafting, approval and posting are distinct permissions. No hard delete of posted entries; corrections use approved reversals/adjustments.
4. **Sales:** may prepare commercial records but cannot independently override approved price lists, discount thresholds, contract terms or approval requirements. Sent versions remain immutable.
5. **Subscription Operations:** may prepare catalogue changes and operate on approved metadata workflows, but cannot create/reset/extend/suspend trials, alter subscriptions, provision tenants or mutate live entitlements through MCM.
6. **All roles:** employee-specific additional grants are allowed only under the approved RBAC direction; the grantor must be authorized, cannot grant beyond their own grant ceiling, and cannot grant themselves access. Every grant has a reason, scope, effective period and revocation trail.
7. **Separation of duties:** a requester cannot approve their own high-risk request where policy requires independent review. Engineering cannot approve its own QA evidence or Production promotion. Finance posting and payment execution must follow separately approved thresholds and dual-control rules.
8. **Deletion:** prefer archive, cancel or reverse. Physical deletion is unavailable for sent quotes, executed contracts, accepted orders, posted finance events and audit records, except under an approved retention/legal process.

### Items that must be decided before this matrix can become an implementation baseline

| Open item | Safe default until approved |
|---|---|
| Monetary approval thresholds, discount limits and contract commitment authority | Route all exceptions to Company Owner; do not invent amounts |
| Who can delegate General Manager approval and for which duration | Owner-only explicit delegation; no implied delegation |
| Finance maker-checker, posting and payment execution limits | Separate preparation from approval and execution; owner approval for unconfigured high-risk actions |
| Who may publish plan catalogue versions and effective-date changes | Owner approval; Subscription Operations prepares only |
| CRM sensitive fields, export rights and retention | Minimum necessary data; no bulk export without explicit permission |
| Individual permission grant/revoke authority and expiry | Company Owner only until a delegated permission-administrator policy is approved |
| Emergency access / break-glass | Disabled until Security defines and tests an audited process |

This proposal must be reviewed role by role. Approval of this section will not approve unrelated identity, accounting, legal, trial-retention or Platform lifecycle decisions.

## 7. Implementation slices, dependencies and Definition of Done

The order below follows the Phase B delivery sequence. Each slice is a separately reviewable vertical increment; completion of one does not authorize Production deployment.

### B0 — Design lock and policy closure
**Dependencies:** Owner review of Phase B scope, role/resource/scope matrix, source-of-truth owners and pending policy register.

**Deliverables:** approved screen inventory; capability matrix; API/entity mapping; data classification; explicit decision log; test plan.

**DoD:** every PB capability has a named owner, approved data source, permission boundary, API contract, acceptance test and operational failure behavior. No unresolved decision is silently defaulted.

### B1 — Internal identity and workspace shell
**Dependencies:** B0; approved identity provider, MFA and internal role policy.

**Deliverables:** internal-only sign-in boundary, navigation shell, server-side permission evaluation, role/scope grants, audit foundation.

**DoD:** tenant tokens cannot enter internal routes; internal users cannot widen their own grants; UI and API permissions match; deactivation/revocation takes effect; privileged actions are auditable. No customer login change.

### B2 — Product portfolio and CRM
**Dependencies:** B1; approved product maturity evidence checklist and CRM field/privacy policy.

**Deliverables:** portfolio list/detail/edit/evidence; leads, contacts, organizations, activities and opportunities.

**DoD:** maturity transition is gated; CRM search and assignment are scoped; duplicates only warn; conversion is explicit; personal data is least-privilege; all writes are audited; currency totals remain separated.

### B3 — Commercial records and approvals
**Dependencies:** B2; approved quote/contract/order templates, approval thresholds and separation-of-duties policy.

**Deliverables:** immutable quote versions, contract versions, commercial orders, approval inbox and decision history.

**DoD:** sent quote versions cannot be edited; approvals are independent where required; order does not provision, activate entitlement, invoice or collect payment; command idempotency/concurrency tests pass.

### B4 — Catalogue and Platform visibility
**Dependencies:** B1 and B3 as applicable; approved Platform read API, allow-listed metadata contract, verified customer mapping policy, trial expiry/retention semantics where display requires them.

**Deliverables:** product plans/versions/entitlement catalogue; owner+2 employee seat representation; read-only tenant/trial/subscription snapshots and freshness indicators.

**DoD:** owner and employee allowances are distinct; branches do not consume seats; plan history is immutable; Platform is the sole authority for live lifecycle; no trial/subscription mutation endpoint exists; stale values are explicit.

### B5 — Executive overview
**Dependencies:** B2, B3 and B4 data contracts and permission-filtered query services.

**Deliverables:** KPI cards, period/source/freshness metadata, scoped drill-down and exception views.

**DoD:** every KPI reconciles to its source query; no fabricated zeroes; currencies remain separate; inaccessible records do not leak via counts or drill-down; stale/unavailable sources are visible.

### Promotion gate for every slice
- Code review and threat-model review completed.
- Automated unit, API, authorization, negative-security, idempotency and concurrency tests pass.
- QA evidence and test environment verification recorded.
- Data migration/rollback plan supplied if any persistence change is proposed.
- Owner acceptance recorded for the slice.
- Production deployment separately authorized; no implicit promotion from a passing build.

## 8. Open decisions and execution blockers

The following remain open in the source design and must be resolved before the affected behavior is implemented. The matrix intentionally does not convert recommendations into approvals.

| Decision / policy | Affected slices | Required approver(s) | Safe interim behavior |
|---|---|---|---|
| Internal identity provider, MFA, recovery and session policy (MCM-DEC-02; related architecture decisions) | B1 | Owner + Security | No production internal accounts or privileged access until approved |
| Initial internal module/role assignments (MCM-DEC-01) | B0–B1 | Owner | Use proposed roles only as design vocabulary |
| Commercial approval thresholds and delegation (MCM-DEC-03) | B3 | Owner | Route exceptions to Owner; do not infer numeric limits |
| Support access and any future customer-data access (MCM-DEC-04) | Future support scope | Owner + Security | No tenant operational-data access in Phase B |
| Trial clock/expiry, grace and retention (DEC-001–003) | B4 | Owner + Product/Legal | Display 14-day duration and authoritative timestamps; mark exact semantics pending |
| Seat pricing, higher tiers, inactive/admin/service-user treatment (DEC-004) | B4 | Owner + Commercial | Represent confirmed owner+2 employees only; no invented add-on prices |
| CRM personal-data retention, consent and restricted identifiers | B2 | Owner + Legal/Privacy | Collect minimum necessary fields; restrict access; no optional tax/registration IDs by default |
| Product availability evidence checklist and release authority | B2 | Owner + Product/QA/Security | Keep maturity below Available until evidence and approval exist |
| Quote/contract templates, legal signature and commercial dispatch integration | B3 | Owner + Legal | Internal drafts/version records only; no claim of legal signature |
| Platform read API, freshness SLA and tenant-link evidence | B4 | Platform Engineering + Owner | No live state inference from stale/unverified snapshots |
| KPI definitions, reporting timezone and refresh SLA | B5 | Owner + Finance/Product | Show source, period and timestamp; null/stale where unresolved |
| Attachment storage, classification and retention | B3–B5 | Security + Legal | Private storage references only; no public URLs |
| Audit retention and source-IP fingerprint use | B1–B5 | Owner + Security + Legal | Record minimum necessary audit fields; do not collect IP fingerprints absent approval |

## 9. Security and privacy release blockers

Before any implementation is accepted:
1. Prove internal/tenant identity separation at middleware, service and data-access layers.
2. Prove every endpoint enforces resource/action/scope authorization independently of UI.
3. Prove customer organization/contact personal data is minimized, classified, retained and exported under policy.
4. Prove tenant registry responses use a strict allow-list and cannot return operational records.
5. Prove no internal MCM command can call tenant provisioning, trial lifecycle, entitlement mutation or tenant operational write services.
6. Prove approval separation-of-duties and immutable decision history.
7. Prove audit coverage for privileged actions without recording secrets or sensitive payloads.
8. Prove stale Platform data cannot be presented as authoritative.
9. Prove idempotency and concurrency behavior under retry and simultaneous edits.
10. Prove search, pagination, KPI aggregates, exports and error responses do not leak out-of-scope record existence or values.

## 10. Explicit non-goals and authorization boundary

This matrix does not authorize:
- SQL/DDL, physical schema design changes, database provisioning or migrations;
- runtime code, API implementation or changes to MALVIA Sales/Restaurant;
- tenant provisioning, trial activation/reset/extension/conversion/suspension, subscription mutation or entitlement writes;
- customer operational-data access, support impersonation or credential configuration;
- public website publication, downloads, payment collection, e-signature or Production deployment;
- PR merge or changes outside the documentation branch.

The next gate is owner review of the traceability and open-decision tables. Implementation planning may begin only after the applicable decisions and B0 design-lock evidence are explicitly approved.

## Phase B0 design lock

- [Phase B0 Design Lock & Decision Closure](MALVIA-COMPANY-MANAGEMENT-PHASE-B0-DESIGN-LOCK-v1.md) is the B0 readiness and decision-closure record for the B1–B5 slices. It distinguishes confirmed requirements from open decisions and does not authorize implementation.
