# MALVIA Financial Ownership, Subledgers & Consolidation Policy Design — v1

**Status:** Proposed accounting/domain design for owner and accountant review. It is not an approved accounting policy, chart of accounts, physical schema or posting implementation.

## 1. Objective

A multi-branch tenant needs to distinguish **legal balance ownership** from **where business activity occurred**. A branch is not automatically a separate legal entity or separate set of books. Shared customers and suppliers must not be duplicated merely to produce branch reports.

## 2. Recommended hybrid model (approval required)

| Domain | Ownership | Branch treatment | Control |
|---|---|---|---|
| General ledger | One tenant ledger per legal entity and currency/book | Branch dimension on attributable postings; explicit tenant-wide scope for central postings | One trial balance; branch and group reports reconcile |
| Customers / receivables | One tenant-wide party identity and subledger | Invoice, receipt, credit and adjustment retain origin and settlement branch | No duplicate customer balances |
| Suppliers / payables | One tenant-wide party identity and subledger | Purchase, receipt, payment, return and credit retain branch dimensions | Central procurement remains possible |
| Cashboxes | Branch-owned cash accounts | Each movement belongs to one branch/cashbox | Multiple cashboxes per branch; paired transfers |
| Bank accounts | Tenant-central or branch-owned | Account scope plus explicit branch allocation when attributable | Central bank can serve multiple branches |
| Expenses | Branch-direct or tenant-wide | Central expenses may have approved allocation lines | No arbitrary branch assignment or double expense |
| Inventory | Branch + warehouse stock subledger | Warehouse belongs to exactly one branch | Quantity and value reconcile by location |
| Partner capital/current accounts | Tenant-wide by default | Branch only as management dimension unless legal structure requires otherwise | Branch is not a legal partner entity by default |
| Internal transfers | Tenant-wide internal movement/clearing | Source and destination branches retained | Never group revenue, purchase or expense |

This is the recommended starting point, not a final accounting instruction. Confirm the legal entity, tax registration and statutory books structure with the accountant.

## 3. Customer and supplier balances

### One identity, branch-aware transactions

Keep one customer/supplier master per tenant unless the legal party is genuinely different. Each transaction stores tenantId, partyId, explicit branch scope, source document/line IDs, amount, currency, due date, settlement allocations and adjustment references.

Customer.balance and supplier.balance may remain cached projections, but are not the accounting authority. They must reconcile to posted subledger entries.

### Cross-branch collection

If Branch A issues an invoice and Branch B receives payment:
- Payment is allocated to the exact open invoice/receivable.
- Invoice-origin branch remains A; cashbox/payment-taking branch is B.
- Settlement branch is stored separately.
- Sales performance is attributed to A; cash collection is attributed to B.
- Consolidated tenant receivable reduces once, never once per branch.

**Recommended reporting convention:** originating branch owns the sale; collecting branch owns the cash movement. This keeps sales performance distinct from collection performance.

### Central supplier payment

A central payment can settle invoices from multiple receiving branches. It must contain explicit invoice allocations and preserve each purchase/receipt branch. Unapplied amounts remain supplier credits until assigned; do not auto-distribute unless a settlement policy is explicitly approved.

## 4. Cashboxes and bank accounts

### Cashboxes
- Every cashbox belongs to one branch and has a stable cashboxId.
- Multiple cashboxes per branch are supported.
- Register/shift assignment is time-bounded and audited.
- Opening float, receipts, refunds, expenses, deposits, withdrawals and counted close are separate source events.
- Physical transfer between cashboxes/branches uses paired events; it is not income or expense.
- A bank-only event cannot silently change physical cash.

### Bank accounts
Support two explicit scopes: TENANT_CENTRAL and BRANCH_OWNED. Every bank ledger entry records account, source operation, counterparty, date, direction, amount, reference and reconciliation state. Central account allocations may target one branch, several explicit branches, or remain tenant-wide/unallocated.

Allocation lines must sum to the attributable amount. If allocation is unknown, preserve it as unallocated; never invent a branch split. A central bank account does not make every transaction tenant-wide: source expense/purchase branch remains explicit.

## 5. Expenses and allocation

Support three cases:
1. Direct branch expense: branchId required.
2. Tenant-wide expense: no forced branch.
3. Allocated central expense: one source expense with explicit allocation lines.

Store allocation basis (manual amount, fixed ratio, headcount, usage or another approved method), source amount, target branch amounts, version, effective date, preparer and approver. Allocation totals must equal source amount under the approved rounding policy.

Separate statutory accounting allocation from management-report allocation. A management-only allocation must not create a second general-ledger expense. Reports must label posted/statutory values separately from management allocations. Reallocation is an adjustment event, not mutation of history.

## 6. Consolidation and internal movements

- Branch P&L is a dimension-filtered view of the tenant ledger, not a separately maintained profit total.
- Group totals include tenant-wide entries once and branch entries once.
- Central expenses may appear in a separate central column. If management allocates them to branches, the same central amount must not also be added to group totals.
- Interbranch stock transfer is internal inventory movement; cash transfer is paired custody movement.
- Central bank payment for a branch liability settles the original payable; it is not a second expense.
- Internal service charges are not assumed; if introduced, they require approved policy and consolidation elimination.

## 7. General ledger and posting architecture

The inspected application has operational documents, treasury, bank entries, partner ledgers and cached balances. It does not establish a complete universal double-entry journal. Do not describe it as full accounting until this layer is designed and reconciled.

