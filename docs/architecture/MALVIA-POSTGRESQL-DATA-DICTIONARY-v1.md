# MALVIA PostgreSQL Data Dictionary v1

**Status:** Detailed design proposal; not implementation approval. Companion to `MALVIA-PHYSICAL-DATABASE-POSTGRESQL-DESIGN-v1.md`. No SQL, migrations, production data or runtime behavior is changed.

## 1. Type and naming conventions

All names below are proposed snake_case PostgreSQL identifiers. Types are logical PostgreSQL types; final precision, enum strategy and generated columns require approval.

| Logical type | Proposed PostgreSQL type | Rule |
|---|---|---|
| Tenant/business ID | UUID (provisional) | UUID vs legacy text IDs remains open; retain legacy ID mapping |
| Human/business code | VARCHAR(64–128) | Not a primary key; tenant-scoped uniqueness |
| Name/title | VARCHAR(200–300) | Unicode |
| Description/notes | TEXT | Bound length at API |
| Money/quantity/rate | NUMERIC(20,6) provisional | Money precision/currency minor units and quantity scale need accountant/domain approval |
| Percentage | NUMERIC(9,6) | Validate domain range |
| Date | DATE | Calendar business date |
| Event/creation time | TIMESTAMPTZ | Preserve original timezone meaning and source timestamp |
| Boolean | BOOLEAN | Avoid nullable booleans unless three-state meaning is explicit |
| Version/counter | BIGINT | Monotonic where used for concurrency |
| Currency | CHAR(3) | ISO 4217 code, subject to supported-currency policy |
| Status/type | VARCHAR(40–64) or lookup FK | Prefer lookup/versioned code table for business-extensible values |
| Metadata | JSONB | Bounded noncanonical metadata only |

### Common columns

Mutable tenant-owned master/operational rows generally include:
- `tenant_id UUID NOT NULL`
- `id UUID NOT NULL` (provisional)
- `created_at TIMESTAMPTZ NOT NULL`, `updated_at TIMESTAMPTZ NOT NULL`
- `created_by_user_id UUID NULL`, `updated_by_user_id UUID NULL`
- `row_version BIGINT NOT NULL DEFAULT 1`
- `status_code VARCHAR(40) NOT NULL` where lifecycle applies
- optional `metadata JSONB NOT NULL DEFAULT '{}'`

Append-only event/ledger rows use `occurred_at`, `recorded_at`, actor, source type/ID/line ID, correlation ID and reversal link. Do not add mutable `updated_at` to immutable ledger rows. Tenant-owned PK is normally `(tenant_id,id)`; child FK repeats tenant_id. Global platform catalogs may use global UUID PK and versioned code.

## 2. Platform schema

| Table | Required fields | Constraints / relationships |
|---|---|---|
| `platform.tenants` | id, tenant_key, legal_name, display_name, timezone, locale, status_code, created_at | PK (id); unique tenant_key; tenant root |
| `platform.plans` | id, code, version, name, status_code | unique (code,version) |
| `platform.modules` | id, code, version, name, industry_scope, status_code | unique (code,version) |
| `platform.industry_packs` | id, code, version, name, status_code | unique (code,version) |
| `platform.subscriptions` | tenant_id, id, plan_id, status_code, starts_at, ends_at, billing_ref | PK (tenant_id,id); tenant FK; date check |
| `platform.subscription_seats` | tenant_id, id, subscription_id, purchased_seats, effective_from, effective_to | seats > 0; subscription FK |
| `platform.seat_assignments` | tenant_id, id, subscription_id, user_id, assigned_at, released_at | FKs; one active seat per user/subscription under approved policy |
| `platform.entitlement_grants` | tenant_id, id, subject_type, subject_id, entitlement_code, source_type, source_id, valid_from, valid_to, version | unique grant identity/version; effective-time check |
| `platform.trials` | tenant_id, id, started_at, ends_at, status_code, conversion_subscription_id | one trial lifecycle per tenant/product policy; no restart on download |
| `platform.trial_events` | tenant_id, id, trial_id, event_code, occurred_at, actor_id, payload | append-only; trial FK |

## 3. Identity schema

