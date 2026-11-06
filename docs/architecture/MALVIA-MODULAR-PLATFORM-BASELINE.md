# MALVIA — Modular Platform Architecture Baseline
**Document:** Architecture & Data-Domain Baseline v1.0  
**Status:** Review draft — documentation only; no runtime or database changes  
**Repository:** `hossamnabil949-ops/malvia`  
**Base branch:** `malvia-web`  
**Review branch:** `docs/modular-platform-architecture-v1`

## 1. Executive decision

MALVIA is one modular, multi-tenant business platform. Industry solutions (auto parts/service, restaurants, grocery/retail, fashion, pharmacy, enterprise services) are compositions of reusable platform capabilities and industry-specific modules. They are not separate products with duplicated identity, billing, security, or data infrastructure.

This document records the target model and the verified gaps found in the current code. It does not authorize a production migration. Implementation must follow reviewed, reversible stages.

## 2. Current-state findings (repository inspection)

Inspected on branch `malvia-web`:
- `src/types/autoParts.ts`
- `src/services/tenantService.ts`
- `src/services/syncService.ts`
- `src/utils/permissions.ts`
- `src/utils/warehouseLogic.ts`
- `src/utils/bankLedger.ts`
- `src/utils/openingBalanceLogic.ts`
- `api/_db.ts`
- `api/_security.ts`
- `api/auth/login.ts`
- `api/sync.ts`
- `api/sync-batch.ts`
- `src/components/WarehousesView.tsx`

### Verified observations

1. **Tenant persistence:** `api/_db.ts` creates `malvia_docs` with primary key `(tenant, resource)`, storing a versioned JSONB document per resource. It also creates backup, employee-session, and agent-idempotency tables. Business entities are therefore mostly embedded in resource documents rather than normalized relational tables.
2. **Authentication:** `api/auth/login.ts` resolves a license, obtains the tenant, loads the tenant's `employees` resource, verifies credentials, and creates a server session tied to tenant and employee. The returned employee identity currently includes role and permission data.
3. **Employee model:** `Employee` is a tenant employee with a fixed role union and an `EmployeePermissions` object. No branch assignment model is present in the inspected interface.
4. **License model:** `TenantLicense` includes `maxEmployees`, plan, expiry/status and boolean feature flags. The current entitlement model is not yet the requested independent seat + module subscription ledger.
5. **Warehouse/branch ambiguity:** `Warehouse` has `id`, `name`, optional `branch` description, active state and creation date. `warehouseLogic.ts` treats `main` as an implicit warehouse. Comments explicitly describe the main stock quantity as the total across warehouses, with non-main balances stored in `stockLevels`. This is not a fully independent branch model.
6. **Transaction scoping:** `Invoice` and `PurchaseInvoice` contain optional `warehouseId`; this points to a stock location, not a stable business branch identity. The inspected types for `Expense`, `TreasuryTransaction`, `Shift`, `SupplierPayment`, `CustomerPayment`, `PartnerWithdrawal`, `PartnerCurrentAccountTransaction`, `BankAccount` and `BankLedgerEntry` do not expose a consistent `branchId`.
7. **Permissions:** `src/utils/permissions.ts` and `api/sync-batch.ts` use tenant employee permission flags for resources. The inspected permission map does not implement a user-to-branch assignment check. Hiding a tab in the client is not a substitute for server authorization.
8. **Sync:** `syncService.ts` maintains tenant-scoped local resources, versions, a durable pending-resource outbox and merge logic. `api/sync.ts` / `api/sync-batch.ts` enforce license, tenant and resource permissions. Branch-aware validation and branch-partitioned sync are not present in the inspected contracts.
9. **Accounting primitives:** bank ledger and opening balance utilities already model financial concepts that must be preserved. A branch migration must not recreate or overwrite opening balances, partner capital, partner current accounts, bank ledgers or treasury history.

### Consequence

The existing app has useful operational foundations and partial warehouse separation, but it is not yet safe to treat warehouses as branches or to aggregate the current resource documents as if every transaction were branch-owned. A branch feature must introduce a separate Branch entity and a consistent scope model, while retaining warehouse as a child location.

## 3. Target platform architecture

### 3.1 Platform layers

