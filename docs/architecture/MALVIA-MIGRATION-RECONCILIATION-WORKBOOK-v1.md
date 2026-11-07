# MALVIA — Migration Reconciliation Workbook & Cutover Gates (Draft v1)

Status: design-only workbook template. No live tenant data has been read or changed. Fill this workbook per tenant and per branch during a controlled migration rehearsal. All monetary amounts use the tenant currency and fixed decimal precision; the examples below are column templates, not assumed values.

## 1. Cutover control sheet

| Field | Value to record | Gate |
|---|---|---|
| Tenant ID / legal company |  | Required; authenticated tenant identity |
| Source application build / schema version |  | Required |
| Target schema version |  | Required |
| Migration run ID |  | Unique and immutable |
| Snapshot timestamp + timezone |  | Required |
| Cutover date/time |  | Approved maintenance window |
| Branch mapping version |  | Required; no implicit default branch |
| Warehouse-to-branch mapping |  | Every active warehouse resolved |
| Currency / decimal precision |  | Required |
| Inventory costing method |  | Owner + accountant approval |
| Trial migration checksum |  | Required |
| Prepared by / reviewed by / approved by |  | Segregation of duties |
| Rollback snapshot ID and restore test |  | Must pass before cutover |

## 2. Branch and warehouse mapping register

| Legacy warehouseId | Legacy name / branch text | Proposed branchId | Proposed warehouseId | Central warehouse? | Evidence / reviewer | Status |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  | UNMAPPED / REVIEW / APPROVED |

Rules:
- Existing `Warehouse.branch` is descriptive text, not a trusted branch foreign key.
- Map each warehouse explicitly. If evidence is insufficient, set status to REVIEW and block branch-scoped cutover for affected records.
- A tenant may have many branches; no fixed branch cap is assumed.
- One warehouse belongs to one branch in the initial target model unless an approved shared-warehouse design is documented.
- Do not infer a branch from employee, device, invoice number prefix, or current UI selection without supporting evidence.

## 3. Per-branch reconciliation matrix

Create one row per tenant + branch + reporting date/snapshot.

| Domain / measure | Legacy source | Legacy value | Target value | Difference | Tolerance | Status | Evidence / note |
|---|---|---:|---:|---:|---:|---|---|
| Item count (distinct item IDs) | parts |  |  |  | exact |  |  |
| On-hand quantity by item/warehouse | parts.stockQuantity + stockLevels + stockMovements |  |  |  | exact by item |  |  |
| Reserved quantity | reservation records / reservedQuantity |  |  |  | exact |  |  |
| Available quantity | derived on-hand less approved holds |  |  |  | exact |  |  |
| Inventory value by costing layer | cost snapshots / batches / opening lines |  |  |  | accountant-defined |  |  |
| Active sales invoice count | invoices excluding cancelled |  |  |  | exact |  |  |
| Gross sales before discounts/tax | invoice headers/lines |  |  |  | 0.01 currency |  |  |
| Discounts | invoice headers/lines |  |  |  | 0.01 currency |  |  |
| Sales returns | salesReturns + invoice return snapshots |  |  |  | 0.01 currency |  |  |
| Net sales before VAT | report calculation |  |  |  | 0.01 currency |  |  |
| Output VAT after credit notes | invoice tax + return tax allocation |  |  |  | 0.01 currency |  |  |
| COGS | invoice line costPrice + approved return policy |  |  |  | accountant-defined |  |  |
| Customer receivables | invoice balances - payment allocations - credits |  |  |  | 0.01 currency |  |  |
| Supplier payables | purchase debt - payments - returns/credits |  |  |  | 0.01 currency |  |  |
| Supplier store credit | supplier credit events |  |  |  | 0.01 currency |  |  |
| Cashbox opening + movements | treasury |  |  |  | 0.01 currency |  |  |
| Open shift expected/count variance | shifts + shift-linked treasury |  |  |  | 0.01 currency |  |  |
| Bank book balance per account | bankAccounts + bankLedgerEntries |  |  |  | 0.01 currency |  |  |
| Unsettled card batches | cardSettlements |  |  |  | exact batch + amount |  |  |
| Outstanding cheques by status | cheques + linked bank entries |  |  |  | exact by cheque |  |  |
| Partner capital by partner | approved opening + capital events |  |  |  | 0.01 currency |  |  |
| Partner current account by partner | opening + current-account transactions |  |  |  | 0.01 currency |  |  |
| Partner exit settlements outstanding | settlement + payments |  |  |  | 0.01 currency |  |  |
| Loyalty points by customer | loyaltyLedger |  |  |  | exact points |  |  |
| Audit event count / checksum | auditLog |  |  |  | exact |  |  |

