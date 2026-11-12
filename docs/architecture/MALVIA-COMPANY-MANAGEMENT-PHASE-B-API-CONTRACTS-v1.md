# MALVIA Company Management — Phase B API Contracts v1

**Status:** Contract design only — no live endpoint is asserted to exist.  
**Parent scope:** [Phase B Scope & Acceptance Criteria](MALVIA-COMPANY-MANAGEMENT-PHASE-B-SCOPE-v1.md)  
**Logical model:** [Phase B Logical ERD](MALVIA-COMPANY-MANAGEMENT-PHASE-B-LOGICAL-ERD-v1.md)

## 1. Contract objectives and boundaries

Define versioned APIs for MALVIA's internal Company Management workspace. These are proposed contracts, not deployed endpoints.

- Internal Company Management APIs are served under a distinct internal API namespace and identity realm.
- Customer-facing product APIs and tenant operational APIs remain separate.
- Platform tenant/trial/subscription data is read through approved Platform service contracts. Internal MCM APIs expose read models only in Phase B.
- No endpoint in this phase provisions, suspends, impersonates, activates a trial, extends a trial, converts a subscription, changes entitlements or posts a payment.
- Every endpoint must enforce authorization on the server; client-side menu visibility is not security.
- All commands use explicit validation, audit and concurrency controls.

Proposed base namespace: `/internal/api/v1`. This is a design convention only; routing and hostnames are undecided.

## 2. Authentication and authorization

### 2.1 Authentication
- Authenticate through the separately approved MALVIA internal identity provider.
- Validate issuer, audience, signature, expiry, not-before, session state and internal realm membership.
- Customer tenant tokens must be rejected, even if the user has a similar email address.
- Privileged roles should require MFA; exact provider and recovery policy remain pending approval.
- Do not accept user IDs, roles, tenant IDs or scope claims from request bodies as proof of authority.

### 2.2 Authorization model

Permission tuple:

`(resource, action, scope, conditions)`

Examples:
- `crm.organization:read:assigned`
- `crm.organization:update:assigned`
- `commercial.quote:create:assigned`
- `commercial.quote:approve:company`
- `portfolio.product:publish:company`
- `platform.tenant-reference:read:authorized`
- `governance.audit:read:scoped`

Scope examples: `self`, `assigned`, `team`, `product`, `company`. Scope is resolved by the server from trusted grants and record relationships.

Sensitive actions require explicit policy checks:
- maker-checker separation for approval classes that require it.
- no self-approval where policy says independent approver.
- role grant changes require a separate permission and audit event.
- field-level masking for contact identifiers and confidential commercial values.

## 3. Common request and response conventions

### 3.1 Headers

| Header | Purpose |
|---|---|
| `Authorization: Bearer <token>` | Internal identity token |
| `X-Request-ID` | Caller-generated or gateway-generated request identifier |
| `Idempotency-Key` | Required for retryable create/command requests |
| `If-Match` | Expected resource version / ETag for optimistic concurrency |
| `Accept-Language` | Optional locale preference; does not affect stored values |

The gateway must create a request ID if missing. Correlation IDs are propagated across internal service calls and Platform read requests.

### 3.2 Success envelope

```json
{
  "data": {},
  "meta": {
    "requestId": "opaque-request-id",
    "correlationId": "opaque-correlation-id",
    "servedAt": "2026-11-12T10:00:00Z",
    "sourceFreshness": "current"
  }
}
```

List response:

```json
{
  "data": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  },
  "meta": {
    "requestId": "opaque-request-id",
    "servedAt": "2026-11-12T10:00:00Z"
  }
}
```

Use cursor pagination for mutable datasets. Cursors are opaque, signed, scope-bound and short-lived. Do not rely on offset pagination for audit/activity feeds.

