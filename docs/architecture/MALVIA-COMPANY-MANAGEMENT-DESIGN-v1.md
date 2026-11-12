# MALVIA Company Management — Internal Operating System Design v1

**Status:** Architecture proposal for owner review — design only.  
**Parent:** MALVIA Company / MALVIA Platform / MALVIA Products.  
**Scope:** Internal operating system used by MALVIA staff to run the software company and its product portfolio. It is not a customer-facing tenant ERP, and it is not an implementation of the public website.

## 1. Purpose and boundaries

MALVIA Company Management (MCM) is the internal system of record for the software company: product portfolio, customers, sales pipeline, contracts, subscriptions, support, delivery projects, product development, internal people, company finance and management reporting.

It must coexist with, but remain distinct from:

1. **MALVIA Company:** the legal/commercial organization and its internal staff, processes and governance.
2. **MALVIA Platform:** the shared multi-tenant technology that provisions and operates customer tenants, users, entitlements, branches, integrations, audit and APIs.
3. **MALVIA Products:** customer-facing systems such as Sales, Restaurant, Pharmacy, Fashion, Market, Construction, Real Estate and HR/Enterprise.

MCM consumes approved Platform APIs and product telemetry. It must not bypass tenant authorization, directly mutate customer business data, or treat internal company staff as customer tenant users by default. A MALVIA employee account is an internal identity; customer owner/admin/employee accounts are tenant identities. Any support access into a customer tenant is a separate, time-limited, permissioned and audited support session.

## 2. Operating principles

- One internal company workspace with role-scoped access and an immutable audit trail for sensitive actions.
- Product portfolio and product maturity are centrally governed; a roadmap entry is not a release.
- A customer relationship, a commercial contract, a platform tenant, a product entitlement and an invoice are separate linked records.
- Subscription seats are distinct from branch counts. The approved basic customer package is one owner plus two employee seats; the owner does not consume an employee seat. Other tiers and add-on prices remain undecided.
- Trial duration is approved as 14 days; exact clock semantics, trial contents and expiry/grace behavior remain pending.
- Customer financial ledgers and MALVIA's own company accounts are separate accounting domains.
- Internal reports use source-linked, versioned metrics; no manually invented or disconnected totals.
- Integrations use least privilege, idempotency, retry controls and observable failure states.
- Sensitive operations require approval thresholds and dual control where policy defines it.

## 3. Users, roles and organization

### 3.1 Internal identities

Internal accounts are provisioned by MALVIA administrators and belong to the company identity domain. They do not automatically create or inherit customer tenant memberships.

Proposed internal roles (permissions must be granular, not role-name-only):
- Company Owner / Super Admin
- Executive / General Manager
- Product Portfolio Manager
- Sales / Account Manager
- Subscription & Billing Operations
- Customer Success
- Support Agent / Support Lead
- Implementation / Project Manager
- Product Manager
- Engineering Lead / Developer
- QA / Release Manager
- Finance / Accountant
- HR / People Operations
- Read-only Auditor

A person may hold multiple scoped roles. High-risk permission grants, financial adjustments, refunds, contract overrides, production release approvals and customer data access must be separately permissioned and audited.

### 3.2 Organizational structure

Support configurable departments, teams, reporting lines, cost centers, work locations and employment status. Do not hard-code a fixed team count or product count. Keep HR employee records distinct from login identities and contractor/vendor contacts.

## 4. Core modules

### MCM-01 — Executive Dashboard & Governance
- Company-wide KPIs: active customers, qualified pipeline, recurring revenue, renewals due, trials, churn, support backlog, delivery health, product release status and cash/receivables summaries.
- Drill-down to source records; filters by period, product, team and customer segment.
- Approval inbox, escalations, overdue commitments and risk register.
- Metric definitions and permissions are versioned; finance metrics reconcile to approved accounting sources.

