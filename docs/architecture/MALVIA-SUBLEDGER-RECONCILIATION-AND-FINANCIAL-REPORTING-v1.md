# MALVIA — Subledger Reconciliation & Financial Reporting Contract (Draft v1)

**Status:** Proposed accounting/reporting contract. Tolerances, valuation policy, report presentation and statutory statements require owner/accountant approval. Documentation only.

## 1. Source-of-truth hierarchy
1. Posted general ledger is the authority for financial-statement balances.
2. Subledgers are detailed authority for customer, supplier, inventory, cashbox, bank, partner and payroll balances; they reconcile to GL control accounts.
3. Source documents/events prove commercial and operational origin.
4. Cached balances/dashboard snapshots are projections only, never independent accounting authority.
5. Treasury movements record cash custody/settlement; they are not automatically income, expense or GL journal entries.
6. Bank ledger entries are book-side activity; external statements are independent reconciliation evidence, not a substitute for the GL.

One atomic server command and posting receipt coordinate linked inventory, AR/AP, cash/bank, tax and GL effects.

## 2. Reconciliation contract
Each immutable run records tenant, legal entity/book, period, branch scope, as-of time, currency, policy version, source counts, control totals, differences, status, preparer/reviewer and evidence. New runs supersede but never overwrite old runs.

| Area | Subledger detail | GL comparison | Exceptions |
|---|---|---|---|
| Customer AR | Open invoices, credits, receipts, allocations, write-offs, aging | AR control by currency/dimension | Unapplied receipts, duplicate allocations, stale credits, cross-branch mismatch |
| Supplier AP | Invoices, returns/credits, payments, allocations, aging | AP control | Unapplied payments, supplier credits, unmatched return and central allocation |
| Inventory | Quantity/value by branch, warehouse, SKU, batch, serial, status | Inventory control and COGS | Negative stock, missing movement, valuation mismatch, in-transit/damaged/expired |
| Cashboxes | Opening float + receipts − payments ± approved adjustments per cashbox/shift | Cash accounts | Count variance, missing close, movement without source, paired transfer mismatch |
| Banks | Book ledger by account/currency/statement reference | Bank GL | Unmatched statement, duplicate posting, uncleared transfer, fees/value date |
| Card/acquirer | Sales batches, refunds, fees, chargebacks, net settlements | Card clearing and bank | Gross/net mismatch, delayed settlement, unknown batch/fee |
| Partner accounts | Contributions, advances, repayments, withdrawals, exit liabilities/payments | Equity/liability/receivable per approved policy | Capital/current account mix-up, duplicate payout, missing approval |
| Opening balances | Approved cutover lines by account, party, stock, cash, bank, partner | Opening journal and trial balance | Unresolved difference, duplicate import, missing evidence |
| Payroll/tax | Approved payroll/tax detail and liabilities | Payroll/tax controls | Unapproved run, mismatch, missing filing/settlement |
| Loyalty/deposits | Points/deposit liability and redemption/expiry | Applicable GL only if policy requires | Orphan points, duplicate earn/redeem, expiry treatment |

## 3. Conceptual reconciliation equations
Exact sign, valuation, tax and rounding policies require approval.
- AR closing = opening AR + posted invoices/charges − allocated receipts − credit notes − approved write-offs ± adjustments.
- AP closing = opening AP + posted supplier invoices/charges − allocated payments − supplier credits/returns ± adjustments.
- Cashbox expected = opening float + cash receipts − cash payments + confirmed incoming transfers − confirmed outgoing transfers ± approved adjustments. Compare with physical count; never auto-balance.
- Bank book = opening bank balance + posted credits − posted debits ± approved adjustments. Reconcile separately to statement using outstanding deposits/payments and identified differences.
- Inventory quantity = opening + receipts + saleable returns + inbound transfers + approved positives − sales/issues − supplier returns − outbound transfers − approved negatives.
- Inventory value uses approved costing, landed cost and write-down policy; never rely universally on current costPrice snapshot.
- Partner current account = approved opening + advances/amounts due − repayments/settlements ± approved reclassifications. Keep capital, withdrawals, profit distributions and exit liabilities distinct.
- Trial balance total debits equal total credits for each legal entity/book/currency under approved multi-currency policy.

A difference is a visible exception, not a number hidden by changing a snapshot.

## 4. Report catalog
**Financial statements:** trial balance; balance sheet; P&L; cash flow only after classification policy; general ledger; journal register.

