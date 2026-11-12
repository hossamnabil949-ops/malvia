# MALVIA — Accounting Period Close, Lock & Financial Controls (Draft v1)

**Status:** Proposed control framework. Period lengths, statutory deadlines, roles, thresholds and retention require owner/accountant and jurisdictional approval. Documentation only.

## 1. Objectives and period ownership
Periods belong to a legal entity + accounting book + fiscal calendar. A branch shift/day close is an operational checkpoint; it does not independently close the legal entity ledger unless separate books are legally approved. Each period stores start/end, timezone/cut-off, status, close owner, approver and immutable version.

Suggested lifecycle: OPEN → SOFT_CLOSED → CLOSE_IN_REVIEW → CLOSED → LOCKED. SOFT_CLOSED may route specifically authorized late events to review; it does not silently post them. CLOSED blocks ordinary posting. LOCKED is the stronger post-approval state. The server owns period status.

## 2. Close workflow
1. Prepare the scope: legal entity, books, branches, registers, warehouses, cashboxes, bank accounts and subledgers.
2. Publish exact accounting cut-off, timezone and date convention.
3. Resolve pending offline outbox operations, failed/unposted source events, open shifts, in-transit transfers, unallocated receipts/payments and draft returns.
4. Reconcile each cashbox and shift: opening float, expected cash, physical count, discrepancy evidence and approval.
5. Reconcile bank statements, book ledger, card batches, fees, chargebacks and outstanding deposits/payments.
6. Reconcile customer AR and supplier AP detail to GL control accounts; review unapplied items, aging and cross-branch settlement.
7. Reconcile inventory quantity/value by branch, warehouse, item, lot and serial; review negative stock, transfers, expiry, damaged/quarantine and count adjustments.
8. Reconcile partner capital/current accounts/withdrawals/advances/exit, payroll liabilities and taxes.
9. Review unposted/failed/duplicate events, manual journals, reversals, suspense balances, template versions and unusual entries.
10. Generate trial balance, P&L, balance sheet, approved cash-flow reports, branch/consolidated reports and supporting schedules.
11. Obtain preparer, independent reviewer/accountant and required owner sign-offs.
12. Lock with close-package hash, report snapshots, evidence, approvers and locked-through date.

## 3. Branch close vs accounting close
Branch managers may certify operational completeness and cash counts within assigned branch scope. They cannot close the legal entity ledger, override period locks or post backdated journals without permission. Central bank accounts and shared customer/supplier subledgers reconcile at tenant/legal-entity level while retaining branch dimensions.

## 4. Late-arriving events and cut-off
- Normal postings to a closed/locked period are rejected.
- Late events preserve original business/effective date and receipt time. Route to an exception queue and apply the accountant-approved current-period or reopen policy.
- Back-posting requires explicit reopen approval, scope, reason and audit.
- Never alter accounting date to bypass a lock.
- Offline events received after close are preserved; they are not discarded or silently shifted.
- A retry after close returns the original receipt if already posted; otherwise it remains pending for authorized resolution.

## 5. Reopen policy
Reopen is exceptional and requires request ID, entity/book/period, scope, reason, evidence, requestor permission distinct from approver, accountant/controller approval and owner approval for configured high-risk cases. Reopen is time-bounded and limited to approved posting categories. Capture the pre-reopen trial balance and close package. Audit every new/reversed journal and affected report; rerun reconciliations, obtain reapproval and relock with a new close version. Reopen never edits/deletes posted journals: corrections use reversal + replacement. Filed statutory periods require a separately approved amendment process.

## 6. Role separation
| Action | Initiator | Required control |
|---|---|---|
| Prepare close | Authorized finance user | Entity/branch scope and checklist |
| Approve branch cash close | Authorized manager | Count evidence and variance review |
| Post source event | Authorized operational role | Entitlement, permission, branch, open period and active template |
| Manual journal | Finance role | Independent approver; controlled accounts restricted |
| Reverse journal | Finance initiator | Independent approval, source and reason |
| Reopen period | Controller/accountant | Owner approval for high-risk/filed periods |
| Lock period | Controller/accountant | Completed reconciliations and signed package |
| Change account/template | Finance admin | Versioned approval, effective date and regression tests |
| Export close package | Finance/owner role | Export permission, scope and audit |

Where feasible, users cannot approve their own high-risk journal, reopen or close. Emergency override requires reason, second approver and alert.

## 7. Blocking exceptions
- Unbalanced journal or missing posting receipt.
- AR/AP detail does not reconcile to control account.
- Cashbox counted/expected variance above approved threshold.
- Unmatched bank/card settlement beyond approved age/amount thresholds.
- Inventory quantity/value mismatch, unapproved negative stock or in-transit transfer unresolved.
- Duplicate source posting or missing reversal link.
- Unallocated customer receipt/supplier payment or stale credit.
- Unresolved opening difference or unexplained suspense balance.
- Pending offline operations affecting the period.
- Missing tax/payroll/partner approval.
- Required branch attribution missing.
- Unauthorized manual journal or template version mismatch.

Waiver requires authorized reviewer, reason, evidence, amount/materiality and residual-risk acceptance. Waived exceptions remain in the close package.

## 8. Close package and evidence
Store immutable references to period scope/timezone/cut-off; trial balance and report snapshots with versions; AR/AP aging and reconciliation; inventory valuation/movement reconciliation; cashbox counts and bank/card matches; partner/payroll/tax schedules; exceptions/waivers/approvals; journal/source counts, reversals, template versions and idempotency receipts; actors/timestamps/audit; cryptographic manifest/hash. Reports must be reproducible from posted ledger and report-definition version. Exports remain access-controlled.

## 9. Server/API controls
Every posting API atomically checks actor/session, tenant membership, module/action entitlement, legal entity/book, branch scope, period status/accounting date, source lifecycle/idempotency, active approved template, account status, balanced lines, subledger references and audit/approval. Period transitions are server commands with optimistic concurrency and immutable transition records. Direct client sync cannot set period state or mutate posted journals.

## 10. Acceptance tests
1. Locked period rejects web, mobile, sync, agent and offline retry postings.
2. Same idempotency key returns prior receipt.
3. Late offline event is preserved and queued.
4. Branch shift close does not close accounting period.
5. Reopen requires independent approver and records prior/new close versions.
6. Existing journals remain immutable; correction uses reversal.
7. Browser clock/request date cannot bypass lock.
8. Close cannot finalize with unbalanced journals.
9. AR/AP, inventory, cash and bank differences are source-traceable.
10. Waivers include approver, reason, evidence and amount.
11. Unauthorized user cannot export close package.
12. Branch and group reports reconcile to same legal-entity trial balance.

**Gate:** No close/lock/reopen behavior is authorized until roles, fiscal calendar, statutory policy, materiality and exception tolerances are approved.


## Related accounting engine design

- [Accounting engine and posting orchestration](MALVIA-ACCOUNTING-ENGINE-AND-POSTING-ORCHESTRATION-v1.md) — canonical source events, server-side command pipeline, synchronous source/journal/receipt/outbox commit or an explicitly approved pending-posting workflow with a separate later journal transaction, idempotency, template versioning, reversals, offline late-event handling and migration gates. Target architecture only; no runtime implementation is implied.
