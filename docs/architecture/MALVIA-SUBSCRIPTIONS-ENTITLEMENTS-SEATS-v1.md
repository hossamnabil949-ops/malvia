# MALVIA Subscription, Entitlement & User Seat Model — v1

**Status:** Commercial/technical proposal. Proposed defaults are not approved pricing or legal policy.

## 1. Principles

- Subscription belongs to a tenant, not to a device, download, branch or employee profile.
- Licensing is user-seat based. No fixed branch ceiling is assumed.
- Purchased industry packs, shared modules and optional features are explicit entitlements.
- Server state is authoritative. Client cache is a convenience only.
- Trial duration is 14 calendar days, measured by server timestamps and tied to the tenant.
- Trial-to-paid conversion preserves the same tenant, users, IDs, records and history.

## 2. Seat model

A seat is a licensed active user membership in a tenant. Track:
- purchased seat quantity;
- assigned active seats;
- pending invitations (do not consume an active seat until accepted, unless later policy says otherwise);
- suspended/inactive memberships;
- effective start/end and audit history.

Suggested enforcement:
- Owner may invite users only when an available seat exists.
- Activation is atomic: invitation acceptance checks current seat availability again.
- Deactivation releases a seat but retains identity, historical attribution and audit records.
- Re-activation consumes a seat again.
- Concurrent invitations/acceptance must not over-allocate seats.
- Shared identity across tenants does not imply a shared seat; each tenant membership consumes that tenant's entitlement.
- Branch count is independent of seat quantity. A user can be assigned to one, several or all tenant branches, subject to permission.

No price, minimum seat quantity, free owner seat, or hard limit is finalized here.

## 3. Entitlement structure

Resolve effective access from a versioned entitlement ledger:
- **Industry pack:** e.g. restaurant, auto parts/service, supermarket/retail, clothing, pharmacy.
- **Shared modules:** POS, inventory, purchasing, finance, HR, workflow, reports, etc.
- **Optional features:** advanced reports, loyalty, integrations, AI quota, multi-currency, advanced traceability.
- **Usage limits:** only where commercially defined (AI quota, storage, API volume, locations if ever approved).

Each entitlement records tenant, code, status, source (trial, subscription, promotion, manual grant), effective interval, quantity/limit, version, and audit actor. Dependencies are declarative; server denies operations when required entitlements are inactive. A tenant may not gain access by editing browser storage or calling an API directly.

## 4. Subscription lifecycle

Proposed states: `TRIAL_PENDING`, `TRIAL_ACTIVE`, `TRIAL_EXPIRED`, `PENDING_PAYMENT`, `ACTIVE`, `PAST_DUE`, `GRACE`, `SUSPENDED`, `CANCELLED`, `ENDED`.

State transitions must be server-owned, timestamped and auditable. Subscription changes create ledger entries; never overwrite history without an amendment event. Renewal and plan changes are effective-dated. Proration/refund/tax/invoice policy is not defined by this document.

## 5. 14-day trial

- Trial starts only after tenant creation and required verification/activation, not on installer download or first device launch.
- Store `trialStartedAt`, `trialEndsAt`, activation source and verification evidence/status server-side.
- Reinstalling, changing device, clearing browser cache or creating another user cannot reset the same tenant's trial.
- Duplicate tenant abuse controls and identity verification are policy/provider decisions.
- Trial entitlements are a snapshot with version and exact expiry.
- Conversion upgrades the same tenant; no data copy into a new tenant.
- All client types use the same server entitlement response.

Trial seat allowance and included pack/modules are still open. Three active users and one selected industry pack with starter shared modules are merely candidate defaults, not approved commitments.

## 6. Expiry, grace and data retention — unresolved policy

The system must support configurable policy but must not assume:
- immediate lockout vs grace period;
- read-only access after expiry;
- export access duration;
- data retention/deletion schedule;
- restoration/reactivation behavior;
- legal hold and customer-requested deletion.

Recommended safe product posture for review: stop new business writes after expiry while preserving data; offer controlled owner export and a clearly disclosed retention window. This is not an adopted policy until commercial, legal and security approval. Never automatically delete tenant data merely because a trial ended.

## 7. Billing and payment ledger

Separate:
- subscription contract and plan version;
- entitlement grants;
- billing periods and invoices;
- payment attempts/receipts/refunds;
- credits/adjustments and tax;
- dunning/renewal events.

A payment provider webhook must be signature-verified, idempotent and reconciled to tenant/invoice. Manual grants/compensation require reason, actor, expiry and audit. Payment methods/provider and Egypt-specific tax/e-invoice requirements need finance/legal review.

## 8. API and security contract

- `GET /api/tenant/entitlements`: authenticated tenant membership; returns effective packs/modules/features, seat usage and version.
- `POST /api/subscriptions/trial/activate`: server checks verification, tenant eligibility and idempotency; never accepts client-supplied start/end timestamps.
- `POST /api/subscriptions/checkout`: creates a server-owned checkout session against a quoted plan version.
- `POST /api/subscriptions/webhook`: provider signature validation + idempotent event receipt.
- `POST /api/tenant/invitations`: requires owner/admin permission and available seats.
- Every protected command checks tenant, membership, seat, module/feature entitlement, branch scope and resource permission server-side.

License keys/device fingerprints alone are not user authentication or authority to export tenant data.

## 9. Migration compatibility

Existing `maxEmployees` is not automatically reinterpreted as a purchased seat ledger. Existing tenant license and employee data must be inventoried, mapped to an explicit migration decision and reconciled. No user is silently deactivated and no tenant's module access is silently narrowed. Trial start dates cannot be fabricated from first-seen device timestamps.

## 10. Commercial decisions requiring approval

1. Seat pricing, minimum purchase, owner seat and treatment of inactive users.
2. Trial seat quantity and included modules/industry pack.
3. Verification methods and provider.
4. Renewal cadence, grace duration, late fees, cancellation and refund.
5. Expiry access mode and export window.
6. Data retention/deletion/legal hold.
7. Payment provider(s), currencies, tax and e-invoicing.
8. AI quota, storage, API and integration usage limits.
9. Whether any future plan limits branches or registers (current design assumes no fixed branch cap).

**Gate:** No billing, license migration or enforcement changes until commercial/legal decisions are approved.
