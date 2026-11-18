# MALVIA Company Management — B0 Remaining Decision Review Packet v1

**Status:** Prepared for explicit Owner / Security / Legal / Commercial / Platform review. **PROPOSALS ONLY — NO NEW POLICY IS APPROVED BY THIS DOCUMENT.**  
**Branch:** `docs/malvia-platform-design-package-v1`  
**Purpose:** Convert the remaining B0 blockers into reviewable, bounded choices with owners, recommended defaults, consequences and acceptance evidence. This packet does not close a decision merely by describing a recommendation.

**Related:** [B0 Design Lock](MALVIA-COMPANY-MANAGEMENT-PHASE-B0-DESIGN-LOCK-v1.md) · [Phase B Scope](MALVIA-COMPANY-MANAGEMENT-PHASE-B-SCOPE-v1.md) · [Traceability Matrix and proposed role permission matrices](MALVIA-COMPANY-MANAGEMENT-PHASE-B-TRACEABILITY-MATRIX-v1.md) · [API Contracts](MALVIA-COMPANY-MANAGEMENT-PHASE-B-API-CONTRACTS-v1.md) · [Architecture Decision Register](MALVIA-ARCHITECTURE-DECISION-REGISTER-v1.md)

## 1. Decisions already confirmed — do not reopen

The following are established requirements and are not proposals in this packet:

1. MALVIA is structured as **MALVIA Company / MALVIA Platform / independently selectable MALVIA Products**.
2. Phase B scope PB-01 through PB-07 was approved by the Owner on 2026-11-12 — scope only.
3. MALVIA internal identities and customer tenant identities are separate realms.
4. MFA is mandatory for every MALVIA internal account, without role exceptions.
5. Internal access uses job-role RBAC plus auditable employee-specific additional permissions; Company Owner is final authority.
6. The approved department responsibility baseline covers the 13 roles/functions recorded in B0.
7. Trial duration is 14 days; trial time is server-owned and cannot be reset by download, reinstall or device change. Exact clock semantics remain open.
8. Basic package = one owner account plus two employee accounts. Owner is not deducted from the two-employee allowance.
9. Branch count has no fixed cap and does not consume employee seats.
10. Platform is the source of truth for tenant/trial/subscription/effective-entitlement lifecycle. MCM Phase B consumes approved read-only metadata and cannot mutate that lifecycle.
11. Company finance is separate from customer tenant ledgers. Phase B does not access customer operational records.
12. No runtime, DDL, migration, account provisioning, merge or Production release is authorized.

## 2. Detailed role and permission baseline

The Traceability Matrix Sections 6A and 6B already contain the proposed resource/action matrix for all 13 role families. This packet does not duplicate or silently approve that matrix.

### 2.1 Required authorization model

Every protected action resolves server-side to:

`(internal principal, role grant, resource, action, scope, conditions)`

- Deny by default; UI visibility is never authorization.
- Scope is explicit and may include assigned product, customer/account, project, repository, environment, record and department.
- Customer/tenant operational content is not in the Phase B permission catalogue.
- Employee-specific grants can only add explicitly catalogued permissions; they cannot bypass mandatory separation-of-duties, scope, approval or environment boundaries.
- Self-grant is prohibited.
- Temporary grants require an expiry and automatic revocation.
- Grant, revoke, expiry, denial and privileged use create audit events.
- Company Owner is final authority. Delegation is explicit, scoped, time-limited and revocable; no implied delegation.
- Engineering cannot approve its own QA evidence or unilaterally promote Production. QA approval and Production promotion are separate permissions.
- Audit remains read-only and cannot approve or execute business commands.

### 2.2 Recommended grant/revoke governance — OWNER DECISION REQUIRED

| Choice | Proposal for review | State |
|---|---|---|
| Who can grant/revoke additional employee permissions? | Company Owner only initially. A delegated permission administrator may be introduced later only through a separately approved, narrowly scoped delegation. | PROPOSED |
| What can be granted? | Only permission codes in a centrally maintained catalogue; no free-form permission strings and no privilege escalation beyond the grantor's approved delegation. | PROPOSED |
| Duration | Permanent only where explicitly justified; otherwise time-limited with mandatory expiry. Sensitive/high-risk grants default to temporary. | PROPOSED |
| Self-grant | Always prohibited, including by Owner acting on their own employee identity; use a separate governed owner-level process if an emergency exception is ever needed. | PROPOSED |
| Conflict of interest | Requester cannot approve their own request. Requester/author cannot independently approve their own high-risk commercial, QA or release action. | PROPOSED |
| Audit | Record grantor, recipient, permission, scope, reason, approval, start/end, revocation, correlation ID and before/after state. | PROPOSED |
| Reviews | Periodic access recertification by Owner or delegated independent reviewer; revoke immediately on role change or termination. | PROPOSED |

