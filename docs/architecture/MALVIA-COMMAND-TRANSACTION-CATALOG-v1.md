# MALVIA Command Transaction Catalog v1

**Status:** Domain command design proposal only. No endpoints, SQL, migrations, production writes or accounting policies are implemented by this document. Each command must be versioned and tested before cutover from legacy client-side multi-resource writes.

## 1. Purpose and shared execution contract

This catalog defines command-level transaction boundaries for the future MALVIA modular platform. A command is the only authorized write path for a financially material business action. UI, offline clients, integrations and AI agents submit intent; the server derives tenant, actor, entitlements and authorized scope, validates the domain state, and owns the transaction.

Companions:
- [Database Constraints & Transaction Specification](MALVIA-DATABASE-CONSTRAINTS-AND-TRANSACTION-SPEC-v1.md)
- [PostgreSQL Data Dictionary](MALVIA-POSTGRESQL-DATA-DICTIONARY-v1.md)
- [Detailed Relational ERD](MALVIA-DETAILED-RELATIONAL-ERD-v1.md)
- [Accounting Engine & Posting Orchestration](MALVIA-ACCOUNTING-ENGINE-AND-POSTING-ORCHESTRATION-v1.md)
- [Backend API Services & Command Contract](MALVIA-BACKEND-API-SERVICES-AND-COMMAND-CONTRACT-v1.md)
- [Migration Reconciliation Workbook](MALVIA-MIGRATION-RECONCILIATION-WORKBOOK-v1.md)

### 1.1 Required request envelope

Conceptual fields:
- API/command schema version;
- stable client command ID;
- idempotency key stable across retries;
- command type;
- requested branch/register/warehouse/account context where relevant;
- expected aggregate versions where optimistic concurrency is useful;
- occurred-at evidence from the client;
- typed payload.

Server-derived fields:
- tenant ID, user/session/device identity;
- module entitlement and subscription/trial state;
- branch, legal entity, register, warehouse, cashbox and bank-account authorization;
- server receipt time and canonical payload hash;
- posting period and authoritative numbering sequence.

The server MUST reject client attempts to set protected ownership, approval, posting or authorization fields. Client timestamps are evidence only and cannot bypass period lock or server business-date policy.

### 1.2 Common transaction algorithm

1. Authenticate active session and tenant; verify user status, module entitlement, seat/session policy and device policy.
2. Resolve command type/version and verify branch/legal entity/account scope.
3. Canonicalize payload and claim idempotency key. If a completed matching receipt exists, return it; if hash differs, reject.
4. Lock aggregate roots and dependent rows in the catalog's deterministic order.
5. Re-read and validate all preconditions under lock; never rely only on client preflight.
6. Allocate server document numbers and calculate authoritative amounts/quantities.
7. Write source document and mandatory subledger, stock, custody and accounting effects.
8. Insert command receipt, audit event and outbox event in the same transaction.
9. Commit; return the durable receipt and resulting IDs/versions.
10. On transient failure, retry the exact same command identity. On ambiguous outcome, query the receipt before any compensating action.

If a downstream external system is involved, write a durable pending instruction/outbox record and finish through a separate idempotent callback. Never hold a database transaction open during network I/O.

### 1.3 Receipt, event and error conventions

Each accepted command returns a receipt ID, command ID, status, source IDs, resulting versions, accounting status/journal IDs where applicable, sync cursor and safe trace ID. Canonical idempotency scope is tenant + command type + key; the receipt is bound to the initiating actor/device so another actor cannot retrieve its result by guessing or reusing the key. A source document committed with pending accounting is not described as fully posted.

Common rejection codes: AUTH_REQUIRED, SESSION_REVOKED, TENANT_SUSPENDED, MODULE_NOT_ENTITLED, SEAT_LIMIT_REACHED, BRANCH_SCOPE_DENIED, ACCOUNT_SCOPE_DENIED, VALIDATION_FAILED, VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, PERIOD_LOCKED, APPROVAL_REQUIRED, SOURCE_STATE_INVALID, STOCK_UNAVAILABLE, RETURN_LIMIT_EXCEEDED, POSTING_MAPPING_MISSING, POSTING_UNBALANCED, DEPENDENCY_UNAVAILABLE.

