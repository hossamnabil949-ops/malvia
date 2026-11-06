# MALVIA — Field-Level Migration Map, API Scope Matrix & Verification Plan (Draft v1)

Status: design/audit artifact only. No SQL, runtime code, data migration, merge, or deployment is included.
Audit baseline: `docs/malvia-platform-design-package-v1`, current application model in `src/types/autoParts.ts`, sync contracts in `src/services/syncService.ts` and `api/_security.ts`.

## 1. Migration invariants

1. Preserve tenant ownership for every record. A branch is a new operational scope inside a tenant, never a replacement for tenantId.
2. Introduce stable `branchId` independently of `warehouseId`. A warehouse is a stock location; a branch is an operating/legal/reporting scope. A warehouse may be designated as a branch's central warehouse, but the two identifiers are not interchangeable.
3. Preserve source IDs and references during migration. Do not regenerate invoice, return, payment, cheque, stock-movement, partner, or opening-balance IDs.
4. Preserve historical timestamps, invoice numbers, user attribution, status, void/correction markers, and audit history.
5. Do not recompute balances by summing mutable display fields. Derive ledger balances from validated source transactions and reconcile against existing snapshots before cutover.
6. Retain the existing offline-first outbox, resource versioning, idempotency, and conflict behavior while adding branch scope. A sync operation must be authorized for every branch represented in its payload.
7. No default branch may be silently assigned to legacy records. A reviewed migration mapping must explicitly resolve legacy records whose branch cannot be proven.
8. Existing partner capital, partner current-account, treasury, bank ledger, opening balances, stock valuation, and return relationships are protected accounting history.

## 2. Current resource inventory and field mapping

The current sync contract contains 35 resources. The list below is the observed `SYNC_RESOURCES` / server validation inventory, not a claim that every resource has already been normalized in the database.

