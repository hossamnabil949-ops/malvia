# MALVIA Company Management — B1.1 Identity Provider Evaluation v1

**Status:** Research and architecture recommendation — **NO PROVIDER SELECTED OR APPROVED**.  
**Prepared:** 2026-11-19  
**Branch:** docs/malvia-platform-design-package-v1  
**Parent:** [B1 Kickoff](MALVIA-COMPANY-MANAGEMENT-PHASE-B1-KICKOFF-v1.md) · [B0 Design Lock](MALVIA-COMPANY-MANAGEMENT-PHASE-B0-DESIGN-LOCK-v1.md)

## 1. Purpose and fixed requirements

Evaluate identity infrastructure for MALVIA Company Management (MCM), the standalone internal company system. The provider must not collapse the internal employee identity realm into MALVIA customer/tenant identities.

Already-approved requirements:
- MFA is mandatory for every MALVIA internal user, regardless of role.
- Internal and tenant identities, token issuers/audiences and authorization realms are separate.
- Internal authorization is job-role RBAC with additional auditable employee-specific grants; the Company Owner remains final authority.
- The identity provider authenticates principals. MCM's application authorization service remains authoritative for MCM roles, permission codes, resource/action/scope checks and approvals.
- No provider selection, tenant/account creation, credentials, runtime integration or production configuration is authorized by this evaluation.

## 2. Evaluation criteria

| Criterion | Required outcome |
|---|---|
| Protocol and portability | Standards-based OIDC/OAuth 2.0; Authorization Code + PKCE for browser clients; documented key rotation/JWKS and logout/revocation behavior |
| Realm isolation | Dedicated MCM identity tenant/instance/realm, issuer and audience; no shared user pool or implicit account linking with customer tenants |
| Universal MFA | Administratively enforce MFA for every internal principal, including privileged/admin users; enrollment gates and recovery cannot bypass the requirement |
| Strong factors | TOTP baseline plus WebAuthn/passkeys or security keys where supported; recovery codes and factor reset are controlled and audited |
| Session lifecycle | Short-lived access tokens, refresh rotation/reuse detection where supported, global and per-session revocation, account disablement, device/session inventory |
| Admin security | Strong MFA for provider administrators, least-privilege admin roles, protected emergency access and auditable configuration changes |
| Audit | Authentication, MFA enrollment/reset, session revocation, account lifecycle, admin/configuration events; export/API and defined retention |
| Resilience | Documented availability, backup/restore, disaster recovery, upgrade/patch process and operational ownership |
| Data/privacy | Data residency, subprocessors, encryption, retention/deletion, incident notice, contractual terms and regional suitability reviewed before adoption |
| Cost and exit | Current pricing and support terms validated; user/data export and migration path documented; no proprietary provider claim used as MCM authorization |

## 3. Candidate comparison

### 3.1 ZITADEL — preferred candidate for proof-of-fit

Documented capabilities:
- OIDC/OAuth2 and SAML support, multi-factor authentication, passkeys and audit trail.
- Cloud and self-hosted deployment choices.
- Published pricing currently describes a Free tier with 100 daily active users and a Pro tier starting at US$100/month with 25,000 daily active users included. Pricing and plan entitlements must be reconfirmed before procurement.

Advantages for MCM:
- Offers a path to start managed and retain a self-hosting option for a future control/residency requirement.
- Its documented MFA factors include TOTP, U2F/security keys, email OTP and SMS OTP; policy must explicitly disallow weak recovery channels as a substitute for required MFA.
- Has a documented Force MFA setting and passkey support.

Risks / validation required:
- Confirm exact plan-level availability of required MFA, audit, retention, custom domains, backup/export and support.
- Validate Cloud data location, DPA/subprocessors, service availability and recovery objectives.
- Validate self-hosted operational burden, upgrade process, backup/restore and commercial support/license terms.
- Test that every internal login path, including admin and recovery flows, enforces the approved MFA policy.

Official references:
- https://zitadel.com/docs
- https://zitadel.com/docs/guides/manage/console/default-settings
- https://zitadel.com/docs/concepts/features/passkeys
- https://zitadel.com/pricing
- https://zitadel.com/pricing/detail

### 3.2 Keycloak — strong self-hosted alternative

Documented capabilities:
- Open-source identity and access management, user federation, strong authentication and fine-grained authorization.
- Supports WebAuthn and OTP flows; its server administration guide documents how to require WebAuthn registration/authentication.

Advantages:
- Strong deployment and configuration control; no dependency on a proprietary hosted identity control plane.
- Broad standards and federation capabilities; potentially suitable if MALVIA needs to own the full identity runtime.

Risks / validation required:
- MALVIA owns hosting, upgrades, database, high availability, monitoring, security patching, backup/restore, key management and incident response.
- MFA flows are configurable and must be designed/tested carefully; misconfiguration can create bypasses or lockouts.
- Estimate engineering/on-call effort and total infrastructure cost rather than treating software license cost as total cost.

Official references:
- https://www.keycloak.org/
- https://www.keycloak.org/docs/latest/server_admin/
- https://github.com/keycloak/keycloak

### 3.3 WorkOS AuthKit — fast managed alternative, with a material MFA caveat

