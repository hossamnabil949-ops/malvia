# MALVIA — End-to-End Transaction Lifecycle & Source-of-Truth Map (Draft v1)

Status: design/audit artifact only. No runtime code, SQL, migration, merge, or deployment.
Audit source: current `malvia-web` application contracts and utilities inspected on 2026-11-06. This document separates **observed behavior** from **target design** and marks unverified accounting postings explicitly.

## 1. Design rules

1. A business document is the source event; its stock, payment, cash/bank, customer/supplier, loyalty, and report effects are linked consequences, not independent copies to be edited freely.
2. Preserve original document IDs, line IDs where present, numbers, local dates/times, status, employee attribution, and correction/void history.
3. Keep tenantId, branchId, warehouseId, registerId, cashAccountId, and bankAccountId as different concepts. Existing warehouseId is not a branch identifier.
4. Every consequential command must be atomic across all affected resources and retry-safe. A retry must return the original result, not repeat stock/cash/bank/customer effects.
5. Offline writes retain a stable operation/idempotency key and source-document relationship. A conflict must be surfaced for resolution; never silently overwrite a financial or stock event.
6. Never infer a journal entry from a UI label. The current application has several operational ledgers and snapshots; a complete double-entry journal model was not established by the inspected source.
7. Corrections should be reversal + replacement or an explicit correction event, not destructive editing of a posted transaction.
8. Reports and exports must use the same branch authorization and calculation policy as the underlying screen.

## 2. Transaction lifecycle catalogue

### 2.1 Sales invoice

| Stage | Observed current representation / behavior | Target source of truth and invariant |
|---|---|---|
| Create | `Invoice` with header, `items[]`, `payments[]` (optional split tender), tax, discount, grandTotal, customer/cashier, optional warehouseId and status. | Immutable SalesInvoice + SalesInvoiceLine + InvoicePayment. Required branchId and explicit registerId; preserve invoice-time item name, SKU, unit price, costPrice, tax and discount snapshots. |
| Validate | Sale logic validates positive quantities, stock, payments/credit and customer credit limit. Money helpers convert EGP to integer piastres during calculations. | Validate module entitlement, employee permission, branch assignment, open register/shift policy, stock availability at the selected branch/warehouse, price/discount policy, credit exposure, and tracking allocation on server. |
| Stock | Sale logic deducts stock; item stock is currently represented by parts.stockQuantity and warehouse-aware stock levels. Stock movements carry type, qtyDelta and balanceAfter. | One inventory issue per invoice line/allocation; available = on-hand minus reservations and any approved holds. Enforce no negative stock unless an explicit authorized policy permits it. |
| Tender | Invoice has paymentMethod and optional payments[]; creditAmount and settlementPayments[] also exist. | Preserve every tender line and distinguish cash, bank/card, wallet, cheque, and credit receivable. Do not assume paymentMethod alone represents split payments. |
| Cash / bank | Treasury categories include cashier sales and customer collection; bank ledger utility creates source-linked, duplicate-protected entries. | Create linked cash movement for cash portion and bank/card clearing entry for bank tender; each posting points to invoice/payment line. Card gross, fee and net settlement remain separate. |
| Customer balance | Customer has balance snapshot; invoices can contain customerId and creditAmount. | Receivable subledger derives open amount from invoice + allocations + returns/credit notes + adjustments. Customer.balance remains a reconciled cache, not independent authority. |
| Loyalty | Invoice supports loyaltyEarned, redeemed points and discount; loyalty ledger has earn/redeem/reversal/return events. | One ledger event per source invoice/line policy; redemption must be atomic with sale; returns reverse proportional earned/redeemed points according to documented policy. |
| Reports | reportsLogic excludes cancelled invoices, nets recorded returns and calculates item profit from stored invoice-line cost where available. | Reports use posted events and explicit period/branch filters. Revenue before tax, output VAT, discounts, returns, COGS and margin remain distinct measures. |

**Must preserve:** invoiceNumber uniqueness, item line identity, payment splits, returned quantities/serials, tax and discount snapshots, cashier attribution, warehouse source, void reason/approval, and linked treasury/bank events.

**Not yet proven:** a universal journal posting set for cash sales, credit sales, VAT, COGS, inventory, discount, and card fees. The implementation must not be described as full double-entry accounting until this is designed and tested.

### 2.2 Sales return / refund / credit

