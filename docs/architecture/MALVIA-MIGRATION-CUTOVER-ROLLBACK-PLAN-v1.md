# MALVIA Legacy Migration, Cutover & Rollback Plan — v1

**Status:** Safety plan for future implementation. No live tenant migration is authorized.

## 1. Goals and invariants

Migrate the current tenant/resource JSONB document system to the approved relational/domain model without loss, duplicate posting, cross-tenant exposure or silent accounting changes.

Immutable invariants:
- Preserve tenant identity and every stable source ID.
- Preserve invoice, purchase, return, transfer, expense, treasury, bank, partner, opening-balance, loyalty, batch, serial and audit history.
- Preserve original business dates, created/updated timestamps, invoice numbers, device codes and source references where available.
- Preserve offline pending outbox and transaction journal until safely acknowledged/reconciled.
- Never run demo reset or clear local storage as a migration technique.
- Never infer a branch from a warehouse ID, user device, currently selected branch or free text.
- Never replay opening-balance approval or financial side effects without source-operation receipts.

## 2. Migration phases

### Phase 0 — Governance and readiness
- Approve physical ERD, field mapping, accounting policies, branch mapping rules, data retention and downtime/dual-write strategy.
- Assign tenant owner, finance reviewer and technical migration operator.
- Freeze scope and schema version; record code/contract version.
- Confirm backup, restore rehearsal and access controls.

### Phase 1 — Tenant baseline snapshot
For each tenant, create an immutable, encrypted snapshot of every resource document and relevant metadata/version. Record:
- tenant ID, resource, source version/hash, record count, capture timestamp;
- IDs and relationships, nested IDs, source timestamps;
- pending outbox entries, transaction journal, device invoice counters;
- active sessions and current entitlement/license state (metadata only).
Verify snapshot checksums and restore into an isolated test environment. Do not read unrelated tenant data.

### Phase 2 — Mapping and branch resolution
- Create explicit source-to-target mapping tables for tenant, branch, warehouse, register, cashbox, bank account, employee, product and transaction IDs.
- Determine branches only from reliable source evidence approved by tenant owner.
- Existing warehouses remain warehouses; branch text descriptions are evidence, not IDs.
- Records without reliable branch scope go to an exception queue with source ID, candidate evidence and reviewer decision.
- Keep tenant-wide records tenant-wide where the domain supports it.
- No "default branch" assignment for ambiguous records.

### Phase 3 — Dry run / shadow load
- Transform snapshot into target schema in isolated environment.
- Validate required fields, FK ownership, uniqueness, enum mapping, date/timezone, currency precision, quantities, serial/batch relations and entitlement scope.
- Compare source and target record counts and deterministic hashes.
- Generate exceptions and proposed resolutions; no silent dropping or coercion.
- Execute domain reconciliation (see §4) and inspect all variances.

### Phase 4 — Rehearsal and approval
- Restore backup to a clean isolated environment and repeat migration from scratch.
- Test representative workflows: sale, split tender, void, partial return, purchase, purchase return, expense, bank payment, partner advance/withdrawal, settlement, opening balances, stock transfer and offline retry.
- Finance reviewer signs off every accounting reconciliation.
- Tenant owner approves branch mapping and operational downtime/cutover window.
- Technical owner approves rollback trigger and recovery point.

### Phase 5 — Production cutover (future, separately authorized)
Preferred approach: controlled write freeze, final delta capture, drain/resolve outbox, snapshot, migrate, reconcile, switch API routing, smoke test, then reopen writes. If a future dual-write strategy is selected, it must use transactional outbox/receipts and a defined source of truth; ad hoc dual writes are prohibited.

### Phase 6 — Stabilization
- Monitor errors, sync lag, duplicate/idempotency receipts, branch authorization denials, report variances and database constraints.
- Keep old snapshots and mapping manifests under approved retention.
- Do not decommission legacy reads/writes until rollback window expires and owner/finance acceptance is recorded.

## 3. Financial and stock reconciliation

