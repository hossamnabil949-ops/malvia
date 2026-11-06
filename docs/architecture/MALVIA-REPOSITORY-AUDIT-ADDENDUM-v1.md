# MALVIA — Repository Audit Addendum: Sync Parity, API Surface & Known Gaps (2026-11-06)

Status: documentation only. This addendum records a fresh source inspection against `malvia-web`; it does not change runtime code.

## 1. Sync resource parity — verified

The client `SYNC_RESOURCES` declaration contains 35 resources. The server validator declares 34 array resources plus the object resource `settings`, also 35 total.

| Comparison | Result |
|---|---|
| Client-only resources | None |
| Server-only resources | None |
| Resource count | 35 client / 35 server |
| Object resource | settings |
| Array resources | 34 |

The client and server lists match exactly at the time of inspection. The earlier concern about possible list drift is **not a confirmed defect**. Keep a parity test in CI so future edits cannot introduce drift.

Client resource list:
`parts, invoices, customers, suppliers, supplierPayments, supplierPaymentSchedules, treasury, employees, settings, salesReturns, purchaseInvoices, purchaseReturns, expenses, partners, partnerWithdrawals, partnerCurrentAccountTransactions, partnerExitSettlements, partnerSettlementPayments, carModels, reservations, inventoryErrors, auditLog, stockMovements, shifts, warehouses, stockLevels, stockTransfers, loyaltyLedger, cheques, stockBatches, serialUnits, bankAccounts, cardSettlements, bankLedgerEntries, openingBalances`.

## 2. Current API route inventory

| Route | Method(s) observed | Current authentication / scope | Important gap or target requirement |
|---|---|---|---|
| `/api/auth/bootstrap` | POST | License key; returns tenant license object | Return minimum safe bootstrap projection; enforce trial/subscription and tenant status consistently. |
| `/api/auth/login` | POST | License key + username/phone/name and password; rate limit; employee lookup; server session | Add seat entitlement, tenant membership and optional branch selection; never expose legacy password material. |
| `/api/sync` | GET, POST | License key + active employee bearer session; GET currently returns all tenant docs; POST validates resource and version | GET must filter records to authorized branch scope; POST must validate branch IDs and nested references. |
| `/api/sync-batch` | POST | Dependency-loaded route; active employee session; idempotency key; per-resource permission policy; atomic multi-resource transaction | Add branch-level authorization and module entitlement to every operation and nested record. |
| `/api/agent/execute` | POST | License key + bearer token hash + idempotency key; DB function validates session, employee and resource permission | Add branch assignment/context and module entitlement; ensure agent operation writes all linked resources atomically. |
| `/api/ai/command` | POST (handler supports command endpoint) | License lookup and rate limits observed; no employee server-session check established in inspected handler | AI must only interpret intent; any read/write action must call a separately authenticated, permission-checked, branch-scoped operation endpoint. |
| `/api/backup?action=export` | GET | License key; exports all tenant docs | Add owner/admin employee session + export permission + audit; support authorized branch export only if policy allows. |
| `/api/backup` owner operations | GET, POST | Platform ADMIN_TOKEN | Keep internal-only; separate platform operator identity and immutable audit. |
| `/api/registry` | GET, POST | Platform ADMIN_TOKEN | Platform-only tenant registry; audit changes and protect version conflicts. |
| `/api/cron-backup` | scheduled request | CRON_SECRET bearer | Add per-tenant result audit and explicit retention/deletion policy; observed handler does not enforce a method guard. |

## 3. Database and persistence findings

- Current PostgreSQL store creates `malvia_docs` keyed by (tenant, resource), with each resource stored as JSONB and a version. It also creates backup, employee-session and AI-agent idempotency tables.
- This is a tenant-scoped document store, not yet a normalized operational relational schema.
- Employee sessions are server-side token hashes with tenant, employee, expiry and revocation.
- Agent execution uses a tenant-scoped idempotency key and DB transaction lock; this is a useful pattern to preserve and generalize.
- Browser offline persistence includes local tenant resources, sync version metadata, durable pending outbox and transaction journal. These must be retained through migration and cutover.

## 4. Current operational-model gaps relevant to multi-branch