| Stage | Observed | Target invariant |
|---|---|---|
| Create return | `SalesReturn` references invoiceId/invoiceNumber and item lineId when available; records quantity, totalRefundAmount, refundMethod and treasuryDeducted. | Return must reference original invoice and original line. Cumulative returned quantity cannot exceed sold quantity; serial can be returned only once and only to its original sale. |
| Stock | Return-related stock movements exist; tracking/serial data is supported in invoice lines. | Returned stock goes to an explicit disposition: saleable stock, quarantine/damaged, or scrap. Do not increase available stock automatically for damaged/unverified goods. |
| Refund | Refund method currently distinguishes cash from treasury, reduction of customer credit, and wallet/Instapay. | Refund allocation must sum to approved refund amount and identify cash account/bank/wallet/receivable credit. A cash refund creates exactly one cash-out; credit refund reduces receivable without cash movement. |
| Accounting | Return amount and treasury effects are represented operationally; no universal journal schema was confirmed. | Reverse net revenue and output VAT according to tax rules, restore COGS/inventory only for saleable returned goods, and record refund/credit liability. Exact account mapping awaits accounting approval. |
| Loyalty | `loyaltyAfterReturn` and return/reversal event types exist. | Reverse earned points and handle redeemed points proportionally and idempotently; retain original and reversal references. |
| Delete/correct | Return correction/delete action types exist in audit and utility logic. | Posted return must not be physically deleted. Use reversal event and preserve both original and reversal in audit. |

### 2.3 Purchase invoice / receipt / supplier liability

| Stage | Observed | Target invariant |
|---|---|---|
| Receive | `PurchaseInvoice` with items, warehouseId, supplier, tax, discount, amountPaid, remainingBalance and paymentStatus. | Separate purchase document from physical receipt if goods can be partially received. Keep supplier invoice number and internal receipt identity. |
| Stock | Purchase lines can include batchNo, expiryDate and serials; stock movements support purchase. | Inventory receipt is branch + warehouse + item + batch/serial scoped. Quantities received must match accepted lines; partial receipts remain open. |
| Cost | Purchase line costPrice and taxAmount are stored. | Preserve landed/recognized cost basis and tax treatment explicitly. Freight/discount allocation policy needs confirmation before normalization. |
| Payment | Payment can be immediate, deferred or partial; supplierPayments and supplier payment schedules exist. | Supplier liability is created for recognized invoice amount; payment allocations reduce the exact supplier/invoice balance. Split tender must retain cash/bank sources. |
| Treasury/bank | Treasury categories include cash purchase and supplier payment; supplierPayment includes treasurySource and bankAccountId. | One cash/bank outflow per actual payment, linked to payment allocation. Avoid duplicate outflow when both invoice and payment resource sync. |
| Reports | Purchase, supplier payable, inventory valuation and tax reports exist. | Purchase expense/stock capitalization, input VAT, payable and cash-flow measures must not be conflated. |

### 2.4 Purchase return / supplier credit / refund

- Current `PurchaseReturn` links to purchaseInvoiceId and records returned lines, totalReturnAmount, deferred debt reduction, store credit, cash refund to treasury, and settlement state.
- Target flow: validate against original received quantity less prior returns; issue stock return from the correct warehouse/batch/serial; reduce the related payable only by the allocated deferred-debt amount; record excess as supplier credit; record cash received as one cash-in/bank-in event.
- The sum of deferredDebtReduction + storeCredit + cashRefund must reconcile to the approved return amount, subject to explicitly recorded rounding/adjustment. Do not assume these fields are always all populated or mutually exclusive without validation of historical data.
- Supplier balance/deferredDebt/storeCredit are currently snapshots/derived fields; migration must reconcile them against invoices, payments and returns before choosing the canonical ledger.
- Exact purchase return journal accounts and VAT reversal treatment remain **accountant approval required**.

### 2.5 Stock transfer between warehouses / branches

| Stage | Current evidence | Target lifecycle |
|---|---|---|
| Transfer request | `StockTransfer` currently has fromWarehouseId, toWarehouseId, items, date/time and creator. | Require sourceBranchId + destinationBranchId and source/destination warehouse IDs; validate both scopes and transfer permission. |
| Dispatch | Current interface does not show explicit in-transit status or dispatch/receipt events. | Deduct source available stock and create an in-transit asset/quantity at dispatch. |
| Receive | Current interface does not expose partial receipt, shortage, damage or received quantities. | Receive each line with accepted, short, damaged and rejected quantities; reconcile in-transit remainder. |
| Cancel | No complete cancellation lifecycle established from inspected type. | Before dispatch, cancel request only. After dispatch, reverse only the unreceived balance through a traceable return-to-source movement. |
| Reporting | Transfer is internal movement, not sale or purchase. | Never inflate group sales, purchases, income or expenses. Show branch-to-branch transfer and in-transit separately. |

**Migration warning:** current StockTransfer has no branch IDs or lifecycle status. Do not invent dispatch/receipt history for legacy transfers. Map source/destination warehouse ownership and mark unknown historical state for review.

### 2.6 Expenses and company-wide allocations