| Current resource | Current shape | Proposed logical target | Branch scope / migration rule |
|---|---|---|---|
| parts | array of AutoPart | Item, ItemBarcode, ItemCompatibility, ItemTrackingPolicy | Tenant catalog by default. Do not duplicate master item per branch. Keep stockQuantity as legacy aggregate only during transition; stock belongs in branch/warehouse inventory balances. |
| invoices | array of Invoice | SalesInvoice, SalesInvoiceLine, InvoicePayment, InvoiceSettlement | Required branchId; preserve invoiceNumber, date/time, cashier, customer, status, returns and void links. Resolve warehouseId separately. |
| customers | array of Customer | Customer, CustomerBalanceLedger | Tenant-wide customer identity; branch dimension on originating invoices/payments. Preserve balance snapshots for reconciliation, not as the sole ledger. |
| suppliers | array of Supplier | Supplier, SupplierBalanceLedger | Tenant-wide supplier identity; branch dimension on purchases/payments/returns. Preserve deferredDebt and storeCredit as reconciled derived balances. |
| supplierPayments | array of SupplierPayment | SupplierPayment, PaymentAllocation | Required branchId for originating payment; preserve bankAccountId, treasurySource and schedule link. |
| supplierPaymentSchedules | array of SupplierPaymentSchedule | SupplierPaymentSchedule, ScheduleOccurrence | Tenant-owned schedule with explicit branch scope; preserve recurrence and paymentId links. |
| treasury | array of TreasuryTransaction | CashTransaction, CashAccount, SourceDocumentLink | Required branchId and cash-account scope; retain txNumber, shiftId, referenceId, category, direction and balanceAfter as historical snapshot. |
| employees | array of Employee | User, EmployeeProfile, TenantMembership, BranchAssignment | User identity tenant-scoped; allow one or more branch assignments. Never copy plaintext password fields into new identity tables; preserve supported password-hash migration path and invalidate/rotate only under an approved plan. |
| settings | object ShopSettings | TenantSettings, BranchSettings, TaxProfile, LoyaltyPolicy | Split tenant-wide defaults from branch overrides; preserve legacy values and record their chosen scope. |
| salesReturns | array of SalesReturn | SalesReturn, SalesReturnLine, RefundAllocation | Required branchId; preserve invoiceId/invoiceNumber, returned line IDs, serials, refund method and correction state. |
| purchaseInvoices | array of PurchaseInvoice | PurchaseInvoice, PurchaseInvoiceLine, PurchasePaymentAllocation | Required branchId; warehouseId remains a separate destination stock location. Preserve supplier invoice number, paid/remaining snapshots and returnedAmount. |
| purchaseReturns | array of PurchaseReturn | PurchaseReturn, PurchaseReturnLine, SupplierCreditAllocation | Required branchId; preserve original purchaseInvoiceId and debt-reduction/store-credit/cash-refund split. |
| expenses | array of Expense | Expense, ExpenseAllocation | Support direct branch expense and explicitly allocated tenant-wide expense. Never infer allocation from payment account. |
| partners | array of Partner | Partner, OwnershipHistory | Tenant-level ownership by default; branch allocation only if the business explicitly defines branch-level equity. Preserve initial/added capital, share percentages and exit links. |
| partnerWithdrawals | array of PartnerWithdrawal | PartnerWithdrawal, FinancialPosting | Required originating branch/account scope; preserve kind distinction (withdrawal vs advance), bank account and reference. |
| partnerCurrentAccountTransactions | array of PartnerCurrentAccountTransaction | PartnerCurrentAccountEntry, FinancialPosting | Preserve partner current-account liability/receivable separately from capital, profit and ordinary expense. Branch dimension must not change accounting meaning. |
| partnerExitSettlements | array of PartnerExitSettlement | PartnerExitSettlement, SettlementComponent | Tenant ownership/settlement scope; preserve entitlement and deduction components, approvals and status. |
| partnerSettlementPayments | array of PartnerSettlementPayment | PartnerSettlementPayment, PaymentAllocation | Required paying branch/account scope; preserve settlementId, partnerId, bank account and receipt reference. |
| carModels | array of CarModel | VehicleMake, VehicleModel, Compatibility | Tenant catalog or shared catalog after deduplication; no branch duplication by default. |
| reservations | array of PartReservation | Reservation, ReservationLine, ReservationDeposit | Required branchId; preserve reservation number, expiry, status, customer/car details and deposit. |
| inventoryErrors | array of InventoryDiscrepancyError | StockCount, StockCountLine, StockAdjustment | Required branchId and warehouseId; preserve system/physical quantities, financial impact, evidence and correction metadata. |
| auditLog | array of AuditEntry | AuditEvent | Required tenantId and actor; branchId where the event concerns branch-scoped data. Append-only; do not rewrite historical actor labels. |
| stockMovements | array of StockMovement | InventoryMovement, InventoryMovementLine | Required branchId and warehouseId; preserve qtyDelta, balanceAfter, source reference and user. |
| shifts | array of Shift | RegisterShift, ShiftCashCount, ShiftPaymentBreakdown | Required branchId and registerId; preserve opening/closing amounts, variance, cash lines, dates and employee IDs. |
| warehouses | array of Warehouse | Warehouse, WarehouseBranchAssignment | Add explicit branchId. Existing branch string is descriptive text only; it is not a reliable foreign key. Map each legacy warehouse manually/with reviewed rules. |
| stockLevels | array of StockLevel | InventoryBalance | Required branchId derived through validated warehouse ownership; unique item+warehouse balance. Preserve id convention only as source key. |
| stockTransfers | array of StockTransfer | StockTransfer, StockTransferLine | Required source and destination branch IDs, plus source/destination warehouse IDs. Cross-branch transfers require paired inventory postings and in-transit state. |
| loyaltyLedger | array | LoyaltyLedgerEntry | Required branchId for earn/redeem event; customer identity remains tenant-wide. Preserve link to source invoice/return. |
| cheques | array | Cheque, ChequeLifecycleEvent | Required branch/account scope; preserve lifecycle history, related document and audit constraints. |
| stockBatches | array | InventoryBatch | Required branchId + warehouseId + itemId; preserve batch/expiry/quantity and purchase source. |
| serialUnits | array | SerializedInventoryUnit | Required branchId + warehouseId + itemId; preserve serial identity, status and sale/return links. |
| bankAccounts | array | FinancialAccount | Explicit scope enum: tenant-central or branch-owned. Preserve account identity and active state; no implicit duplication by branch. |
| cardSettlements | array | CardSettlement, SettlementAllocation | Required acquiring/account scope and branch attribution for originating sales; preserve settlement and bank deposit relationship. |
| bankLedgerEntries | array | BankLedgerEntry, SourceDocumentLink | Required account scope and branch attribution; preserve immutable source linkage and reconciliation constraints. |
| openingBalances | array (currently at most one approved record) | OpeningBalanceBatch, OpeningBalanceLine, OpeningPartnerPosition | Preserve approved record as immutable cutover evidence. Branch attribution must be reviewed line by line; never fan out one opening balance across branches automatically. |