1. `Warehouse.branch` is optional descriptive text; it is not a stable branch foreign key.
2. Invoice and PurchaseInvoice have optional warehouseId, but warehouseId represents stock location, not business branch.
3. Expense, TreasuryTransaction, Shift, SupplierPayment, CustomerPayment, PartnerWithdrawal, PartnerCurrentAccountTransaction, BankAccount and BankLedgerEntry do not share a consistent branchId contract in the inspected types.
4. StockTransfer has source/destination warehouse IDs but no branch IDs or explicit in-transit/partial receipt lifecycle.
5. Employee permissions are resource/action flags; no employee-to-branch assignment model was found in the inspected type contract.
6. `/api/sync` GET returns tenant documents after employee session validation but no branch filter was observed.
7. `/api/backup?action=export` is license-key scoped and exports the tenant's complete document set; owner/admin session and export permission were not observed.
8. `/api/ai/command` did not show employee-session validation in the handler; action execution must never rely on AI route authorization alone.
9. License model is not yet a normalized seat/module/trial subscription ledger.

## 5. Safeguards to add to CI and migration gates

- Assert exact set equality between client SYNC_RESOURCES and server ARRAY_RESOURCES ∪ OBJECT_RESOURCES.
- Assert every route has explicit method, authentication, tenant scope, module entitlement, branch scope, idempotency and audit classification.
- Add negative tests for cross-tenant, cross-branch, unauthorized export, expired trial, missing module, stale branch assignment and nested record branch mismatch.
- Add a route-level inventory test that fails when a new API file is added without an entry in this matrix.
- Keep current tenant JSON documents readable during a staged dual-read/dual-write migration; do not drop the old resource store until all reconciliations and rollback gates pass.

## 6. Audit confidence

Confirmed from current source inspection: route files listed above, 35-resource parity, generic JSONB resource persistence, employee session table, agent idempotency table, and the model gaps listed here.

Not confirmed: every UI-to-resource write path, every export entry point, all accounting journal semantics, production tenant data shape, and every historical document's branch attribution. These require deeper call-site tracing and tenant-specific rehearsal; do not treat this addendum as a complete production-data audit.


## 7. Reporting, spreadsheet export and branch-scope audit

Inspected client export surfaces:
- `src/components/ReportsView.tsx`: sales, purchases, sales/purchase returns, treasury, inventory, accounts and master ERP workbook exports.
- `src/components/ExcelImportExportModal.tsx`: full inventory and car-model exports plus spreadsheet imports.
- `src/components/InvoicesView.tsx`: sales invoice export.
- `src/components/PurchasesView.tsx`: purchase invoice export.
- `src/components/SuppliersView.tsx`: supplier/account export.
- `src/components/StockCardModal.tsx` and `src/components/TreasuryAccountsReport.tsx`: additional report surfaces found in repository search.

Observed limitations relevant to the future platform:
1. The inspected report component filters by date but does not receive an explicit authorized branch scope. All exported rows currently come from the component's supplied tenant-wide arrays.
2. Sales report export includes every date-filtered invoice, including cancelled invoices; the on-screen sales KPI excludes cancelled invoices. The export's net column uses grandTotal minus returnedAmount, while the shared report logic uses net sales before tax. These are different definitions and must be made explicit before multi-branch rollup.
3. Inventory export values parts.stockQuantity × parts.costPrice and does not reconcile warehouse stockLevels, batches, serial units, reservations or branch ownership. It is not yet a branch inventory valuation ledger.
4. Accounts export uses customer.balance / supplier.balance and totalPurchases / totalSupplied snapshots rather than a complete allocation-aware receivable/payable transaction ledger.
5. Treasury export includes balanceAfter snapshots. A group-level export must not sum branch balanceAfter values as if they were transactions; it must reconstruct each cash account balance from opening amount plus scoped movements.
6. Purchase export reports grandTotal, amountPaid and a derived remaining amount, while purchase returns are exported separately. The payable figure must be reconciled against return allocations, supplier credits and payment allocations.
7. Exports are generated in the browser from component props using XLSX. They are not a centralized server export service with a separately enforced branch permission check.
8. The full inventory/car-model import-export flow must preserve source IDs, barcodes, batch/serial tracking and compatibility references; it must not overwrite branch inventory by importing a tenant-wide item master file.