**Acceptance evidence:** approved role-to-resource/action/scope matrix; named role owners; grant/revoke workflow; negative tests for self-grant, escalation, expired grants, cross-scope access and revoked access; audit evidence.

## 3. Internal identity, MFA, sessions and recovery

### 3.1 Fixed security requirements

- Separate internal identity realm, issuer and token audience from all customer tenant authentication.
- MFA required for every internal account.
- Verify issuer, audience, signature, expiry, not-before, session status and internal membership.
- Fail closed when identity or authorization services are unavailable.
- Do not create production internal credentials during design.
- Recovery must not bypass MFA with knowledge-only questions or support-agent discretion.

### 3.2 Provider selection — SECURITY + OWNER DECISION REQUIRED

No identity provider is selected by this packet. Select one only after a documented comparison covering:

- OIDC/OAuth standards support, issuer/audience controls and signing-key rotation.
- Mandatory MFA enforcement and supported phishing-resistant methods (prefer passkeys/WebAuthn where feasible), plus a controlled fallback.
- Enrollment, device replacement, lost-factor recovery and account recovery controls.
- Session revocation, token lifetime, refresh-token rotation and audit export.
- Admin separation, availability, data residency/privacy, incident response, cost and vendor exit/export.
- Test tenant, staging integration and documented recovery drills.

**Recommendation:** require phishing-resistant MFA as the preferred method, permit a separately approved fallback for users who cannot enroll it, and prohibit SMS as the sole factor for privileged internal access. This is a security recommendation, not an approved method/provider selection.

### 3.3 Session and device policy — SECURITY DECISION REQUIRED

| Topic | Recommended default for review | Approval needed |
|---|---|---|
| Concurrent sessions | One active session per internal user by default; exceptions only for a documented operational need. | Security + Owner |
| Session duration | Short-lived access token; rotating refresh session with configurable absolute and idle limits. Exact durations must be set after risk review. | Security |
| Revocation | Immediate server-side revocation on account disablement, role/grant change where relevant, factor reset or suspected compromise. | Security |
| Device registration | Record minimal device/session metadata; no invasive fingerprinting without privacy review. | Security + Legal |
| Lost device | Revoke affected session/device and require controlled re-authentication and MFA recovery. | Security |
| Break-glass | Disabled by default. If approved, named custodians, dual authorization, short expiry, alerting, post-event review and immutable audit. | Owner + Security |

**Acceptance evidence:** provider threat review; MFA enrollment/recovery test; cross-realm token rejection tests; session revocation tests; lost-factor drill; break-glass negative test; no account can enter protected routes without MFA.

## 4. Commercial approvals and separation of duties

### 4.1 No numeric limits are assumed

The system must support configurable thresholds, but this packet does not invent EGP values, discount percentages, contract values or approval tiers.

| Activity | Proposed preparation role | Proposed approval authority | Open owner choice |
|---|---|---|---|
| Quote creation and revision | Sales / Account Manager | Owner or explicitly delegated Executive above configured policy | Discount, margin and commitment thresholds |
| Price/discount exception | Sales prepares reason and impact | Owner until an exact delegation/threshold is approved | Numeric limits and permitted exception classes |
| Contract deviation / non-standard terms | Sales prepares; Legal review where applicable | Owner plus required Legal approval | Which clauses require Legal and/or dual approval |
| Commercial order acceptance | Sales prepares; checks quote/contract version | Owner/delegated approver per approved threshold | Value/risk thresholds and evidence |
| Plan catalogue or seat-price change | Subscription Operations prepares immutable version | Owner; Finance/Commercial review as required | Effective-date and review workflow |
| Refund, credit or commercial compensation | Authorized operator prepares evidence | Owner or independent delegated approver; maker-checker | Amount thresholds and accounting treatment |
| Payment execution / finance posting | Finance maker prepares | Separate checker/authorized finance approver | Accountant-approved limits and bank controls |