- Current Expense includes title/category/amount/date/paymentMethod/bankAccountId/recordedBy; it has no confirmed branchId or allocation-line structure.
- Target: support direct branch expense and tenant-wide expense with explicit allocation lines. Each allocation must sum to the source expense amount; preserve allocation method (direct, fixed, headcount, usage, manual) and who approved it.
- Cash expense produces one cash-out; bank expense produces one bank-ledger outflow. Do not infer account posting or expense recognition date from payment date where accrual/prepayment treatment is relevant.
- A tenant-wide expense must remain tenant-wide until an approved allocation exists; never assign it to a branch based on the paying cashbox alone.

### 2.7 Register shifts and cash reconciliation

- Current Shift captures openingCash, opening denominations, carryOverDiff, expectedCash, countedCash, variance, variancePosted, cashIn/cashOut, cashSales, nonCash, invoiceCount and breakdown.
- TreasuryTransaction may carry shiftId; `shiftLogic` summarizes shift transactions and calculates variance as counted minus expected.
- Target: every cash movement references branch + register + shift + cash account. Opening float is not revenue. Closing variance is an explicit approved cash over/short event with one idempotent posting. Reopening/adjusting a closed shift requires privileged correction with audit.
- Card/Instapay/wallet amounts are not physical cash and must not inflate counted drawer cash.
- A shift close must reconcile invoice tender lines, cash receipts/refunds, supplier/expense cash movements, cash transfers and opening float. Difference must remain visible; never silently force expected = counted.

### 2.8 Partner capital, partner current accounts and partner exits

- Current Partner stores initialCapital, addedCapital, reinvestedProfits, totalCurrentCapital, totalWithdrawn and ownership percentage.
- PartnerWithdrawal distinguishes `withdrawal` from `advance`. PartnerCurrentAccountTransaction has four types: partner deposit, partner withdrawal, partner repayment, company repayment, with treasuryTransactionId and optional bank account.
- Opening balance logic deliberately separates historical partner capital from opening partner current-account balance. Approved opening record is immutable; current-account validation checks linked treasury and bank records, origin, date, and overpayment.
- Target: capital contributions, ownership changes, profit reinvestment/distribution, ordinary withdrawals, advances, current-account deposits/withdrawals/repayments, and exit settlements must be separate transaction classes. A partner current-account advance must not silently change share capital or profit.
- Partner exit settlement keeps capital entitlement, profit entitlement, other entitlements, withdrawals, advances, deductions and net payable distinct.
- Preserve existing ownership percentages and effective dates. A branch dimension must not create separate equity unless owners explicitly approve branch-level equity.
- Do not infer accounting classification for legacy withdrawal/advance records if kind is missing; quarantine for review.

### 2.9 Cheques

- Cheque utility models incoming/outgoing direction, lifecycle status/history and actions such as deposit, clear, bounce and cancel.
- A cleared cheque creates a bank-ledger entry; a bounced cheque creates a reversal entry. Duplicate cheque postings are rejected by deterministic source IDs.
- Target: each cheque has a party, issuing/receiving branch, linked invoice/payment, bank account, due date, immutable lifecycle events and exact posting/reversal IDs. Deposit is not the same as cleared cash. A bounced cheque must reverse the cleared bank movement and reopen the original customer/supplier exposure according to its source.
- Cheque status alone must not be treated as settled receivable/payable; derive from linked source allocations and bank events.

### 2.10 Bank accounts and card settlement

- BankAccount has opening balance and active status; BankLedgerEntry is the movement ledger. CardSettlementBatch validates gross amount, fee, net amount = gross - fee, and bank account.
- Target: account scope explicitly tenant-central or branch-owned; opening balance is an opening transaction, not an editable running total. Bank transfers create paired out/in entries with one transfer ID. Card settlement maps individual card receipts to processor batch and bank deposit; fee is separate expense/contra-revenue according to accountant-approved policy.
- Reconcile statement balance, book balance, outstanding deposits, pending card settlement, returned cheque and unmatched entries. Do not duplicate a card receipt as both a cash movement and a bank deposit.

### 2.11 Reservations and deposits

- PartReservation currently stores part, quantity, customer, reservedAt/expiresAt, status, unitPrice and depositAmount; Treasury category includes reservation deposit.
- Target: reservation hold is not a sale and must not deduct stock as sold. It reduces available-to-promise quantity only. Deposit must be a linked liability/customer advance, later allocated to invoice, refunded or forfeited only under an explicit policy.
- Conversion to invoice must consume reservation once and release/consume held stock atomically. Expiry/cancellation releases hold; any deposit settlement remains traceable.

### 2.12 Loyalty

- Loyalty ledger supports earn, redeem, reverse_earn, reverse_redeem, return, return_undo, adjust, expire and opening.
- Target: append-only point ledger with customer, branch, source document, effective/expiry date and idempotency key. Branches share a customer identity but earn/redeem authorization and reporting retain originating branch. A return reverses the source accrual; it must not directly overwrite customer.loyaltyPoints without ledger reconciliation.