- **Platform Core:** tenant/company lifecycle, identity, sessions, branches, memberships, roles, permissions, subscription entitlements, audit, files, notifications, integrations, sync and reporting contracts.
- **Business capabilities:** sales/POS, inventory, procurement, customers, suppliers, finance, treasury, banking, HR, payroll, attendance, assets, workflow and analytics.
- **Industry packs:** auto parts/service, restaurant/cafe, grocery/retail, fashion, pharmacy and future verticals. Packs compose capabilities and add domain-specific workflows and data; they do not fork the core.
- **AI services:** permission-aware tools and domain services; all writes must use the same tenant, branch, permission and idempotency policies as normal APIs.

### 3.2 Tenant and branch hierarchy

```text
MALVIA Platform
└── Tenant (customer company)
    ├── Company settings and shared master data
    ├── Users / memberships
    ├── Subscriptions / enabled modules / seat entitlements
    ├── Branch 1
    │   ├── Warehouses
    │   ├── Cash registers / tills
    │   ├── Cash and bank activity (branch-scoped where appropriate)
    │   ├── Employees / shifts
    │   └── Operational transactions
    ├── Branch 2 ... Branch N
    └── Consolidated reporting
```

A tenant may have any practical number of branches; do not encode a fixed branch limit. A branch is not a warehouse. A branch can own multiple warehouses and operational endpoints.

### 3.3 Target identity and authorization model

- `Tenant`: legal/business customer boundary.
- `User`: global login identity, not owned by a branch.
- `TenantMembership`: user membership in a tenant, status and tenant-level role.
- `BranchMembership`: user-to-branch assignment (many-to-many).
- `Role` / `Permission`: reusable role and granular permissions.
- `RoleAssignment`: role + scope (tenant or branch) + optional constraints.
- `Session`: authenticated user, tenant membership and expiry/revocation.
- `SeatEntitlement`: licensed active-user capacity for a tenant.

Authorization is evaluated server-side on every read and write using tenant membership, active session, enabled module, permission and requested branch scope. A user with company-wide authority may access all tenant branches; a limited user must be denied any branch not assigned, even if they forge a client request.

### 3.4 Subscription and module model

Separate commercial packaging from authorization:
- `Plan`: catalog offer and included commercial limits.
- `Subscription`: tenant's purchased contract and billing period.
- `SubscriptionItem`: seats and module/industry-pack entitlements.
- `ModuleCatalog`: module definition and dependencies.
- `TenantModuleEntitlement`: enabled, trial, suspended or expired module state.
- `SeatAssignment`: active user consuming a licensed seat.

Branch count is not a seat count. Devices are not users. Deactivating a module must not delete its historical data. A module's access is still subject to user permissions.

## 4. Domain and data ownership matrix

| Domain / record | Target scope | Notes |
|---|---|---|
| Company profile, tax identity, base currency | Tenant | Shared company settings |
| Branch | Tenant + Branch identity | Stable entity; not represented by Warehouse |
| Warehouse | Branch | Multiple warehouses per branch |
| Product/part catalog | Tenant by default | Branch overrides may be supported for local pricing/availability |
| Stock balance and stock movements | Tenant + Branch + Warehouse | Quantities never aggregated by mutating source balances |
| Customer / supplier master | Tenant by default | Contact/profile shared; financial subledger may be branch or tenant scoped by policy |
| Sales invoices and sales returns | Branch | Must retain original invoice/return linkage |
| Purchase invoices and purchase returns | Branch | Receipt warehouse is a separate reference |
| Expenses | Branch by default | Explicit tenant-wide expense allocation needs allocation lines |
| Treasury account / cash register | Branch | Transfers between branches are inter-branch clearing, not income/expense |
| Treasury transaction | Branch + account | Immutable source transaction and audit trail |
| Bank account | Explicit owner scope | Must decide tenant-central vs branch-owned; never infer from payment method |
| Bank ledger entry | Same scope as bank account + source transaction | Reconciliation and transfer legs required |
| Shifts / cash tills | Branch + register + employee | Employee can work at multiple branches |
| Employee profile | Tenant | Employment assignment can be branch-specific |
| Attendance / schedule | Branch or assigned work location | Retain employee identity across branches |
| Partner capital / ownership | Tenant | Company-level by default; branch allocations are reporting dimensions, not duplicate capital |
| Partner current account | Tenant unless formally branch-attributed | Preserve existing separate treatment from capital/profit |
| Opening balances | Explicit tenant or branch scope per line | Migration must preserve balancing and approvals |
| Audit log | Tenant + actor + optional branch | Append-only, branch scope recorded at event time |
| Workflow / approvals | Tenant + optional branch context | Cross-branch workflows must state source and destination |

