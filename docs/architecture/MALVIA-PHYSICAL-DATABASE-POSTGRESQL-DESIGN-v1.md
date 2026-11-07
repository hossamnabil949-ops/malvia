# MALVIA Physical Database Design — PostgreSQL v1

**Status:** Proposed design only; not approved for implementation. **Target:** PostgreSQL / Neon. **Platform:** one modular, multi-tenant MALVIA platform.

> No SQL, schema, migration, live data or deployment is created or changed by this document. Table names and types are proposals pending owner, accountant, security and engineering approval.

## 1. Invariants

1. Shared platform foundation for every tenant and industry pack. Industry extensions reuse identity, organization, inventory, finance and accounting contracts.
2. Every tenant-owned row carries `tenant_id`. Every relationship between tenant-owned rows is tenant-safe at database level.
3. Distinguish `legal_entity_id`, `branch_id`, `warehouse_id`, `stock_location_id`, `register_id`, `cashbox_id`, and `bank_account_id`; none is a substitute for another.
4. Posted financial and stock history is append-only. Corrections use linked reversals/corrections, not silent overwrite or deletion.
5. Server commands that affect multiple domains commit atomically with an idempotency receipt, audit event and outbox event.
6. JSONB remains a compatibility source during staged migration. No cutover without reconciliation and rollback evidence.
7. Seat-based licensing is independent of branch count. Branch count has no artificial system cap.

## 2. PostgreSQL schema strategy

Use shared PostgreSQL schemas to separate technical domains, not one schema per tenant:

| Schema | Tables / responsibility |
|---|---|
| `platform` | tenants, plans, modules, industry packs, subscriptions, seats, entitlement grants, trials, operator audit |
| `identity` | users, credentials, roles, permissions, branch assignments, sessions, devices |
| `org` | legal entities, branches, locations, registers, sequences, register/cashbox assignments |
| `catalog` | items, services, units, price lists, tax categories, item attributes |
| `inventory` | warehouses, stock locations, balances, movements, batches, serials, allocations, transfers, counts |
| `sales` | customers, orders, invoices, lines, tenders, returns, shifts and closeouts |
| `procurement` | suppliers, purchase invoices/lines, supplier payments/allocations, purchase returns |
| `finance` | cashboxes, treasury movements, bank accounts/ledger, payment instruments, partner subledgers |
| `accounting` | chart of accounts, fiscal periods, journals/lines, posting templates/receipts, reversals |
| `workflow` | versioned definitions, steps, instances, tasks, approvals, events |
| `sync` | command receipts/events, outbox/inbox, device cursors, conflict cases |
| `integration` | external connections, webhooks, import/export jobs |
| `audit` | append-only security, business and platform events |
| `insights` | report definitions, report runs, derived read models |
| `legacy` | current JSONB documents, source snapshots, ID maps, import and reconciliation evidence |

Shared schemas are the recommended starting point: schema-per-tenant increases migration and operations complexity. Schema names are not security boundaries.

## 3. Keys and common columns

Recommended tenant table key: `PRIMARY KEY (tenant_id, id)`; alternate natural key: `UNIQUE (tenant_id, code)`. Child rows store `tenant_id` and use composite FK `(tenant_id, parent_id) REFERENCES parent(tenant_id,id)`. This prevents cross-tenant references even if application code has a defect.

Mutable business rows commonly carry `tenant_id UUID`, `id UUID`, `created_at/updated_at TIMESTAMPTZ`, actor IDs, `row_version BIGINT`, and a defined status. Ledger/event rows instead carry `occurred_at`, `recorded_at`, actor, source type/ID/line ID and idempotency identity. Use exact decimal/numeric types for amounts and quantities; never round-trip migration money through JS floating point.

Existing IDs and document numbers are evidence. Do not assume legacy IDs are UUIDs or derive IDs from invoice numbers. Proposed mapping table:

- `legacy.id_map(tenant_id, source_system, resource_name, legacy_id, target_table, target_id, source_hash, imported_at)`
- unique `(tenant_id, source_system, resource_name, legacy_id)`
- unique `(tenant_id, target_table, target_id)`

UUID v4/v7 versus retaining existing textual IDs as canonical keys remains unresolved.

## 4. Platform, subscriptions and identity