### MCM-02 — Product Portfolio & Roadmap
- Product catalogue with owner, target segment, industry, status, release channel, supported regions, dependencies and commercial packaging.
- Product states: Planned, In Development, Private Pilot, Available, Deprecated.
- Product versions, release notes, environments, compatibility, rollout cohorts and support lifecycle.
- Roadmap initiatives, epics, milestones, dependencies, risks and target windows.
- Product/module entitlements are catalogued separately from marketing bundles.
- Status changes to Available require release evidence and an authorized release approval.

Initial portfolio records: MALVIA Sales (operating, subject to release verification); MALVIA Restaurant (in preparation); Pharmacy, Fashion, Market, Construction, Real Estate and HR & Enterprise (portfolio directions; not to be advertised as released without evidence).

### MCM-03 — CRM & Customer Accounts
- Leads, prospects, qualified opportunities, contacts, companies, communication history, consent/preferences and lead sources.
- Customer lifecycle: Lead → Qualified → Opportunity → Proposal → Negotiation → Won/Lost → Onboarding → Active → At Risk → Churned.
- Deduplicate organizations and contacts using reviewed matching rules; preserve audit history.
- Link one commercial customer to one or more legal entities and platform tenants only through explicit verified relationships.
- Record industry, expected users, branch count, requested products, integrations, onboarding needs and account owner.
- Support account hierarchy and reseller/partner relationships without cross-customer data leakage.

### MCM-04 — Sales, Proposals & Contracts
- Opportunity pipeline, product-specific quotations, pricing versions, discounts and approval thresholds.
- Proposal templates, scope, implementation services, integrations, support tier, exclusions and acceptance.
- Contract lifecycle: Draft, Review, Approved, Sent, Signed, Active, Suspended, Expired, Terminated.
- Store signed document metadata and controlled files; do not claim electronic signature validity until provider and legal process are approved.
- Contract amendments, renewal terms, SLA, data-processing terms and customer obligations.
- No quote or contract automatically provisions a production tenant without an authorized order-to-activation workflow.

### MCM-05 — Subscription, License & Entitlement Operations
- Separate records for customer account, subscription, plan, purchased product, optional module, seat allowance, actual assigned users, trial and billing cycle.
- Basic package baseline: one owner + two employee seats. Owner is included but not deducted from the employee allowance. Branch count is not a subscription quantity.
- Track purchased additional seats, effective dates, proration policy, upgrade/downgrade, grace, suspension and reactivation as explicit approved policies.
- Trial: 14 days; server-owned start/end timestamps and no reset through download, reinstall or device change. Remaining clock semantics and expiry policy are pending.
- Entitlement decisions are server-side, tenant-scoped and auditable; UI hiding alone is never authorization.
- Reconcile subscription state with payment and invoice records. Failed payment does not silently erase customer data.
- Entitlement changes generate idempotent provisioning commands and a visible outcome.

### MCM-06 — Onboarding, Implementation & Customer Success
- Onboarding checklist per product/industry, assigned implementation owner, milestones, data import, configuration, training and acceptance.
- Branch/user setup is customer-specific and not capped by a global hard-coded branch limit.
- Migration plans include source inventory, mapping, validation, trial import, reconciliation, backup and signed acceptance.
- Customer health, adoption, training completion, renewal risk and success plans.
- Customer-specific customizations are documented, versioned and assessed for supportability before commitment.

### MCM-07 — Support Desk & Service Management
- Ticket intake from portal, email or internal creation; customer, tenant, product, version, severity, impact, environment and reproduction details.
- SLA policies, ownership, queues, escalation, status history, attachments and customer-visible updates.
- Incident/problem/change records and known-error knowledge base.
- Safe diagnostics redact passwords, employee personal data, tokens and sensitive financial information by default.
- Support staff see operational metadata by default. Customer-content access requires a separate time-bound, reason-coded and approved support session, with customer consent where policy requires.
- Link tickets to product defects, releases, incidents and customer commitments.

### MCM-08 — Product Development & Engineering Delivery
- Product backlog, epics, stories, defects, technical debt, milestones, owners, estimates and dependencies.
- Link work items to repository, branch, commit, PR, build, preview, release and incident references.
- Distinguish Planned, In Progress, In Review, QA, Accepted, Released and Rejected.
- Acceptance criteria, test evidence, security review, migration impact and rollback plan required for release candidates.
- No automatic Production deployment from a roadmap status or merged PR alone; deployment is a separately authorized operation with evidence.
- Protect customer data and secrets in issue descriptions, logs, screenshots and test fixtures.