### 2.1 Nested record mapping

| Parent / nested type | Existing fields that must remain addressable | Target treatment |
|---|---|---|
| AutoPart.alternatives[] | id, partId, alternativePartNumber, alternativeName, brand, origin, salePrice, stockQuantity, compatibilityScore, isScreenOrDisplay | Normalize to item-alternative relation; stock quantity moves to inventory balance, not alternative master data. |
| AutoPart.extraBarcodes[] / tracking | barcode, internalBarcode, supplierBarcode, extraBarcodes, tracking | Normalize barcode aliases and tracking policy; retain original barcode values and uniqueness validation. |
| Invoice.items[] | lineId, partId, partNumber, partName, quantity, unitPrice, originalPrice, costPrice, total, taxAmount, returnedQuantity, batchAllocations, serials, returnedSerials | SalesInvoiceLine plus batch/serial allocations; preserve historical name/number/price/cost snapshots. |
| Invoice.payments[] | method, amount, bankAccountId | InvoicePayment with explicit payment account and branch; do not collapse split tender into one method. |
| Invoice.settlementPayments[] | amount, date, time, paymentMethod, receiptNumber | InvoiceSettlement with source invoice and settlement account reference. |
| PurchaseInvoice.items[] | partId, partNumber, partName, category, brand, quantity, costPrice, salePrice, total, taxAmount, returnedQuantity, tracking, batchNo, expiryDate, serials | PurchaseInvoiceLine plus batch/serial receipts; preserve purchase-time cost and quantities. |
| SalesReturn.items[] | lineId, partId, partNumber, partName, quantity, unitPrice, total, reason, serials | SalesReturnLine linked to original invoice line; enforce cumulative returned quantity/serial uniqueness. |
| PurchaseReturn.items[] | partNumber, partName, quantity, unitCost, total, reason | PurchaseReturnLine linked to original purchase line where source IDs exist; ambiguous legacy line matching requires review. |
| Shift.breakdown[] / cash lines | payment method, amount, denomination/count details | ShiftPaymentBreakdown and ShiftCashCount; preserve expected vs counted values and variance. |
| StockTransfer.items[] | partId, partNumber, partName, quantity | StockTransferLine with source/destination inventory postings. |
| OpeningBalances.lines[] | id, label, category, amount, bankAccountId, partId, quantity, unitCost, entityId | OpeningBalanceLine with typed references; inventory line must reconcile quantity × unitCost to amount. |
| OpeningBalances.partners[] | partnerId, partnerName, originalContribution, ownershipPercentage, currentAccountBalance | OpeningPartnerPosition; capital contribution and current-account balance remain distinct. |
| ProfitDistributionRecord.partnerShares[] | partnerId, partnerName, percentage, shareAmount | ProfitDistributionLine; retain original distribution period and calculated amount. |

### 2.2 Field transformation policy

| Field family | Rule |
|---|---|
| id / foreign IDs | Preserve source ID as legacySourceId; assign new internal PK only if needed; maintain deterministic cross-reference table. |
| tenant / tenantId | Map to immutable tenant_id from authenticated license/session, not client-supplied values. |
| branchId | Add only after explicit mapping or trusted transaction context; required for new branch-scoped writes. |
| warehouseId | Preserve as warehouse FK; never reinterpret as branchId. |
| dates and times | Preserve original local date/time strings and timezone semantics; store normalized timestamp additionally, not instead. |
| amounts / quantities | Use fixed-precision decimal in relational design; do not round existing values during import. |
| status / correction / void fields | Preserve exact historical state and actor/reason/timestamp. |
| denormalized names and numbers | Keep as immutable document snapshots even when normalized customer/item/employee FKs are added. |
| balanceAfter / remainingBalance / returnedAmount | Retain as historical snapshots; reconcile against ledger-derived values before choosing a canonical balance. |
| password / passwordHash | Sensitive credential migration; never export plaintext, log credentials, or copy plaintext into the new schema. |
| imageUrl / serials / batchAllocations | Preserve source references; validate storage ownership and nested cardinality before conversion. |
| unknown / future fields | Keep a versioned legacy payload or migration quarantine until explicitly mapped; never silently drop. |