| Table | Key fields and constraints |
|---|---|
| `platform.tenants` | id, tenant_key, legal/display name, timezone, locale, status; unique tenant_key |
| `platform.plans`, `modules`, `industry_packs` | versioned catalogs; unique code + version |
| `platform.subscriptions` | tenant_id, plan_id, state, start/end, external billing reference |
| `platform.subscription_seats` | purchased seat count and effective dates; branch count is not capped |
| `platform.seat_assignments` | subscription_id, user_id, assigned/released dates; unique active assignment |
| `platform.entitlement_grants` | tenant, subject, module/feature code, source, validity, version |
| `platform.trials`, `trial_events` | tenant-owned 14-day lifecycle and append-only events; download/reinstall cannot restart |
| `identity.users` | tenant, username_normalized, display name, status; unique tenant + normalized username |
| `identity.user_credentials` | password hash, credential version; never returned to clients |
| `identity.roles`, `permissions`, `role_permissions`, `user_roles` | tenant-scoped roles and effective assignments |
| `identity.user_branch_assignments` | tenant, user, branch, access level, valid_from/to; no implicit all-branch access |
| `identity.sessions` | tenant, user, device, token hash, issued/expiry/revoked timestamps |
| `identity.devices`, `session_events` | device status and append-only security events |

Authorization evaluates tenant state, session, user, seat, module entitlement, permission, branch/legal-entity scope and row ownership. UI hiding is not authorization. AI and agents use the same server policy pipeline.

## 5. Organization model

| Table | Key fields / rules |
|---|---|
| `org.legal_entities` | tenant, legal identity, tax references, functional currency; unique tenant + code |
| `org.branches` | tenant, legal_entity_id, code, name, timezone, status; FK includes tenant |
| `org.locations` | branch and physical/business location type |
| `org.registers` | branch, code, device policy; unique tenant + branch + code |
| `org.register_cashbox_assignments` | register, cashbox, effective interval, actor; auditable history |
| `org.document_sequences` | legal entity, optional branch/register, scope type, document type/series, prefix, next value, version; partial unique indexes per scope handle NULL values correctly; register scope requires branch |
| `org.branch_membership_events` | branch/user assignment history |

A legal entity may own multiple branches. A transaction's originating branch is distinct from the branch that collects payment. Central costs may be tenant-owned with explicit allocation lines.

## 6. Catalog and industry extensions

Shared `catalog.items`, `item_units`, `item_prices`, `tax_categories`, `services`, `item_attributes` and typed attribute values. Auto-parts compatibility, restaurant recipes/modifiers/table service, apparel size/color and pharmacy product metadata belong in additive industry extension tables with tenant-safe FKs to shared items/orders. No industry pack owns a separate cash, identity, branch or accounting ledger. Tax behavior and regulated-product requirements need specialist approval.

## 7. Inventory

| Table | Important fields / purpose |
|---|---|
| `inventory.warehouses` | tenant, branch, code, name, type, status; central warehouse belongs to a designated branch |
| `inventory.stock_locations` | warehouse, bin/shelf/quarantine location |
| `inventory.stock_balances` | item, warehouse, location, on-hand, reserved, version; unique dimensional balance |
| `inventory.stock_movements` | item, warehouse/location, movement type, quantity delta, cost, source, branch, occurred_at; append-only |
| `inventory.stock_batches`, `stock_batch_movements` | batch identity, expiry, cost and movement allocation |
| `inventory.serial_units`, `serial_events` | serial identity, current custody/state, immutable event history |
| `inventory.stock_allocations` | item, warehouse, demand reference, quantity, status, expiry; reservation only |
| `inventory.stock_transfers`, `stock_transfer_lines`, `stock_transfer_events` | source/destination branches, requested/dispatched/received quantities, partial receipt/shortage/damage/cancel events |
| `inventory.cost_layers` | source movement, remaining quantity and unit cost |
| `inventory.inventory_counts`, `inventory_count_lines` | count evidence; approved adjustment posts a movement |

Do not reuse legacy `warehouseId` as `branch_id`. Preserve aggregate stock and per-warehouse stock as separate evidence until reconciled. Costing method, negative-stock policy, serial uniqueness scope and reservation rules are unresolved.

## 8. Sales and procurement