Target:
- Append-only journal_entries and journal_lines, tenant/legal-entity scoped.
- Each entry has source event ID, posting-template version, accounting date, currency, period, status, actor and idempotency key.
- Each line has account, debit/credit, amount, currency, branch dimension or explicit tenant-wide scope, optional counterparty and source reference.
- Debits equal credits per journal entry and currency/book.
- Posted entries are immutable; correction uses reversal + replacement with links.
- AR/AP, inventory, cash and bank subledgers reconcile to control accounts.
- Posting templates are versioned and accountant-approved. Industry packs may define event types but cannot create separate cash/accounting ledgers.
- Draft/unposted events are excluded from statutory trial balance and clearly labelled in operational reports.

No chart-of-account codes or debit/credit mappings are prescribed. VAT, COGS, discounts, returns, card fees, loyalty, deposits, partner events, costing and tax timing require approved posting templates.

## 8. Existing-business opening balances

A company joining MALVIA after operating for months or years needs a controlled cutover snapshot, not replay of historical cash/stock as current-period income.

Capture separately:
- partner capital and ownership evidence;
- inventory by branch/warehouse/item/lot/serial and approved valuation basis;
- counted balance for each cashbox;
- each bank account balance and reconciliation date;
- customer receivables and supplier payables by party and open document/aging where available;
- partner current-account balances, distinct from capital;
- loans, taxes, deposits, advances and other liabilities/assets;
- retained earnings/opening equity or surplus/deficit treatment approved by accountant.

The difference between assets and liabilities/equity remains an explicit unresolved opening difference until accountant approval. It must not silently increase share capital, profit or partner current accounts. Preserve source evidence, approval, posting receipt and one-time migration marker. Never replay opening effects.

## 9. Required shared dimensions

Minimum contracts: tenantId, legalEntityId, branchId (nullable only with explicit tenant-wide scope), warehouseId, registerId, cashboxId, bankAccountId, partyId, sourceDocumentType, sourceDocumentId, sourceLineId, operationId, idempotencyKey, postingTemplateVersion, accountingDate, effectiveAt, createdAt, postedAt, actorId, currencyCode and allocationGroupId where applicable.

All tenant, branch, account and nested references are validated server-side. Branch scope is never trusted from a client assertion.

## 10. Decisions requiring owner/accountant approval

| Decision | Recommended starting point | Approval required |
|---|---|---|
| Legal books | One tenant ledger per legal entity | Confirm whether one tenant may contain multiple legal entities |
| Customer/supplier | Tenant-wide subledger + branch dimensions | Confirm cross-branch settlement/allocation |
| Sales attribution | Originating branch; collection branch separately | Confirm reporting convention |
| Cashboxes | Branch-owned; multiple per branch | Confirm central petty-cash exceptions |
| Bank accounts | Central and branch-owned supported | Approve cross-branch allocation/reconciliation |
| Expenses | Branch-direct + central + explicit allocations | Approve allocation basis and statutory vs management treatment |
| Partner balances | Tenant-wide by default | Confirm legal ownership structure |
| Opening difference | Explicit unresolved difference | Accountant chooses final account/treatment |
| Transfers | Preserve inventory cost; paired internal movement | Approve costing and in-transit valuation |
| Journal | Balanced append-only journal and reconciled subledgers | Approve chart of accounts and posting templates |

## 11. Acceptance tests

1. Customer buys in A and pays in B: receivable reduces once; sale remains attributed to A; collection cash belongs to B.
2. Supplier serves A and C and receives one central bank payment: exact invoice allocations; payable reduces once.
3. Central bank pays a branch expense: bank changes once; expense attribution is explicit; no duplicate expense.
4. Cashbox transfers between branches: source decreases and destination increases; group income/expense unchanged.
5. Central expense allocated to A/B: allocations equal source; group expense counted once; reallocation audited.
6. Branch with multiple cashboxes/registers reconciles each shift independently.
7. Central warehouse belongs to designated branch; transfer preserves item/lot/serial cost.
8. Branch, central and group reports reconcile without duplicate balances.
9. User without branch C access cannot see C's parties, cash, bank allocations or exports.
10. Posted journal entry cannot be edited/deleted; reversal retains source and audit history.
11. Opening balances post once; retries do not duplicate cash, bank, stock or partner capital.
12. Journal entries balance and AR/AP/inventory/cash/bank subledgers reconcile to control accounts.

**Gate:** Proposed model only. Owner/accountant approval is required for legal-entity boundaries, allocation rules, chart of accounts, posting templates, tax treatment and opening-balance policy before physical schema, SQL or runtime implementation.


## Related accounting design documents

- [Logical chart of accounts and posting template catalog](MALVIA-CHART-OF-ACCOUNTS-AND-POSTING-TEMPLATES-v1.md) — proposed account taxonomy, source-event posting questions, industry event extensions and posting receipt/idempotency controls. All posting directions remain pending accountant approval.
- [Accounting period close and controls](MALVIA-ACCOUNTING-PERIOD-CLOSE-AND-CONTROLS-v1.md) — period state machine, close/reopen approvals, late offline event policy and close evidence.
- [Subledger reconciliation and financial reporting](MALVIA-SUBLEDGER-RECONCILIATION-AND-FINANCIAL-REPORTING-v1.md) — GL/subledger reconciliation, branch consolidation, report consistency and exception workflow.


## Related accounting engine design

- [Accounting engine and posting orchestration](MALVIA-ACCOUNTING-ENGINE-AND-POSTING-ORCHESTRATION-v1.md) — canonical source events, server-side command pipeline, atomic source/journal/receipt/outbox commit, idempotency, template versioning, reversals, offline late-event handling and migration gates. Target architecture only; no runtime implementation is implied.
