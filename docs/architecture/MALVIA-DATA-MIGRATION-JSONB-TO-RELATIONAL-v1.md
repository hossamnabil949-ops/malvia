# MALVIA Data Migration — JSONB Documents to PostgreSQL Relational Model v1

**Status:** Proposed plan only. No data movement, SQL, local-storage clearing, write-path change or cutover is authorized.

## 1. Purpose and non-negotiable safeguards

Current MALVIA stores most tenant resources in JSONB documents keyed by tenant/resource. Browser storage also contains tenant resource snapshots, sync versions/base hashes, a pending-resource outbox and a recoverable multi-resource transaction journal. Financial operations can affect invoices, inventory, customers/suppliers, treasury, bank, partner ledgers, loyalty and audit across multiple resources.

Migration must preserve every source ID, document number, timestamp, status, amount, line reference and audit trail. Snapshot and hash sources before transformation. Never re-run a historical business command merely to create normalized rows. Never discard pending local operations or journals. Ambiguous mappings go to review, not guesses. Keep JSONB immutable/available until approved cutover and retention sign-off.

## 2. Current source inventory

### Server
`malvia_docs` stores tenant/resource JSONB documents with versions. APIs include bootstrap, login, GET/POST sync, sync-batch, agent, backup/export and registry. Current sync is tenant/resource permission-aware but not fully branch-row scoped. Most business collections are embedded rather than normalized.

### Browser
Known keys:
- `malvia_<tenantId>_<resource>`: tenant resource documents.
- `malvia_sync_meta_v1_<tenantId>`: versions/base hashes.
- `malvia_sync_pending_v1_<tenantId>`: pending resource outbox.
- `malvia_<tenantId>___transaction_journal`: recoverable multi-resource local commit journal.
- `malvia_user_session_v1`, `malvia_pending_server_session_v1`: session state.
- tenant license cache, active tenant, saved device license, invoice device code, selected warehouse and UI preferences.

The current outbox tracks dirty resources, not immutable operations. One dirty resource may represent several user actions or a merged snapshot. Do not invent command history from a snapshot.

## 3. Recommended migration architecture

Use staged strangler migration:

1. Freeze mapping contract, canonical source identities and ownership dimensions.
2. Snapshot immutable server documents and required local evidence with hashes and versions.
3. Import relational shadow copies while JSONB remains authoritative.
4. Reconcile structural, financial, inventory and reference integrity.
5. Run shadow reads and compare outputs without mixing authoritative results.
6. Pilot a narrowly selected command family through relational command services.
7. Expand by domain with per-tenant/domain feature flags.
8. Cut over reads only after parity and security gates.
9. Cut over writes only when the relational command boundary is authoritative for that domain.
10. Retire JSONB only after recovery, retention, legal and audit approval.

### Authority by phase

| Phase | JSONB | Relational | Command API |
|---|---|---|---|
| Snapshot/import | authoritative | shadow | disabled |
| Shadow validation | authoritative | comparison | disabled |
| Pilot | authoritative for non-pilot domains | authoritative only for pilot commands | pilot only |
| Domain cutover | immutable history/compatibility | system of record for cutover domain | authoritative |
| Retirement | archive per policy | system of record | authoritative |

Avoid two independent writers. If compatibility JSONB must be updated, use a transactional outbox and idempotent projection worker with repair queue and parity checks—not browser dual writes.

## 4. Migration control tables

Proposed `legacy` schema:

| Table | Purpose |
|---|---|
| `import_runs` | tenant, source watermark, snapshot, transform version, status |
| `source_snapshots` | tenant/resource, source version, content hash, immutable object reference |
| `id_map` | legacy ID to target table/ID, unique source mapping |
| `record_map` | source resource/record to target row |
| `field_map_versions` | deterministic versioned transformation rules |
| `import_errors` | row-level failure, source pointer, safe diagnostic |
| `reconciliation_runs/items` | domain/scope/calculation version and expected/actual/delta/evidence |
| `exception_cases` | ambiguous branch, warehouse, line, partner or source mapping |
| `cutover_checkpoints` | tenant/domain, watermark, feature flag and rollback point |
| `effect_receipts` | source event to imported effects; prevents duplicate application |

Unique mapping: tenant + source system + resource + legacy ID. Re-running same snapshot/transform must be idempotent. A new transform version creates a new controlled run, not an overwrite.

## 5. Dependency-ordered import

1. Tenants/settings (preserve tenant IDs).
2. Legal entities, branches and explicit ownership decisions.
3. Users/roles/permissions (never import raw session tokens).
4. Subscription/trial evidence (do not restart 14-day trial).
5. Catalog, units, tax categories and services.
6. Warehouses, locations, stock snapshots, batches and serials.
7. Customers and suppliers.
8. Cashboxes, bank accounts, partners.
9. Opening-balance records and their existing effects/receipts.
10. Sales invoices, lines, payments, returns and voids.
11. Purchase invoices, lines, payments, returns and settlements.
12. Treasury, bank, cheque/card and partner events.
13. Stock movements/transfers/reservations/counts.
14. Expenses, shifts, workflows and audit history.
15. Derived reports/read models after source reconciliation.