### 1.4 Lock-order convention

Lock only required rows, preserving this relative order:
1. command/idempotency identity;
2. legal entity and fiscal period;
3. branch/register/shift/sequence;
4. source document and lines;
5. customer/supplier/partner aggregate;
6. stock balances sorted by item + warehouse + location;
7. batches/serials sorted by stable ID;
8. cashbox/bank accounts sorted by stable ID;
9. journal/posting rows;
10. receipt/audit/outbox inserts.

Exact table names may change with physical design, but lock order must remain deterministic.

## 2. Command catalog

### CMD-SALES-001 — sales.create

**Preconditions**
- Active user/session, SALES entitlement, authorized branch/register/warehouse and open shift where shift control applies.
- Invoice series and fiscal period valid; customer active if selected.
- Item/price/tax/discount rules validated server-side; payment split and destinations valid.
- Stock availability, batch/serial eligibility and loyalty redemption checked under lock.
- No duplicate external/client invoice identity.

**Read set**
- tenant/module/session and branch authorization;
- legal entity, branch, register, sequence, shift;
- customer/credit limit and open receivable aggregate;
- item, price list, tax policy, stock balances, reservations, batches and serial units;
- cashbox/bank account and period/posting templates;
- loyalty balance and policy.

**Write set**
- invoice header, immutable line/tax/discount/cost snapshots and tender rows;
- stock movement and stock balance; batch/serial allocation/custody events;
- customer receivable and payment allocations if credit exists;
- treasury movements for cash/wallet and bank/clearing ledger effects for bank/card paths;
- loyalty earn/redeem events;
- accounting journal/posting receipt when synchronous policy requires;
- command receipt, audit and outbox.

**Idempotency / locks**
- Scope: tenant + sales.create + client idempotency key.
- Lock sequence, shift, customer receivable aggregate, all stock balances in sorted order, batch/serial units, custody accounts and posting period.
- Unique invoice series/number and unique source-effect keys are final guards.

**Reversal / rollback**
- Any mandatory synchronous failure rolls back all effects.
- A later void is CMD-SALES-002; never delete the invoice.
- If provider settlement is external, record pending settlement and callback receipt separately.

### CMD-SALES-002 — sales.void

**Preconditions**
- Original invoice exists, tenant and branch/account scope authorized, status is voidable.
- Reason and required approval are present.
- Previously returned quantities/refunds are read and locked; void refund amount cannot duplicate a prior return settlement.
- Period and reversal policy allow the operation.

**Read set**
- invoice/lines/tenders/returns; stock source movements, batches/serials; customer allocations; loyalty events; treasury/bank entries; original journal and period.

**Write set**
- immutable void event and invoice lifecycle status/reason/approver;
- reversal stock movements and custody restoration where items were not already returned;
- refund/credit settlement for eligible remaining amount;
- customer receivable adjustment; loyalty reversal;
- reversing journal and linked custody events;
- receipt/audit/outbox.

**Idempotency / locks**
- Scope: tenant + sales.void + original invoice + command key.
- Lock invoice, all lines/returns, relevant stock/serials, customer and tender accounts, period.

**Reversal / rollback**
- Retain original invoice and all prior return links.
- One successful void effect; duplicate call returns same receipt.
- No partial void unless an explicitly modeled workflow is approved.

### CMD-SALES-003 — sales.return.create

**Preconditions**
- Original invoice and line are eligible and not voided under policy.
- Return quantity/value remains within sold quantity less prior approved/posted returns.
- Return reason, branch authorization, item disposition and refund/credit method valid.
- Serial/batch identity matches original sold unit when tracked.

**Read set**
- original invoice/line and all returns against it;
- stock/warehouse/batch/serial state;
- customer receivable/loyalty and original payment allocation;
- refund cashbox/bank account, period and return policy.