**Recommended safe default:** until thresholds and delegation are approved, route all exceptions and all non-standard commitments to Company Owner; do not infer authority from job title. Keep preparation, approval and execution separate for high-risk actions. The person who prepared a transaction cannot approve it where maker-checker applies.

**Acceptance evidence:** signed threshold table; delegated approver register with scope and expiry; self-approval tests; immutable approval decisions; audit reconciliation; proof that approval/order does not provision tenants, activate trials, issue invoices or collect payment.

## 5. Support access and customer-data boundary

**Phase B fixed boundary:** MCM has no access to customer operational records, tenant databases, customer ledgers or arbitrary impersonation. Support may use ticket metadata and sanitized diagnostics only.

For a future exceptional support-content access process, the proposed minimum controls are:
- customer/tenant and exact resource scope;
- specific support purpose and ticket/reference;
- explicit customer consent where required;
- independent approver and emergency policy;
- time-limited least-privilege grant;
- visible session banner and recorded actions;
- immediate revocation and immutable audit;
- no access to credentials, payment secrets or unrelated records.

**Decision:** keep exceptional customer-content access disabled for Phase B. Any future enablement requires Owner + Security + Legal approval and a separate scope change. This is consistent with the approved Phase B exclusion; it does not authorize a support-access feature.

## 6. Trial clock, bundle, seats and expiry

### 6.1 Confirmed commercial invariants

- Trial duration: 14 days.
- Server-owned start/end timestamps; download, reinstall, browser reset or device change cannot start/reset it.
- Basic allowance: one owner + two employee accounts.
- Branch count is uncapped by a fixed system limit and is not a seat meter.
- Trial bundle, verification, expiry, grace, retention and additional-seat prices are not yet approved.

### 6.2 Exact 14-day clock — OWNER + PRODUCT DECISION REQUIRED

Two coherent options:

| Option | Meaning | Consequence |
|---|---|---|
| A — 336 elapsed hours | Ends exactly 336 hours after the server activation instant, stored and compared in UTC. | Consistent duration across timezones and daylight-saving changes; local display may show a different wall-clock time. |
| B — 14 tenant-local calendar days | Ends at the defined local-time boundary on the 14th calendar day using the tenant's configured timezone. | Easier calendar explanation; requires explicit boundary and daylight-saving rules. |

**Recommendation:** Option A (336 elapsed hours) for deterministic server enforcement, with UTC storage and tenant-local display. This remains a recommendation until Owner + Product explicitly select it.

Activation should occur once, atomically, after the approved verification/setup gate. Pending setup does not consume trial time. Repeated activation requests are idempotent and cannot extend the end timestamp.

### 6.3 Trial contents and seat allowance — OWNER + COMMERCIAL DECISION REQUIRED

- Trial bundle must be product-specific and versioned.
- The user selects a product/industry; only that product and explicitly approved shared starter modules are enabled.
- Do not assume all products, modules, AI quotas, storage, API limits or integrations are included.
- The confirmed basic package owner+2 allowance is not automatically proof that the free trial has identical quotas. Explicitly decide whether the trial uses the same allowance.
- No card requirement, verification provider, add-on seat price or higher-tier price is assumed.

**Recommendation:** trial starts with the selected product plus a named starter-module bundle; represent the bundle as a versioned catalogue entry. Decide the exact included modules and whether owner+2 applies to trial before launch.

### 6.4 Expiry and data retention — OWNER + LEGAL + SECURITY DECISION REQUIRED

The following options must be selected as one coherent lifecycle policy:

1. Immediate access suspension at expiry.
2. New writes disabled while owner read-only access remains for a grace period.
3. Read-only plus owner export for a defined grace period, followed by retention/archive.
4. Reactivation behavior and treatment of data/entitlements.
5. Retention schedule, deletion authorization, legal hold, backup expiry and customer-requested deletion.

**Recommended safe posture:** at expiry, stop new business writes, preserve records, provide owner read-only/export access for a defined grace window, and never delete solely because the trial expired. A 30-day grace/retention proposal appears in the architecture register as a suggestion only; it is not approved and must not become a code default. Legal hold and statutory obligations override routine deletion.

**Acceptance evidence:** state-transition table; UTC/timezone tests; expiry boundary tests; grace/export authorization tests; retention/deletion simulation; legal-hold override; proof that download/reinstall cannot reset trial; audit evidence for every lifecycle event.

