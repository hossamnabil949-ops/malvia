# MALVIA — Backend API, Domain Services & Command Contracts (Draft v1)

**Status:** Target architecture proposal only. It does not authorize runtime code, SQL, database migrations, production changes, or a public API launch. Contracts and examples are conceptual; final schemas and accounting behavior require owner, security and qualified-accountant review.

## 1. Objectives

Define a stable server boundary for the single modular, multi-tenant MALVIA platform. The backend must support multiple industries, branches, registers, devices and offline clients while enforcing tenant, user, branch, module, legal-entity and accounting-period boundaries on the server.

Design principles:
- One shared identity, tenant, subscription, entitlement, authorization, audit, sync and accounting foundation.
- Industry packs provide domain workflows and source-event adapters; they do not bypass shared services.
- Business commands are the write authority. Generic document synchronization is not the authority for sensitive financial actions.
- Every write is tenant-scoped, authenticated, authorized, validated, versioned and auditable.
- Offline support preserves commands durably and resolves them explicitly; it does not grant the client authority to post financial effects.
- API contracts are versioned and backward-compatible during migration.
- The backend owns canonical timestamps, IDs, policy versions, posting decisions and idempotency receipts.

## 2. Logical service boundaries

These are domain boundaries, not a requirement to deploy separate microservices. Start with a modular monolith / well-separated serverless domain modules unless measured scale or team ownership justifies extraction.

| Domain service | Responsibilities | Must not own |
|---|---|---|
| Identity & Session | login, session issuance/revocation, device/session trust, actor context | business balances |
| Tenant & Organization | tenant, legal entities, branches, warehouses, registers, operating calendar | employee password copies in business documents |
| Access Policy | roles, permissions, branch/account scope, module entitlements, seat limits | UI-only visibility as authorization |
| Subscription & Trial | plans, seats, industry/module entitlements, trial lifecycle, billing state | trial timer controlled by downloaded client |
| Industry Workflow | POS, workshop, restaurant order, retail/pharmacy-specific validations | independent GL or security bypass |
| Inventory | stock ledger, reservations, batches, serials, costing inputs, transfers | cash or GL balances |
| Sales & Purchasing | invoices, receipts, returns, customer/supplier source documents | direct unguarded cross-resource writes |
| Treasury & Settlement | cashbox custody, shifts, payment allocations, bank/card settlement references | GL journal as a side effect inferred from balance snapshot |
| Accounting Engine | posting templates, journals, period controls, receipts, reversals | mutable historical posted entries |
| Reporting & Export | authorized read models, reconciliations, report versions, exports | independent recalculation rules in each UI |
| Sync & Device Outbox | device registration, command delivery, receipts, conflict state | client-side merge as financial authority |
| Audit & Evidence | append-only audit facts, approvals, export/close evidence | mutable operational source-of-truth replacement |
| AI & Agent Gateway | intent extraction, explanation, proposed command | direct database mutation or bypass of command APIs |
| Notification & Integration | email/SMS/webhook/provider adapters, delivery status | authoritative financial commit |

A domain may initially share one deployment and database transaction manager. Enforce module boundaries in code and ownership of writes even before services are physically separated.

## 3. Request pipeline

Every protected request passes through this order:

1. Parse and validate transport, API version, content type, size and schema.
2. Authenticate the bearer session; reject expired, revoked or inactive sessions.
3. Resolve tenant and actor from the session, not from trusted client claims.
4. Load current tenant status, trial/subscription state, purchased seats, enabled industry packs and module entitlements.
5. Resolve requested legal entity, branch, register, warehouse, cashbox and bank-account scopes; validate each independently.
6. Check role/permission and resource/action policy on the server.
7. Validate domain invariants and expected versions.
8. For writes, resolve idempotency and execute an atomic command or return a deterministic conflict/receipt.
9. Write audit facts and an outbox event as part of the transaction where applicable.
10. Return a safe, versioned response with trace ID and explicit source/posting states.

Authorization is deny-by-default. An accessible branch does not automatically grant access to every bank account, cashbox, employee record or module. Platform-operator access is a separate trust domain and must not be implied by tenant admin.