**Write set**
- return header/lines linked to original invoice line;
- return allocation against original line;
- stock movement and disposition-specific balance/batch/serial custody;
- refund tender, customer credit or receivable adjustment;
- loyalty reversal if applicable;
- journal and receipt/audit/outbox.

**Idempotency / locks**
- Scope: tenant + sales.return.create + command key; unique return number.
- Lock original invoice and all affected original lines/return aggregates before stock and custody locks.
- Cumulative quantity check occurs under lock or through a serializable aggregate constraint strategy.

**Reversal / rollback**
- No deletion of posted return. Correct by a linked return reversal/adjustment command.
- A return's refund and restock effects are independently traceable but commit atomically.

### CMD-PROC-001A — procurement.purchase_invoice.record

**Preconditions**
- Supplier, legal entity and originating/receiving business context are authorized.
- Supplier invoice identity, invoice lines, units, currency, tax and discounts are valid.
- Duplicate supplier-document reference follows an explicit policy; invoice quantity is not assumed to be physically received.
- Any payment entered in the same workflow is a separate payment command/allocation, not proof of stock receipt.

**Read set**
- supplier identity and payable subledger;
- legal entity/book, invoice numbering scope and period;
- item/unit, tax and price/cost policy;
- existing supplier invoice references and allocations.

**Write set**
- supplier invoice header and immutable line/tax/discount snapshots;
- supplier payable event and invoice allocation projection only when invoice recognition policy requires;
- accounting journal/receipt when synchronous posting is approved;
- command receipt, audit and outbox.

**Idempotency / locks**
- Scope: tenant + procurement.purchase_invoice.record + command key.
- Lock supplier/document identity, numbering sequence and accounting period.
- Unique internal invoice number; external supplier-reference uniqueness remains policy-controlled.

**Reversal / rollback**
- Does not increase inventory. Stock changes only through an accepted receipt command.
- Correct posted invoice through linked credit/reversal events, not physical deletion.

### CMD-PROC-001B — procurement.purchase_receipt.post

**Preconditions**
- Receiving branch and warehouse are authorized; source supplier and optional purchase invoice are valid.
- Receipt lines identify accepted/rejected quantities, units, batch/serial data and cost evidence.
- For invoice-linked receipts, cumulative allocation cannot exceed invoiced quantity; unlinked receipt policy must be approved.
- Source stock availability/custody and serial uniqueness are checked under lock.

**Read set**
- purchase invoice lines and prior receipt allocations, if linked;
- supplier, branch/warehouse, item units and stock balances;
- batch/serial identities and cost-layer policy;
- period, tax/landed-cost policy and posting templates.

**Write set**
- receipt header/lines and invoice-to-receipt allocations;
- stock movements/balances/cost layers/batches/serial custody for accepted quantities only;
- receipt accrual/subledger effect only under approved accounting policy;
- journal/posting receipt when synchronous posting is approved;
- command receipt, audit and outbox.

**Idempotency / locks**
- Scope: tenant + procurement.purchase_receipt.post + command key.
- Lock receipt number, source invoice lines/receipt allocations, stock balances in sorted order, then batch/serial rows and period.
- Unique receipt line source-effect key prevents duplicate stock receipt.

**Reversal / rollback**
- Any mandatory synchronous failure rolls back receipt and stock effects together.
- Rejected/damaged quantities do not become available stock; their disposition remains explicit.
- Later supplier return references the accepted receipt line, not merely the invoice line.

### CMD-PROC-002 — procurement.purchase_return.create_or_settle

**Preconditions**
- Original accepted purchase receipt lines exist; cumulative accepted quantity less prior returns is sufficient. Invoice-only quantity is not returnable stock.
- Return disposition and supplier settlement components are explicit.
- Cash refund, deferred debt reduction and supplier store credit are mutually reconciled to approved return value.
- Any stock being returned is in eligible custody and tracked batch/serial matches.

**Read set**
- original accepted receipt lines, linked invoice lines and all prior returns;
- stock balances/batches/serials and cost layers;
- supplier payable, payment allocations, store-credit balance;
- cashbox/bank destination and period.