Target requirements:
- Every report request carries an explicit authorized branch set and reporting timezone/period.
- Every exported row includes tenantId, branchId (where applicable), source document ID, source line ID and stable business number.
- Report calculations are defined once in shared report services and reused by screen, Excel, CSV, PDF and API outputs.
- Export authorization is server-side: tenant session → module entitlement → report permission → branch assignment → row-level scope.
- Group totals are calculated from transaction facts; internal transfers are excluded from group sales/purchases/income/expenses.
- Snapshot columns such as balanceAfter are labeled as historical snapshots and are not summed to calculate current group balances.

## 8. Offline conflict and local clearing audit

Observed sync behavior:
- The offline outbox persists a set of dirty resource names, not an immutable per-operation event stream.
- Batch retries derive an idempotency key from serialized resource operations; identical retry payloads therefore reuse the key after a lost response.
- Three-way merge uses base/local/remote. When both sides change the same record ID differently, the local device wins for non-delta fields.
- Delta merge is enabled only for `parts.stockQuantity`, `customers.balance`, `customers.loyaltyPoints`, `suppliers.balance`, `stockLevels.quantity` and `stockBatches.quantity`.
- Delete-vs-update behavior is resolved by the merge function and may retain a modified record; the conflict is not represented as a durable, user-resolvable conflict object in the inspected code.

Implications:
- Same-record financial edits from two devices can silently favor one local version unless protected by server-side domain validation. A future branch-aware design must not rely on generic last-writer/local-wins merge for invoices, returns, payments, partner balances, cheques, shifts or opening balances.
- Resource-level dirty flags cannot prove which business operations are pending. Preserve the existing outbox for compatibility, but introduce an immutable operation/event outbox with per-operation receipts before enabling complex multi-branch offline posting.
- Quantity/balance delta merge is not a substitute for inventory/receivable/payable ledgers. Deltas must be derived from uniquely identified source events and validated against branch-specific balances.

Destructive local reset path found:
- `clearTenantDemoData(tenantId)` in `src/services/tenantService.ts` replaces many tenant resources with empty arrays, including invoices, inventory, treasury, partner records, bank accounts/ledger, cheques and approved opening balances, then marks resources dirty for cloud synchronization.
- This is a demo-data cleanup function, not a safe migration or tenant-onboarding workflow. It must never be invoked as part of migration, branch creation, trial conversion, account activation, logout or data repair.
- Any future demo reset must be isolated to a confirmed demo tenant with an explicit destructive confirmation, backup, audit event and server-side guard. Production tenant data must remain untouched.

## 9. Newly confirmed implementation priorities

1. Centralize report definitions so screen totals and exported totals cannot diverge.
2. Add branch scope to all report/export APIs and every report component contract.
3. Replace generic local-wins conflict handling for posted business documents with operation-level conflict resolution and immutable receipts.
4. Keep local reset/demo cleanup out of all production lifecycle and migration code paths.
5. Add export reconciliation tests for cancelled invoices, returns, discounts, VAT, supplier credits, inventory across warehouses and group cash/bank totals.


## 10. App-level transaction orchestration — verified call-site trace

The main application coordinator is `src/App.tsx`. The UI components pass domain objects into handlers; the handlers mutate several resource arrays and call `persistChanges` per resource. This confirms that the current operational transaction boundary is a **client-side multi-resource sequence**, not one server-side atomic transaction.

### 10.1 Sales posting and void

Observed in `handleCreateInvoice`:
1. Normalize split payments (legacy invoice without payments becomes one payment line).
2. Validate direct-bank payment lines by creating bank ledger entries; reject missing/inactive bank account.
3. Validate credit portion has a registered customer; reject duplicate invoice number.
4. Optionally require an open shift.
5. Recheck stock at invoice.warehouseId, deduct aggregate part stock, allocate FEFO batches or serial units, and calculate loyalty earned/redeemed.
6. Save invoice, loyalty ledger, batch/serial state, parts, warehouse stock levels, stock movements, customer balance for credit, treasury receipt lines and bank ledger entries in separate resource updates.
7. Log audit event and clear cart.

Observed in `handleVoidInvoice`:
- Uses `computeVoidPlan` to refund only the remaining portion after prior returns, restores remaining stock/tracking, marks invoice cancelled with reason and approver, reduces credit balance, creates treasury refunds and reverses loyalty.
- It preserves the invoice instead of deleting it, which is the safer pattern to retain.