### MCM-09 — Project & Professional Services Delivery
- Implementation projects, integrations, custom development and consulting engagements.
- Scope baseline, change requests, budget, time entries, deliverables, milestones, dependencies, risks and customer sign-off.
- Resource planning by skills/capacity and project cost tracking.
- Separate product roadmap work from billable customer-specific work.
- Change requests require impact analysis and commercial approval before scope expansion.

### MCM-10 — Company Finance & Billing
- MALVIA legal entities, chart of accounts, fiscal periods, cash/bank accounts, receivables, payables, expenses, payroll interface, tax and management reporting.
- Customer invoices and receipts reconcile to subscription/contracts; internal revenue is not inferred solely from active tenant count.
- Revenue recognition, VAT, e-invoicing, tax and statutory treatment require Egyptian accountant/legal sign-off before live posting.
- Product profitability, recurring revenue, collection aging, refunds, discounts, implementation margin and support cost.
- Keep company books isolated from tenant financial ledgers and product demo/sample data.

### MCM-11 — People, Access & Internal Operations
- Internal staff directory, teams, roles, onboarding/offboarding, access reviews, leave/work allocation and training records.
- HR-sensitive records require narrower permissions than ordinary staff directory data.
- Joiner/mover/leaver process revokes sessions, API tokens and system access promptly.
- HR and payroll legal compliance must be separately approved; this module is not a replacement for customer-facing MALVIA HR.

### MCM-12 — Knowledge, Documents & Communications
- Controlled document library for policies, proposals, contracts, architecture decisions, runbooks, release notes and customer deliverables.
- Versioning, ownership, retention, classification and access logs.
- Customer communications linked to CRM account and ticket/project; opt-out and consent preferences respected.
- Internal AI search/assistant may summarize authorized company records but must enforce source permissions, citations and data boundaries.

### MCM-13 — Integrations, Automation & Audit
- Integration registry for GitHub, Vercel, billing/payment, email, support channels and approved customer systems.
- Per-integration scopes, secret vault references, rotation, webhook signature validation, retries, idempotency and health monitoring.
- Automation catalogue with owner, trigger, actions, approval requirement, execution log and kill switch.
- Immutable audit events for role changes, pricing overrides, contracts, subscriptions, support access, finance and releases.
- Never store plaintext credentials or expose secrets in audit or support diagnostics.

## 5. Key end-to-end workflows

### 5.1 Lead-to-customer
Lead capture → qualification → discovery → product fit → proposal → commercial approval → signed contract/order → customer account verification → tenant provisioning request → owner activation → onboarding → acceptance → customer success.

### 5.2 Trial-to-paid
Product selection → verified account → explicit trial activation → tenant and approved starter entitlements → usage/health monitoring → reminders → customer selects plan → order/payment approval → subscription activation → entitlement reconciliation. Trial expiry and data retention follow separately approved policy. Download is a delivery method only; it neither creates nor resets a trial.

### 5.3 Support-to-release
Ticket → severity/impact triage → safe diagnostics → reproduce → defect/work item → code review → automated tests → QA/acceptance → approved release → monitored rollout → customer communication → incident closure and knowledge capture.

### 5.4 Renewal and expansion
Renewal forecast → usage/seat review → customer success review → quotation/amendment → approval/signature → billing → entitlement update. Adding branches does not by itself change subscription price; additional user seats or purchased products/modules follow the approved commercial catalogue.

### 5.5 Customer access for support
Ticket and reason → least-privilege scope → customer consent/approval where required → time-limited access grant → audited session → expiry/revocation → access summary attached to ticket.

## 6. Core data domains and relationship boundaries