## 3. API route and authorization matrix (observed routes)

| Route | Method | Authentication observed | Tenant scope | Branch scope today | Required future gate |
|---|---|---|---|---|---|
| /api/auth/bootstrap | POST | License key | License → tenant | None | Trial/subscription status + tenant identity; expose only safe bootstrap data. |
| /api/auth/login | POST | License key + username/password; server session issued | License → tenant employee | None | Tenant membership, active employee, seat entitlement, optional branch selection, branch assignment. |
| /api/sync | GET | License key + bearer server session | Tenant | None | Filter returned documents by authorized branch and resource scope; do not leak other branch data. |
| /api/sync | POST | License key + bearer server session + resource permission | Tenant | None | Validate every row's branchId and nested branch references server-side. |
| /api/sync-batch | POST | License key + bearer server session + idempotency key + per-resource permissions | Tenant; atomic batch | None | Branch authorization per operation and per nested record; atomic cross-resource validation remains mandatory. |
| /api/agent/execute | POST | License key + bearer token + idempotency key | Tenant | None | Resolve authenticated employee session (not token-shape only), action permission, branch assignment, branch stock/account context. |
| /api/ai/command | POST | License key + tenant rate limit; no employee server-session validation observed in handler | License → tenant | None | Treat as AI interpretation only; require authenticated employee context and re-check permissions/branch scope before any consequential action is executed. |
| /api/backup?action=export | GET | License key | Tenant | Entire tenant export currently | Tenant owner/admin policy; branch-filtered export only when explicitly requested and authorized. |
| /api/backup | GET/POST | ADMIN_TOKEN | Platform admin | N/A | Internal operations only; audit all restore/export actions. |
| /api/registry | GET/POST | ADMIN_TOKEN | Platform registry | N/A | Platform-only; separate internal operator identity and audit trail. |
| /api/cron-backup | scheduled handler | CRON_SECRET | All tenants selected by backup routine | N/A | Platform service identity, tenant-by-tenant audit, retention policy. |

Important audit finding: current permission checks are resource-level employee flags. No branch assignment/branch-scope authorization was found in the inspected model or sync routes. Hiding a branch or tab in the UI is not a security boundary.

## 4. Module entitlement and licensing gaps

- Current observed TenantLicense includes maxEmployees, plan, expiry/status, allowedFeatures and boolean feature flags.
- The inspected license shape does not yet provide a normalized subscription ledger, purchased user seats, branch-independent user assignment, industry pack entitlement, module-level effective dates, trial lifecycle, or download entitlement.
- Future authorization must evaluate: tenant status → subscription/trial validity → module entitlement → employee permission → branch assignment → resource/document relationship.
- Seat count must count distinct active tenant memberships according to the commercial policy, not branch assignments.
- A single user assigned to multiple branches consumes one tenant seat unless a later approved pricing policy explicitly states otherwise.

## 5. Branch-aware API and sync contract proposal

Every branch-scoped operational record carries immutable `tenantId` and required `branchId`. Warehouse-bound inventory records additionally carry `warehouseId`. The server derives tenantId from the authenticated session and rejects tenantId supplied in client payloads if it conflicts.

Proposed request envelope (logical, not implemented):
- tenant identity: derived from server session
- branch context: explicit branchId for single-branch operation; explicit authorized branch set for batch/report operations
- operations: resource, operationId, baseVersion, data
- idempotencyKey: stable across retries for identical logical batch
- schemaVersion: explicit payload version for backward-compatible offline clients

Server validation:
1. Authenticate a non-expired employee session.
2. Resolve tenant membership and effective subscription/module entitlements.
3. Validate requested branch is assigned to the actor and active for the tenant.
4. Validate all nested rows, references, warehouse ownership, and source-document branch consistency.
5. Validate permissions for the operation and sensitive financial invariants.
6. Execute multi-resource updates atomically where invariants span resources.
7. Return per-resource versions and safe diagnostics only; never return secrets or raw database internals.