### 2.13 Opening balances / cutover

- Current OpeningBalanceRecord has cutoverDate, originalCapital, lines, partners and status; approved record is immutable. Lines include amount and optional quantity/unitCost/part/bank references. Partner currentAccountBalance is separate from original capital.
- Target: one controlled opening batch per tenant (or explicitly versioned subsequent adjustment batch), with branch allocation for every stock/cash/bank/receivable/payable/liability line. Preserve the original signed evidence and approver.
- Inventory opening quantity × unit cost must equal line amount; bank lines map to real bank accounts; partner ownership percentages must reconcile under existing validation.
- Opening balance difference is a documented surplus/deficit, not a plug to capital or profit without accountant approval.

## 3. Cross-cutting source-of-truth matrix

| Domain | Canonical event / source | Derived or cached fields that must reconcile | Branch dimension |
|---|---|---|---|
| Sales | Posted invoice + invoice lines | customer balance, item sales totals, tax totals, cashier totals | Required |
| Sales return | Posted return + original line allocations | returnedQuantity, returnedAmount, refund/credit totals, loyalty reversal | Required |
| Purchases | Accepted purchase receipt + supplier invoice | item cost/stock, supplier debt, input tax | Required |
| Purchase return | Posted return + original purchase line | returnedQuantity, debt reduction, supplier credit, cash refund | Required |
| Inventory | Immutable movement events + count adjustments | on-hand, reserved, available, stock value | Required branch + warehouse |
| Customer | Customer identity + receivable ledger | balance, aging, credit exposure | Tenant identity; transactions branch-scoped |
| Supplier | Supplier identity + payable ledger | balance, deferred debt, store credit | Tenant identity; transactions branch-scoped |
| Treasury | Cash movement ledger | cashbox balance, shift expected cash | Required branch + register/cash account |
| Bank | Bank ledger events | book balance, reconciliation state | Account scope explicit |
| Partner capital | Capital/ownership events | capital and ownership snapshot | Tenant-wide unless approved otherwise |
| Partner current account | Current-account event ledger | partner receivable/payable | Tenant-wide unless approved otherwise |
| Loyalty | Append-only loyalty ledger | available points | Tenant customer; source branch retained |
| Cheque | Cheque lifecycle + linked bank posting | open/cleared/bounced exposure | Branch/account scope |
| Reports | Read model over canonical events | totals and cached aggregates | Explicit authorized branch set |

## 4. Required atomicity and idempotency contract

Every posted command must carry:
- `operationId`: stable ID generated once on device and reused on retries.
- `idempotencyKey`: unique per logical operation, tenant-scoped, not regenerated after timeout.
- `schemaVersion`: payload version for offline compatibility.
- `sourceDocumentType`, `sourceDocumentId`, and source line IDs where applicable.
- `tenantId`: derived by server, never trusted from request.
- `branchId`: explicit and checked against employee assignment.
- `warehouseId` / `registerId` / account IDs as needed.

Server transaction sequence:
1. Authenticate active employee session and tenant.
2. Validate trial/subscription and module entitlement.
3. Authorize action + branch + linked resource scope.
4. Lock or compare affected stock/ledger aggregates.
5. Check idempotency key; return prior result if already committed.
6. Validate document, references, cumulative returns, tender totals and account state.
7. Write source document and all linked stock/ledger/loyalty/audit events atomically.
8. Update versioned projections/caches.
9. Commit and return durable operation receipt + versions.

Offline conflict classes:
- Safe merge: independent notes or non-financial metadata with field-level policy.
- Delta merge only when mathematically safe and tied to a unique source operation.
- Hard conflict: invoice number collision, stock below availability, return over quantity, duplicate serial, stale shift close, bank/cheque duplicate, partner account overpayment, opening-balance mutation, branch authorization failure.
- Hard conflicts must remain pending and visible until resolved; no silent data loss or double posting.

## 5. Open accounting decisions (not approved)

1. Exact chart of accounts and debit/credit postings for VAT, discounts, COGS, inventory, sales returns, purchase returns, card fees and loyalty.
2. Whether customer/supplier balances use tenant-wide ledgers with branch dimensions or branch subledgers with consolidated view.
3. Whether company-wide expenses are allocated at entry or only for management reporting.
4. Whether bank accounts are tenant-central, branch-owned, or both.
5. Whether reservation deposits are always refundable customer advances and how forfeiture is recognized.
6. Tax invoice and credit-note compliance rules for each target jurisdiction.
7. Costing method (weighted average/FIFO/specific identification) by industry and tracking mode.
8. Whether negative stock is ever permitted and under what role/approval policy.

These choices must be reviewed with an accountant and owner before physical schema or posting code is finalized.