Target requirement: one server command must atomically persist invoice + inventory + batch/serial + customer ledger + treasury/bank + loyalty + audit. The existing client validations are useful but cannot protect concurrent devices or server-side branch scope by themselves.

### 10.2 Sales return posting

Observed in `handleAddSalesReturn`:
- Rejects returns for cancelled invoices.
- Resolves original invoice line by lineId, then partId/price, then part number/name/price fallback.
- Stores return, increments invoice item returnedQuantity and header returnedAmount, updates full/partial return status, restores part stock and original warehouse level, updates batch/serial tracking and loyalty, and may update customer credit or treasury depending on refund method.
- Several resources are persisted independently.

Important migration risks:
- The UI proposes a quantity, but the coordinator must enforce cumulative quantity and unique serial constraints against current server state. Do not trust client-side proposed quantities.
- A legacy return item that cannot be resolved to an original invoice line must be held for review; never silently attach it to a similar line.
- The current implementation adds returned quantities back to general stock; it does not expose an explicit disposition for saleable vs damaged/quarantine goods.
- The current return path uses the original invoice warehouse, which is useful provenance but still not a branch identity.

### 10.3 Purchase invoice and supplier settlement

Observed in `handleAddPurchaseInvoice`:
- Validates supplier and invoice rows, updates parts/cost/stock and warehouse quantities, creates stock movement records, purchase invoice and supplier payable/payment snapshots, and creates treasury/bank movements for payment portions.
- Purchase tracking creates stock batches and serial units tied to purchase invoice ID/number.
- Supplier payment schedules are a separate resource and require source allocation to the purchase/supplier balance.

Target requirement: model purchase document, accepted receipt(s), supplier payable, payment allocation(s), cash/bank events and batch/serial receipts as one atomic server operation. Preserve partial receipt and payment as separate dimensions; do not infer receipt from payment status.

### 10.4 Purchase return / legacy settlement / deletion

Observed in `handleAddPurchaseReturn`:
- Splits return value into cashRefund, reduction against supplier deferred debt, and remaining supplier store credit.
- Updates supplier snapshots and purchase invoice returned amount, grand total, amountPaid and remainingBalance; decreases stock and creates treasury cash-in for cash refunds.
- A legacy `handleSettlePurchaseReturn` can apply supplier and invoice balance effects without touching stock/treasury.
- `handleDeletePurchaseReturn` physically removes the return, reverses supplier/invoice/stock snapshots and, if a cash refund existed, adds a new treasury reversal movement.

Target requirement: posted purchase returns must be immutable. Replace physical deletion with a linked reversal/correction event. The legacy settlement path must be imported with an explicit `legacySettlementApplied` marker so migration cannot apply its financial effects twice.

### 10.5 Warehouse transfer

Observed in `handleCreateTransfer`:
- Validates from/to warehouse IDs, positive integer quantities and available source stock.
- Immediately applies the transfer to stockLevels and then creates a StockTransfer record with source/destination warehouse IDs, items, date/time, note and creator.
- No explicit dispatched, in-transit, partially received, shortage, damaged or received event exists in the inspected type/handler.

Target requirement: distinguish request, dispatch, transit, receipt, discrepancy and cancellation. Existing legacy transfer is a completed immediate balance move only if the paired stock-level update can be reconstructed; do not create fictional in-transit steps.

### 10.6 Expenses and bank movements

Observed in `handleAddExpense`:
- Validates permissions and positive amount.
- Validates required bank account for direct-bank payment, saves expense and a treasury transaction, then saves a bank ledger entry for bank payment.
- The expense, treasury and bank resources are persisted separately. Bank posting IDs are deterministic from expense ID, allowing duplicate detection in bank ledger helper.
- Branch identity is not present in the Expense contract reviewed.

Target requirement: server-side permission + branch/account scope; atomically link expense, payment, bank/cash movement and audit. Confirm whether a bank-paid expense should create a treasury row in the shared account model or whether the treasury row is a payment-method projection; avoid double counting in cash reports.

### 10.7 Partner current account and withdrawals