Required source-to-target comparisons by tenant, branch where resolved, period and currency:
- Sales: count, gross, discounts, tax, net, returned amount, void/cancelled count and payment-method totals.
- Sales returns: count, original invoice linkage, returned quantity per line, refund/credit allocation, restock disposition.
- Purchases: invoice count, gross/net/tax, paid, outstanding, supplier allocation.
- Purchase returns: quantities, cash refunds, payable reductions, store credits, settlement markers and inventory effect.
- Treasury: opening + signed movements = closing by cashbox; never sum balanceAfter snapshots.
- Bank: opening + posted ledger entries = closing/reconciled statement; link every entry to source operation.
- Partners: capital, ownership, current account, advances, withdrawals, exit liabilities and settlement payments separately.
- Opening balances: approved batch count, source lines, generated effects, posting receipts; never approve twice.
- Inventory: on-hand, reserved, blocked/quarantined, batch/serial, weighted cost and valuation by warehouse; explain every variance.
- Customers/suppliers: transaction-level balance roll-forward and allocation; snapshot balances are comparison values, not authoritative ledgers.
- Loyalty: earned, redeemed, reversed and outstanding points.
- Tax: compare source tax treatment and rounding; no tax policy rewrite during migration.

All totals must reconcile to an agreed tolerance (normally exact to currency minor unit except explicitly documented rounding). Any unexplained variance blocks cutover.

## 4. Transaction idempotency and offline safety

- Capture immutable operation IDs, idempotency keys, payload hash, source device, actor, tenant, branch and server receipt.
- Drain pending outbox only after each operation is acknowledged or placed in a human-reviewed conflict queue.
- Preserve the transaction journal until all referenced resource writes have verified receipts.
- Retry returns the original receipt; it must not repeat stock, cash, bank, loyalty or balance effects.
- Legacy resource sync must not be treated as proof that a multi-resource business operation committed atomically.
- Conflicting edits to posted financial transactions are resolved through compensating events, not last-write-wins.
- Migration marker is per source operation and target effect; opening balance, purchase return settlement and other legacy side effects must not be replayed.
- Do not clear localStorage keys, pending server sessions or cached license state as a shortcut. Session rotation is a separately designed security operation.

## 5. Exception queue

Every exception contains:
- source tenant/resource/record ID and source version;
- target object/field and validation failure;
- reason and evidence;
- proposed mapping (if any), reviewer and approval timestamp;
- resolution action and resulting audit reference.

Examples: ambiguous branch; missing warehouse; duplicate invoice number across devices; missing return line ID; orphaned batch/serial; bank entry without source; supplier/customer snapshot mismatch; unknown enum; invalid timezone; duplicate operation; legacy settlement without receipt. No exception may be silently discarded.

## 6. Rollback design

Rollback is not "restore an old database and hope". Before cutover, define:
- exact rollback decision owner and deadline;
- last known good snapshot and transaction watermark;
- whether writes were frozen or accepted after switch;
- reverse delta/event capture for post-cutover transactions;
- tested restoration of old API/schema and routing;
- client compatibility and minimum supported version.

If writes are reopened on the new system, rollback requires replaying accepted post-cutover operations into the restored source system or an approved forward-fix. Never discard those operations. If atomic replay is impossible, keep the new system authoritative and use forward repair rather than destructive rollback.

## 7. Cutover stop conditions

Stop and revert before reopening writes if:
- snapshot/checksum mismatch;
- missing or duplicate source IDs;
- tenant/branch ownership violation;
- unexplained financial or inventory variance;
- duplicate posting or idempotency failure;
- unresolved critical exceptions;
- backup restore fails;
- offline queue/journal cannot be reconciled;
- API authorization regression or cross-tenant test failure;
- finance or tenant owner has not signed off.

After writes reopen, use the post-cutover recovery protocol; do not perform blind database rollback.

## 8. Required evidence pack

For every tenant migration retain:
- source snapshot manifest and checksums;
- schema and transform version;
- source-target ID mapping;
- branch resolution approvals;
- dry-run report and exception disposition;
- financial/inventory reconciliation workbook;
- backup/restore rehearsal results;
- test evidence and cutover checklist;
- owner/finance/technical approvals;
- cutover and rollback decision log.

## 9. Non-goals and explicit prohibitions

This plan does not authorize production SQL, schema deployment, live tenant reads, migration execution, clearing local data, changing accounting policy, or enabling trial/billing behavior. Those require separate approval after the design and commercial decisions are finalized.