Proposed logical aggregates (not physical table/DDL approval):
- Company: CompanyEntity, Department, Team, InternalUser, InternalRole, Permission, CostCenter.
- Portfolio: Product, ProductVersion, ProductModule, RoadmapItem, Release, CompatibilityPolicy.
- CRM: CustomerOrganization, Contact, Lead, Opportunity, Activity, AccountOwner.
- Commercial: Quote, QuoteLine, Contract, ContractVersion, Order, Approval.
- Subscription: Plan, PlanVersion, Subscription, SubscriptionItem, SeatAllowance, SeatAssignment, Trial, Entitlement, ProvisioningJob.
- Delivery: Onboarding, ImplementationProject, Milestone, WorkItem, TimeEntry, ChangeRequest, Acceptance.
- Support: Ticket, Incident, Problem, SLA, SupportAccessGrant, DiagnosticArtifact.
- Finance: CompanyLedgerReference, Invoice, Receipt, Refund, Expense, PaymentAllocation, TaxDocument.
- Knowledge/Integration: Document, Communication, Integration, SecretReference, WebhookEvent, AutomationRun, AuditEvent.

Critical separation:
- InternalUser ≠ TenantUser.
- CustomerOrganization ≠ Tenant.
- Product ≠ ProductModule ≠ Plan.
- Contract ≠ Subscription ≠ Invoice ≠ Payment.
- Trial ≠ DownloadArtifact.
- SupportAccessGrant ≠ normal tenant membership.
- Company finance ledger ≠ customer tenant ledger.
- Product roadmap status ≠ deployed release status.

## 7. System integration architecture

MCM should consume versioned, authenticated Platform APIs for tenant provisioning, product catalog, entitlements, usage summaries and audit references. It should use approved integration adapters for GitHub/Vercel and payment/email services. Avoid direct cross-database writes into customer product schemas.

Recommended interaction pattern:
1. MCM command validates internal permission and approval requirements.
2. MCM persists its own business transaction and an outbox event atomically.
3. A worker delivers an idempotent Platform provisioning/entitlement command.
4. Platform returns an operation reference and resulting state.
5. MCM records outcome and exposes retry/escalation without duplicating the effect.
6. Reconciliation jobs compare contracts/subscriptions/entitlements/tenant state and raise exceptions.

No live integration, endpoint, database or secret configuration is authorized by this document.

## 8. Dashboards and reporting

- Executive: recurring revenue, new/active customers, churn, pipeline, collections, delivery/support health, product maturity and release risks.
- Sales: funnel, win/loss, forecast, product mix, conversion and discount approvals.
- Product: roadmap, release quality, adoption, defects, incidents and product costs.
- Customer success: onboarding, adoption, renewal, health and open risks.
- Support: backlog, first response, resolution, SLA breach, reopen and incident trend.
- Delivery: project margin, milestone variance, utilization and change requests.
- Finance: cash, receivables, payables, revenue, costs, tax and product profitability.

Every metric needs an owner, definition, source, time basis, filters, refresh cadence and reconciliation test. No hard-coded sample values may appear as live company figures.

## 9. Security and governance

- Separate internal identity realm from customer tenant authentication.
- Enforce MFA for privileged internal roles and sensitive operations.
- Use least privilege, scoped roles, approval thresholds and periodic access reviews.
- Separate duties for pricing override, refund, finance posting, support access and Production release.
- Encrypt secrets and sensitive files; never put credentials in GitHub documents.
- Tenant data access is denied by default and brokered through explicit support grants.
- Audit logs are append-only from application perspective, time-stamped and exportable to authorized auditors.
- Define data classification, retention, deletion, legal hold, backup and incident response with legal/security owners.
- Apply secure SDLC, dependency scanning, code review, test evidence and release rollback controls.

## 10. Delivery phases

**Phase A — Business and policy definition:** approve internal org/roles, customer lifecycle, product catalogue, pricing ownership, contract workflow, support access, finance boundaries and retention.

**Phase B — Minimum internal control plane:** product catalogue, CRM, opportunities, customer organizations, tenant registry reference, contract/order records, plan/seat catalogue, trial/subscription visibility and executive dashboard.