| Table | Required fields | Constraints / relationships |
|---|---|---|
| `identity.users` | tenant_id, id, username_normalized, display_name, phone, email, status_code | unique (tenant_id,username_normalized) |
| `identity.user_credentials` | tenant_id, user_id, password_hash, credential_version, changed_at | PK (tenant_id,user_id); user FK; hash only |
| `identity.roles` | tenant_id, id, code, name, is_system, status_code | unique (tenant_id,code) |
| `identity.permissions` | id, code, module_code, resource_code, action_code, scope_type | unique code; catalog may be global |
| `identity.role_permissions` | tenant_id, role_id, permission_id, effect | unique role/permission/effect; role FK |
| `identity.user_roles` | tenant_id, user_id, role_id, valid_from, valid_to | composite FKs; valid interval |
| `identity.user_branch_assignments` | tenant_id, id, user_id, branch_id, access_level, valid_from, valid_to | composite FKs; no implicit all-branch access |
| `identity.sessions` | tenant_id, id, user_id, device_id, token_hash, issued_at, expires_at, revoked_at | unique token_hash; active-session index |
| `identity.devices` | tenant_id, id, device_key_hash, display_name, status_code, last_seen_at | unique tenant/device hash |
| `identity.session_events` | tenant_id, id, session_id, event_code, occurred_at, safe_metadata | append-only |

## 4. Organization schema

| Table | Required fields | Constraints / relationships |
|---|---|---|
| `org.legal_entities` | tenant_id, id, code, legal_name, tax_registration, functional_currency, status_code | unique tenant/code |
| `org.branches` | tenant_id, id, legal_entity_id, code, name, timezone, status_code | FK to legal entity; unique tenant/legal entity/code |
| `org.locations` | tenant_id, id, branch_id, code, name, location_type, status_code | FK branch; unique tenant/branch/code |
| `org.registers` | tenant_id, id, branch_id, code, name, device_policy, status_code | FK branch; unique tenant/branch/code |
| `org.register_cashbox_assignments` | tenant_id, id, register_id, cashbox_id, valid_from, valid_to, assigned_by | FKs; non-overlap rule enforced transactionally |
| `org.document_sequences` | tenant_id, id, legal_entity_id, branch_id nullable, register_id nullable, document_type, series_code, prefix, next_value, version | unique approved numbering-scope tuple; tenant-safe FKs; register must belong to branch; allocate and insert document atomically; scope dimensions are policy-configured, not assumed branch-only |
| `org.branch_membership_events` | tenant_id, id, user_id, branch_id, event_code, occurred_at, actor_id | append-only assignment evidence |

## 5. Catalog schema

| Table | Required fields | Constraints / relationships |
|---|---|---|
| `catalog.items` | tenant_id, id, item_code, barcode, name, item_type, base_unit_id, status_code | unique tenant/item_code; barcode policy explicit |
| `catalog.item_units` | tenant_id, id, item_id, unit_code, conversion_factor, is_base | unique tenant/item/unit; factor > 0 |
| `catalog.item_prices` | tenant_id, id, item_id, price_list_id, currency_code, unit_price, valid_from, valid_to | FK item/list; valid range |
| `catalog.price_lists` | tenant_id, id, code, name, currency_code, status_code | unique tenant/code |
| `catalog.tax_categories` | tenant_id, id, code, name, tax_policy_ref, status_code | unique tenant/code; tax policy not inferred |
| `catalog.services` | tenant_id, id, service_code, name, unit_id, status_code | unique tenant/service_code |
| `catalog.item_attributes` | tenant_id, id, code, data_type, industry_scope | unique tenant/code |
| `catalog.item_attribute_values` | tenant_id, id, item_id, attribute_id, value_text, value_numeric, value_boolean, value_json | exactly one typed value per data_type; FK item/attribute |

## 6. Inventory schema