**Write set**
- purchase return/lines linked to original accepted receipt lines and source-line allocations;
- stock-out movement and batch/serial custody events;
- settlement components: cash refund, supplier debt reduction, store credit;
- supplier subledger and purchase invoice allocation projections;
- treasury/bank movement only for actual cash/bank settlement;
- journal, receipt/audit/outbox.

**Idempotency / locks**
- Scope: tenant + procurement.purchase_return + command key.
- Lock original purchase and lines/return aggregate, stock, supplier payable/credit, custody accounts and period.

**Reversal / rollback**
- Posted return is immutable; correction uses reversal/adjustment command.
- Legacy “settle” or delete behavior must be migrated as explicit historical events and must not replay stock or money effects.

### CMD-FIN-001 — finance.expense.create

**Preconditions**
- Expense category/account mapping valid; branch/legal entity and actor authorized.
- Amount, currency, business date and tax treatment valid.
- Exactly one settlement path is selected: cashbox, bank, or approved payable/pending method.

**Read set**
- category/account posting template and fiscal period;
- branch/legal entity, cashbox/bank account;
- approval thresholds and budget controls if enabled.

**Write set**
- expense source document;
- one cashbox treasury movement OR bank ledger movement for actual settlement;
- expense payable if explicitly deferred;
- journal/posting receipt;
- command receipt, audit and outbox.

**Idempotency / locks**
- Scope: tenant + finance.expense.create + command key.
- Lock expense numbering, custody account, legal entity/period and posting configuration.

**Reversal / rollback**
- If custody or mandatory journal write fails, roll back expense.
- Correction uses expense reversal/credit event; no physical delete after posting.
- Whether bank-paid expense also appears in a unified treasury view is a reporting projection decision, not a duplicate cash posting.

### CMD-INV-001 — inventory.transfer.create_dispatch_receive

**Preconditions**
- Source and destination warehouses must differ and both are authorized. The branches may be the same for a transfer between warehouses within one branch; cross-branch transfers require authorization for both branches.
- Items, quantities, batches/serials and transfer route valid.
- Source available stock verified under lock; destination receipt policy known.
- Transfer approval/dispatch/receipt roles validated.

**Read set**
- transfer and sequence; source/destination branches/warehouses;
- stock balances, reservations, batches, serials;
- user branch assignments and transfer policy.

**Write set**
- transfer header/lines and lifecycle events;
- at dispatch: source stock movement and in-transit custody;
- at receipt: destination stock movement, received/damaged/short quantities and serial/batch custody;
- variance/claim records if required;
- command receipt, audit and outbox for each lifecycle command.

**Idempotency / locks**
- Separate stable keys for create, dispatch, receive and approved correction.
- Lock transfer, source/destination balances in deterministic order, then batch/serial rows.
- Transfer number unique in the configured legal-entity/branch/register/document-type/series scope; the scope is policy-driven, not branch-only.

**Reversal / rollback**
- Do not treat dispatch as destination receipt.
- Never make the same quantity available in both source and destination.
- Transfer events append-only; cancellation after dispatch requires explicit return-transfer or correction workflow.
- Internal transfer does not create group sales, purchases, income or expense.

### CMD-PARTNER-001 — finance.partner_current_account.post

**Preconditions**
- Partner active and legal entity context valid.
- Event type is explicitly advance/loan, repayment or approved adjustment.
- Repayment links to eligible outstanding origin event and cannot exceed outstanding amount.
- Settlement method and custody account authorized.

**Read set**
- partner and current-account events;
- origin event and prior repayments;
- cashbox/bank account, period and posting template.

**Write set**
- immutable partner current-account event;
- linked treasury or bank ledger movement for actual cash movement;
- current-account balance projection/allocation;
- journal, receipt/audit/outbox.

**Idempotency / locks**
- Scope: tenant + finance.partner_current_account.post + command key.
- Lock partner current-account aggregate, origin event, custody account and period.

**Reversal / rollback**
- Never mutate partner capital or ownership by implication.
- Repayment is a new event linked to origin.
- Reversal is a linked event; no delete.

### CMD-PARTNER-002 — finance.partner_withdrawal_or_advance.post