Sales tables:
- `sales.customers`, `customer_addresses`.
- `sales.sales_orders`, `sales.sales_order_lines` (where enabled).
- `sales.invoices`: legal entity, originating branch, register, configured document sequence/series, issue timestamp, status, currency and immutable totals snapshot.
- `sales.invoice_lines`: item/service, quantity, price, discount, tax and cost snapshots, returned quantity.
- `sales.invoice_payments`: one row per tender component, invoice, tender method, amount, collection branch, cashbox/bank account and external reference.
- `sales.sales_returns`, `sales.sales_return_lines`, `sales.sales_return_tenders`: original invoice and line, quantity, disposition, refund method/destination.
- `sales.customer_receipts`, `customer_receipt_tenders`, `customer_receipt_allocations`, `customer_ledger_events`: standalone multi-tender customer receipts, explicit allocations and append-only AR events.
- `sales.reservations`, `reservation_lines`, `reservation_deposits`: availability holds and separately traceable deposits; a reservation is not a sale or stock issue.
- `sales.loyalty_ledger`: append-only earn/redeem/reversal/expiry events.
- `sales.shifts`, `shift_events`, `shift_closeouts`: register/branch/cashbox and expected vs counted tenders.

Procurement tables:
- `procurement.suppliers`.
- `procurement.purchase_invoices`, `purchase_invoice_lines`: supplier invoice facts and invoiced quantities, separate from physical receipt.
- `procurement.purchase_receipts`, `purchase_receipt_lines`, `purchase_receipt_line_serials`, `purchase_invoice_receipt_allocations`: accepted/rejected quantities, receiving branch/warehouse, batch/serial evidence and partial receipt allocation. Only accepted receipt lines create stock movements.
- `procurement.supplier_payments`, `supplier_payment_tenders`, `supplier_payment_allocations`, `supplier_payment_schedules`, `supplier_ledger_events`.
- `procurement.purchase_returns`, `purchase_return_lines`, `purchase_return_settlements`: return lines reference accepted receipt lines; physical stock return is separated from debt reduction, cash refund and supplier credit.

Unique invoice/receipt keys use the configured numbering scope, not an assumed branch-only scope. Return cumulative quantity is validated inside a locked server transaction. Customer/supplier balances are derived from subledger events and explicit allocations, not editable snapshots.

## 9. Treasury, bank, partners and accounting

### Custody, expenses and bank books

- `finance.cashboxes`: tenant, branch, code, currency, status.
- `finance.treasury_movements`: cashbox, branch, direction, amount, currency, source, reversal link; append-only.
- `finance.cashbox_transfers`: paired transfer, not income/expense.
- `finance.expenses`, `expense_allocations`: direct branch or explicitly tenant-wide expense; allocation lines do not duplicate statutory GL expense.
- `finance.bank_accounts`: legal entity, optional explicit branch scope, currency, status.
- `finance.bank_ledger_entries`, `bank_transfers`: bank-book movements and paired internal transfers.
- `finance.bank_statement_imports`, `bank_statement_lines`: external statement evidence and matching state.
- `finance.payment_instruments`, `payment_instrument_events`: cheque/other instrument lifecycle as append-only events.
- `finance.card_settlement_batches`, `card_settlement_lines`: processor gross, fee, net and original tender reconciliation.
- `finance.opening_balance_batches`, `opening_balance_lines`, `opening_balance_effects`: approved opening snapshot and replay-proof mapping of each generated effect.

Treasury custody, bank-book entries, processor settlement and GL journals are separate books. A bank transfer is not income or expense. Card fees and cheque settlement/reversal rules require approved accounting policy.

### Partner subledger

- `finance.partners`
- `finance.partner_capital_events`
- `finance.partner_current_account_events` (advance/loan/repayment)
- `finance.partner_withdrawals` (distinct from advance)
- `finance.partner_exit_settlements`, `partner_exit_payments`

Capital, current account, withdrawal, advance and exit liability remain separate event types. Each references source command and related cash/bank movement.

### Accounting

