# MALVIA — Treasury & Bank Cycle Review (v1)

**Review scope:** source review only; accounting design and tests.  
**Branch:** `finance/accounting-foundation-v1`  
**Safety:** no production deployment, database migration, live journal posting, or legacy-record rewrite is authorized or performed by this review.

## Executive result

The existing application has operational flows for bank-account transfers, card settlements, cleared cheques, and bank-routed receipts/payments. The accounting foundation has pure journal adapters for those sources and a read-only statement matcher. The important missing operational source is a dedicated cash-to-bank deposit / bank-to-cash withdrawal workflow: `buildCashBankMovementJournal` exists and is tested, but no matching UI action or persisted source record was found in the reviewed `src/App.tsx` and `FinanceView` paths.

The statement matcher is also a pure utility only; `BankLedgerView` currently exposes account setup, card settlement, transfer, and ledger display, but no statement import/reconciliation workflow was found.

## Final source-to-account mapping

| Business movement | Debit | Credit | Operational source / current status |
|---|---|---|---|
| Cash deposited into bank | Bank account (selected bank subledger) | Cash on hand / treasury | Adapter exists and tests pass; no dedicated operational UI/source record found. Must be added before live accounting integration. |
| Cash withdrawn from bank | Cash on hand / treasury | Bank account (selected bank subledger) | Adapter exists and tests pass; no dedicated operational UI/source record found. |
| Transfer between own bank accounts | Destination bank | Source bank | Operational paired bank-ledger entries exist; pure accounting adapter exists. No income/expense recognition. |
| Card settlement | Bank = net proceeds; bank fees expense = fee | Card/Visa clearing = gross amount | Operational batch, paired bank-ledger details (clearing/net/fee), fee expense, and treasury gross/net clearing records exist. Accounting adapter independently produces net + fee vs gross clearing. Ensure only one journal is posted per batch; do not post both the adapter and a second manually reconstructed entry. |
| Incoming cheque registration | Cheques receivable / under collection | Customer receivables | Adapter only; registration currently updates party balance and cheque record. |
| Incoming cheque clears | Bank account | Cheques receivable | Operational bank entry created when cleared; adapter exists. |
| Incoming cheque bounces before clearing | Customer receivables | Cheques receivable | Adapter supports lifecycle reversal; operational party balance/cheque status changes. |
| Incoming cheque bounces after clearing | Customer receivables | Bank account | Operational bank reversal entry exists; adapter supports reversal using prior cleared bank account. |
| Outgoing cheque registration | Supplier payables applied + supplier advances (if excess) | Cheques payable | Adapter only; cheque record and supplier balance effects are operational. |
| Outgoing cheque clears | Cheques payable | Bank account | Operational bank entry created when cleared; adapter exists. |
| Outgoing cheque bounces/cancels | Bank or cheques payable (depending on prior state) | Supplier payables / supplier advances | Adapter supports lifecycle reversal; operational bank reversal exists for post-clear bounce. |
| Customer collection by bank transfer | Bank account | Customer receivables | Operational customer settlement records bank-ledger movement; accounting adapter exists. Current adapter resolves settlement method without an explicit bank id in its call contract; confirm bank mapping at integration boundary. |
| Supplier payment by bank | Supplier payables applied + supplier advances (excess) | Bank account | Operational payment record freezes `payableApplied`; bank ledger movement exists; accounting adapter exists. |
| Bank-paid operating expense | Operating expense | Bank account | Operational bank-ledger movement exists; accounting adapter exists. Tax split is not available in legacy expense records and must not be invented. |
| Bank-paid partner current-account movement | Partner current-account liability/receivable according to movement type | Bank account, or reverse | Operational bank-ledger movement exists; adapter exists. |
| Bank-statement reconciliation | No journal entry | No journal entry | Read-only matcher only. Matches references / amount+date and reports unmatched, ambiguous, duplicate statement lines and unmatched ledger entries. |

## Important accounting rules

1. Transfers between owned bank accounts are balance-sheet movements only.
2. Cash-to-bank deposit/withdrawal is an asset reclassification only; never income or expense.
3. Card settlement must satisfy `gross = fee + net`. Debit bank by net, debit bank fees by fee, credit card clearing by gross.
4. Cheques do not affect bank balance until clearing. Registration moves the related customer/supplier balance to cheque receivable/payable; clearing moves cheque position to/from the bank.
5. A bounced cheque after clearing reverses the original bank movement and restores the underlying customer/supplier position. A stable event/source id is required for retries.
6. Reconciliation must not create adjustment entries automatically. Differences require review and an explicitly approved adjustment source.
7. All bank-account postings must reference an active bank account and be idempotent. Keep tenant/branch scope and closed-period checks at the eventual posting boundary.
8. Legacy source records without frozen allocations or VAT details must be rejected for automatic historical posting rather than inferred from mutable current balances.

## Findings / integration gaps to close