**Operational/subledger:** customer statement and AR aging; supplier statement and AP aging; inventory valuation/movement/batch/serial/expiry/write-off/in-transit; cashbox/shift/count variance; bank book/statement reconciliation/card settlement; partner capital/current-account/withdrawal/advance/exit; opening-balance register; approved tax/VAT and payroll schedules.

**Management:** branch P&L; group consolidation; central expense/allocation analysis; branch comparison and drill-down.

Each report definition declares source ledgers, accounting basis, date field, status inclusion, cancellation/return/discount/tax logic, valuation, currency conversion, branch scope, consolidation rules, permissions, filters, formula version and export schema.

## 5. Branch and group reporting
- Branch scope comes from authenticated membership and explicit authorized branch IDs, never arbitrary client filters.
- Tenant-wide entries appear once in a central/unallocated column and once in group totals, never duplicated across branches.
- Sales belong to originating branch; collection performance is attributed separately to collecting branch.
- Expenses are direct branch, tenant-wide or explicitly allocated. Management allocations are labelled and do not duplicate statutory GL expense.
- Interbranch stock/cash transfers are internal movements, not group revenue/expense.
- Group totals retain branch drill-down/source IDs and equal tenant/legal-entity ledger totals.
- Cross-branch settlement reduces tenant-wide subledger once; origin and settlement branches remain separately reportable.

## 6. Calculation consistency across UI and exports
One versioned calculation service drives dashboard, screen, PDF, Excel, CSV, API and AI summaries. It must:
- exclude void/cancelled documents from active sales while retaining audit/void reporting;
- subtract approved returns once and enforce cumulative line-level return quantity;
- separate gross, discounts, returns, net sales, VAT/tax and tender collections;
- calculate profit from approved COGS/service basis, never a percentage fallback;
- use invoice timestamp and tenant timezone for daily/hourly periods and year+month for monthly grouping;
- reconcile purchase returns across stock, supplier credit, cash refund and store credit;
- value stock by approved warehouse/batch/serial costing, not stockQuantity × current costPrice alone;
- never sum balanceAfter snapshots as movements;
- enforce identical branch scope and permissions for exports and screens.

## 7. Exception workflow
Exceptions use stable IDs and states OPEN, ASSIGNED, UNDER_REVIEW, RESOLVED, WAIVED. Each has category, amount/quantity, accounts/subledgers, source IDs, branch, period, severity, evidence, owner, due date, resolution and approver. Waiver requires reason and authorized approver and never erases the difference. Resolution creates adjustment/reversal events and a new reconciliation run.

## 8. Logical API contracts (not implemented)
- POST /api/accounting/reconciliations — create immutable run for authorized scope.
- GET /api/accounting/reconciliations/{id} — read run/evidence under branch permissions.
- POST /api/accounting/exceptions/{id}/resolve — idempotent resolution with evidence.
- POST /api/accounting/reports/{reportId}/run — server-side report from approved definition.
- GET /api/accounting/reports/{runId}/export — authorized immutable export.
- POST /api/accounting/subledgers/{type}/adjustments — approved correction, never direct snapshot mutation.

All require session, tenant, legal entity, module, branch, period and export authorization server-side.

## 9. Acceptance tests
1. AR/AP detail reconcile to GL controls with differences visible.
2. Inventory quantity/value reconcile by branch/warehouse/lot/serial under approved costing.
3. Cashbox expected balance differs visibly from physical count.
4. Bank book and statement reconcile with outstanding items/evidence.
5. Card gross, fees, refunds and net settlement reconcile by batch.
6. Partner capital/current/withdrawal/advance/exit remain distinct.
7. Opening balances post once and preserve unresolved difference pending approval.
8. Group totals equal tenant ledger; central amounts are not multiplied by branch count.
9. Internal transfers do not inflate group sales, purchases, income or expense.
10. UI, Excel, PDF, API and AI share calculation version and scope.
11. Exports cannot bypass screen branch/role restrictions.
12. Differences have immutable runs and traceable resolution/waiver.

**Gate:** No financial report or reconciliation service is authoritative until GL, subledgers, accounting policy, valuation and access controls are implemented and independently tested.


## Related accounting engine design

- [Accounting engine and posting orchestration](MALVIA-ACCOUNTING-ENGINE-AND-POSTING-ORCHESTRATION-v1.md) — canonical source events, server-side command pipeline, synchronous source/journal/receipt/outbox commit or an explicitly approved pending-posting workflow with a separate later journal transaction, idempotency, template versioning, reversals, offline late-event handling and migration gates. Target architecture only; no runtime implementation is implied.