- `accounting.books`: legal-entity books with explicit book type and currency policy.
- `accounting.chart_of_accounts`: tenant-owned master catalogue of code, name, type and parent.\n- `accounting.book_accounts`: effective assignment of an account to a legal-entity book; journal lines may use only accounts assigned to that book and posting date.
- `accounting.fiscal_periods`: legal entity + book, date range and state; prevent overlapping open periods per book/calendar.
- `accounting.journals`, `journal_lines`: source event, legal entity/book, branch, template version, posted timestamp, account, debit/credit, currency/dimensions.
- `accounting.posting_templates`: legal entity + book + event type, immutable version, effective dates and approval state.
- `accounting.posting_receipts`: source event, command, legal entity/book, posting purpose and template generation evidence; unique source effect per tenant/legal entity/book/source/purpose, so template changes cannot auto-repost history.
- `accounting.journal_reversals`: original/reversal journal and reason.
- `accounting.subledger_control_accounts`, `period_close_runs`.

Posted journals balance by approved currency policy independently per legal entity/book/currency. Currency precision, FX, tax, account codes and debit/credit directions require accountant approval; this schema does not prescribe them.

## 10. Workflow, sync, integration, audit and insights

- `workflow.definitions`, `definition_versions`, `steps`, `transitions`, `instances`, `tasks`, `approvals`, `events`; active instances pin a version.
- `sync.command_receipts`: unique tenant + command type + idempotency key; actor identity is bound to the receipt to prevent cross-actor receipt disclosure; stores outcome/version.
- `sync.command_events`, `outbox_events`, `inbox_events`, `device_cursors`, `conflict_cases`.
- `integration.connections`, `webhook_deliveries`, `import_jobs`, `export_jobs`.
- `audit.events`: append-only actor/action/resource/scope/time/correlation metadata.
- `insights.report_definitions`, `report_runs`: calculation version, authorized scope, filters and source watermark.

Logs must exclude passwords, tokens, raw payment credentials, SQL values and unnecessary personal data. Read models are derived/rebuildable, never the source of truth.

## 11. Tenant ownership and relationship rules

- Tenant ID appears on every tenant-owned row and every tenant-owned FK includes tenant ID.
- `legal_entity_id` = legal/accounting owner; `branch_id` = operational attribution; `warehouse_id` = stock custody; `register_id` = POS origin; `cashbox_id` = cash custody; `bank_account_id` = bank custody.
- Invoice remains attributed to originating branch; payment separately records collection branch.
- Customer/supplier can be tenant-wide; their invoice, payment and allocation rows carry branch dimensions.
- Central expense has tenant ownership plus explicit allocation lines; allocations must not duplicate expense.
- Bank account is tenant-central or branch-scoped explicitly, never implicitly both.
- Branch user access is one/multiple/all only through explicit assignments and permission checks.

## 12. Constraints, indexes and deletion

Required constraints: tenant-safe composite FKs; tenant-scoped unique natural keys; check constraints for valid amounts/quantities/date ranges/debit-credit exclusivity; server transaction checks for over-returns, stock, serial custody, credit limits, over-allocation and balanced journals. No cascading delete from tenant, branch, customer, supplier, invoice or journal to posted history.

Initial index candidates (confirm with query plans):
- tenant + branch + occurred/issue date;
- tenant + status + updated_at;
- tenant + parent_id on FK columns;
- unique tenant + legal entity + resolved configured scope identity + document type/series + number;
- partial active-session index by tenant/user/expiry;
- partial pending-outbox index by tenant/status/created_at;
- unique tenant + idempotency key + command type;
- unique tenant + item + warehouse + stock location balance;
- tenant + account + posted date for ledgers.

Use JSONB for bounded metadata and industry attributes, not canonical financial relationships. Soft-delete only eligible master data. Posted invoices, payments, movements, journals, opening balances, partner events, audit and accepted receipts are immutable/reversed, not deleted. Retention/anonymization policy remains open.

## 13. Isolation, RLS and concurrency

API authorization is primary. Add defense in depth:
1. Derive tenant/user from validated session; never trust client tenant_id.
2. Parameterized SQL and tenant-scoped repositories.
3. Composite FKs and tenant predicates on every query.
4. Consider RLS with transaction-local tenant context set only by trusted server code.
5. Separate application, migration and operator DB roles; application role must not bypass RLS.
6. Test pooled connection context reset and cross-tenant reads/writes/joins/exports/jobs/backups.
7. RLS does not replace module, permission or branch checks.