This is dependency order, not permission to reapply side effects. Existing stock, treasury, bank, partner and opening effects are imported as historical evidence and linked to source IDs; do not regenerate them via live commands.

## 6. Field mapping rules

- Preserve legacy IDs in mapping/legacy ID columns; never derive IDs from document numbers.
- Preserve timestamps and timezone meaning. Ambiguous legacy local timestamps retain raw value and require review; do not silently treat as UTC.
- Preserve monetary values as exact decimals; avoid JS floating-point conversion.
- Preserve invoice number/series, date, status, cancellation reason, line order and original line IDs.
- Preserve historical price, discount, tax, cost and currency snapshots; do not recompute from current catalog.
- Preserve capital, current-account advances/repayments, withdrawals, partner exit liabilities separately.
- Preserve aggregate stock and warehouse stock separately; retain batch/serial/movement evidence.
- Preserve treasury and bank entries independently; do not derive movements from balanceAfter snapshots.
- Preserve opening approval actor/time and generated effects with one-time application markers.
- Preserve source version, base hash and sync state.

## 7. High-risk domain handling

### Sales, voids and returns
Import invoice and lines as historical source records. Import tenders independently. Returns must retain original invoice and line. Ambiguous line matches are exception cases; never match by name/price guess. Preserve canceled invoices. Import stock restoration, customer credit, refund, loyalty and audit effects with source/effect receipts. Never run live void/return handlers during historical import.

### Purchases and purchase returns
Keep receipt separate from payment. Keep physical return separate from cash refund, supplier debt reduction and store credit. Legacy settlement that changed debt without stock movement needs a marker and reconciliation. Preserve reversal/deletion evidence from snapshots/backups.

### Stock and transfers
Branch, warehouse and location remain separate. Do not infer branch from warehouse name. Legacy immediate transfers map to completed history; do not invent in-transit, dispatch, damage or shortage events. Reconcile by item/warehouse/location/batch/serial.

### Treasury, bank and partner
Import treasury and bank ledger independently. Do not sum balanceAfter snapshots. Preserve partner capital/current account/advance/withdrawal/exit separately. Cross-branch allocation requires evidence. Opening bank/cash is not income; opening inventory is not a purchase; opening difference is not automatic profit or capital.

### Opening balances
Import approved opening record and all generated effects with stable references. Record whether each effect was already applied. Prevent opening approval replay. Reconcile stock, cash, bank, AR/AP, partner capital/current account and unexplained difference separately. Accountant approval is required before assigning any difference to profit/capital/current account.

## 8. Offline outbox and transaction journal preservation

Mandatory workflow:
1. Put client into migration-aware mode that stops incompatible writes without clearing data.
2. Capture local bundle: tenant, resources, sync metadata, pending-resource list, transaction journal, device/app versions, timestamp and integrity hash.
3. Server acknowledges durable receipt and records checkpoint.
4. Compare local versions/base hashes to server; classify clean, pending, divergent or journal-recovery-required.
5. Recover incomplete local transaction journal before translation.
6. Translate pending operations only when exact semantics/dependencies can be reconstructed; ambiguous snapshots require controlled user review.
7. Keep original bundle and map accepted operations to stable command IDs.
8. Server returns durable accepted/rejected/conflict receipt for each command.
9. Client removes a pending item only after receipt and verified checkpoint.
10. Preserve old keys through a reversible adapter/version marker. Logout, reinstall, device replacement or trial conversion must not erase accepted or pending financial data.

Because current outbox records dirty resources rather than immutable events, a snapshot may not reveal original operation granularity. Do not fabricate it.

## 9. Reconciliation framework

Each run stores tenant, scope, source watermark, transform/calculation versions, operator and evidence.

### Structural
- Counts by resource/table/status.
- Source ID coverage and duplicate mappings.
- Orphan and cross-tenant FK checks.
- Document number uniqueness and sequence high-water marks.
- Timestamp/status distributions and null/unknown classification.

### Financial
- Sales gross, discounts, tax, returns, voids and net using one approved definition.
- Invoice tenders vs payment allocations.
- Customer receivables/credits.
- Purchase totals, supplier payments, returns, credits and payables.
- Treasury movements by cashbox/currency/date.
- Bank ledger by account and statement reconciliation.
- Partner capital/current account/withdrawals/advances/exit separately.
- Opening components and unexplained difference.
- Journal debit/credit and control-account reconciliation after posting policy approval.

Never compare unlike measures (gross incl. tax vs net-of-tax, or balanceAfter snapshots vs movement totals).

### Inventory
- Item/warehouse/location quantity.
- Batch quantities and expiry coverage.
- Serial uniqueness/custody.
- Reserved vs available quantity.
- Movement sums vs snapshots.
- Transfer source/destination conservation.
- Valuation using the same approved costing method/date.