| Table | Required fields | Constraints / relationships |
|---|---|---|
| `inventory.warehouses` | tenant_id, id, branch_id, code, name, warehouse_type, status_code | unique tenant/branch/code; branch FK |
| `inventory.stock_locations` | tenant_id, id, warehouse_id, code, name, location_type | unique tenant/warehouse/code |
| `inventory.stock_balances` | tenant_id, id, item_id, warehouse_id, stock_location_id, on_hand_qty, reserved_qty, row_version | unique tenant/item/warehouse/location; nonnegative policy explicit |
| `inventory.stock_movements` | tenant_id, id, item_id, branch_id, warehouse_id, stock_location_id, movement_code, quantity_delta, unit_cost, currency_code, source_type, source_id, source_line_id, occurred_at, recorded_at, reversal_of_id | append-only; source idempotency; quantity delta signed |
| `inventory.stock_batches` | tenant_id, id, item_id, warehouse_id, batch_code, manufactured_on, expires_on, unit_cost, status_code | uniqueness scope for batch code to approve |
| `inventory.stock_batch_movements` | tenant_id, id, stock_movement_id, batch_id, quantity_delta | append-only; movement and batch FKs |
| `inventory.serial_units` | tenant_id, id, item_id, serial_number, current_state, current_warehouse_id | unique serial scope to approve |
| `inventory.serial_events` | tenant_id, id, serial_unit_id, event_code, source_type, source_id, occurred_at | append-only custody history |
| `inventory.stock_allocations` | tenant_id, id, item_id, warehouse_id, source_type, source_id, quantity, status_code, expires_at | positive quantity; transactional availability check |
| `inventory.stock_transfers` | tenant_id, id, source_branch_id, destination_branch_id, source_warehouse_id, destination_warehouse_id, transfer_number, status_code, requested_at, dispatched_at, completed_at | source and destination warehouses must differ; branches may be equal for an intra-branch warehouse transfer; unique approved-scope number |
| `inventory.stock_transfer_lines` | tenant_id, id, transfer_id, item_id, requested_qty, dispatched_qty, received_qty, damaged_qty | quantities bounded by policy; transfer/item FKs |
| `inventory.stock_transfer_events` | tenant_id, id, transfer_id, event_code, actor_id, occurred_at, note | append-only lifecycle |
| `inventory.cost_layers` | tenant_id, id, item_id, warehouse_id, source_movement_id, original_qty, remaining_qty, unit_cost | remaining between zero and original |
| `inventory.inventory_counts` | tenant_id, id, branch_id, warehouse_id, count_number, status_code, started_at, approved_at | unique tenant/warehouse/count no |
| `inventory.inventory_count_lines` | tenant_id, id, count_id, item_id, expected_qty, counted_qty, variance_qty | count/item FKs; approved variance posts movement |

## 7. Sales schema