## 6. Test and acceptance matrix

| Area | Required scenarios | Pass condition |
|---|---|---|
| Tenant isolation | User from tenant A requests tenant B branch, resource, export, sync conflict or agent action | No read/write or metadata disclosure across tenants. |
| Branch authorization | Single-branch employee attempts another branch via UI, direct API, modified payload, nested line or conflict response | Server denies; no partial commit or leaked data. |
| Multi-branch user | User assigned to branches A and B; attempts branch C | A/B succeed within permissions; C denied. One user still consumes one seat. |
| Consolidated reporting | Compare branch totals with group total; drill down and return to group view | Group total equals sum of included branches without double-counting transfers or internal settlements. |
| Inventory | Branch stock, warehouse stock, batch/serial, reservation, transfer, return, discrepancy | Quantity and valuation reconcile; transfers create paired source/destination postings. |
| Sales | Invoice, split payments, discount, tax, return, void, offline duplicate number | Original snapshots preserved; returns capped by sold quantity; duplicate protection works. |
| Purchases | Receipt, partial payment, return, deferred debt, store credit, cash refund | Supplier balance and stock reconcile with source documents. |
| Treasury/bank | Cash movement, bank transfer, cheque lifecycle, card settlement, shift close | Each movement has one source posting; account scope and branch attribution reconcile. |
| Partner accounting | Capital, withdrawal, advance, current-account deposit/withdrawal/repayment, exit settlement, profit distribution | Capital/current account/profit remain distinct; no branch migration changes equity balances. |
| Opening balances | Inventory, cash, bank, customer/supplier balances, partner capital/current account | Immutable source batch preserved; debits/credits and ownership reconcile before cutover. |
| Sync offline | First sync, outbox persistence, retry after lost response, same idempotency key, simultaneous edits, version conflict | No lost acknowledged data or duplicate financial posting; branch authorization still enforced. |
| Trial lifecycle | Create trial, start clock, day 13/14, expiry, reinstall, new device, conversion | 14 days measured from server-side trial start; reinstall/download does not reset; conversion retains tenant/data. |
| Seats/modules | Seat limit, one user multi-branch, module expiry/upgrade/downgrade | Server rejects over-limit membership and disabled module operations consistently. |
| Backup/restore | Tenant export, platform backup, restore, branch-filtered export | Tenant isolation, integrity, audit and retention rules hold. |
| Security | Expired session, disabled employee, revoked branch assignment, stale offline client, forged tenant/branch IDs | All writes denied server-side; safe diagnostics only. |

## 7. Migration sequencing and release gates

1. Complete repository-wide inventory of all resource writers/readers, reports, exports, agent actions and offline stores.
2. Approve unresolved accounting and account-ownership rules before physical ERD/SQL.
3. Produce deterministic legacy branch mapping; quarantine ambiguous records rather than guessing.
4. Build read-only migration rehearsal and reconciliation reports against a database copy.
5. Add compatibility layer and branch-aware API behind feature flags; do not switch production writes yet.
6. Run tenant/branch security tests and accounting invariants against synthetic multi-branch tenants.
7. Run shadow comparisons: old outputs vs new branch-aware outputs, with documented accepted differences.
8. Obtain explicit approval for cutover, backup, rollback window and production release.

## 8. Open decisions that still block physical schema

- Customer/supplier subledger ownership and how cross-branch payments are allocated.
- Bank account scope: tenant-central, branch-owned, or both.
- Central warehouse ownership and inter-branch in-transit behavior.
- Company-wide expense allocation method and whether allocations can be edited after posting.
- Whether partner equity remains tenant-wide or supports branch-specific ownership.
- Exact seat counting, grace period, trial expiry behavior, data retention and export policy.
- How to map legacy transactions whose branch is not recorded today.

## 9. Audit coverage and known limitations

This pass inspected the shared TypeScript domain model, sync resource declarations, server-side resource validation, single-resource sync, atomic batch sync, employee permission map, login/bootstrap, agent execution, backup and registry handlers, and report utility entry points.

