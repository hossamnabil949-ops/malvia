# MALVIA — Logical Chart of Accounts & Posting Template Catalog (Draft v1)

**Status:** Proposed logical taxonomy and illustrative event-posting design only. Not an approved statutory chart, account-code list, debit/credit policy, tax treatment, or implementation instruction. Owner and qualified accountant approval is mandatory before physical account codes or posting rules are finalized.

## 1. Design boundaries
- One shared accounting engine serves every industry pack. Industry packs emit typed business source events; they do not create separate ledgers.
- Separate legal entities/books where legally required. A branch is a reporting/operational dimension, not automatically a legal entity.
- Every posted journal is balanced per legal entity, book and currency; it references one immutable source event and a versioned approved template.
- Operational documents, inventory movements, treasury custody movements, bank statement lines and GL journal lines are related but distinct records.
- Each source event has a unique posting receipt keyed by tenant/legal entity, source type, source ID, event version and template version. Replays return the same receipt.
- Posted journals are append-only. Corrections use linked reversals and replacement entries.
- No account numbers are assigned here. Codes, statutory presentation, tax accounts and local requirements need accountant approval.

## 2. Logical chart-of-accounts taxonomy
This is a classification tree, not a finalized numbering scheme. Each leaf account must define normal balance, reconciliation control, allowed dimensions, currency policy, posting restrictions and financial-statement mapping.

| Class | Logical groups | Typical purpose / controls |
|---|---|---|
| Assets | Cash and cash equivalents; bank; card/acquirer clearing; trade receivables; other receivables; inventory; advances/prepayments; fixed assets; accumulated depreciation; deposits; tax recoverables | Reconcile cash/bank to custody/statements, AR to customer subledger, inventory to valuation and fixed assets to register |
| Liabilities | Trade payables; accrued expenses; taxes payable; payroll liabilities; customer deposits; deferred revenue; loans; cheques payable; related-party liabilities where legally applicable | AP to supplier subledger; tax/payroll/debt to supporting schedules |
| Equity | Issued/partner capital; additional contributions; retained earnings; current-period result; approved opening equity/suspense pending resolution; statutory reserves | Keep capital, profit, partner current accounts and withdrawals distinct |
| Revenue | Product sales; service/labor revenue; food/beverage sales; other operating revenue; returns/allowances; discounts if presented separately | Net/gross presentation and VAT exclusion require policy approval |
| Cost of sales | Merchandise COGS; ingredients/food cost; parts consumed; service materials; other direct costs; inventory write-offs where policy classifies them | Reconcile to inventory issue and valuation |
| Operating expenses | Payroll; rent; utilities; marketing; delivery; maintenance; bank/payment fees; software; administrative; depreciation; other operating costs | Direct branch, tenant-wide and allocated dimensions; avoid duplicate allocation |
| Other income/expense | Interest; foreign exchange; gains/losses on disposal; penalties; non-operating items | Classification and tax deductibility require approval |
| Memorandum/statistical (non-GL) | Units; reservations; loyalty points; production quantities; wastage metrics; operational KPIs | Not debit/credit accounts unless approved policy requires monetary recognition |

### Account metadata
Each account: stable ID, code assigned only after approval, localized name, class/group, normal balance, control-account flag, reconciliation type, legal entity/book, currency policy, allowed branch scope, effective dates, parent, tax category, statement mapping, posting restrictions and approval/version history. Control accounts (AR/AP/inventory/cash/bank/payroll/tax and applicable partner accounts) prohibit uncontrolled manual journals.

## 3. Dimensions and posting context
Every journal line resolves tenant, legal entity/book, account, currency, accounting date/open period, branch or explicit TENANT_WIDE scope, optional warehouse/register/cashbox/bank account/customer/supplier/partner, source document and line, operation/idempotency key, posting receipt, template ID/version, actor and approval. A bank account's ownership scope is independent of the branch that originated the transaction. Originating and collecting branches remain separate.

## 4. Posting template lifecycle
States: DRAFT → REVIEW → APPROVED → ACTIVE → RETIRED. Only an approved active version posts. New versions apply prospectively; they never rewrite posted history. Backdated use needs explicit period/reposting approval.

Each template defines source event and lifecycle state; required fields; account-role mapping; amount basis and rounding; approved debit/credit rules; dimensions; tax/discount/fee handling; subledger/inventory references; idempotency; reversal template; tests; approver and effective date.

## 5. Event posting matrix — questions to approve
**This matrix specifies required links and policy questions, not final debit/credit.** Accountant approval is required for account roles, timing, tax, valuation and presentation.