**Preconditions**
- Partner and payout destination valid.
- Type is either capital withdrawal or advance/current-account movement; approval rules differ.
- Amount available under the applicable approved limit/policy.

**Read set**
- partner ownership/capital events and withdrawal history;
- current-account outstanding if advance;
- cashbox/bank account and period.

**Write set**
- typed partner withdrawal/advance event;
- treasury/bank payout event;
- relevant partner subledger projection and journal;
- receipt/audit/outbox.

**Idempotency / locks**
- Scope: tenant + command type + key.
- Lock partner aggregate, custody account and period.

**Reversal / rollback**
- A capital withdrawal affects the approved withdrawn-capital measure; an advance affects partner current account. Never interchange these classifications.
- Reversal is linked and preserves original event.

### CMD-PARTNER-003 — finance.partner_exit.approve_and_pay

**Preconditions**
- Partner exit/settlement proposal has required approval and immutable approved amount.
- Outstanding due = approved amount less prior payments/credits under approved policy.
- Payout account and period valid; amount <= outstanding due.

**Read set**
- partner exit settlement and approval history;
- prior settlement payments and credits;
- partner capital/current account balances as defined by approved settlement calculation;
- cashbox/bank and posting period.

**Write set**
- approval event and approved liability snapshot;
- each payment as separate immutable event;
- treasury/bank payout, journal and settlement outstanding projection;
- receipt/audit/outbox.

**Idempotency / locks**
- Separate keys for approval and each payment.
- Lock settlement, partner aggregate, prior payments, custody account and period.

**Reversal / rollback**
- Never overwrite approved amount to make payments reconcile.
- Payment cannot exceed outstanding due; correction requires approved adjustment event.

### CMD-OPEN-001 — finance.opening_balance.approve

**Preconditions**
- Opening balance draft is complete and reconciled by domain.
- Owner/accountant approval and effective date/legal entity/branch scope valid.
- Existing approved opening policy checked; no prior posting for same scope/version.
- Inventory valuation, cash/bank, receivables/payables and partner capital/current accounts are separately classified.

**Read set**
- opening draft and all lines;
- existing opening receipts and posted source events;
- items/stock, customers/suppliers, bank/cashbox, partners and fiscal period.

**Write set**
- approved immutable opening snapshot;
- stock opening movements/cost layers;
- cashbox/bank opening movements;
- AR/AP opening subledger events;
- partner capital/current-account opening events separately;
- opening journal(s), command receipt, audit and outbox.

**Idempotency / locks**
- Scope: tenant + legal entity + opening scope/version + command key.
- Lock opening scope, period, stock rows, party/partner aggregates and custody accounts in deterministic order.
- Unique opening posting receipt per approved scope/version.

**Reversal / rollback**
- One approval produces one complete effect set. Replayed approval returns original receipt.
- Corrections after posting require explicit reversing and replacement opening workflow with accountant approval.
- Never reset balances or run demo-data clearing as an opening migration.

### CMD-SHIFT-001 — sales.shift.close

**Preconditions**
- Shift open and assigned register/cashbox valid.
- Cashier/manager authority and count evidence supplied.
- All in-scope sales, returns, tenders and known offline receipts reconciled or explicitly listed as pending.

**Read set**
- shift, register, cashbox assignment;
- shift-linked invoices/returns/tenders/treasury events;
- card settlement/cheque pending states and prior closeout.

**Write set**
- immutable closeout snapshot with expected, counted and variance by tender;
- variance/over-short event and any approved custody/journal effect;
- shift closed state, receipt/audit/outbox.

**Idempotency / locks**
- Scope: tenant + shift ID + close command key.
- Lock shift, register/cashbox and relevant pending event aggregates.

**Reversal / rollback**
- One closeout per shift unless a controlled reopen workflow is approved.
- Closing must not silently discard late offline commands; those are quarantined/reconciled through explicit process.

### CMD-GL-001 — accounting.period.close