**Important unresolved policy:** shared customer/supplier master records should not imply a single shared financial balance. Financial subledgers need an explicit scope policy, with a tenant-wide consolidated view derived from branch ledgers where appropriate.

## 5. Proposed relational foundation (logical schema)

This is a logical target, not executable SQL. Exact column types, indexes and constraints follow after resource-by-resource mapping.

### Core
- `tenants(id, legal_name, status, base_currency, timezone, created_at)`
- `users(id, login_identifier, credential_reference, status, created_at)`
- `tenant_memberships(id, tenant_id, user_id, status, joined_at)`
- `branches(id, tenant_id, code, name, address, timezone, status, created_at)`
- `branch_memberships(id, tenant_id, branch_id, user_id, status)`
- `roles(id, tenant_id nullable, code, name, scope_type)`
- `permissions(id, code, module_code, description)`
- `role_permissions(role_id, permission_id)`
- `role_assignments(id, tenant_id, user_id, role_id, scope_type, branch_id nullable)`
- `sessions(id, user_id, tenant_id, token_hash, expires_at, revoked_at)`
- `module_catalog(code, name, module_type, dependencies)`
- `plans(id, code, name, billing_period)`
- `subscriptions(id, tenant_id, plan_id, status, starts_at, ends_at)`
- `subscription_items(id, subscription_id, item_type, item_code, quantity, status)`
- `seat_assignments(id, tenant_id, user_id, status, assigned_at)`
- `tenant_module_entitlements(id, tenant_id, module_code, status, starts_at, ends_at)`

### Operational common
- `warehouses(id, tenant_id, branch_id, code, name, status)`
- `registers(id, tenant_id, branch_id, code, name, status)`
- `audit_events(id, tenant_id, actor_user_id, branch_id nullable, action, entity_type, entity_id, occurred_at, metadata)`
- `sync_operations(id, tenant_id, branch_id nullable, device_id, idempotency_key, payload_hash, status, created_at)`

Business domains (sales, procurement, inventory, treasury, finance, HR and industry packs) add their own tables with tenant ownership and explicit branch references where the matrix requires them. Tenant and branch consistency should be enforced with composite foreign keys or equivalent database constraints, not only application checks.

## 6. Cross-branch accounting and operational rules

1. **Inter-branch cash transfer:** create linked source and destination ledger entries, using due-to/due-from or inter-branch clearing accounts. It is not revenue or expense.
2. **Stock transfer:** source dispatch, in-transit state where needed, destination receipt and variance handling. Group stock is derived from branch/warehouse balances; transfer does not change group quantity.
3. **Central procurement:** purchase at a central branch/location then explicit allocations/transfers to recipient branches. Cost allocation rules must be recorded.
4. **Shared supplier/customer:** shared master data, separately scoped balances unless the tenant explicitly chooses a centralized subledger policy.
5. **Partner capital and current accounts:** company ownership and partner current accounts remain distinct from branch cash movements. Branch attribution is a reporting dimension only when supported by an explicit allocation.
6. **Consolidated reporting:** aggregate posted source transactions by currency, date and branch; eliminate internal transfers and duplicate accounting legs. Drill-down must resolve to original records.

## 7. API and security contracts

Every protected request must resolve:
- authenticated user and active session;
- tenant membership and tenant status;
- module entitlement;
- permission for the operation;
- branch scope and active branch membership;
- resource ownership and tenant/branch consistency;
- idempotency and concurrency/version rules for writes.

The client may send a requested branch context, but the server derives the allowed set from trusted membership records. A branch identifier supplied by the browser is never authorization proof.

For offline sync, each queued operation must retain tenant, branch, actor, device, entity ID, base version and idempotency key. The server revalidates current access when accepting the operation. Revoked branch access must not be bypassed by an old offline queue. Conflict policy must be domain-specific: stock, cash, invoices and attendance cannot all use generic last-write-wins.

## 8. Migration strategy from the current JSONB resources

### Phase M0 — Inventory and reconciliation (before schema changes)
- Enumerate every resource in `SYNC_RESOURCES`, `ARRAY_RESOURCES`, object resources, local persistence, API routes and reports.
- Map each entity and nested child to tenant, branch, warehouse, register, account and actor scope.
- Identify references between resources and derived balances.
- Capture production baseline counts, totals, versions and checksums using read-only access.
- Confirm backup restore procedure and retention.

### Phase M1 — Core reference records
- Create tenant/branch and membership tables.
- Create one primary branch for each existing tenant.
- Preserve the current tenant ID and all existing entity IDs.
- Do not yet move operational records or change the active production read/write path.