**Important:** the same source amount may appear in several views (invoice, treasury, bank, customer ledger). Do not sum those views together as if they were separate revenue or cash. Reconcile each ledger to its own source events and cross-check linked document IDs.

## 4. Tenant-wide / group reconciliation

| Control | Legacy total | Sum of branches | Target tenant total | Difference | Gate |
|---|---:|---:|---:|---:|---|
| Sales net before VAT |  |  |  |  | No unexplained difference |
| Sales returns |  |  |  |  | No duplicate returns |
| Inventory quantity by item |  |  |  |  | Branch sum equals tenant stock |
| Inventory value |  |  |  |  | Same costing method |
| Customer receivables |  |  |  |  | No double-counted shared customers |
| Supplier payables/store credit |  |  |  |  | No double-counted supplier master |
| Cash and bank balances |  |  |  |  | Account scope preserved |
| Partner capital/current accounts |  |  |  |  | Capital distinct from current account |
| Outstanding cheques/card settlement |  |  |  |  | Status and source links preserved |

Group reports must show both branch lines and group total. Internal branch transfers are excluded from group sales, purchases, income and expenses.

## 5. Document-level reconciliation samples

For each branch, sample and compare at least:
- oldest and newest sales invoice;
- one split-tender invoice;
- one credit invoice and one customer collection;
- one partial and one full sales return, including serial/batch item where applicable;
- one cash and one deferred/partial purchase;
- one purchase return using debt reduction, one using store credit, and one cash refund if those cases exist;
- one supplier payment linked to a schedule;
- one stock adjustment and one warehouse transfer;
- one open and one closed shift with variance if present;
- one bank movement, one card settlement and one cheque in each material lifecycle status;
- one partner capital event, one withdrawal, one advance, one current-account repayment, and one exit settlement if present;
- one opening balance with inventory, bank and partner current-account lines;
- one reservation/deposit and one loyalty redemption/return if present.

For every sample verify source ID, line IDs, number, date/time, branch, warehouse, actor, amounts, status, linked movements, and audit events.

## 6. Referential integrity and duplicate checks

| Check | Required result |
|---|---|
| Duplicate primary/source IDs within tenant/resource | 0 |
| Duplicate invoice numbers within tenant (unless documented legacy namespace) | 0 unresolved |
| Sales return references missing invoice or line | 0 unresolved |
| Cumulative returned sales quantity exceeds sold quantity | 0 |
| Purchase return references missing purchase or exceeds accepted quantity | 0 unresolved |
| Duplicate returned serial / serial sold twice | 0 |
| Stock movement references missing item/source | 0 unresolved |
| Stock transfer source/destination warehouse mapping missing | 0 |
| Treasury event with missing/duplicate source relationship | 0 unresolved |
| Bank ledger entry duplicate source posting | 0 |
| Partner current-account transaction missing matching treasury/bank event | 0 |
| Approved opening balance mutated or duplicated | 0 |
| Loyalty reversal without original earn/redeem event | 0 |
| Audit event actor/source missing | exceptions documented; history retained |

## 7. Offline outbox and device cutover