| Source event | Source of truth / required dimensions | Posting questions requiring approval |
|---|---|---|
| Sales invoice | Immutable invoice/lines/tender; origin branch, customer, tax, discount, register, inventory issue | Revenue recognition; VAT inclusive/exclusive; AR vs tender; COGS/valuation |
| Sales return | Return linked to original line; origin and receiving branches; quantity, disposition, refund/credit | Revenue/tax reversal; saleable restock vs damaged write-off; refund or customer credit |
| Void sale | Approved void linked to invoice; approver; remaining unreturned amounts/quantities | Full/partial reversal boundaries; prevent duplicate refund/restock |
| Customer receipt/refund | Receipt/refund and explicit invoice allocations; collecting branch and tender account | Applied/unapplied receipt; cross-branch settlement; refund vs credit note |
| Purchase receipt/invoice | Supplier invoice and receipt lines; receiving branch/warehouse, supplier, tax | Control transfer timing; landed cost; receipt vs invoice timing; AP |
| Supplier payment | Payment with invoice allocations; paying branch/account, supplier | Applied/unapplied amount; central payment across branches; value date |
| Purchase return | Return line + cash refund, debt reduction or store credit outcome | Inventory valuation reversal; AP allocation; cash refund vs credit; avoid duplicate settlement |
| Expense | Approved expense and tender; direct branch or tenant-wide allocation | Accrual vs cash; VAT recoverability; central allocation without double expense |
| Treasury cash movement | Cash custody event; cashbox, branch, shift and source | Is it settlement of a receivable/payable or custody-only movement? Never infer income/expense from cash movement |
| Cash/bank transfer | Paired transfer instruction/confirmation; source/destination accounts and branches | Clearing/in-transit timing; failed transfer reversal; never revenue/expense |
| Bank fees | Bank statement/fee event; account, statement line, allocation | Expense classification, VAT and bank reconciliation |
| Card settlement | Acquirer batch; gross sales, refunds, fees, net settlement, bank | Gross/net treatment, fees, chargebacks and unmatched settlement |
| Shift open/close | Shift lifecycle, opening float, expected/counted cash; register/cashbox | Float is not revenue; shortage/overage approval and materiality |
| Cash shortage/overage | Approved discrepancy with count evidence and approver | Suspense vs gain/loss; employee recovery policy/legal review |
| Inventory adjustment | Approved count/discrepancy; branch/warehouse/item/lot/serial/reason | Shrinkage, damage, expiry, found stock and revaluation |
| Stock transfer | Dispatch/receipt lifecycle; source/destination, in-transit, lot/serial/cost | Internal movement; destination recognition; shortage/damage |
| Partner contribution | Approved capital event and ownership evidence; partner/legal entity/source | Equity vs liability and legal documentation |
| Partner current account | Advance/repayment event; partner, origin and settlement source | Liability/receivable nature; distinct from capital/profit/expense |
| Partner withdrawal/exit | Explicit withdrawal or advance; approved exit calculation and payment | Distribution vs partner receivable/liability; exit liability and installment timing |
| Opening balances | Approved cutover package by account/party/stock/cash/bank/partner | Opening difference remains unresolved until accountant approval; never auto-add to capital/profit |
| Loyalty | Append-only earn/redeem/expire ledger; customer and source sale/return | Whether points create liability/marketing cost; points are not cash |
| VAT/tax | Tax determination attached to source event; code, jurisdiction, taxable base | Tax point, exemptions, inclusive pricing, recoverability, credit notes |
| Discounts | Approved discount allocation by invoice line/promotion | Revenue reduction vs expense; allocation across taxable lines |
| Payroll | Approved payroll run; employee, branch/cost center and period | Gross/net, deductions, employer costs and local statutory obligations |

## 6. Industry event extensions on the shared ledger
| Pack | Source events | Shared accounting boundary |
|---|---|---|
| Restaurant/café | Orders, kitchen tickets, recipes, ingredient issues, production, waste, delivery, tips, aggregator settlement | Shared sales/inventory/COGS/payroll/fees/tax; recipe and yield remain operational detail |
| Auto parts/service | Job cards, labor operations, part issues, warranty claims, core returns, reservations | Shared sales/COGS/AR/AP; labor and parts are distinct source lines |
| Supermarket/retail | POS sale, weighed/barcode item, promotion, receipt, expiry/write-off | Shared retail sales/inventory; summarized posting must retain traceable source totals |
| Clothing | Variant SKU size/color, exchange, markdown, seasonal clearance | Shared GL; variant inventory subledger |
| Pharmacy | Prescription/dispense, lot/expiry, controlled stock adjustment, supplier rebate | Shared GL; regulated traceability and jurisdiction-specific tax/rebate rules |

## 7. Posting receipt and idempotency
Persist source type/ID/version, tenant/legal entity, template version, deterministic idempotency key, journal IDs, result, timestamp and actor. Retries return the original receipt. Changed source facts require a correction event, not a second posting of the same version.

## 8. Illustrative balance example (not a posting template)
For a simple cash sale of 100 currency units with no tax, discount, return, inventory cost, fee or credit, the journal must contain equal total debit and credit. This document intentionally does not prescribe the account names or sides. A real sale also needs the separate approved inventory/COGS valuation posting where applicable.

## 9. Mandatory tests
1. Each journal balances by currency/book; rounding follows approved policy.
2. Repeated source/version creates one receipt and one posting result.
3. Draft, retired or out-of-date templates cannot post.
4. Returns cannot exceed original unreturned quantity/value and reverse original links.
5. Tender splits reconcile to payment allocations and custody/bank/card clearing.
6. COGS and inventory reconcile under approved costing.
7. Branch and tenant-wide scopes are explicit; consolidation counts each event once.
8. Tax, discounts and fees reconcile to source details.
9. Posted entries cannot be edited/deleted; correction creates linked reversal/replacement.
10. Controlled subledger accounts reject unauthorized manual journals.
11. Pack upgrades cannot silently alter historical template versions.
12. Opening balance posting is evidence-backed and replay-safe.

## 10. Decisions required
Legal entities/books; reporting currency and accounting basis; account codes and normal balances; VAT/tax point and recoverability; costing method; revenue recognition for services/deposits/tips/aggregators; discounts, loyalty, warranty and partner treatment; shortage/overage and card/bank fees; opening difference; period controls.

**Gate:** Do not generate physical account codes, final debit/credit templates, SQL, migration scripts or live postings from this draft. Obtain signed owner/accountant approval.