### Phase M2 — Compatibility mapping
- Map existing `Warehouse` records to warehouses under the primary branch.
- Treat the implicit `main` warehouse as the primary branch's default warehouse; do not convert it into a second branch.
- Existing invoices and purchase invoices map through their current warehouse to the corresponding primary branch. Their original `warehouseId` remains intact.
- All legacy records without a branch map to the primary branch only after domain review; company-wide master records and partner/company-level records remain tenant-scoped.
- Do not guess a branch for records where ownership is ambiguous; quarantine for explicit reconciliation.

### Phase M3 — Dual-read validation, then controlled writes
- Backfill relational rows with stable IDs and source-document references.
- Compare row counts, sums, balances, invoice totals, stock quantities, return quantities, partner balances and bank reconciliations.
- Use checksums and repeatable migration batches.
- Do not run dual writes until idempotency, rollback and reconciliation are proven.
- Switch one bounded domain at a time behind a feature flag; retain a tested rollback path.

### Phase M4 — Branch-aware runtime and reporting
- Enable branch assignment and server-side enforcement.
- Move one domain at a time to the new model.
- Rebuild consolidated reports from source ledger entries.
- Keep old JSONB data read-only until migration acceptance and retention policy approval.

### Non-negotiable preservation rules
- No destructive reset of localStorage or server resources.
- No regeneration of invoice, return, employee, partner, bank or transaction IDs.
- No overwriting historical balances with newly calculated estimates.
- Preserve audit history and original timestamps.
- Existing tenants receive one primary branch as a compatibility mapping, not a new chargeable seat or branch cap.
- Any discrepancy blocks cutover until explained and approved.

## 9. Test strategy and acceptance gates

### Tenant and branch security
- Cross-tenant reads and writes are rejected.
- A user assigned to Branch A cannot read or mutate Branch B, including via direct API calls or forged sync payloads.
- A user assigned to A and B can switch context without mixing local queues or cached records.
- Revoked access invalidates online access and prevents stale offline writes from being accepted.

### Commercial entitlements
- Seat count is independent of branch count and device count.
- A user assigned to multiple branches consumes the intended seat count only once.
- Disabled modules remain stored but inaccessible.
- Module dependency and plan changes are enforced server-side.

### Accounting and inventory
- Transfers do not create revenue/expense or change group stock.
- Consolidated totals reconcile to branch totals after eliminations.
- Treasury balances reconcile to ledger movements.
- Partner capital, profit allocation and partner current accounts remain separate.
- Returns cannot exceed original invoice quantities or values.

### Migration and sync
- Every resource has an explicit scope classification.
- Existing IDs, versions, balances and history reconcile.
- Replayed sync operations are idempotent.
- Out-of-order or conflicting updates follow domain-specific rules.
- Preview tests use a production-safe data copy or synthetic fixtures, never live destructive writes.

## 10. Implementation sequence after design sign-off

1. Complete resource inventory and scope matrix.
2. Approve customer/supplier subledger policy, bank account ownership, branch-level employee model and tenant-wide allocations.
3. Produce exact ERD, SQL migrations, API contracts and permission matrix.
4. Implement Core Foundation in a dedicated feature branch.
5. Add automated tenant/branch isolation tests.
6. Implement compatibility mapping and read-only migration verifier.
7. Implement branch-aware inventory, sales and procurement.
8. Implement branch-aware treasury, banking, expenses and shifts.
9. Implement consolidated reporting and reconciliation.
10. Add industry-pack registry and independent module entitlements.
11. Run Preview acceptance and obtain explicit approval before Production deployment.

## 11. Decisions still required before executable schema

These are policy decisions, not reasons to delay the audit:
1. **Customer and supplier balances:** tenant-wide ledger with branch dimensions, or separate branch subledgers with consolidated view.
2. **Bank accounts:** centrally owned by the tenant, branch-owned, or support both with explicit account scope.
3. **Employees:** tenant-wide employee profile with one or more branch work assignments; recommended default.
4. **Company-wide expenses:** direct tenant expense with allocation lines, or mandatory branch attribution; recommended support both.
5. **Central warehouse:** a warehouse attached to a designated central branch, not a branch-less warehouse.

Recommended defaults above are proposed for review, not silently assumed as approved policy.

## 12. Scope of this change

This branch contains architecture documentation only. It does not modify application source, database schema, credentials, production data, deployment settings or the production branch.