### Reports and exports
Run identical filters, dates, branch scopes and permissions against both stores. Compare source IDs and totals. Dashboard, Excel, CSV, PDF, API and agent must share calculation definitions and authorization scope.

## 10. Dual-read / dual-write policy

Shadow reads compare only; one feature-flagged result is authoritative to users. Record safe diffs and watermarks.

For migrated commands: validate session/tenant/module/branch/permission; commit relational source, dependent effects, journal receipt (if applicable), command receipt, audit and outbox in one transaction. An outbox worker may project compatibility JSONB idempotently. Repair queue handles projection failure. Never permit browser code to independently write two authoritative stores.

## 11. Cutover and rollback

### Eligibility
- snapshots and hashes captured;
- no unresolved critical local journal;
- pending outbox preserved/classified;
- no material unresolved branch/warehouse/account attribution;
- structural, financial and inventory reconciliation pass;
- tenant/branch/module authorization tests pass;
- export parity and backup restore rehearsal pass;
- owner/accountant/security/engineering sign-offs recorded.

### Cutover
1. Record source watermark/checkpoint.
2. Pause only affected domain writes if needed; other modules continue.
3. Drain/classify pending commands; accepted work is never silently rejected.
4. Apply final delta and reconcile.
5. Switch authoritative reads and command routing for selected tenant/domain.
6. Verify controlled test tenant transactions and read-only checks.
7. Monitor duplicate receipts, lag, reconciliation deltas, outbox backlog and error rates.
8. Retain legacy snapshot and compatibility path for approved rollback window.

### Rollback
If no relational writes were accepted, route back to legacy and retain shadow data. If relational commands were accepted, do not switch to stale legacy writes. Freeze affected writes, capture accepted command/event watermark, reconcile, then forward-fix or perform controlled reverse projection using idempotency receipts. Never delete relational history or replay commands without receipt checks. Restore from backup only under tested PITR/WAL/event-replay procedures.

## 12. Failure response

| Failure | Response |
|---|---|
| Parse/constraint failure | quarantine with source pointer; no silent coercion |
| Duplicate source ID | stop batch and inspect mapping/hash |
| Cross-tenant FK failure | reject and security alert |
| Missing branch mapping | exception queue; no default branch |
| Ambiguous return line | manual review |
| Financial/inventory mismatch | block cutover |
| Incomplete local journal | recover before conversion |
| Pending operation cannot be reconstructed | retain bundle and request controlled resolution |
| Projection lag | retry idempotently and alert |
| Duplicate command retry | return original receipt; no second effect |
| Authorization/RLS failure | fail closed and block cutover |

## 13. Security and audit

Use dedicated least-privilege migration identity. Tenant-scope every job. Do not log credentials, password hashes, bearer tokens, payment secrets or unnecessary personal data. Encrypt snapshots and restrict access. Audit operator access, import, exception resolution and rollback. Test API authorization and RLS independently.

## 14. Tests

- Deterministic/idempotent mapping; decimal/timestamp preservation; ID uniqueness.
- Tenant-safe FK and RLS pooled-connection tests.
- Full sale/void/return/purchase/return command transaction.
- Injected failure at every write boundary and atomic rollback.
- Duplicate idempotency, outbox retry and projection repair.
- Offline bundle, pending operation and transaction journal recovery.
- Multi-branch, central warehouse, multiple cashboxes and bank ownership fixtures.
- Opening difference, cancelled invoice, partial returns, mixed purchase return settlement, partner advance/withdrawal, batch/serial traceability.
- Report/export/API parity.
- Import interruption/resume, backup restore, feature-flag rollback and forward-fix.

## 15. Sign-off and unresolved decisions

| Reviewer | Approval |
|---|---|
| Business owner | branch mapping, scope, retention/trial implications, cutover |
| Accountant | opening balances, AR/AP, cash/bank, partners, stock valuation, tax/journals |
| Operations | branch/register/warehouse/transfer/shift behavior |
| Security | tenant isolation, session, branch/module access, RLS, exports |
| Engineering | mapping, idempotency, atomicity, recovery, rollback, monitoring |

Open decisions: canonical ID format; branch/legal entity mapping; retention/anonymization; reconciliation tolerances; whether pending dirty-resource snapshots can be reconstructed; compatibility projection needs; RLS/pooling; PITR RPO/RTO; currency/FX; costing/serial policy; posting templates; feature flag thresholds and incident response.

## 16. Related documents

- `MALVIA-PHYSICAL-DATABASE-POSTGRESQL-DESIGN-v1.md`
- `MALVIA-LOGICAL-ERD-AUTH-API-v1.md`
- `MALVIA-BACKEND-API-SERVICES-AND-COMMAND-CONTRACT-v1.md`
- `MALVIA-MIGRATION-RECONCILIATION-WORKBOOK-v1.md`
- `MALVIA-ACCOUNTING-ENGINE-AND-POSTING-ORCHESTRATION-v1.md`
- `MALVIA-REPOSITORY-AUDIT-ADDENDUM-v1.md`
