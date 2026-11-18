# MALVIA Company Management — Phase B1 Kickoff & Readiness Plan v1

**Status:** B1 DESIGN / PREPARATION AUTHORIZED by Owner on 2026-11-19. **Implementation remains gated.**  
**Branch:** `docs/malvia-platform-design-package-v1`  
**Parent:** [B0 Design Lock](MALVIA-COMPANY-MANAGEMENT-PHASE-B0-DESIGN-LOCK-v1.md) · [Phase B Scope](MALVIA-COMPANY-MANAGEMENT-PHASE-B-SCOPE-v1.md) · [Traceability Matrix](MALVIA-COMPANY-MANAGEMENT-PHASE-B-TRACEABILITY-MATRIX-v1.md) · [B0 Decision Review Packet](MALVIA-COMPANY-MANAGEMENT-B0-DECISION-REVIEW-PACKET-v1.md)

## 1. Authorization and phase boundary

The Owner explicitly closed the B0 design-review phase and authorized proceeding to B1 on 2026-11-19.

This authorization permits B1 design, specification, threat-modeling, UX/workspace definition, test planning and readiness review. It does **not** authorize runtime code, database creation, SQL/DDL, migrations, production credentials, employee account provisioning, tenant lifecycle commands, customer operational-data access, merge or Production deployment.

B1 is the internal identity and workspace foundation for MALVIA Company Management. It must remain a standalone project/bounded context, separate from MALVIA Sales and customer tenant identity realms.

## 2. B1 objective

Prepare a secure internal workspace foundation with:
- A dedicated MALVIA internal identity realm, issuer and token audience.
- Mandatory MFA for every internal account.
- Server-enforced job-role RBAC plus approved, auditable employee-specific permission grants.
- Explicit resource/action/scope authorization and deny-by-default behavior.
- A permission-filtered workspace shell and navigation model.
- Auditable session, recovery, privileged-action and access-denial policies.
- Clear separation between identity, authorization, workspace presentation and business capabilities.

No real internal account or production credential is created during this design stage.

## 3. B1 work packages

### B1.1 — Identity architecture decision
**Research complete; provider not selected.** See [B1.1 Identity Provider Evaluation](MALVIA-COMPANY-MANAGEMENT-B1-IDENTITY-PROVIDER-EVALUATION-v1.md). ZITADEL is the preferred candidate for proof-of-fit, Keycloak is the self-hosted fallback, and WorkOS remains conditional because its hosted AuthKit MFA requirement does not apply to SSO users. This is a recommendation only, not an approval.

Next: define a provider-neutral identity boundary and run identical synthetic-account tests for realm isolation, universal MFA, recovery, session revocation, signing-key rotation and audit export.

Compare OIDC/OAuth support, issuer/audience isolation, MFA enforcement, recovery controls, session/device management, audit/export capabilities, regional availability, vendor risk, portability and exit strategy.

**Approval gate:** Owner + Security select the provider and approve the identity architecture, MFA methods, enrollment, recovery, session/device and break-glass policies.

### B1.2 — Authorization policy and permission catalogue
Convert the approved role families and traceability matrix into a normalized permission catalogue:
- Principal and active internal membership.
- Role grants and role lifecycle.
- Permission code, resource, action and scope.
- Employee-specific additional grants.
- Grant/revoke authority, delegation and expiry.
- Self-grant prevention and separation-of-duties constraints.
- Deny precedence, revocation propagation and policy versioning.

**Approval gate:** Owner + Security approve exact permission codes/scopes, grant/revoke workflow, delegation, conflict-of-interest rules and audit requirements. The existing owner-approved RBAC direction remains valid; detailed controls are not assumed approved.

### B1.3 — Session, recovery and privileged access
Specify session issuance/refresh/revocation, concurrent-session behavior, device enrollment, lost-device recovery, MFA reset, account disablement, emergency access and security-event handling. Recovery must not bypass MFA through knowledge-only questions or informal support discretion.