Use ordinary tables and tenant-aware indexes first. Consider time partitioning later for audit, command events, outbox, stock movements and journal lines only after measured volume. PostgreSQL partitioned uniqueness constraints may require partition key inclusion; global idempotency may need a separate registry. Neon-specific pooling/RLS behavior needs a security spike.

Server command transaction includes source record, dependent movements/subledgers, journal (if synchronous), receipt, audit and outbox. If pending posting is explicitly approved, source + pending exception + receipt + audit + outbox commit atomically, and a later posting transaction commits journal + posting receipt; the two states must never be described as one already-completed atomic posting. Use unique constraints, row locks or optimistic versions for stock, returns, sequences, allocations and closeouts. Do not hold transactions open during external calls; use outbox workers.

## 14. Conceptual ERD

~~~mermaid
erDiagram
  TENANTS ||--o{ LEGAL_ENTITIES : owns
  TENANTS ||--o{ USERS : contains
  LEGAL_ENTITIES ||--o{ BRANCHES : operates
  BRANCHES ||--o{ WAREHOUSES : contains
  BRANCHES ||--o{ REGISTERS : hosts
  BRANCHES ||--o{ CASHBOXES : owns
  USERS ||--o{ USER_BRANCH_ASSIGNMENTS : receives
  ITEMS ||--o{ STOCK_MOVEMENTS : moves
  WAREHOUSES ||--o{ STOCK_MOVEMENTS : stores
  BRANCHES ||--o{ INVOICES : originates
  INVOICES ||--|{ INVOICE_LINES : contains
  INVOICES ||--o{ INVOICE_PAYMENTS : settles
  INVOICES ||--o{ SALES_RETURNS : may_return
  SUPPLIERS ||--o{ PURCHASE_INVOICES : supplies
  CASHBOXES ||--o{ TREASURY_MOVEMENTS : records
  BANK_ACCOUNTS ||--o{ BANK_LEDGER_ENTRIES : records
  SOURCE_EVENTS ||--o{ JOURNALS : posts
  JOURNALS ||--|{ JOURNAL_LINES : contains
~~~

Conceptual only; composite tenant keys and table catalog govern physical implementation.

## 15. Migration gates

No physical schema implementation until owner approves ownership dimensions, accountant approves accounting/valuation/tax, security approves isolation/RLS/export, and engineering approves IDs/types/constraints/indexes/transaction strategy. Dry run must prove counts, financial totals, references and pending local command preservation. See `MALVIA-DATA-MIGRATION-JSONB-TO-RELATIONAL-v1.md`.

## 16. Unresolved decisions

1. UUID v4/v7 or legacy string IDs as canonical keys.
2. Shared schema (recommended) or schema-per-tenant.
3. RLS adoption and Neon roles/pooling model.
4. Decimal precision, currency and FX policy.
5. Stock costing, negative stock, reservations and serial uniqueness.
6. Soft delete, anonymization and retention by record class.
7. Partition thresholds and partition keys.
8. Legal entity/branch mapping for existing tenants.
9. Central/branch bank accounts and cross-branch settlement policy.
10. Synchronous/asynchronous posting by event family.
11. Account codes, posting templates, VAT and statutory rules.
12. Backup RPO/RTO and restore retention.
13. Trial expiry, grace, retention and export.
14. Exact physical enum/type/generated-column choices.

## 17. Acceptance checklist

- [ ] Every tenant-owned table has tenant_id and tenant-safe FKs.
- [ ] Cross-tenant references fail closed.
- [ ] Branch, warehouse, register, cashbox, bank and legal entity are distinct.
- [ ] Explicit multi-branch assignments are enforced server-side.
- [ ] Inventory balances reconcile to movements, batches and serials.
- [ ] Sales/returns/purchases/treasury/bank/partner events retain source IDs.
- [ ] Every posted journal balances and has one posting receipt.
- [ ] Reversals preserve original postings.
- [ ] Duplicate command retry produces one effect.
- [ ] Offline pending operations survive migration/replay.
- [ ] Reports/exports enforce same authorization scope.
- [ ] Restore/rollback rehearsal and sign-offs complete.


## Detailed physical model companions

- [MALVIA-POSTGRESQL-DATA-DICTIONARY-v1.md](MALVIA-POSTGRESQL-DATA-DICTIONARY-v1.md) — proposed per-table columns, logical PostgreSQL types, required fields, unique/check constraints and relationship rules.
- [MALVIA-DETAILED-RELATIONAL-ERD-v1.md](MALVIA-DETAILED-RELATIONAL-ERD-v1.md) — domain ERDs and explicit ownership/cardinality/transaction invariants.

These are review artifacts only. They do not authorize DDL, migrations or data cutover.


## Design review corrections — transaction and data coverage

- Purchase invoices and physical goods receipts are separate aggregates. Partial accepted receipts create stock; invoice quantities alone never increase inventory. Purchase returns reference the accepted receipt line that supplied the stock.
- Transfers require distinct source and destination warehouses. Source and destination branches may be the same for a same-branch warehouse transfer; cross-branch transfers additionally validate both branch scopes.
- Document numbering uses a configured legal-entity/branch/register/document-type/series scope. A branch-only sequence is not assumed; exact scope and offline provisional-number reconciliation remain policy decisions.
- Accounting books are explicit. Fiscal periods, journals and posting receipts carry book identity so balancing and close controls cannot accidentally combine statutory/management books.
- Customer/supplier receipts and allocations, payment instruments/card settlement, reservations/deposits, loyalty, expense allocations and opening-balance effect receipts are represented as first-class structures, not inferred from snapshots.


## Review clarification — references and transaction modes

- A purchase invoice and a physical goods receipt are separate aggregates. Partial receipts are represented explicitly; invoiced quantity is not stock on hand, and returns reference accepted receipt lines.
- Transfers require different source/destination warehouses, but may remain within the same branch. Cross-branch authorization applies only when branch IDs differ.
- Sequence uniqueness and sequence allocation share one configured legal-entity/branch/register/document-type/series scope. Offline provisional numbers require a collision-safe namespace and reconciliation.
- Every accounting journal, fiscal period and posting receipt carries an accounting book identity. Balancing and close controls are evaluated per legal entity/book/currency.
- Canonical command idempotency scope is tenant + command type + key, with initiating actor/device bound to the receipt. A different actor cannot retrieve another actor's receipt by reusing a key.
- For synchronous posting, source and mandatory journal effects commit together. If pending posting is separately approved, source + pending exception/receipt/audit/outbox commit first, and journal + posting receipt commit in a later transaction.
- Polymorphic references such as source_type/source_id are event provenance, not automatic foreign keys. Where referential integrity is required, use typed association tables or explicit nullable typed FKs with CHECK constraints; do not claim a generic polymorphic FK is enforced.


## Optional-scope uniqueness and typed-FK safeguards

PostgreSQL UNIQUE constraints treat NULL values as distinct unless a supported NULLS NOT DISTINCT form is explicitly selected. For `org.document_sequences`, use separate partial unique indexes for legal-entity, branch and register scopes (or a version-supported equivalent) so duplicate NULL-scoped sequences cannot be created. The document-number unique constraint must match the sequence scope exactly. Register-scoped rows require a branch and tenant-safe register-to-branch ownership.

Polymorphic provenance (source_type/source_id) is not a relational FK. For business relationships that require database enforcement, use typed nullable FKs and CHECK constraints or dedicated association tables. Multi-tender receipts use header + tender lines + allocation lines; tender totals and allocations are independently reconciled.


## Posting identity protection

A posting receipt's uniqueness is tenant + legal entity + accounting book + source event + posting purpose. The template version/generation is recorded for audit and reproducibility but is not part of the uniqueness key. Template upgrades therefore cannot generate a second journal for the same source purpose. Separate journals require an explicitly distinct approved purpose or a reversal/replacement command.


## Cross-document consistency review

- [MALVIA-DESIGN-CONSISTENCY-REVIEW-v1.md](MALVIA-DESIGN-CONSISTENCY-REVIEW-v1.md) — resolved cross-document conflicts, canonical invariants, remaining approval decisions and release-blocking verification checklist. Design review only; no implementation approval.


## Accounting book/account enforcement

The chart of accounts is a tenant-level catalogue; `accounting.book_accounts` defines which accounts are enabled for each legal-entity book and effective date. Journal lines must reference an active book-account assignment. Posting templates are book-scoped (legal entity + book + event type + version). This prevents a journal from balancing numerically while posting to an account unavailable in that book.