Observed in App-level partner handlers:
- Current-account transactions validate partner status, amount, allowed payment methods, linked origin for repayments, and prevent overpayment of an origin.
- They create linked treasury or bank entries and persist current-account transaction separately.
- Partner withdrawals distinguish `withdrawal` and `advance`; only withdrawal increments partner.totalWithdrawn. Cash withdrawals create treasury outflow; bank withdrawals create bank ledger outflow.
- Partner exit settlement has draft → approved → partially_paid/paid flow; payments are limited to outstanding net payable and create cash/bank movements.
- These handlers are richer than a single partner balance snapshot and must be retained as first-class source events.

Target requirement: one atomic event per partner action; keep capital, current account, ordinary withdrawal, advance, exit liability and exit payment as distinct event classes. Branch attribution for partner events remains a design decision, not a current source field.

### 10.8 Opening balance approval

Observed in the FinanceView callback:
- Approval is blocked if the user lacks capital permission or an opening balance already exists.
- Inventory lines increase part stock and weighted-average cost; cash/wallet lines create treasury opening receipts; bank lines update bank account openingBalance; receivable/payable lines increase customer/supplier snapshots; partner lines set original capital and ownership; stock movement and audit records are created.
- The record is stored as one approved openingBalances resource, while its effects are written across multiple resources.

Migration requirement: preserve both the approved source record and every generated effect/source ID. Do not re-run approval during import. Opening balances need a one-time posting receipt or migration marker so a replay cannot apply them again.

## 11. Cross-resource write matrix (current coordinator)

| Business command | Primary resource | Other resources mutated by current App handler | Main concurrency/idempotency risk |
|---|---|---|---|
| Create sale | invoices | parts, stockLevels, stockMovements, stockBatches, serialUnits, customers, treasuryTransactions, bankLedgerEntries, loyaltyLedger, auditLog | Duplicate invoice/stock/payment/loyalty on retry; competing sales |
| Void sale | invoices | parts, stockLevels, stockMovements, stockBatches, serialUnits, customers, treasuryTransactions, loyaltyLedger, auditLog | Duplicate refund or stock restoration |
| Sales return | salesReturns | invoices, parts, stockLevels, stockMovements, stockBatches, serialUnits, customers, treasuryTransactions, loyaltyLedger, auditLog | Over-return and double refund/restock |
| Purchase | purchaseInvoices | parts, stockLevels, stockMovements, stockBatches, serialUnits, suppliers, supplierPayments, treasuryTransactions, bankLedgerEntries, auditLog | Duplicate receipt/payment/cost update |
| Purchase return | purchaseReturns | purchaseInvoices, parts, stockLevels, stockMovements, suppliers, treasuryTransactions, auditLog | Duplicate debt reduction/credit/refund; delete reversal |
| Warehouse transfer | stockTransfers | stockLevels | Stock changed without transfer record if interruption occurs |
| Expense | expenses | treasuryTransactions, bankLedgerEntries | Expense/cash/bank posting partial persistence |
| Partner current account | partnerCurrentAccountTransactions | treasuryTransactions, bankLedgerEntries, auditLog | Origin repayment and cash/bank mismatch |
| Partner withdrawal | partnerWithdrawals | partners, treasuryTransactions, bankLedgerEntries, auditLog | Partner snapshot and payout diverge |
| Partner exit payment | partnerSettlementPayments | partnerExitSettlements, treasuryTransactions, bankLedgerEntries, auditLog | Paid amount and cash/bank posting diverge |
| Opening balance approval | openingBalances | parts, stockMovements, treasuryTransactions, bankAccounts, customers, suppliers, partners, auditLog | Replay duplicates opening balances |

## 12. Newly confirmed design blockers before physical schema

1. **Atomicity:** the client coordinator currently saves each resource separately. The target API must own the whole command and commit all effects in one database transaction.
2. **Deletion semantics:** purchase returns can be physically deleted with compensating mutations. Posted financial/stock events need immutable reversal workflows.
3. **Transfer lifecycle:** current transfer is immediate; target in-transit lifecycle is new behavior and must not be backfilled as if it existed historically.
4. **Return disposition:** no explicit damaged/quarantine disposition was found in the sales return coordinator.
5. **Opening replay protection:** opening approval mutates many resources; migration needs a posting receipt and must not invoke the approval handler.
6. **Account mapping:** bank-paid expenses currently create both treasury transaction and bank ledger entry. Decide whether treasury is a unified movement log or a cash-account ledger before defining consolidated cash balances.
7. **Server authorization:** client handler checks are not a substitute for server session, tenant, module and branch enforcement.