| Table | Required fields | Constraints / relationships |
|---|---|---|
| `sales.customers` | tenant_id, id, customer_code, name, phone, status_code | unique tenant/customer_code |
| `sales.customer_addresses` | tenant_id, id, customer_id, address_type, address_text, city, country_code | customer FK |
| `sales.sales_orders` | tenant_id, id, branch_id, customer_id, order_number, status_code, ordered_at | unique tenant/branch/order no |
| `sales.sales_order_lines` | tenant_id, id, order_id, item_id, quantity, unit_price, discount_amount, tax_amount | order/item FKs |
| `sales.invoices` | tenant_id, id, legal_entity_id, branch_id, register_id, customer_id, series_code, document_number, issued_at, business_date, status_code, currency_code, subtotal, discount_total, tax_total, grand_total, returned_total, source_command_id | unique tenant/legal entity/series/number; immutable posted snapshot |
| `sales.invoice_lines` | tenant_id, id, invoice_id, line_number, item_id, description_snapshot, quantity, returned_qty, unit_price, discount_amount, tax_amount, cost_snapshot, line_total | unique tenant/invoice/line number; return quantity bounded |
| `sales.invoice_payments` | tenant_id, id, invoice_id, collection_branch_id, tender_type, cashbox_id, bank_account_id, amount, currency_code, paid_at, external_ref | exactly one applicable custody destination per tender type |
| `sales.sales_returns` | tenant_id, id, original_invoice_id, branch_id, return_number, status_code, reason_code, returned_at, approved_by | unique tenant/branch/return no |
| `sales.sales_return_lines` | tenant_id, id, sales_return_id, original_invoice_line_id, item_id, quantity, disposition_code, refund_amount | original line FK; server validates cumulative returned quantity |
| `sales.sales_return_tenders` | tenant_id, id, sales_return_id, tender_type, cashbox_id, bank_account_id, amount, settled_at | linked refund/credit effect receipt |
| `sales.shifts` | tenant_id, id, branch_id, register_id, cashbox_id, opened_by, opened_at, closed_at, status_code | one active shift per register/cashbox policy |
| `sales.shift_closeouts` | tenant_id, id, shift_id, expected_totals, counted_totals, variance_totals, closed_by, closed_at | immutable closeout snapshot; structured tender lines recommended |
| `sales.reservations` | tenant_id, id, branch_id, customer_id, status_code, expires_at, source_ref | reservation holds availability but is not a sale or stock issue |
| `sales.reservation_lines` | tenant_id, id, reservation_id, item_id, warehouse_id, quantity, allocated_qty | positive quantity; availability reserved transactionally |
| `sales.reservation_deposits` | tenant_id, id, reservation_id, amount, currency_code, tender_type, cashbox_id, bank_account_id, status_code | deposit remains separately traceable as customer advance/liability until allocated/refunded/forfeited under approved policy |
| `sales.customer_receipts` | tenant_id, id, customer_id, branch_id, receipt_number, amount, currency_code, received_at, cashbox_id, bank_account_id, status_code | standalone receipts; one actual custody destination per tender line |
| `sales.customer_receipt_allocations` | tenant_id, id, customer_receipt_id, invoice_id, allocated_amount | positive; cumulative allocation <= receipt and eligible invoice balance |
| `sales.customer_ledger_events` | tenant_id, id, customer_id, event_type, source_type, source_id, branch_id, amount, currency_code, occurred_at, reversal_of_id | append-only AR subledger events; balance snapshots are projections |
| `sales.loyalty_ledger` | tenant_id, id, customer_id, source_type, source_id, branch_id, event_type, points_delta, occurred_at, reversal_of_id | append-only; source event idempotency; return/reversal linked to original earn/redeem |

## 8. Procurement schema

| Table | Required fields | Constraints / relationships |
|---|---|---|
| `procurement.suppliers` | tenant_id, id, supplier_code, name, phone, status_code | unique tenant/supplier_code |
| `procurement.purchase_invoices` | tenant_id, id, legal_entity_id, branch_id, supplier_id, supplier_document_no, internal_document_no, invoice_date, status_code, currency_code, subtotal, tax_total, grand_total, amount_paid | commercial supplier invoice/document; unique internal number; external supplier number duplicate policy explicit; physical receipt is separate |
| `procurement.purchase_invoice_lines` | tenant_id, id, purchase_invoice_id, line_number, item_id, invoiced_qty, unit_cost, discount_amount, tax_amount, line_total | unique invoice/line; do not treat invoiced quantity as received stock |
| `procurement.purchase_receipts` | tenant_id, id, legal_entity_id, branch_id, warehouse_id, supplier_id, purchase_invoice_id nullable, receipt_number, received_at, status_code | unique receipt number in approved scope; receipt may be partial; stock posts only on accepted receipt |
| `procurement.purchase_receipt_lines` | tenant_id, id, receipt_id, purchase_invoice_line_id nullable, item_id, accepted_qty, rejected_qty, unit_cost_snapshot, batch_id, serial references, disposition_code | accepted/rejected quantities validated; batch/serial and warehouse custody recorded |
| `procurement.purchase_invoice_receipt_allocations` | tenant_id, id, purchase_invoice_line_id, purchase_receipt_line_id, allocated_qty | allocation cannot exceed invoiced or accepted quantities; supports multiple partial receipts |
| `procurement.supplier_payments` | tenant_id, id, supplier_id, branch_id, cashbox_id, bank_account_id, amount, currency_code, paid_at, reference | custody destination and source receipt |
| `procurement.supplier_payment_allocations` | tenant_id, id, supplier_payment_id, purchase_invoice_id, allocated_amount | positive allocation; sum <= payment |
| `procurement.purchase_returns` | tenant_id, id, original_purchase_invoice_id, branch_id, return_number, status_code, returned_at | original invoice FK |
| `procurement.purchase_return_lines` | tenant_id, id, purchase_return_id, original_purchase_receipt_line_id, original_purchase_invoice_line_id nullable, quantity, unit_cost_snapshot, disposition_code | canonical return source is accepted receipt line; cumulative return <= accepted quantity net of prior returns |
| `procurement.purchase_return_settlements` | tenant_id, id, purchase_return_id, settlement_type, amount, cashbox_id, bank_account_id, supplier_credit_ref | separate cash refund/debt reduction/store credit |