## 4. API surface (logical contract)

Use resource-oriented reads and command-oriented writes. Exact paths may change during API review; the following is a logical namespace proposal.

### 4.1 Identity and tenant context
- `POST /api/v1/auth/login` — authenticate a tenant user and issue a revocable session.
- `POST /api/v1/auth/refresh` — rotate session credentials under a defined refresh policy.
- `POST /api/v1/auth/logout` — revoke the current session; do not clear or delete the offline financial outbox.
- `GET /api/v1/me/context` — safe actor profile, assigned branches, accessible modules, tenant state and session/device metadata.
- `GET /api/v1/tenant/bootstrap` — minimal safe tenant configuration required by the client; a license key alone must not expose all employee or financial resources.

### 4.2 Organization and entitlements
- `GET/POST /api/v1/branches`, `/warehouses`, `/registers` — scoped organization configuration.
- `GET /api/v1/entitlements` — server-derived seats, industry packs, modules and feature grants.
- `POST /api/v1/subscription/trial/activate` — controlled tenant trial activation; trial start is server-owned and cannot be reset by reinstall/download.
- Configuration writes require explicit platform/tenant policy and audit; client-side hiding is not enforcement.

### 4.3 Read APIs
- `GET /api/v1/{domain}/{resource}` — paginated, filtered, scoped reads with stable cursor semantics.
- `GET /api/v1/reports/{reportKey}` — report result with calculation version, scope and as-of metadata.
- `POST /api/v1/reports/{reportKey}/exports` — authorized export job; export permission and branch scope are rechecked server-side.
- Large reports/exports use asynchronous jobs and expiring download grants; no public permanent file URLs.

### 4.4 Business commands
- `POST /api/v1/commands/sales.create`
- `POST /api/v1/commands/sales.void`
- `POST /api/v1/commands/sales.return`
- `POST /api/v1/commands/purchases.receive`
- `POST /api/v1/commands/purchases.return`
- `POST /api/v1/commands/payments.allocate`
- `POST /api/v1/commands/expenses.create`
- `POST /api/v1/commands/inventory.transfer`
- `POST /api/v1/commands/inventory.adjust`
- `POST /api/v1/commands/partners.current-account`
- `POST /api/v1/commands/accounting.journal.propose`
- `POST /api/v1/commands/accounting.journal.approve`
- `POST /api/v1/commands/accounting.period.close`
- `POST /api/v1/commands/accounting.period.reopen`

Command names are illustrative. Each command has its own schema, permission, validation and lifecycle; do not expose one generic “write any resource” endpoint as a replacement.

### 4.5 Sync and operation receipts
- `POST /api/v1/sync/commands` — submit a bounded batch of durable offline commands with per-command IDs and dependencies.
- `GET /api/v1/sync/receipts?cursor=...` — retrieve accepted, rejected, pending and conflicted command receipts.
- `GET /api/v1/sync/changes?cursor=...` — retrieve authorized server changes after a stable cursor.
- `POST /api/v1/sync/conflicts/{id}/resolve` — submit a user-approved resolution where policy allows; never silently overwrite financial facts.
- Batch limits, ordering, dependency rules and retention must be documented and enforced.

## 5. Standard command envelope

Conceptual example (not a final wire schema):

```json
{
  "apiVersion": "v1",
  "commandId": "client-generated-stable-id",
  "idempotencyKey": "stable-retry-key",
  "commandType": "sales.create",
  "schemaVersion": 1,
  "expectedVersions": {
    "register": 12,
    "customer": 8,
    "inventoryScope": 41
  },
  "context": {
    "branchId": "requested-branch",
    "registerId": "requested-register",
    "warehouseId": "requested-warehouse"
  },
  "occurredAt": "client-event-time",
  "payload": {}
}
```

The server derives tenant ID, actor ID, session, entitlement and authoritative access scope. The server validates the requested branch/register/warehouse and stamps serverReceivedAt. Client-supplied timestamps are evidence, not authority to backdate into a locked accounting period.

The canonical request hash includes all semantically relevant command data and excludes transport-only fields. Reusing a key with the same canonical payload returns the original receipt; reusing it with different payload returns an idempotency conflict.