Documented capabilities:
- Hosted authentication, user/session management, MFA, organizations, SSO, RBAC features and audit-log products.
- Public pricing currently advertises AuthKit free up to 1 million users; SSO and Directory Sync are priced as separate connection-based products.

Material caveat:
- WorkOS documentation states that hosted AuthKit MFA uses authenticator-app TOTP and that the MFA requirement does not apply to SSO users.
- Because MCM's approved requirement is universal MFA for every internal account, this default behavior is not acceptable unless WorkOS confirms and demonstrates a supported configuration that enforces equivalent MFA assurance for every SSO path. Do not assume this can be solved by hiding the SSO button.

Advantages:
- Managed service reduces identity infrastructure operations.
- Useful enterprise SSO and directory integration path if MCM later requires them.

Risks / validation required:
- Obtain written clarification on MFA enforcement for SSO and all admin/recovery flows.
- Confirm audit retention/export, data residency, DPA, uptime/support and full cost for the actual MCM requirements.

Official references:
- https://workos.com/docs/authkit
- https://workos.com/docs/authkit/mfa
- https://workos.com/docs/authkit/sso
- https://workos.com/pricing

## 4. Preliminary assessment

| Dimension | ZITADEL | Keycloak | WorkOS AuthKit |
|---|---|---|---|
| Managed option | Yes | Not as the core open-source project | Yes |
| Self-host option | Yes | Yes | No equivalent self-hosted AuthKit control plane |
| Standards-based integration | OIDC/OAuth2, SAML | OIDC, SAML | OIDC/SAML integrations |
| MFA evidence | TOTP, U2F/passkeys and other factors; Force MFA documented | OTP and WebAuthn configurable | Hosted TOTP MFA; SSO exception documented |
| Audit evidence | Audit trail documented; plan/retention to verify | Admin/events available; design and operations are MCM-owned | Audit Logs product; pricing/retention to verify |
| Main trade-off | Verify plan details, hosting/privacy and operations | Highest self-managed operational responsibility | Managed speed, but SSO/MFA exception conflicts with universal MFA requirement |
| Current disposition | **Preferred for proof-of-fit** | **Viable alternative** | **Conditional / caveat unresolved** |

This is a qualitative architecture screen, not a security certification, vendor endorsement or procurement decision.

## 5. Recommended architecture independent of provider

1. Create a dedicated MCM identity instance/tenant/realm and dedicated OIDC client(s); do not reuse MALVIA Sales or customer-product identity clients.
2. Use Authorization Code + PKCE for browser-based sign-in. Validate issuer, audience, signature, expiry, nonce/state and authorized algorithms server-side.
3. Keep provider subject (issuer + subject) as the external identity key. Maintain MCM employee, department, role and permission records in the MCM domain; do not encode the full permission matrix as long-lived token claims.
4. MCM API authorization must check active employee status, current role grants, individual grants, scope and revocation state on every protected operation. Navigation visibility is not security enforcement.
5. Require MFA at the identity policy layer for all internal users; block application access until enrollment is complete. Recovery/factor reset must be separately authenticated, approved and audited.
6. Use separate service identities and audiences for machine-to-machine access. No employee browser token is accepted as a Platform or customer-tenant service credential.
7. Keep an exit path: provider-neutral OIDC integration, stable MCM subject mapping, documented user/factor migration limitations, and no direct dependency on proprietary role semantics.

## 6. Proof-of-fit test plan

Before selection, test each viable candidate in an isolated non-production evaluation environment using synthetic accounts only:

- Internal issuer/audience is accepted by MCM test API; customer-tenant issuer/audience is rejected.
- MCM issuer/audience is rejected by customer-tenant test API.
- MFA is required for standard, executive and provider-admin accounts.
- Login is denied before MFA enrollment and after factor removal until a secure re-enrollment/recovery path completes.
- Recovery cannot silently disable MFA or allow password-only access.
- Revoked session, disabled account and expired token are rejected.
- Refresh-token replay/rotation behavior is tested where supported.
- Signing-key rotation and JWKS cache refresh work without accepting invalid signatures.
- Admin actions, factor resets, login failures and session revocations appear in auditable logs.
- Backup/export and restore or vendor recovery procedures are demonstrated.
- Provider outage and lost-device scenarios are documented and rehearsed.

## 7. Recommendation and decision gate

**Recommendation:** advance ZITADEL to the first proof-of-fit evaluation, keep Keycloak as the self-hosted fallback, and keep WorkOS conditional until the universal-MFA/SSO behavior is resolved.

**Not approved yet:** provider selection, hosting mode, subscription, identity-domain/custom-domain choice, MFA factor policy, session lifetime, recovery policy, break-glass process, data residency, retention or production use.

**Approvers required:** Owner + Security. Legal/Privacy and Engineering must complete vendor, data-processing and operational reviews before any production adoption.

**Next B1.1 action:** prepare a provider-neutral identity boundary and test harness specification, then run the same synthetic-account acceptance tests against the shortlisted candidates. Record the selected provider only after explicit Owner + Security approval.

## 8. Sources and review date

Official vendor documentation and pricing pages listed above were reviewed on 2026-11-19. Vendor features, plan limits, pricing and terms can change; reconfirm directly before procurement or implementation.