## 9. Finance and accounting schemas

| Table | Required fields | Constraints / relationships |
|---|---|---|
| `finance.cashboxes` | tenant_id, id, branch_id, code, name, currency_code, status_code | unique tenant/branch/code |
| `finance.treasury_movements` | tenant_id, id, cashbox_id, branch_id, direction, amount, currency_code, source_type, source_id, occurred_at, reversal_of_id | append-only; positive amount and direction enum |
| `finance.cashbox_transfers` | tenant_id, id, from_cashbox_id, to_cashbox_id, amount, currency_code, status_code, occurred_at | source != destination; linked paired movements |
| `finance.expenses` | tenant_id, id, legal_entity_id, branch_id nullable, category_id, amount, currency_code, business_date, status_code, source_command_id | branch required for direct expense; null branch only with explicit tenant-wide scope |
| `finance.expense_allocations` | tenant_id, id, expense_id, branch_id, allocation_basis, amount, policy_version, approved_by | allocation totals reconcile to source amount; management-only allocation does not create duplicate GL expense |
| `finance.bank_accounts` | tenant_id, id, legal_entity_id, branch_scope_id, bank_name, masked_account_ref, currency_code, status_code | explicit central vs branch scope |
| `finance.bank_ledger_entries` | tenant_id, id, bank_account_id, branch_id, direction, amount, currency_code, value_date, source_type, source_id, reversal_of_id | append-only |
| `finance.bank_statement_imports` | tenant_id, id, bank_account_id, imported_at, source_hash, status_code | source hash idempotency |
| `finance.bank_statement_lines` | tenant_id, id, import_id, external_line_ref, value_date, amount, currency_code, description, match_status | unique import/external line ref |
| `finance.bank_transfers` | tenant_id, id, from_bank_account_id, to_bank_account_id, amount, currency_code, status_code, initiated_at, confirmed_at | source != destination; paired ledger entries share transfer ID; not income/expense |
| `finance.payment_instruments` | tenant_id, id, instrument_type, direction, party_id, source_document_id, bank_account_id, amount, currency_code, due_date, status_code | cheque/card/other instrument identity; state transitions append-only |
| `finance.payment_instrument_events` | tenant_id, id, instrument_id, event_code, occurred_at, actor_id, external_ref | append-only; duplicate provider/bank event deduped |
| `finance.card_settlement_batches` | tenant_id, id, provider_ref, bank_account_id, gross_amount, fees_amount, net_amount, currency_code, status_code, settled_at | gross - fees = net under approved rounding; unique provider reference |
| `finance.card_settlement_lines` | tenant_id, id, batch_id, invoice_payment_id, refund_tender_id nullable, gross_amount, fee_amount, net_amount | line allocations reconcile to batch and original tenders |
| `finance.partners` | tenant_id, id, partner_code, name, status_code | unique tenant/partner_code |
| `finance.partner_capital_events` | tenant_id, id, partner_id, event_type, amount, currency_code, occurred_at, source_id | append-only |
| `finance.partner_current_account_events` | tenant_id, id, partner_id, event_type, origin_event_id, amount, currency_code, occurred_at | advance/loan/repayment remain distinct |
| `finance.partner_withdrawals` | tenant_id, id, partner_id, withdrawal_type, amount, cashbox_id, bank_account_id, occurred_at, source_id | withdrawal != advance |
| `finance.partner_exit_settlements` | tenant_id, id, partner_id, approved_amount, status_code, approved_at | immutable approved amount; adjustments via events |
| `finance.partner_exit_payments` | tenant_id, id, settlement_id, amount, cashbox_id, bank_account_id, paid_at | cumulative payment <= approved liability |
| `finance.supplier_ledger_events` | tenant_id, id, supplier_id, event_type, source_type, source_id, branch_id, amount, currency_code, occurred_at, reversal_of_id | append-only AP subledger; balance snapshots are projections |
| `finance.opening_balance_batches` | tenant_id, id, legal_entity_id, effective_date, status_code, approved_by, approved_at, policy_version | one approved posting per scope/version; immutable approval evidence |
| `finance.opening_balance_lines` | tenant_id, id, batch_id, category, branch_id nullable, party_id nullable, account_id nullable, item_id nullable, warehouse_id nullable, amount, quantity, unit_cost, currency_code | explicit typed target and ownership scope; no inferred branch or balancing plug |
| `finance.opening_balance_effects` | tenant_id, id, batch_id, line_id, target_type, target_id, source_effect_key, applied_at | unique batch/line/target effect; prevents replay of generated opening effects |
| `accounting.chart_of_accounts` | tenant_id, id, code, name, account_type, parent_account_id, status_code | unique tenant/code; parent same tenant |
| `accounting.books` | tenant_id, id, legal_entity_id, book_code, book_type, currency_policy, status_code | unique tenant/legal entity/book code; statutory/management/tax book types require policy |
| `accounting.fiscal_periods` | tenant_id, id, legal_entity_id, book_id, starts_on, ends_on, status_code, locked_at | valid range; no overlapping open periods per legal entity/book/calendar |
| `accounting.journals` | tenant_id, id, legal_entity_id, book_id, journal_number, source_type, source_id, template_version_id, currency_code, posting_date, status_code, posted_at, reversal_of_id | unique scoped journal no; posted immutable; balance independently by book/currency |
| `accounting.journal_lines` | tenant_id, id, journal_id, line_number, account_id, branch_id, debit, credit, currency_code, memo | exactly one debit/credit positive; journal balance validated transactionally |
| `accounting.posting_templates` | tenant_id, id, event_code, version, effective_from, effective_to, approval_status, definition | unique tenant/event/version; immutable once effective |
| `accounting.posting_receipts` | tenant_id, id, legal_entity_id, book_id, source_type, source_id, posting_purpose, template_generation, journal_id, command_id, outcome, created_at | unique tenant/legal entity/book/source/purpose/template generation; exact uniqueness policy documented for multi-book/multi-purpose posting |
| `accounting.journal_reversals` | tenant_id, id, original_journal_id, reversal_journal_id, reason, approved_by, occurred_at | one approved reversal per policy |
| `accounting.period_close_runs` | tenant_id, id, fiscal_period_id, started_at, completed_at, status_code, evidence_ref | period FK; immutable close evidence |