### 3.3 Error envelope

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request could not be accepted.",
    "details": [
      {
        "field": "displayName",
        "reason": "REQUIRED"
      }
    ],
    "retryable": false
  },
  "meta": {
    "requestId": "opaque-request-id",
    "correlationId": "opaque-correlation-id"
  }
}
```

Never return stack traces, SQL, secrets, internal hostnames or raw provider errors.

### 3.4 Standard status mapping

| HTTP | Use |
|---|---|
| 200 | Successful read or update |
| 201 | Resource created |
| 202 | Accepted for asynchronous processing (only when explicitly supported) |
| 400 | Malformed request |
| 401 | Missing/invalid internal authentication |
| 403 | Authenticated but unauthorized |
| 404 | Missing or deliberately concealed out-of-scope resource |
| 409 | State conflict, duplicate, idempotency conflict or stale version |
| 412 | `If-Match` precondition failed |
| 422 | Valid syntax but invalid domain transition |
| 429 | Rate limit |
| 503 | Required upstream read service unavailable |
| 504 | Upstream timeout |

## 4. Proposed endpoint catalogue

All routes below are proposals. No claim is made that they are implemented.

### 4.1 Executive overview
- `GET /internal/api/v1/executive/overview?from=&to=&timezone=`
- `GET /internal/api/v1/executive/kpis/{kpiCode}?from=&to=&timezone=`
- `GET /internal/api/v1/executive/exceptions?cursor=&limit=`

Requirements:
- Return KPI definition/version, reporting period, calculation timestamp and source freshness.
- Return values by currency separately where applicable.
- If a source is unavailable or stale, return an explicit freshness state and nullable value; never substitute a fabricated zero.
- Drill-down links must be permission-filtered and must not reveal inaccessible record IDs.

### 4.2 Product portfolio
- `GET /internal/api/v1/products?state=&industry=&cursor=&limit=`
- `POST /internal/api/v1/products`
- `GET /internal/api/v1/products/{productId}`
- `PATCH /internal/api/v1/products/{productId}`
- `POST /internal/api/v1/products/{productId}/versions`
- `POST /internal/api/v1/products/{productId}/evidence`
- `POST /internal/api/v1/products/{productId}/maturity-transitions`

Maturity transition command requires:
- `targetState`
- `reason`
- `evidenceIds[]`
- `expectedVersion`

Transition to Available additionally requires required QA/security/support/release evidence and an authorized independent approval. This command does not publish a website listing or download artifact.

### 4.3 CRM
- `GET /internal/api/v1/leads?stage=&owner=&cursor=&limit=`
- `POST /internal/api/v1/leads`
- `GET /internal/api/v1/leads/{leadId}`
- `PATCH /internal/api/v1/leads/{leadId}`
- `POST /internal/api/v1/leads/{leadId}/qualify`
- `POST /internal/api/v1/leads/{leadId}/convert`
- `GET /internal/api/v1/organizations?query=&lifecycle=&owner=&cursor=&limit=`
- `POST /internal/api/v1/organizations`
- `GET /internal/api/v1/organizations/{organizationId}`
- `PATCH /internal/api/v1/organizations/{organizationId}`
- `GET /internal/api/v1/organizations/{organizationId}/contacts`
- `POST /internal/api/v1/organizations/{organizationId}/contacts`
- `GET /internal/api/v1/organizations/{organizationId}/activities`
- `POST /internal/api/v1/organizations/{organizationId}/activities`
- `GET /internal/api/v1/opportunities?stage=&owner=&productId=&cursor=&limit=`
- `POST /internal/api/v1/opportunities`
- `GET /internal/api/v1/opportunities/{opportunityId}`
- `PATCH /internal/api/v1/opportunities/{opportunityId}`
- `POST /internal/api/v1/opportunities/{opportunityId}/stage-transitions`

Duplicate detection returns candidate matches and reasons. It never merges records automatically. Organization merge is excluded from Phase B; if introduced later, it must be a separately authorized, reversible, audited command.

### 4.4 Commercial records
- `GET /internal/api/v1/opportunities/{opportunityId}/quotes`
- `POST /internal/api/v1/opportunities/{opportunityId}/quotes`
- `GET /internal/api/v1/quotes/{quoteId}`
- `POST /internal/api/v1/quotes/{quoteId}/versions`
- `POST /internal/api/v1/quotes/{quoteId}/submit-for-approval`
- `POST /internal/api/v1/quotes/{quoteId}/send`
- `GET /internal/api/v1/contracts?organizationId=&status=&cursor=&limit=`
- `POST /internal/api/v1/contracts`
- `GET /internal/api/v1/contracts/{contractId}`
- `POST /internal/api/v1/contracts/{contractId}/versions`
- `POST /internal/api/v1/contracts/{contractId}/submit-for-approval`
- `GET /internal/api/v1/orders?organizationId=&status=&cursor=&limit=`
- `POST /internal/api/v1/orders`
- `GET /internal/api/v1/orders/{orderId}`

Phase B commands create and track internal commercial records only. `send` means record a controlled proposal dispatch action if a messaging integration is separately configured; it is not an electronic signature or payment. Contract signed state must not be inferred from a file upload.

### 4.5 Approvals
- `GET /internal/api/v1/approvals/inbox?status=pending&cursor=&limit=`
- `GET /internal/api/v1/approvals/{approvalId}`
- `POST /internal/api/v1/approvals/{approvalId}/decisions`

Decision body:

```json
{
  "decision": "APPROVE",
  "reason": "Reviewed against the current approved commercial policy.",
  "expectedVersion": 3
}
```

The service derives the approver identity from the authenticated principal. It rejects self-approval when prohibited, stale approval versions, expired requests and decisions outside the caller's scope. A decision cannot be overwritten; correction requires a new governed event.

### 4.6 Plan and seat catalogue
- `GET /internal/api/v1/catalog/products/{productId}/plans`
- `POST /internal/api/v1/catalog/products/{productId}/plans`
- `GET /internal/api/v1/catalog/plans/{planId}/versions`
- `POST /internal/api/v1/catalog/plans/{planId}/versions`
- `GET /internal/api/v1/catalog/entitlements`
- `POST /internal/api/v1/catalog/plans/{planId}/versions/{versionId}/submit-for-approval`

Catalogue changes do not mutate active subscriptions. Approval and effective dates are required before a version can be offered commercially.

Confirmed basic seat representation:

```json
{
  "planCode": "BASIC",
  "seatAllowances": [
    { "seatType": "OWNER_ACCOUNT", "includedQuantity": 1, "billable": true },
    { "seatType": "EMPLOYEE_SEAT", "includedQuantity": 2, "billable": true }
  ],
  "branchLimit": null,
  "branchLimitMeaning": "UNLIMITED"
}
```

The owner is a distinct included account and is not subtracted from the two employee seats. Price fields for additional seats and higher tiers remain unapproved and must not be defaulted.

### 4.7 Platform read models (read-only)
- `GET /internal/api/v1/platform/tenant-references?organizationId=&status=&cursor=&limit=`
- `GET /internal/api/v1/platform/tenant-references/{referenceId}`
- `POST /internal/api/v1/platform/tenant-references/{referenceId}/verify-link`
- `GET /internal/api/v1/platform/trials?state=&expiresBefore=&cursor=&limit=`
- `GET /internal/api/v1/platform/trials/{trialReferenceId}`
- `GET /internal/api/v1/platform/subscriptions?state=&organizationId=&cursor=&limit=`
- `GET /internal/api/v1/platform/subscriptions/{subscriptionReferenceId}`
- `GET /internal/api/v1/platform/entitlements?tenantReferenceId=`

`verify-link` verifies the internal CustomerOrganization ↔ external tenant reference association only. It must not call tenant provisioning or modify Platform tenant state.

No POST/PATCH/DELETE endpoint is defined for trial or subscription lifecycle in Phase B. In particular, no trial activate, reset, extend, convert, suspend or delete endpoint is permitted.

### 4.8 Audit and attachments
- `GET /internal/api/v1/audit-events?actor=&targetType=&targetId=&from=&to=&cursor=&limit=`
- `GET /internal/api/v1/attachments/{attachmentId}/download-grant`

Audit reads require dedicated permissions and are scope-filtered. Download grants are short-lived and issued only after record and attachment authorization.

## 5. Command envelope and concurrency

All state-changing commands should include:
- stable `Idempotency-Key`;
- `If-Match` or `expectedVersion` for mutable aggregates;
- explicit command body and reason for sensitive transitions.

Example:

```http
POST /internal/api/v1/opportunities/opp_123/stage-transitions
Authorization: Bearer <internal-token>
Idempotency-Key: 3d9c...
If-Match: "v7"
Content-Type: application/json
```

```json
{
  "targetStage": "QUALIFIED",
  "reason": "Budget owner and intended product confirmed."
}
```

Idempotency contract:
1. Key is scoped to internal principal + command route + target aggregate.
2. First accepted request stores request hash and final outcome.
3. Same key + same canonical request returns the original outcome.
4. Same key + different request returns `409 IDEMPOTENCY_KEY_REUSED`.
5. Concurrent requests serialize on the aggregate version; stale requests return `412 VERSION_MISMATCH` or a domain-specific 409.
6. A retry must never duplicate an activity, quote version, approval decision, order or audit side effect.
7. Retention period for idempotency records is a platform-level policy to be agreed before implementation.

## 6. Validation and domain error catalogue

| Error code | Meaning | Typical HTTP |
|---|---|---:|
| `VALIDATION_FAILED` | Required or malformed field | 422 |
| `DUPLICATE_CANDIDATE_FOUND` | Possible duplicate needs review | 409 |
| `INVALID_STATE_TRANSITION` | Transition not allowed | 422 |
| `EVIDENCE_REQUIRED` | Required product evidence missing | 422 |
| `APPROVAL_REQUIRED` | Action needs approval first | 409 |
| `APPROVER_NOT_ELIGIBLE` | Scope, role or separation-of-duties failure | 403 |
| `VERSION_MISMATCH` | Stale aggregate version | 412 |
| `IDEMPOTENCY_KEY_REUSED` | Same key, different request | 409 |
| `SOURCE_UNAVAILABLE` | Required Platform read API unavailable | 503 |
| `SOURCE_STALE` | Snapshot exceeds freshness threshold | 200 with stale metadata |
| `TENANT_LINK_UNVERIFIED` | Customer-to-tenant relation not verified | 409 |
| `LIFECYCLE_COMMAND_NOT_SUPPORTED` | Prohibited Phase B tenant/trial/subscription mutation | 403 or 405 |
| `CURRENCY_MISMATCH` | Invalid mixed-currency calculation | 422 |
| `EXPORT_SCOPE_DENIED` | Requested export exceeds permissions | 403 |

Responses must not leak whether an inaccessible record exists; use 404 where resource concealment is required.

## 7. External Platform read integration

The internal MCM service must call a versioned Platform read API through a service identity with least privilege.

Required integration metadata:
- source system and API version;
- external opaque tenant/trial/subscription identifiers;
- source-updated timestamp and local observed timestamp;
- correlation ID and source request ID;
- freshness state and last successful refresh;
- mapping status and reconciliation exception.

Reliability:
- bounded timeout and retry with exponential backoff + jitter for safe GET requests only;
- circuit breaker and explicit degraded state;
- no retry of non-idempotent writes (none are in Phase B);
- scheduled reconciliation compares current read model to source and records discrepancies;
- source outage must not block unrelated CRM/product operations.

## 8. KPI response contract

Each KPI returns:
- `code`, `definitionVersion`, `label`;
- `value` or `null`;
- `unit`, `currencyCode` when relevant;
- `periodStart`, `periodEnd`, `asOf`;
- `sourceSystem`, `sourceUpdatedAt`, `freshness`;
- `filtersApplied` and `limitations[]`.

No mixed-currency rollup without an approved FX rate source, rate date and rounding policy. No derived MRR/ARR, churn, collections, cash or profit KPI in Phase B.

## 9. Security, privacy and observability requirements

- Apply object-level and field-level authorization to every endpoint.
- Enforce scope in query predicates, not post-fetch UI filtering.
- Use parameterized queries and schema validation.
- Rate-limit authentication, exports and high-cost search endpoints.
- Protect contact details and commercial values with field-level permissions.
- Log actor, action, target, decision, request/correlation IDs and outcome; redact tokens, credentials and sensitive payloads.
- Audit export and attachment download.
- Trace Platform source requests without logging customer operational data.
- Monitor 401/403 spikes, failed approvals, stale source data, duplicate/idempotency conflicts and integration circuit state.
- Do not include internal endpoints in public customer API documentation or expose them through tenant sessions.

## 10. API acceptance tests

1. Tenant token sent to an internal route returns 401/403 and no data.
2. Internal user without resource scope cannot read a record by guessing its ID.
3. A user cannot widen their own scope by changing query parameters or request body.
4. Product Available transition without evidence is rejected.
5. Product Available transition without authorized approval is rejected.
6. Duplicate CRM candidate is surfaced but no automatic merge occurs.
7. Unverified tenant link cannot be treated as a verified customer mapping.
8. Platform source outage returns a degraded/stale read response; CRM write remains available.
9. Stale Platform snapshot cannot be returned as current Active state.
10. Trial lifecycle mutation endpoint is absent or explicitly rejected.
11. Same idempotency key and same body returns one stable result.
12. Same idempotency key with a different body returns 409.
13. Concurrent update with stale ETag returns 412 and does not overwrite the latest version.
14. Sent quote version cannot be edited; a new version is required.
15. Unauthorized approver and self-approval are rejected according to policy.
16. Approval decision cannot be overwritten.
17. Plan version update does not mutate an existing subscription snapshot or effective Platform entitlement.
18. Basic package returns one owner plus two employee seats; owner is not counted as employee.
19. Branch count changes do not change seat utilization.
20. Mixed-currency opportunity aggregation returns separate buckets.
21. KPI source outage returns null/stale metadata rather than fabricated zero.
22. Export and attachment download enforce record scope and emit audit events.
23. Error responses contain no stack traces, SQL or secrets.
24. Retrying a failed safe GET does not create side effects; no Phase B command invokes tenant provisioning.

## 11. Proposed build sequence and gates

1. Internal identity middleware and permission evaluator (after security policy approval).
2. Audit envelope and aggregate version/idempotency infrastructure.
3. Product portfolio APIs and maturity evidence.
4. CRM organization/contact/lead/opportunity APIs.
5. Commercial quote/contract/order and approval APIs.
6. Catalogue APIs with versioned plans and seat definitions.
7. Platform read adapters and snapshot reconciliation.
8. Executive KPI/read APIs.

Each slice requires contract tests, negative authorization tests, audit verification, code review and owner acceptance. Production rollout requires a separate release approval.

## 12. Open decisions before implementation

- Internal identity provider, MFA, recovery and session lifetime.
- Role/scope matrix and maker-checker thresholds.
- Internal service hosting, API gateway and service-to-service authentication.
- Platform source API versions, freshness thresholds and ownership.
- CRM personal-data retention, consent and export policy.
- Quote currency precision, rounding and pricing approval authority.
- Contract document storage and legally approved signature workflow (outside Phase B).
- Trial clock/expiry semantics and authoritative Platform read contract.
- Idempotency record retention and outbox/reconciliation implementation details.
- Audit retention, tamper evidence and privileged audit-reader access.

**Non-authorization:** This document does not assert that these routes exist. It does not authorize runtime code, database schema, SQL/DDL, migrations, trial/subscription lifecycle changes, tenant provisioning or Production deployment.

## Phase B traceability

- [Phase B Traceability Matrix](MALVIA-COMPANY-MANAGEMENT-PHASE-B-TRACEABILITY-MATRIX-v1.md) provides the screen-to-API-to-permission crosswalk, maps API tests to Phase B acceptance criteria, and defines slice-level DoD and failure handling. Routes remain proposed; this link does not assert implementation or authorize runtime work.

## Phase B0 boundary

- [Phase B0 Design Lock & Decision Closure](MALVIA-COMPANY-MANAGEMENT-PHASE-B0-DESIGN-LOCK-v1.md) consolidates the source-of-truth and security decisions that gate implementation of these proposed API contracts. The routes remain proposals until B0 approvals and slice gates are met.