Still required before calling the audit complete:
- enumerate every API file and every method/route, including any unindexed nested routes;
- trace all read/write call sites and every localStorage key beyond the main sync service;
- inspect all report/export screens and AI agent operations for hidden resource dependencies;
- map all nested object schemas that are generated dynamically or typed outside autoParts.ts;
- run code-level tests against each branch-aware invariant after implementation design is approved.

This document is a field-level migration map for the observed model, not a final physical ERD and not an authorization to change production data.


## 10. Expanded code audit — local persistence, AI, reports and exports

### 10.1 Browser persistence inventory (observed keys)

| Key / pattern | Purpose | Migration and safety requirement |
|---|---|---|
| `malvia_<tenantId>_<resource>` | Local tenant resource documents | Preserve offline data; migration must be versioned and tenant-isolated. |
| `malvia_sync_meta_v1_<tenantId>` | Resource versions and merge base hashes | Preserve or safely rebuild only after successful server reconciliation. |
| `malvia_sync_pending_v1_<tenantId>` | Durable pending-resource outbox | Must survive restart, retry and upgrade; do not clear on branch switch. |
| `malvia_<tenantId>___transaction_journal` (resource suffix) | Recoverable multi-resource local commit journal | Keep crash recovery semantics during storage redesign. |
| `malvia_user_session_v1` | Employee session including server token | Sensitive credential; migrate to secure session storage strategy, revoke on logout/device policy. |
| `malvia_pending_server_session_v1` | Pending server session token | Treat as credential; preserve only through controlled login recovery. |
| `malvia_tenant_licenses_v1` | Device-cached tenant licenses | Replace as authoritative entitlement with server-side subscription state; cache only safe claims. |
| `malvia_active_tenant_id_v1` | Current tenant selector | Never treat client value as authorization; server derives tenant from session. |
| `malvia_device_saved_license_key_v1` | Saved license key | Sensitive credential; avoid broad exposure and define rotation/revocation. |
| `malvia_app_theme_v1` | UI theme | Non-sensitive preference; migrate as user/device preference. |
| `malvia_master_owner_pin_v1` | Locally stored master PIN | Security gap: a locally stored owner PIN is not a server-side authentication boundary; replace with server-authenticated owner identity and MFA/step-up policy. |
| `malvia_invoice_device_code_v1` | Device-specific invoice numbering code | Preserve device identity and invoice-number history; do not regenerate on app reinstall without collision-safe server registration. |
| `malvia.pos.warehouse` | POS selected warehouse | Replace/validate against authorized branch + warehouse assignment on each session; UI preference alone is not permission. |
| Navigation collapse key | Sidebar preference | Non-sensitive UI preference. |

The resource store is localStorage-based and tenant-prefixed. The sync engine keeps a durable resource-level outbox, version/base metadata and a recovery journal. These are essential product behavior, not disposable cache. No migration or logout flow may clear them without an explicit, recoverable policy and user-visible backup/reconciliation.

### 10.2 AI command and execution trust boundaries

- `/api/ai/command` currently checks POST, license validity/status and rate limits, then sends command/context to the model. The inspected handler does not validate an employee server session or branch assignment.
- `/api/agent/execute` accepts only an allow-listed action, license key, bearer token hash and idempotency key. Its database function validates the live employee session, employee status and resource permission, and persists an idempotent result.
- The execution path is stronger than the interpretation path, but neither inspected execution function nor payload has branch authorization today.
- Required future design: AI command may interpret and propose; any read of branch data and every write must be bound to a server-authenticated employee, selected authorized branch, active module entitlement and the same domain services used by the normal UI. AI must never grant itself a branch or bypass confirmation/approval rules.
- Extend the idempotency scope to include tenant + actor + action + logical operation key as appropriate; do not create a new key on retry of the same operation.

### 10.3 Reports and export dependencies

Observed report registry: 20 report definitions across sales, finance, inventory and receivables/payables. Existing report utilities include daily sales, sales by item/customer/cashier/payment, sales reconciliation, returns, profit/loss, VAT, expenses, treasury, purchases by supplier, inventory valuation, low stock, slow-moving, expiry, customer aging, supplier payables, cheques and loyalty.

There are also separate Excel export flows for sales, purchases, returns, treasury, inventory, accounts and a master accounting workbook, plus full inventory/car-model import/export.