## 7. CRM privacy, audit and evidence retention

### 7.1 CRM data minimization

- Collect only contact and organization data needed for the stated sales/customer-success purpose.
- Separate business contact data from sensitive personal/identity data.
- Optional tax/registration identifiers are not required by default.
- Restrict contact details, notes, attachments, exports and deletion actions by field/resource scope.
- Record purpose/source and consent or other approved legal basis where applicable.
- Support correction, export and deletion workflows only under an approved retention/legal policy.
- Do not place customer records, credentials or financial details in analytics or general application logs.

**Owner + Legal/Privacy must approve:** data categories, purpose/legal basis, notice/consent, retention by category, data-subject requests, cross-border/vendor handling, export and deletion workflow.

### 7.2 Audit and attachments

Required audit event fields for sensitive actions: actor, actor role/grant, action, target, scope, reason, approval reference, timestamp, correlation ID, outcome and before/after reference where safe. Never log passwords, MFA secrets, access tokens, payment secrets or unnecessary personal payloads.

**Security + Legal decisions still required:** retention period by event class, tamper-evidence mechanism, privileged audit-reader access, export format, attachment classification/storage, malware scanning, download-grant expiry and legal hold.

No retention duration or source-IP/device fingerprint collection is approved here.

## 8. Product maturity and executive KPIs

### Product availability

- Available requires version-specific QA, security, support, documentation, backup/restore and release evidence appropriate to the product.
- Product Portfolio coordinates evidence; Engineering supplies technical evidence; QA independently verifies; Security reviews security evidence; Owner or separately delegated release authority approves the maturity transition.
- The maturity transition does not itself publish a website listing, activate a download or deploy Production.
- Product statuses remain Planned / In Development / Private Pilot / Available / Deprecated.

**Owner + Product + QA + Security must approve:** exact evidence checklist, mandatory signatories, exception handling and publication/release separation.

### Executive KPI contract

Every KPI must define owner, formula, numerator/denominator, currency basis, time window, timezone, source of truth, filters, freshness SLA, unknown/stale behavior and reconciliation test.

**Recommendation:** use UTC for storage and a configured company reporting timezone for display; never aggregate different currencies without an approved FX source/rate/time policy. Finance approves financial KPI formulas; Product/Operations approves operational KPI formulas; Owner approves the executive set.

No KPI formula, exchange rate, timezone or freshness SLA is approved by this packet.

## 9. MALVIA Company ↔ Platform ↔ Products integration contract

### 9.1 Authority boundaries

| Layer | Owns | Must not own |
|---|---|---|
| MALVIA Company | Corporate users/roles, portfolio governance, CRM, commercial preparation, internal approvals, company finance and corporate reporting | Tenant operational records, live tenant entitlement decisions or product business ledgers |
| MALVIA Platform | Tenant identity/membership, tenant lifecycle, trial activation/expiry, subscriptions, effective entitlements, seat enforcement and cross-product tenant/branch registry | Corporate CRM authority, product business transactions or MALVIA corporate finance |
| MALVIA Products | Product-specific business operations, records, workflows and tenant ledgers | Corporate staff identity, corporate CRM source of truth or unilateral subscription/entitlement policy |

### 9.2 Phase B integration rules

1. MCM calls a versioned internal Platform read API using a dedicated service identity with least privilege.
2. Platform remains the sole source of truth for tenant, trial, subscription, seat usage and effective entitlement status.
3. MCM stores opaque references and minimal approved metadata snapshots with source, observed-at time, version and freshness state.
4. Customer organization ↔ tenant mapping must be verified, auditable and support one-to-many where a customer has multiple tenants/products.
5. Stale/unavailable data is shown as Stale/Unknown/Unavailable; never infer Active, Expired or zero.
6. No MCM Phase B POST/PATCH/DELETE to Platform lifecycle endpoints; no tenant provisioning, trial activation/reset/extension/conversion/suspension, subscription mutation or entitlement writes.
7. Products enforce entitlements server-side using Platform authority; an MCM snapshot is not an authorization token.
8. Product operational data remains in its product/tenant boundary. No cross-product direct database joins.
9. Integration uses explicit API contracts, schema/version compatibility, timeouts, retries with idempotency where relevant, correlation IDs, reconciliation and alerting.
10. Events may notify MCM of changes, but event payloads are not a replacement for authoritative read/reconciliation. Events must be authenticated, versioned, replay-safe and contain only approved metadata.