Before cutover:
1. Stop new writes or place devices in controlled maintenance mode.
2. Allow each connected device to sync; record device ID, last successful sync, pending operation count, resource versions and outbox checksum.
3. Preserve `malvia_sync_pending_v1_<tenantId>`, `malvia_<tenantId>___transaction_journal`, sync metadata and local session/device settings as evidence until migration and rollback windows close.
4. Do not clear localStorage, replace the tenant selector, regenerate invoice device codes, or force logout as a migration shortcut.
5. For offline devices, either bring them online and drain their outbox before cutover or formally quarantine them with their exact source schema/version. Never replay an old outbox blindly against new branch mappings.
6. After cutover, reconcile each operation receipt and ensure no operation was lost or applied twice.

## 8. Blocking and rollback rules

Cutover is BLOCKED if any of the following holds:
- a legacy warehouse or branch-scoped transaction has no reviewed branch mapping;
- stock quantity/value differs beyond approved tolerance;
- customer/supplier balances do not reconcile;
- treasury or bank balances differ;
- partner capital and partner current account are merged or differ;
- an approved opening balance changed;
- any invoice/return/payment/cheque/transfer source link is missing or duplicated;
- offline outbox/journal entries are unaccounted for;
- audit history or original IDs/timestamps were dropped;
- authorization tests show cross-tenant or cross-branch data access;
- restore/rollback rehearsal fails.

Rollback means restore the pre-cutover snapshot and resume the prior application/schema. Do not run reverse transformations over partially migrated live financial records unless a separately tested reversal plan exists.

## 9. Acceptance sign-off

| Owner | Sign-off requirement | Name/date |
|---|---|---|
| Business owner | Branch mapping, retained records, unresolved exceptions |  |
| Accountant | Opening balances, inventory valuation, receivable/payable, partner balances, tax |  |
| Operations lead | Branch/register/warehouse workflows and shift reconciliation |  |
| Security reviewer | Tenant + module + employee + branch authorization |  |
| Engineering | Idempotency, offline replay, API compatibility, restore test |  |

A successful technical import alone is not acceptance. Cutover requires all required business, accounting, security and operational sign-offs.

## 10. Financial ownership and consolidation review gates
Use MALVIA-FINANCIAL-OWNERSHIP-SUBLEDGER-CONSOLIDATION-v1.md when completing the tenant/branch reconciliation. Specifically verify originating-branch sales versus collection-branch cash, central supplier payment allocations, tenant-central bank accounts, direct versus allocated central expenses, cashbox transfers, partner capital versus current accounts, and opening differences. Do not count management allocations twice or use account balance snapshots as ledger movements. These are proposed controls pending accountant approval.


## Physical database and JSONB migration companions

- [MALVIA-PHYSICAL-DATABASE-POSTGRESQL-DESIGN-v1.md](MALVIA-PHYSICAL-DATABASE-POSTGRESQL-DESIGN-v1.md) — proposed PostgreSQL schemas, relational table catalog, tenant-safe keys/FKs, ownership dimensions, constraints, indexes and isolation. Design only; no SQL or runtime schema is deployed.
- [MALVIA-DATA-MIGRATION-JSONB-TO-RELATIONAL-v1.md](MALVIA-DATA-MIGRATION-JSONB-TO-RELATIONAL-v1.md) — staged preservation-first migration from JSONB documents and local sync state, including ID mapping, effect receipts, reconciliation, offline outbox/journal protection, cutover and rollback.


## Database constraints and command transaction companions

- [MALVIA-DATABASE-CONSTRAINTS-AND-TRANSACTION-SPEC-v1.md](MALVIA-DATABASE-CONSTRAINTS-AND-TRANSACTION-SPEC-v1.md) — tenant-safe keys, domain constraints, uniqueness/idempotency, locking/isolation, atomicity, ledger immutability, RLS safeguards and concurrency acceptance tests.
- [MALVIA-COMMAND-TRANSACTION-CATALOG-v1.md](MALVIA-COMMAND-TRANSACTION-CATALOG-v1.md) — command-by-command preconditions, read/write sets, locks, idempotency, receipts, reversals and rollback semantics.

Both are design-only review documents; they do not authorize SQL, migrations, API implementation or production changes.