**Preconditions**
- Period is in an eligible pre-close state (OPEN or SOFT_CLOSED as defined by the approved state machine) and all required branch/legal entity/book subledgers are reconciled.
- No unresolved mandatory posting, outbox, bank/cash, stock valuation, tax or approval blockers.
- Authorized finance approver and close policy version present.

**Read set**
- fiscal period, journals and posting queues;
- branch/legal entity subledgers, bank/cash reconciliations;
- inventory valuation and receivables/payables;
- open shifts, pending transfers and integration settlement exceptions.

**Write set**
- close run and immutable control snapshots;
- closing/adjustment journals only as defined by approved accounting policy;
- period status transition and audit/outbox.

**Idempotency / locks**
- Scope: tenant + legal entity + period + close-run key.
- Lock period row and close run; serialize postings against period lock.

**Reversal / rollback**
- Failed preflight creates a blocker report and does not close.
- Reopening requires explicit privileged approval and audit; do not mutate prior close snapshots.

### CMD-PLATFORM-001 — platform.seat.assign_or_release

**Preconditions**
- Tenant subscription active and seat entitlement effective.
- User belongs to tenant and is eligible; module/role permissions do not imply seat purchase.
- Seat counting and concurrent-device policy approved.

**Read set**
- subscription, purchased seat count and effective interval;
- active seat assignments, user status and entitlement grants.

**Write set**
- seat assignment/release event and current assignment;
- entitlement/session policy refresh as required;
- receipt/audit/outbox.

**Idempotency / locks**
- Scope: tenant + subscription + user + command key.
- Lock subscription seat aggregate before counting active assignments; unique active assignment prevents duplicate allocation.

**Reversal / rollback**
- Concurrent final-seat attempts serialize; never exceed purchased capacity.
- Release does not delete historical assignment evidence or erase user data.

### CMD-PLATFORM-002 — platform.trial.convert

**Preconditions**
- Tenant trial active or within explicitly approved conversion grace policy.
- Plan, modules, seats, billing reference and payment status meet approved commercial rules.
- Existing tenant identity and data validated; no new tenant fork.

**Read set**
- trial lifecycle/events, tenant status;
- subscription plan/module entitlements, seat capacity;
- billing provider transaction status and conversion history.

**Write set**
- subscription and entitlement grants;
- trial conversion event/status;
- billing reference/payment receipt (not raw payment credentials);
- receipt/audit/outbox.

**Idempotency / locks**
- Scope: tenant + trial ID + conversion command key.
- Lock tenant subscription/trial aggregate; unique conversion source prevents double conversion.

**Reversal / rollback**
- Keep same tenant and data. Download/reinstall/device change cannot restart trial.
- Failed payment follows approved pending/failed conversion policy; never silently create duplicate paid subscriptions.
- Expired trial data retention/read-only/export policy remains OPEN.

### CMD-WF-001 — workflow.instance.approve

**Preconditions**
- Workflow instance references active immutable definition version and current step.
- Approver identity, role, branch scope and separation-of-duties rules valid.
- Required evidence/fields complete; no prior terminal approval for same step.

**Read set**
- workflow definition/version/step and instance row version;
- task/approval history and actor roles/branch assignments;
- source business record and its current version/status.

**Write set**
- immutable approval/rejection event;
- workflow instance/task state transition;
- any explicitly bound domain command receipt (approval alone must not bypass domain command);
- audit/outbox.

**Idempotency / locks**
- Scope: tenant + workflow instance + step + decision command key.
- Lock workflow instance and current task; compare expected version after lock.

**Reversal / rollback**
- A duplicate approval returns original receipt.
- Reassignment or correction is a new event under policy; active workflow definition is not edited in place.
- Approval of a financial action invokes its domain command through the same authorization/transaction contract.

## 2A. Additional cross-domain command contracts

### CMD-AR-001 — sales.customer_receipt.record_and_allocate

