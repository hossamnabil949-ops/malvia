# MALVIA — Repository Audit Addendum: Sync Parity, API Surface & Known Gaps (2026-11-06)

Status: documentation only. This addendum records a fresh source inspection against `malvia-web`; it does not change runtime code.

## 1. Sync resource parity — verified

The client `SYNC_RESOURCES` declaration contains 35 resources. The server validator declares 34 array resources plus the object resource `settings`, also 35 total.

| Comparison | Result |
|---|---|
| Client-only resources | None |
| Server-only resources | None |
| Resource count | 35 client / 35 server |
| Object resource | settings |
| Array resources | 34 |

The client and server lists match exactly at the time of inspection. The earlier concern about possible list drift is **not a confirmed defect**. Keep a parity test in CI so future edits cannot introduce drift.

Client resource list:
`parts, invoices, customers, suppliers, supplierPayments, supplierPaymentSchedules, treasury, employees, settings, salesReturns, purchaseInvoices, purchaseReturns, expenses, partners, partnerWithdrawals, partnerCurrentAccountTransactions, partnerExitSettlements, partnerSettlementPayments, carModels, reservations, inventoryErrors, auditLog, stockMovements, shifts, warehouses, stockLevels, stockTransfers, loyaltyLedger, cheques, stockBatches, serialUnits, bankAccounts, cardSettlements, bankLedgerEntries, openingBalances`.

## 2. Current API route inventory

| Route | Method(s) observed | Current authentication / scope | Important gap or target requirement |
|---|---|---|---|
| `/api/auth/bootstrap` | POST | License key; returns tenant license object | Return minimum safe bootstrap projection; enforce trial/subscription and tenant status consistently. |
| `/api/auth/login` | POST | License key + username/phone/name and password; rate limit; employee lookup; server session | Add seat entitlement, tenant membership and optional branch selection; never expose legacy password material. |
| `/api/sync` | GET, POST | License key + active employee bearer session; GET currently returns all tenant docs; POST validates resource and version | GET must filter records to authorized branch scope; POST must validate branch IDs and nested references. |
| `/api/sync-batch` | POST | Dependency-loaded route; active employee session; idempotency key; per-resource permission policy; atomic multi-resource transaction | Add branch-level authorization and module entitlement to every operation and nested record. |
| `/api/agent/execute` | POST | License key + bearer token hash + idempotency key; DB function validates session, employee and resource permission | Add branch assignment/context and module entitlement; ensure agent operation writes all linked resources atomically. |
| `/api/ai/command` | POST (handler supports command endpoint) | License lookup and rate limits observed; no employee server-session check established in inspected handler | AI must only interpret intent; any read/write action must call a separately authenticated, permission-checked, branch-scoped operation endpoint. |
| `/api/backup?action=export` | GET | License key; exports all tenant docs | Add owner/admin employee session + export permission + audit; support authorized branch export only if policy allows. |
| `/api/backup` owner operations | GET, POST | Platform ADMIN_TOKEN | Keep internal-only; separate platform operator identity and immutable audit. |
| `/api/registry` | GET, POST | Platform ADMIN_TOKEN | Platform-only tenant registry; audit changes and protect version conflicts. |
| `/api/cron-backup` | scheduled request | CRON_SECRET bearer | Add per-tenant result audit and explicit retention/deletion policy; observed handler does not enforce a method guard. |

## 3. Database and persistence findings

- Current PostgreSQL store creates `malvia_docs` keyed by (tenant, resource), with each resource stored as JSONB and a version. It also creates backup, employee-session and AI-agent idempotency tables.
- This is a tenant-scoped document store, not yet a normalized operational relational schema.
- Employee sessions are server-side token hashes with tenant, employee, expiry and revocation.
- Agent execution uses a tenant-scoped idempotency key and DB transaction lock; this is a useful pattern to preserve and generalize.
- Browser offline persistence includes local tenant resources, sync version metadata, durable pending outbox and transaction journal. These must be retained through migration and cutover.

## 4. Current operational-model gaps relevant to multi-branch

1. `Warehouse.branch` is optional descriptive text; it is not a stable branch foreign key.
2. Invoice and PurchaseInvoice have optional warehouseId, but warehouseId represents stock location, not business branch.
3. Expense, TreasuryTransaction, Shift, SupplierPayment, CustomerPayment, PartnerWithdrawal, PartnerCurrentAccountTransaction, BankAccount and BankLedgerEntry do not share a consistent branchId contract in the inspected types.
4. StockTransfer has source/destination warehouse IDs but no branch IDs or explicit in-transit/partial receipt lifecycle.
5. Employee permissions are resource/action flags; no employee-to-branch assignment model was found in the inspected type contract.
6. `/api/sync` GET returns tenant documents after employee session validation but no branch filter was observed.
7. `/api/backup?action=export` is license-key scoped and exports the tenant's complete document set; owner/admin session and export permission were not observed.
8. `/api/ai/command` did not show employee-session validation in the handler; action execution must never rely on AI route authorization alone.
9. License model is not yet a normalized seat/module/trial subscription ledger.

## 5. Safeguards to add to CI and migration gates

- Assert exact set equality between client SYNC_RESOURCES and server ARRAY_RESOURCES ∪ OBJECT_RESOURCES.
- Assert every route has explicit method, authentication, tenant scope, module entitlement, branch scope, idempotency and audit classification.
- Add negative tests for cross-tenant, cross-branch, unauthorized export, expired trial, missing module, stale branch assignment and nested record branch mismatch.
- Add a route-level inventory test that fails when a new API file is added without an entry in this matrix.
- Keep current tenant JSON documents readable during a staged dual-read/dual-write migration; do not drop the old resource store until all reconciliations and rollback gates pass.

## 6. Audit confidence

Confirmed from current source inspection: route files listed above, 35-resource parity, generic JSONB resource persistence, employee session table, agent idempotency table, and the model gaps listed here.

Not confirmed: every UI-to-resource write path, every export entry point, all accounting journal semantics, production tenant data shape, and every historical document's branch attribution. These require deeper call-site tracing and tenant-specific rehearsal; do not treat this addendum as a complete production-data audit.