**Approval gate:** Security + Owner approve the complete policy and negative-test evidence.

### B1.4 — Workspace shell and navigation
Define the responsive internal application shell:
- Company identity and environment indicator.
- User profile, session/security status and sign-out.
- Permission-filtered navigation for Executive Overview, Portfolio, CRM, Commercial, Platform Operations and Audit & Exceptions.
- Access-denied, unavailable, stale-data and pending-approval states.
- Accessible desktop/mobile behavior and localization-ready layout.

The shell is a presentation layer only. Hidden navigation is never an authorization control; every API action must enforce server-side policy.

### B1.5 — Audit and observability contract
Specify immutable security-relevant event fields, correlation IDs, actor/role/grant snapshots, outcomes, before/after references, retention classes, access to audit records, alerting and secret/personal-data redaction.

**Approval gate:** Security + Legal/Privacy approve retention, tamper-evidence, audit-reader scopes and privacy controls before implementation.

### B1.6 — Acceptance and threat-test plan
Prepare executable test specifications for:
- Tenant token rejected by every internal endpoint.
- Internal token rejected by tenant endpoints.
- Missing/invalid MFA rejected.
- Wrong issuer/audience/signature/expiry rejected.
- Disabled user and revoked session rejected.
- Default-deny for unknown permission/resource/action/scope.
- Cross-department, cross-product, cross-customer and cross-project scope violations rejected.
- Self-grant, privilege escalation, expired grant and revoked grant rejected.
- Delegation expiry and separation-of-duties enforced.
- Audit events emitted without secrets.
- Workspace navigation and API authorization remain consistent.

## 4. Required B1 deliverables

1. Identity-provider comparison and decision record.
2. Internal identity and token-boundary specification.
3. MFA enrollment/recovery/session/device/break-glass policy.
4. Permission catalogue and role-to-resource/action/scope matrix.
5. Grant/revoke/delegation and separation-of-duties workflow.
6. Workspace shell UX specification and navigation map.
7. Audit/security event schema and retention proposal.
8. Threat model, negative-test catalogue and acceptance matrix.
9. B1 readiness report identifying approved, pending and blocked items.

## 5. Dependencies and blockers

The following are not silently resolved by B0 closure:
- Identity provider and all MFA/session/recovery/break-glass details.
- Exact permission catalogue and scope filters.
- Who may grant/revoke additional permissions and under what delegation.
- Self-grant and conflict-of-interest handling.
- Audit retention, tamper evidence and privileged audit-reader access.
- Legal/privacy approval for personal data and event retention.

B1 design work may proceed in parallel where it does not prejudge these decisions. Any implementation slice that depends on an unresolved decision remains blocked until the named approver records the exact choice.

## 6. Definition of Ready for B1 implementation

B1 implementation may be proposed only when:
- Identity provider and identity boundary are approved.
- Universal MFA is enforceable with approved enrollment and recovery.
- Session/device and account-disable/revocation behavior are approved.
- Role/resource/action/scope permission catalogue is approved.
- Grant/revoke/delegation/self-grant/separation-of-duties rules are approved.
- Audit schema, access, retention and tamper-evidence requirements are approved.
- Threat model and negative tests are reviewed by Security.
- Workspace UX and accessibility/localization acceptance criteria are approved.
- A separate implementation authorization is explicitly recorded.

Passing this checklist does not authorize merge or Production release; those remain separate approvals.

## 7. Non-goals

B1 does not implement CRM, product portfolio operations, commercial approvals, tenant registry integration, trial/subscription lifecycle, customer support access to tenant content, company finance or any MALVIA Sales feature. These remain later Phase B slices under the approved scope and their own gates.

## 8. Change control

Any new capability, cross-realm identity mapping, customer-content access, Platform lifecycle mutation or shared-database dependency requires a recorded architecture decision and explicit approval before design or implementation changes.