- Preconditions: active customer, authorized collecting branch/cashbox/bank account, valid currency and amount; each invoice allocation references an eligible open receivable.
- Read/lock: customer AR aggregate, target invoices/credits and prior allocations, collection account and period.
- Atomic writes: receipt header plus one or more tender lines, explicit invoice allocations (or unapplied customer credit), customer subledger event, cashbox and/or bank movements for the actual tender lines, journal when synchronous, receipt/audit/outbox.
- Invariant: total allocations cannot exceed receipt amount or eligible invoice balance; unapplied remainder remains explicit and is not auto-assigned.
- Retry/reversal: same tenant + command + key returns original receipt; corrections use linked refund/reallocation events.

### CMD-AP-001 — procurement.supplier_payment.record_and_allocate

- Preconditions: supplier and paying account authorized; allocations target eligible supplier invoices/credits.
- Read/lock: supplier AP aggregate, invoice balances, prior allocations, paying cashbox/bank account and period.
- Atomic writes: payment header plus one or more tender lines, invoice allocations, supplier AP event, cashbox and/or bank movements for actual tender lines, journal when synchronous, receipt/audit/outbox.
- Invariant: allocation cannot exceed payment or eligible payable; unapplied amount remains supplier credit. Central payment retains each originating receipt/invoice branch.
- Retry/reversal: stable receipt identity; corrections use linked reversal/reallocation events.

### CMD-FIN-002 — finance.bank_transfer.confirm

- Preconditions: source/destination bank accounts are distinct, same tenant/legal-entity/currency policy is satisfied, and actor can use both accounts.
- Read/lock: both bank accounts in stable ID order, transfer state and period.
- Atomic writes: transfer instruction/state plus paired bank-ledger out/in events, fees/clearing only under approved policy, journal when required, receipt/audit/outbox.
- Invariant: one side cannot be reported as a completed transfer without its paired side or an explicit pending-in-transit state. It is not revenue or expense.

### CMD-INV-002 — inventory.count.approve_and_post

- Preconditions: count belongs to authorized branch/warehouse; count evidence is complete; approval and variance reason are present.
- Read/lock: count and lines, stock balances in sorted order, relevant batch/serial rows and period.
- Atomic writes: immutable count approval, variance stock movements/balance projection, batch/serial corrections, journal when applicable, receipt/audit/outbox.
- Invariant: one approval effect per count version; count cannot overwrite movement history.

### CMD-SALES-004 — sales.reservation.create_convert_or_cancel

- Preconditions: customer/branch/warehouse scope valid; reservation expiry and available-to-promise policy valid; any deposit tender is explicit.
- Read/lock: reservation, stock availability/allocation, customer and deposit/custody records.
- Atomic writes: reservation lifecycle, availability allocation/release, deposit liability/receipt and conversion link to invoice where applicable, receipt/audit/outbox.
- Invariant: reservation is not a sale or stock issue; conversion consumes the hold once; deposit is allocated/refunded/forfeited only under approved policy.

### CMD-FIN-003 — finance.payment_instrument.transition_or_card_settlement

- Preconditions: instrument/provider event is authenticated, deduplicated and linked to the original tender/source; state transition is allowed.
- Read/lock: instrument, source allocations, card batch and bank account.
- Atomic writes: append-only instrument event; for card settlement, batch/line gross-fee-net reconciliation and bank deposit event; journal when approved; receipt/audit/outbox.
- Invariant: deposited/cleared is not assumed from instrument status alone; card gross less fees reconciles to net settlement under approved rounding. Bounced/chargeback events create linked reversals, not silent edits.

## 3. Legacy migration mapping and protection

Current legacy flows may write multiple resource documents from the client. During migration:
1. Inventory each handler and record exact source resource IDs, nested line IDs, effects and ordering.
2. Introduce command endpoint and receipt beside legacy sync; do not redirect all writes in one release.
3. Pilot low-risk commands before sales, returns, purchases, finance or opening balances.
4. For each migrated command, record source IDs and a legacy-to-command receipt mapping.
5. After a controlled cutover gate, prevent legacy sync from mutating command-owned fields/resources; keep read compatibility as required.
6. Preserve `malvia_sync_pending_v1_<tenantId>`, `malvia_<tenantId>___transaction_journal`, sync versions, device identifiers and active sessions. Do not clear or blindly replay them.
7. An offline legacy operation must be reconciled to a command receipt or quarantined for review. Do not mint a new idempotency key for a retry of the same business action.
8. Preserve invoice/return/purchase/treasury/bank/partner/opening-balance source identities and audit history.
9. Do not call demo clearing or reset helpers during migration, onboarding, trial conversion, repair or logout.
10. Rollback restores a tested snapshot or uses an approved forward-repair command; it does not run improvised inverse mutations over live financial events.