### 9.3 Platform approval checklist — PLATFORM ENGINEERING + OWNER

- API owner and service identity.
- Versioned endpoint list and schema.
- Allow-listed fields for tenant/trial/subscription/entitlement snapshots.
- Verified customer-to-tenant linking and correction workflow.
- Freshness SLA, source timestamp and stale threshold.
- Authentication, authorization, key rotation and network boundary.
- Rate limits, timeouts, retries, idempotency and circuit behavior.
- Event/reconciliation model and operational ownership.
- Contract tests, cross-tenant negative tests and evidence that lifecycle mutation is impossible from MCM.

No endpoint, API version, service credential, network path or production integration is approved by this design packet.

## 10. Consolidated approval ledger

| ID | Decision | Decision owner(s) | Current state |
|---|---|---|---|
| B0-R01 | Permission catalogue, scopes, grant/revoke, delegation and conflict rules | Owner + Security | PROPOSAL PREPARED — approval pending |
| B0-R02 | Identity provider, MFA methods/enrollment/recovery | Owner + Security | PROPOSAL PREPARED — approval pending |
| B0-R03 | Session/device and break-glass policy | Security + Owner | PROPOSAL PREPARED — approval pending |
| B0-R04 | Commercial thresholds, delegation and maker-checker | Owner + Finance/Commercial + Legal as applicable | PROPOSAL PREPARED — approval pending |
| B0-R05 | Exceptional support access | Owner + Security + Legal | Phase B content access remains excluded; future policy approval pending |
| B0-R06 | 14-day clock semantics | Owner + Product | Options and recommendation prepared — selection pending |
| B0-R07 | Trial bundle, trial seats, verification and payment-card requirement | Owner + Commercial + Product | Proposal prepared — approval pending |
| B0-R08 | Expiry, grace, export, retention, deletion and legal hold | Owner + Legal + Security | Proposal prepared — approval pending |
| B0-R09 | Additional seats, higher tiers and user categories | Owner + Commercial | Proposal prepared — approval pending |
| B0-R10 | CRM privacy, consent/legal basis and retention | Owner + Legal/Privacy | Proposal prepared — approval pending |
| B0-R11 | Audit, attachment and idempotency retention/tamper evidence | Security + Legal + Engineering | Proposal prepared — approval pending |
| B0-R12 | Product maturity evidence and release authority | Owner + Product + QA + Security | Proposal prepared — approval pending |
| B0-R13 | KPI formulas, reporting timezone, currency and freshness | Owner + Finance + Product | Proposal prepared — approval pending |
| B0-R14 | Platform read API, metadata allow-list, freshness and tenant mapping | Platform Engineering + Owner | Proposal prepared — approval pending |

## 11. Required acceptance evidence before B0 can close

B0 remains **PREPARED — NOT APPROVED FOR IMPLEMENTATION** until:
- Each applicable decision row above has exact selected wording, approver role, date, conditions and evidence recorded in the authoritative decision register.
- Permission matrix and separation-of-duties tests are accepted.
- Security approves the identity/MFA/session/recovery policy and test evidence.
- Owner/Commercial approves trial bundle, seats, pricing boundaries and commercial authority.
- Owner/Legal/Security approves expiry, privacy, retention and deletion.
- Platform Engineering approves the read contract and proves lifecycle write paths are absent.
- Product/QA/Security approve maturity evidence and KPI/source ownership.
- The B0 checklist and all linked documents agree on each status.

Approval of B0 for B1 planning/implementation is still separate from authorization to implement each slice. DDL, migrations, credentials, runtime, tenant lifecycle changes, merge and Production deployment each require separate explicit authorization.

## 12. Explicit non-authorization

This packet authorizes documentation review only. It does not authorize:
- any identity provider purchase/configuration, employee account or credential creation;
- runtime/API implementation, SQL/DDL, database provisioning or migrations;
- Platform lifecycle mutations, tenant provisioning, trial activation/extension/expiry enforcement or entitlement writes;
- customer operational-data access, impersonation or support-content access;
- payment processing, contracts, statutory invoices, tax postings or refunds;
- website publication, product availability claims, download publication;
- PR merge, deployment or any Production change.