**Phase C — Delivery and support operations:** onboarding, implementation projects, support desk, incident/problem, knowledge base, customer success and communication history.

**Phase D — Engineering and release operations:** repository/PR/build/release references, QA evidence, deployment approvals, product telemetry and change management.

**Phase E — Finance and people:** accountant-approved company accounting/billing integration, project costing, internal people/access workflows and profitability.

Do not build every module at once. Deliver vertical slices with acceptance tests and operational ownership.

## 11. Acceptance gates before implementation

1. Owner approves internal operating model and initial module scope.
2. Internal roles/permissions matrix and separation from tenant identities is reviewed.
3. CRM/customer/tenant/product/contract/subscription relationship model is validated.
4. Seat, trial, pricing, renewal, suspension and retention policies are approved.
5. Support-access threat model and consent/approval flow are signed off.
6. Accountant/legal review company invoicing, tax, revenue and finance workflows.
7. API contracts, outbox/retry/idempotency and reconciliation design are reviewed.
8. Security threat model, audit, backup, recovery and data retention are approved.
9. Each phase has acceptance tests, migration plan and rollback where applicable.
10. Existing MALVIA Sales production behavior remains untouched until a separate integration plan and explicit authorization are approved.

## 12. Open decisions for owner review

| ID | Decision | Recommended starting point | State |
|---|---|---|---|
| MCM-DEC-01 | Initial internal modules for first release | Portfolio + CRM + Customer/Tenant Registry + Subscription visibility + Executive dashboard | OPEN |
| MCM-DEC-02 | Internal employee accounts | Separate internal identity realm; MFA for privileged roles | OPEN |
| MCM-DEC-03 | Commercial authority | Owner approves price exceptions, contract deviations and refunds above configurable limits | OPEN |
| MCM-DEC-04 | Support access | No standing customer-data access; time-limited, reason-coded and audited grant | OPEN |
| MCM-DEC-05 | Billing/payment integration | Select provider only after fees, Egypt availability, reconciliation and legal review | OPEN |
| MCM-DEC-06 | Company finance | Accountant-approved chart, tax treatment and posting workflow before live finance | OPEN |
| MCM-DEC-07 | Internal vs customer HR | Internal people operations separated from customer-facing HR product | OPEN |
| MCM-DEC-08 | Initial customer portal boundary | Portal handles customer profile, subscriptions, entitlements, tickets and downloads; tenant business operations stay in products | OPEN |

## 13. Explicit non-goals and authorization boundary

This document does not authorize:
- SQL/DDL, schema migrations or database provisioning.
- Runtime code or changes to MALVIA Sales/Restaurant or customer tenants.
- Production deployment, DNS changes, public website publication or trial activation.
- Customer-data access, support impersonation or credential configuration.
- Payment collection, legal contracts, tax filings or statutory accounting postings.

The next approval step is to confirm Phase B scope and resolve MCM-DEC-01 through MCM-DEC-04. Only then should the logical ERD and API contract for MCM be prepared. All implementation remains separately gated.


## Phase B scope and acceptance criteria

- [MALVIA Company Management — Phase B Scope & Acceptance Criteria](MALVIA-COMPANY-MANAGEMENT-PHASE-B-SCOPE-v1.md) — detailed internal control-plane scope, role/capability proposal, KPI dictionary, CRM/tenant boundaries, seat/trial visibility, acceptance tests and implementation gates. Owner-authorized design elaboration only; runtime implementation remains separately gated.


## Phase B technical design artifacts

- [Phase B Logical ERD](MALVIA-COMPANY-MANAGEMENT-PHASE-B-LOGICAL-ERD-v1.md) — internal company bounded-context entities, cardinalities, ownership boundaries and integrity rules.
- [Phase B API Contracts](MALVIA-COMPANY-MANAGEMENT-PHASE-B-API-CONTRACTS-v1.md) — proposed internal API routes, authorization, request/response envelopes, idempotency, errors, Platform read-only integration and acceptance tests.

Both are design-only. They do not assert that endpoints exist or authorize schema, runtime, tenant lifecycle or Production changes.