## 4. Command acceptance test matrix

| ID | Command | Critical test | Expected |
|---|---|---|---|
| CMD-T01 | sales.create | concurrent sale for final stock / same serial | one valid allocation; no duplicate serial |
| CMD-T02 | sales.create | same key and payload retried after timeout | original receipt; one invoice and effect set |
| CMD-T03 | sales.void | void after partial return | only eligible remaining refund/restock |
| CMD-T04 | sales.return.create | simultaneous returns exceed sold quantity | aggregate limit enforced |
| CMD-T05 | purchase_receipt.post | retry after stock updated but response lost | one accepted receipt and one stock effect set |
| CMD-T06 | purchase_return | cash refund + credit + debt reduction exceed return | reject atomically |
| CMD-T07 | expense.create | bank write or journal fails | full rollback or explicitly approved pending state |
| CMD-T08 | inventory.transfer | dispatch succeeds but receipt not yet done | in-transit custody; no double availability |
| CMD-T09 | partner_current_account | repayment exceeds linked advance | reject under lock |
| CMD-T10 | partner withdrawal | advance submitted as capital withdrawal | type policy enforced |
| CMD-T11 | partner exit | two concurrent payments exceed outstanding | one serialized valid result |
| CMD-T12 | opening approval | replay approved opening command | one set of opening effects |
| CMD-T13 | shift.close | late offline invoice exists | close blocked or explicit pending exception |
| CMD-T14 | period.close | pending journal/outbox blocker | close rejected with blocker list |
| CMD-T15 | seat.assign | two users claim final seat | only one assignment succeeds |
| CMD-T16 | trial.convert | retry conversion callback | one subscription; same tenant |
| CMD-T17 | workflow.approve | duplicate approval or stale row version | one approval; stale request rejected |
| CMD-T18 | all | cross-tenant or unauthorized branch ID supplied | denied before data mutation |
| CMD-T19 | all | outbox/audit insert failure | mandatory transaction rolls back |
| CMD-T20 | all | deadlock/serialization retry | same idempotency identity; no duplicate effects |

## 5. Decisions requiring approval before implementation

- negative stock/backorder and reservation policy;
- serial/batch uniqueness and return disposition;
- document numbering gap and offline numbering policy;
- money/quantity precision, rounding, currencies and FX;
- tax posting and return-credit note policy;
- whether source commit with pending GL posting is permitted;
- central bank/cashbox ownership and branch allocation;
- supplier external document duplicate policy;
- partner settlement calculation and approval authority;
- shift reopen and late offline operation policy;
- period reopen policy and required approvals;
- seat counting, device concurrency and grace rules;
- trial conversion payment states and expired-data retention;
- workflow separation of duties and approval thresholds.

**Implementation gate:** each command requires a versioned API contract, schema/constraint mapping, migration compatibility test, concurrency/idempotency tests, accounting sign-off where applicable, and security review. This catalog is not permission to implement or deploy any of those changes.


## Numbering and receipt-line enforcement notes

- The sequence allocator and document unique constraint must use the identical approved scope (legal entity, optional branch/register, document type and series). Nullable scope columns require partial unique indexes or a reviewed equivalent; do not rely on a plain nullable composite UNIQUE.
- Customer and supplier receipts may contain multiple tender lines. Each tender line has one actual custody destination; the header total equals the sum of tender lines. Invoice allocations are a separate dimension and may leave an explicit unapplied balance.
- Purchase invoice recording does not create stock. A later receipt command creates stock only for accepted receipt-line quantities. A purchase return references accepted receipt lines.
- A same-branch transfer between different warehouses is valid. Only identical source/destination warehouses are prohibited.