- **Cash ↔ bank workflow:** add a persisted transfer voucher/source record and UI action for deposit and withdrawal. It must record direction, amount, date, selected bank account, treasury source/destination, reference, creator, and reversal/cancellation metadata. Validate cash availability for deposit and bank availability for withdrawal against the authoritative balances. Create a bank-ledger entry and treasury entry atomically (or via an idempotent recoverable operation).
- **Bank statement reconciliation UI:** expose statement import (CSV/XLSX format contract to be selected), account selection, preview, matching status, and manual review. Do not mutate bank ledger or create journals during matching.
- **Bank-to-ledger account mapping:** define and persist the mapping from each bank account id to its tenant/branch-specific general-ledger account. Do not rely on display names or implicit string conventions.
- **Customer bank receipts:** the adapter must receive the exact bank account id when the payment method is bank-routed; preserve the chosen account in the customer payment source.
- **Card settlement duplication control:** enforce a single stable settlement id across card batch, bank ledger, treasury clearing records, fee expense, and future journal source. Repeated requests must not create duplicate fee expense or duplicate journal.
- **Cheque history:** retain previous status, event id, clearing bank account, and original bank ledger entry id in a durable lifecycle event. Confirm cancel/bounce semantics against all legacy statuses before posting.
- **Opening balances:** bank opening balances must be tied to a reconciled cutover date and evidence; do not combine a bank opening balance already embedded in `BankAccount.openingBalance` with a second opening journal for the same amount.

## Tests already present in this branch

- `tests/accountingSourceAdapters.test.ts`: cash-to-bank deposit and withdrawal balanced entries, unknown bank mapping rejection, bank transfer adapter, card settlement adapter, cheque registration/lifecycle adapters, customer receipts, supplier payments, expenses, and partner current-account adapters.
- `tests/bankReconciliation.test.ts`: exact reference match, amount/date fallback, ambiguous candidates, unmatched statement, duplicate statement, conflicting references, account isolation, and source immutability.
- `src/utils/bankLedger.ts`: active-account checks, duplicate protection, positive amount/date validation, paired bank-transfer entries, card settlement split, cheque clear/reversal, and ordinary bank movement primitives.

These are pure unit tests. They do not prove the operational UI workflow, cloud sync atomicity, persistence under concurrent devices, or end-to-end journal posting.

## Release gates before accounting activation

- [ ] Implement and test cash↔bank voucher source workflow.
- [ ] Implement statement import + review UI; retain read-only matching until user approves each adjustment.
- [ ] Complete per-bank-account GL mapping and tenant/branch validation.
- [ ] Add end-to-end tests for every operational source: source record → bank ledger/treasury → one journal input → retry/reversal.
- [ ] Test duplicate operations, inactive accounts, insufficient balance, closed periods, cross-tenant isolation, offline/sync replay, and partial failure recovery.
- [ ] Reconcile opening balances and historical transactions with documentary evidence.
- [ ] Obtain explicit approval for activation date and journal posting.
- [ ] Only then plan a separately approved migration/activation and production rollout.

## Review conclusion

The accounting direction is viable, and most core bank movement primitives already exist. The cycle is **not yet ready for live accounting activation** because cash↔bank has no operational source flow, statement reconciliation has no user-facing workflow, and several integration controls still need end-to-end verification. Keep the PR draft and unmerged until these gates are completed.


## Implementation follow-up — 2026-11-17

The two UI gaps identified in the source review have now been implemented on `finance/accounting-foundation-v1`:

- Cash↔bank vouchers: deposit and withdrawal forms are available in the bank-ledger screen. The application validates active bank account, positive amount, available source balance, and duplicate source IDs; then persists the paired bank-ledger and cash-treasury records together. The movement is classified as an asset transfer, not income or expense.
- Bank statement review: CSV/XLS/XLSX files can be imported into a client-side preview. Arabic/English headers, date formats, debit/credit columns, and decimal amounts are parsed. The existing reference-aware matcher displays matched, ambiguous, duplicate, unmatched statement, and unmatched ledger results. Invalid rows are reported.
- Imported statements are not saved. Matching remains read-only and cannot create adjustments or journals.
- Added workbook parser tests alongside existing reconciliation tests.

**Validation on commit `4596f8c42d0cfca3165727508c1525db9dbb340c`:** TypeScript check passed, financial/regression tests passed, Production build passed, and the Vercel Preview deployment reached READY. GitHub Actions run: https://github.com/hossamnabil949-ops/malvia/actions/runs/44080674929

The remaining release gates are general-ledger bank-account mapping, customer bank-receipt source mapping, end-to-end sync/retry/reversal tests, opening-balance evidence reconciliation, and explicit approval before live journal posting. No migration, live journal posting, or Production deployment was performed.


## Follow-up — bank GL mapping and receipt provenance

- Added a strict resolver from a bank subledger ID to one active general-ledger asset account, scoped by tenant, branch, and currency. Missing or duplicate mappings, inactive bank accounts, missing/inactive GL accounts, and non-asset GL accounts are rejected.
- Customer collections now retain the selected bankAccountId in each invoice settlement allocation as well as the treasury record; the customer-receipt journal adapter resolves the same bank-specific settlement account.
- Added adapter-level tests proving that card settlement and customer receipt journal inputs use the mapped GL bank account, and that missing/inactive/wrong-scope mappings are rejected.
- **Important boundary:** the resolver is a tested domain capability, not yet an end-user chart-of-accounts setup screen or a persisted GL configuration workflow. No live journals are posted. Operational mapping UI/persistence and sync replay tests remain release gates.
- Latest source commit under review: 28e9facb5281cf8561bebc731b41c944df8920b8. Vercel Preview build was still BUILDING at the last status check; do not treat it as validated until READY and CI tests are green.