## 6. Standard response and error model

A command response should distinguish business commit from accounting posting:

```json
{
  "commandId": "same-command-id",
  "receiptId": "server-receipt-id",
  "status": "accepted",
  "source": {
    "status": "committed",
    "type": "invoice",
    "id": "server-source-id"
  },
  "accounting": {
    "status": "posted",
    "journalIds": ["journal-id"],
    "templateVersion": "approved-version-id"
  },
  "sync": {
    "serverCursor": "opaque-cursor"
  },
  "traceId": "safe-diagnostic-id"
}
```

Statuses are examples, not a final enum. A source can be committed while accounting is pending or rejected only if an explicitly approved workflow supports that state; the response and UI must state this clearly. Never label it fully accounted.

Stable error categories include:
- `AUTH_REQUIRED`, `SESSION_REVOKED`, `TENANT_SUSPENDED`;
- `MODULE_NOT_ENTITLED`, `SEAT_LIMIT_REACHED`;
- `BRANCH_SCOPE_DENIED`, `ACCOUNT_SCOPE_DENIED`;
- `VALIDATION_FAILED`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`;
- `PERIOD_LOCKED`, `APPROVAL_REQUIRED`, `SOURCE_STATE_INVALID`;
- `POSTING_MAPPING_MISSING`, `POSTING_UNBALANCED`;
- `DEPENDENCY_UNAVAILABLE`, `RETRYABLE_INTERNAL_ERROR`.

Return field-level safe validation details and trace IDs. Never return passwords, session tokens, license secrets, employee private data, SQL values, raw stack traces or internal infrastructure secrets.

## 7. Atomic command transaction boundary

For a financially material command, the server transaction should include, as applicable:
- source document and line records;
- inventory movements and allocation changes;
- customer/supplier subledger effects;
- treasury custody movement and payment allocation;
- bank/card clearing book movement;
- loyalty or partner subledger event;
- GL journal and journal lines, if synchronous posting is required;
- idempotency receipt;
- audit record and outbox event.

All effects are not required for every command. The command's domain specification lists exactly which effects are mandatory and which are asynchronous. If an external bank/card provider is involved, commit the internal instruction/clearing state and use a separate idempotent settlement callback; do not hold a database transaction open across an external network call.

If any mandatory synchronous effect fails, roll back the entire transaction. If policy explicitly permits source commit with pending posting, commit a durable exception state and receipt atomically, with retry/alert ownership and no false success.

## 8. Legacy compatibility and strangler migration

The current application has legacy `/api/auth/bootstrap`, `/api/auth/login`, `/api/sync`, `/api/sync-batch`, agent, AI and backup paths. The current sync model persists tenant/resource JSON documents, and client handlers can update multiple resources independently.

Migration strategy:
1. Inventory each current caller and contract; add contract tests before changing behavior.
2. Introduce versioned session/context and entitlement checks without invalidating existing active sessions unexpectedly.
3. Add server command endpoints beside legacy sync; do not silently reroute all writes at once.
4. Move one command family at a time, beginning with a narrow low-risk pilot and then financially material commands only after atomicity/idempotency tests.
5. Mark command-owned resources/fields and reject conflicting legacy writes to those fields after the cutover gate.
6. Keep legacy read paths during a measured compatibility period, with explicit sunset/version policy.
7. Preserve local outbox, transaction journal, session and pending operations. Do not clear browser storage or replay the same operation under a new key.
8. Reconcile source totals, inventory, AR/AP, cash, bank, partner accounts and GL before expanding rollout.
9. Maintain rollback/forward-repair strategy that preserves commands already accepted by the new backend.

Never use a demo-data clearing helper as a migration, onboarding, trial-conversion, repair or logout mechanism.

## 9. AI, agents and integrations

AI and agents are untrusted command producers, not privileged domain services. They may:
- interpret user intent;
- ask for missing required details;
- prepare a proposed command;
- explain validation or reconciliation results within the actor's authorized scope.

They may not:
- mint or elevate permissions;
- choose an unauthorized branch/account;
- bypass approval, period lock or idempotency;
- call direct document writes for financial effects;
- read broad tenant data through a license key alone.

Any approved AI action calls the same authenticated command endpoint as the human client, and records actor, initiating interface, model/agent identity, approval and resulting receipt. External integrations use scoped credentials, webhook signature validation, replay protection and independent delivery receipts.

## 10. Observability, rate limits and operations

Every request/command has trace ID, tenant-safe correlation ID, command ID, actor, domain, latency, result category and retry classification. Logs must be structured and minimize personal/financial payloads. Apply per-tenant, per-user and per-device rate limits with stricter policies for login, exports, AI and high-risk commands.

Operational dashboards should expose:
- command success/rejection and latency by domain;
- pending posting and reconciliation queues;
- idempotent replay counts and payload-hash conflicts;
- sync cursor lag, outbox delivery and dead-letter state;
- authorization denials by policy category;
- external settlement callback failures;
- period-close blockers and late offline events.

Diagnostics visible to customers contain safe error code, stage, trace ID and next action only.

## 11. Acceptance and security tests

1. Tenant A cannot read or mutate Tenant B using guessed IDs or modified payloads.
2. A user assigned to one branch cannot read, export or post to another branch.
3. Module-disabled commands fail server-side even if manually called.
4. Seat overage and suspended/expired tenant state follow approved policy.
5. Revoked session and inactive employee cannot submit a command or sync receipt.
6. Same idempotency key/payload returns one receipt and one set of effects.
7. Same key/different payload is rejected.
8. Two concurrent sales cannot oversell controlled stock or allocate one serial twice.
9. Concurrent returns cannot exceed eligible original invoice quantity.
10. Partial batch failure returns per-command receipts without hiding committed commands.
11. A failed mandatory GL posting rolls back the source transaction, unless an explicitly approved pending-posting workflow is used.
12. Treasury, bank book, subledger and GL remain separately identifiable and reconcilable.
13. Locked-period commands and offline retries cannot backdate into a closed period.
14. Export authorization matches the report's branch and role scope.
15. AI/agent calls cannot bypass the same policy pipeline.
16. Logout/reinstall does not erase accepted or pending offline financial commands.
17. Legacy-to-command cutover does not double-apply an event or lose a pending operation.
18. Safe diagnostics never disclose credentials, SQL values or raw stack traces.

## 12. Decisions required before implementation

- Final modular monolith vs service extraction boundaries and deployment topology.
- API versioning, authentication/session rotation, device trust and refresh-token policy.
- Exact legal-entity, branch, register, warehouse, cashbox and bank-account authorization model.
- Seat enforcement, trial states, grace/suspension and module entitlement rules.
- Command schemas, batch limits, ordering and dependency semantics.
- Synchronous vs pending accounting posting by event family.
- Offline retention, conflict resolution, device revocation and accepted-command recovery.
- Data retention, audit access, export authorization and support/operator break-glass.
- Rate limits, provider integration, webhook and notification contracts.
- Final physical relational schema, indexes, isolation/locking strategy and disaster recovery objectives.

**Implementation gate:** This is a design-only contract. Do not deploy endpoints, alter legacy routes, change live tenant data, clear client storage, create SQL migrations or publish API credentials until the relevant contracts, security tests, accounting policies and rollback plan are approved.


## Physical database and JSONB migration companions

- [MALVIA-PHYSICAL-DATABASE-POSTGRESQL-DESIGN-v1.md](MALVIA-PHYSICAL-DATABASE-POSTGRESQL-DESIGN-v1.md) — proposed PostgreSQL schemas, relational table catalog, tenant-safe keys/FKs, ownership dimensions, constraints, indexes and isolation. Design only; no SQL or runtime schema is deployed.
- [MALVIA-DATA-MIGRATION-JSONB-TO-RELATIONAL-v1.md](MALVIA-DATA-MIGRATION-JSONB-TO-RELATIONAL-v1.md) — staged preservation-first migration from JSONB documents and local sync state, including ID mapping, effect receipts, reconciliation, offline outbox/journal protection, cutover and rollback.