Branch-aware report contract:
- Every report accepts an explicit authorized branch scope (one branch, selected set, or all branches for an authorized owner).
- Each row retains branch identity and source document IDs; consolidated totals must be reproducible from branch rows.
- Transfers between branches are internal movements and must not inflate group sales, purchases, income or expenses.
- Customer/supplier balances require allocation-aware reporting; never attribute a tenant-wide balance to the currently selected branch by UI context alone.
- Cash/bank reports follow the owning account and originating transaction dimensions; cross-branch settlement must be shown without double counting.
- Exports enforce the same server authorization as on-screen reports; client-side filtering is not a data security boundary.
- CSV/XLSX export metadata should include report scope, selected branch IDs, period, generation timestamp and schema version.

### 10.4 Further gaps and implementation constraints

1. Bootstrap returns the license-derived tenant object; the future customer portal must not treat a device-cached license object as authoritative subscription state.
2. Tenant backup export currently retrieves all tenant documents using license key in the inspected route. It needs explicit owner/admin authentication and auditable export authorization.
3. Owner PIN is currently persisted in browser localStorage; it must not remain the security boundary for platform operations.
4. POS warehouse choice is a browser preference. It must be reconciled against server-authorized branch and warehouse assignment.
5. Invoice device code is local and participates in invoice numbering; migration must retain device code/sequence collision safety across multiple devices and branches.
6. Report and Excel surfaces are separate code paths. Both need the same branch scope and calculation definitions to avoid different totals between dashboard, report hub and exported workbook.
7. The current 14-day trial and modular entitlement model is not implemented by these observed license fields; trial lifecycle must be server-owned and timestamped.



## 11. Detailed branch, industry, subscription and cutover specifications

Companion specifications added to this package:
- `MALVIA-BRANCH-REGISTER-ACCOUNT-MODEL-v1.md`
- `MALVIA-INDUSTRY-PACKS-AND-COMMON-MODULES-v1.md`
- `MALVIA-SUBSCRIPTIONS-ENTITLEMENTS-SEATS-v1.md`
- `MALVIA-MIGRATION-CUTOVER-ROLLBACK-PLAN-v1.md`

### 11.1 Exact scope identifiers

Keep the following independent in every mapping/API contract: `tenantId`, `branchId`, `warehouseId`, `registerId`, `cashboxId`, `bankAccountId`, `stockAllocationId`, `userId`, `membershipId`, and `operationId`. Do not alias a legacy warehouse to a branch. Every warehouse maps to exactly one branch in the target; central warehouse belongs to a designated central branch. Register and cashbox are separate identities and can have multiple records per branch.

### 11.2 Additional migration entities

| Target concept | Required mapping/evidence | Safety rule |
|---|---|---|
| Branch | Tenant-approved branch mapping | No inferred default for ambiguous legacy transactions |
| Register | Device/register evidence and invoice sequence history | Preserve invoice numbers and prevent collisions |
| Cashbox | Treasury account/cash custody evidence | Do not merge bank accounts or cashboxes based on display name |
| Bank account scope | Existing bank account identity + owner approval | Preserve bank ledger and opening balance |
| Stock allocation | Explicit reservation/order/demand evidence | Do not convert ordinary on-hand stock into a reservation |
| Industry pack extension | Domain-specific source fields and pack version | Preserve unknown fields in versioned legacy payload/quarantine |
| Seat assignment | Existing employee/user membership and approved commercial policy | Do not infer purchased seats from `maxEmployees` without a policy decision |

### 11.3 Transfer migration

Existing immediate warehouse transfers are imported as completed historical transfers with the original source/destination and timestamps where available. The new request/dispatch/in-transit/partial-receipt/shortage/damage/cancel lifecycle applies only to newly created transfers after the relevant feature is approved. No historical in-transit quantity is fabricated.

### 11.4 Cutover blocking controls

Before any tenant cutover, require snapshot checksums, outbox/journal reconciliation, source-to-target ID map, branch exception approvals, exact financial and stock reconciliation, restore rehearsal, tenant owner approval and finance approval. If writes have reopened on the target, rollback must preserve and replay accepted post-cutover operations or use forward repair; never discard them.