## 10. Workflow, sync, audit and integration

| Table | Required fields | Constraints / relationships |
|---|---|---|
| `workflow.definitions` | tenant_id, id, code, name, status_code | unique tenant/code |
| `workflow.definition_versions` | tenant_id, id, definition_id, version, published_at, definition_hash | unique definition/version; immutable published version |
| `workflow.steps` | tenant_id, id, definition_version_id, step_code, step_order, config | unique version/step_code and version/step_order |
| `workflow.instances` | tenant_id, id, definition_version_id, business_ref_type, business_ref_id, status_code, started_at | pins published version |
| `workflow.tasks` | tenant_id, id, instance_id, step_id, assignee_user_id, status_code, due_at | tenant-safe FKs |
| `workflow.approvals` | tenant_id, id, task_id, decision, actor_id, decided_at, comment | append-only decision |
| `sync.command_receipts` | tenant_id, id, command_type, idempotency_key, request_hash, status_code, result_ref, completed_at | unique tenant/command type/idempotency key |
| `sync.command_events` | tenant_id, id, receipt_id, event_code, occurred_at, safe_payload | append-only |
| `sync.outbox_events` | tenant_id, id, event_type, aggregate_type, aggregate_id, payload_version, payload, status_code, created_at, published_at | partial pending index; idempotent consumer |
| `sync.inbox_events` | tenant_id, id, source_system, external_event_id, received_at, processed_at, status_code | unique tenant/source/external event |
| `sync.device_cursors` | tenant_id, id, device_id, stream_code, last_acknowledged_sequence, updated_at | unique device/stream |
| `sync.conflict_cases` | tenant_id, id, aggregate_type, aggregate_id, conflict_type, state, opened_at, resolved_at, resolution_ref | durable human-resolvable conflict |
| `audit.events` | tenant_id, id, actor_type, actor_id, action_code, resource_type, resource_id, branch_id, occurred_at, correlation_id, safe_metadata | append-only; no secrets |
| `integration.connections` | tenant_id, id, provider_code, encrypted_secret_ref, status_code, created_at | secret stored in vault, not plaintext column |
| `integration.webhook_deliveries` | tenant_id, id, connection_id, event_id, attempt_count, next_attempt_at, status_code | retryable delivery |
| `integration.import_jobs` / `export_jobs` | tenant_id, id, actor_id, scope_json, status_code, started_at, completed_at, artifact_ref | authorization scope snapshot and audit |

## 11. Common constraints and indexes

1. Every tenant-owned FK is `(tenant_id, referenced_id)`; no cross-tenant joins.
2. Every business number has a scoped unique key and sequence allocation protected by transaction/locking.
3. Posted money/stock rows are immutable. Corrections link `reversal_of_id` or source correction event.
4. Amount and quantity checks are positive/nonnegative where direction is stored separately; signed deltas only where explicitly named.
5. Date intervals satisfy start < end. Effective assignment intervals must not overlap where exclusivity is required.
6. Return quantities, allocations, payment settlement and partner exit payments are checked under row locks in the command transaction.
7. Journals balance by currency and approved accounting policy; application-only validation is insufficient.
8. Index tenant + branch + business date/occurred_at; tenant + status + updated_at; all FK columns; pending outbox; active sessions; source identity and idempotency keys.
9. Add indexes from measured query plans; do not preemptively partition tables.

## 12. Explicitly not finalized

UUID/text identity, numeric precision and rounding, tax and currency/FX, nullable semantics, exact enum/lookup catalogs, FK delete actions, legal entity and branch mapping, inventory costing, serial uniqueness, customer/supplier balance model, journal posting timing, partitioning, RLS policy and retention require approvals. This dictionary is a review baseline, not executable DDL.


## Database constraints and command transaction companions

- [MALVIA-DATABASE-CONSTRAINTS-AND-TRANSACTION-SPEC-v1.md](MALVIA-DATABASE-CONSTRAINTS-AND-TRANSACTION-SPEC-v1.md) — tenant-safe keys, domain constraints, uniqueness/idempotency, locking/isolation, atomicity, ledger immutability, RLS safeguards and concurrency acceptance tests.
- [MALVIA-COMMAND-TRANSACTION-CATALOG-v1.md](MALVIA-COMMAND-TRANSACTION-CATALOG-v1.md) — command-by-command preconditions, read/write sets, locks, idempotency, receipts, reversals and rollback semantics.

Both are design-only review documents; they do not authorize SQL, migrations, API implementation or production changes.


## Data Dictionary completeness addendum — review corrections

The following entities were absent or under-specified in the initial table list despite being required by the transaction lifecycle, logical ERD or financial ownership model. They are now included in the relevant sections above: separate purchase receipts and invoice-to-receipt allocations; standalone customer receipts and AR events; supplier AP events; reservations and deposits; loyalty ledger; expenses and allocation lines; payment instruments/events and card settlement batches; bank transfers; opening-balance batches, lines and one-time effect receipts; and accounting books.

**Design notes:** purchase invoice quantity is not stock-received quantity. Inventory increases only through accepted receipt lines. Purchase returns must reference accepted receipt lines. A branch may move stock between two different warehouses in that same branch; branch IDs may therefore be equal while warehouse IDs must differ. Document sequence scope is configurable by approved legal-entity/branch/register/series dimensions and is not hard-coded to branch alone. No new tax, payment, costing or accounting treatment is approved by adding these structural entities.
