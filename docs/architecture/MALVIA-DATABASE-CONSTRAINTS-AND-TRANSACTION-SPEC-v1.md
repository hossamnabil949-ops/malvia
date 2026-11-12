# MALVIA Database Constraints & Transaction Specification v1

**Status:** Design specification for review only. It is not executable DDL and does not authorize schema deployment, data migration, accounting-policy changes or production behavior changes. Types, precision, currency policy and unresolved business rules remain subject to explicit approval.

## 1. Purpose and authority

This document turns the PostgreSQL Data Dictionary and Detailed Relational ERD into enforceable integrity requirements. It defines the database guarantees expected of the future relational platform while preserving the current legacy application's behavior until a separately approved migration.

Normative terms: **MUST** is a release-blocking requirement; **SHOULD** is the default unless a documented exception is approved; **OPEN** marks a policy that must not be guessed by implementation.

Companion documents:
- [PostgreSQL Data Dictionary](MALVIA-POSTGRESQL-DATA-DICTIONARY-v1.md)
- [Detailed Relational ERD](MALVIA-DETAILED-RELATIONAL-ERD-v1.md)
- [Physical Database Design](MALVIA-PHYSICAL-DATABASE-POSTGRESQL-DESIGN-v1.md)
- [Accounting Engine & Posting Orchestration](MALVIA-ACCOUNTING-ENGINE-AND-POSTING-ORCHESTRATION-v1.md)
- [Backend API Services & Command Contract](MALVIA-BACKEND-API-SERVICES-AND-COMMAND-CONTRACT-v1.md)
- [Migration Reconciliation Workbook](MALVIA-MIGRATION-RECONCILIATION-WORKBOOK-v1.md)

## 2. Global integrity principles

1. Every tenant-owned row MUST carry `tenant_id`; all tenant-owned references MUST be tenant-safe composite foreign keys, normally `(tenant_id, referenced_id)`.
2. Tenant identity, actor identity, entitlement, module access and authorized branch/account scope MUST be derived and verified server-side. A client-supplied tenant or branch ID is a requested context, never proof of authorization.
3. A business fact MUST have one authoritative source. Snapshot fields are projections, not independent postings. Derived totals must be reproducible from source events and allocations.
4. Posted financial and stock ledger events are append-only. Corrections use linked reversal/correction events; physical deletion or silent mutation is prohibited.
5. A business command's mandatory source, stock, subledger, custody, accounting, receipt, audit and outbox effects commit atomically or not at all, except for an explicitly approved durable pending workflow.
6. At-least-once delivery is expected. Exactly-once business effect is achieved by durable idempotency receipts and unique source-effect constraints, not by assuming a request is delivered once.
7. Database constraints are the final concurrency authority. UI validation and preflight reads improve usability but do not guarantee integrity.
8. No migration may infer missing branch ownership, discard legacy IDs, clear offline outbox/journal state or replay an effect without a migration receipt.

## 3. Constraint catalogue by domain

The following is a logical constraint matrix. Names are illustrative; final SQL names and exact types are implementation decisions.

| Domain | Primary / foreign keys | Unique constraints | CHECK / exclusion / transactional invariants |
|---|---|---|---|
| Platform tenants | tenant PK; tenant-owned FKs include tenant | tenant_key globally unique | status transitions controlled; trial dates valid |
| Plans/modules/packs | global catalog PKs | (code, version) unique | only published compatible versions grant entitlements |
| Subscriptions/seats | tenant-scoped subscription/user FKs | subscription reference unique where required | purchased seats > 0; valid effective interval; active assignments <= purchased seats under approved counting rule |
| Trials/events | tenant/trial FKs | one trial lifecycle per tenant/product policy; event idempotency | ends_at > started_at; download/reinstall cannot restart trial |
| Users/credentials | (tenant_id,id), credential FK | normalized username unique per tenant | username normalization deterministic; password hashes only; no plaintext credentials |
| Roles/permissions | tenant-safe role/user FKs; global permission FK | role code per tenant; role-permission pair unique | valid effect/scope; role assignment interval valid |
| Sessions/devices | tenant/user/device FKs | token hash unique; device key hash unique per tenant | expiry > issue; revoked session cannot authorize; one active session policy OPEN |
| Legal entities/branches | composite tenant FKs | legal entity code per tenant; branch code per legal entity | branch belongs to exactly one legal entity; branch scope explicit |
| Registers/cashboxes | tenant + branch/account FKs | register code per branch; valid assignment uniqueness | at most one active cashbox assignment per register/time interval; no overlapping validity intervals |
| Document sequences | tenant/legal entity plus optional branch/register FKs | unique approved numbering-scope tuple + document type/series, implemented with separate partial unique indexes for nullable entity/branch/register scope | next value positive; register scope requires branch; increment and document insert atomic; committed number never reused; plain UNIQUE with nullable scope columns is not sufficient where NULLs are distinct |
| Catalog items/units | tenant-safe item/unit FKs | item code per tenant; unit code per item; barcode policy OPEN | conversion factor > 0; exactly one typed attribute value matches declared type |
| Prices/tax | item/list/tax FKs | uniqueness by item/list/currency/effective version | valid_from < valid_to; overlapping active price intervals prohibited for same key unless priority policy exists |
| Warehouses/locations | warehouse branch FK; location warehouse FK | warehouse code per branch; location code per warehouse | warehouse branch immutable after posting or changed only by controlled migration |
| Stock balances | item/warehouse/location FKs | one balance per tenant/item/warehouse/location | quantities follow approved scale; negative on-hand policy OPEN |
| Stock movements | source item/branch/warehouse FKs | source-effect key unique for each posting effect | quantity delta nonzero; reversal references original; append-only |
| Batches/serials | item/warehouse and event FKs | batch code scope OPEN; serial uniqueness scope OPEN | expiry >= manufacture date; one active custody state per serial; no serial allocated/sold twice concurrently |
| Allocations | item/warehouse/source FKs | active allocation source identity unique | allocated quantity > 0; total active allocation cannot exceed eligible availability under locked transaction |
| Transfers | source/destination branch and warehouse FKs | transfer number unique in approved scope | source warehouse != destination warehouse; source and destination branch may be equal for intra-branch transfer; quantities nonnegative; received/damaged <= dispatched; lifecycle transition validated |
| Inventory counts | branch/warehouse/item FKs | count number unique per warehouse | only approved variance posts stock movement; one approval effect |
| Sales documents | tenant/legal entity/branch/register/customer FKs | invoice number unique by tenant/legal entity/series; line number unique per invoice | totals recomputed server-side; posted snapshot immutable; valid currency/date/amount rules |
| Invoice tenders | invoice/cashbox/bank FKs | source tender effect unique | positive amount; exactly one applicable custody destination; sum reconciles to invoice settlement state |
| Sales returns | original invoice/line FKs | return number unique in scope; source effect unique | cumulative returned quantity <= eligible sold quantity; return cannot target cancelled/voided line unless approved policy says otherwise; refund/credit totals reconcile |
| Procurement | supplier/invoice/receipt/receipt-line/warehouse FKs | internal invoice and receipt numbers unique in approved scopes; supplier external ref duplicate policy OPEN | invoiced quantity is distinct from accepted receipt quantity; only accepted receipt lines increase stock; returns cannot exceed accepted net quantity |
| Purchase returns | original purchase/line FKs | return number unique; settlement effect unique | cumulative returned quantity <= net accepted quantity; cash refund + debt reduction + store credit cannot exceed approved return value |
| Cashboxes/treasury | branch/cashbox/source FKs | source effect key unique | amount > 0; direction explicit; reversal linked; no mutable balance snapshot as ledger source |
| Bank ledger | bank account/source FKs | source effect key unique | amount > 0; direction explicit; bank and cash custody are distinct ledgers |
| Partners | partner/source/cashbox/bank FKs | source event unique | capital, current-account advance/repayment, withdrawal and exit settlement remain distinct event types |
| Customer/supplier allocations | party/document/payment FKs | allocation source identity unique | allocations > 0; cumulative allocation <= eligible payment/document amount |
| Books/accounts/journals | legal entity/book/period/account and book-account assignment FKs | account assignment unique per book/effective interval; journal number unique in approved scope; one source posting effect per tenant/legal entity/book/source/purpose | journal line account must be active in the journal book/date; debit/credit nonnegative; balance per legal entity + book + currency; period open; posted lines immutable |
| Reversals | original event/journal FKs | one full reversal per original unless partial-reversal model explicitly supported | reversal cannot exceed unreversed original; correction preserves source chain |
| Workflow | tenant/definition/version/step FKs | step code/order unique within version | active workflow version immutable; valid transitions; approval actor authorized |
| Sync/commands | tenant/actor/command FKs | idempotency key unique in defined scope; event sequence unique | same key + same hash returns receipt; same key + different hash conflicts |
| Audit/outbox/inbox | tenant/source/actor FKs | event/delivery dedupe keys unique | append-only audit; outbox committed with source transaction; consumer inbox idempotent |
| Integrations | tenant/connection/job FKs | provider external ID unique per connection | webhook signature and replay window verified; secrets encrypted |

### 3.1 Tenant-safe relational pattern

Every tenant-owned parent exposes a unique key on `(tenant_id, id)`. A child stores both values and references both. A relationship from a child in Tenant A to a guessed parent ID in Tenant B must fail at the database boundary even if an application check is defective.

Cross-tenant platform catalog references are the exception: they point to explicitly global catalog IDs and do not weaken tenant ownership of the consuming row. Avoid nullable tenant IDs as a shortcut for shared records; use explicit global catalog tables or tenant-owned copies.

### 3.2 Branch, legal entity and custody dimensions

These are different dimensions and MUST NOT be conflated:
- `legal_entity_id`: legal/accounting ownership.
- `branch_id`: operational origin or responsibility.
- `warehouse_id` / `stock_location_id`: physical stock custody.
- `register_id`: point of sale/workstation.
- `cashbox_id`: cash custody.
- `bank_account_id`: bank custody and legal account ownership.
- `collection_branch_id`: where payment was collected, which may differ from invoice origin.

A record may carry multiple dimensions for different meanings. Each FK must be tenant-safe and business-compatible. Authorization must evaluate the relevant dimension for the action; access to one branch does not imply access to all tenant bank accounts or all legal entities.

## 4. Numbering, uniqueness and idempotency

### 4.1 Document numbering

Invoice/return/purchase/receipt/transfer/shift numbers use a server-owned sequence row scoped to the approved numbering domain. The domain may be legal-entity, branch, register or a configured combination with document type and series; do not assume branch-only scope. Because branch/register scope columns may be NULL, implement separate partial unique indexes (or an explicitly reviewed NULLS NOT DISTINCT strategy supported by the deployed PostgreSQL version); a plain nullable composite UNIQUE can admit duplicates. Increment and document insert occur in one transaction while holding a row lock on the sequence. A committed number is never reused, including after later void/reversal. Gaps are acceptable unless a jurisdiction-specific policy requires otherwise; that policy is OPEN.

Do not use MAX(number)+1, client timestamps, localStorage counters or an unlocked read-modify-write. If multiple numbering series exist, include the series in the unique key. Offline provisional numbers require a separately approved namespace and collision reconciliation; do not silently merge them into the online sequence.

### 4.2 Idempotency receipts

Canonical logical identity: (tenant_id, command_type, idempotency_key). Store canonical payload hash, actor ID, originating device ID, command ID, status, receipt, source IDs, committed timestamp and schema version. The actor is bound to the receipt: a different actor reusing the key must not receive the first actor's response or effects; return a safe conflict/authorization denial. A narrower scope is allowed only when explicitly documented and proven not to permit duplicate business effects.

- First valid request claims the key and executes.
- Same key + same canonical payload returns the original durable receipt and does not repeat effects.
- Same key + different payload returns IDEMPOTENCY_CONFLICT.
- A concurrent request with the same key waits for/reads the winning receipt; it must not run a second effect.
- Failed validation before business execution may return a stable rejection; transient failures must leave no misleading committed receipt.
- A committed command whose response was lost is recovered by retrying the same key.
- Every ledger/source effect also has a unique source identity so a programming error cannot post the same effect twice under a different transport retry.

Exactly-once here means exactly one committed business effect per accepted command identity, not exactly-once network delivery.

## 5. Transaction and concurrency model

### 5.1 Default isolation

Use PostgreSQL READ COMMITTED with explicit row locks and authoritative unique/check constraints for most commands. Use SERIALIZABLE selectively for invariants that cannot be safely expressed through locked rows/constraints, with bounded retry on serialization failure. Do not select SERIALIZABLE globally without workload testing.

Use `SELECT ... FOR UPDATE` for mutable aggregate roots and balance/sequence rows. Use `FOR UPDATE SKIP LOCKED` only for queue workers claiming independent work, never as a way to skip a required business validation.

### 5.2 Stable lock order

Commands touching multiple domains must use one documented deterministic order to reduce deadlocks. Proposed order:
1. idempotency/command identity;
2. tenant/legal entity/period control rows;
3. branch/register/shift or sequence rows;
4. source document and document lines;
5. customer/supplier/partner subledger rows;
6. item/warehouse/stock balance rows sorted by stable item + warehouse + location key;
7. batch/serial rows sorted by stable ID;
8. cashbox/bank account rows sorted by stable ID;
9. journal/period posting rows;
10. receipt, audit and outbox inserts.

A command may lock only the subset it needs, but it must preserve relative order. When a new dependency is introduced, update the command catalog and concurrency tests.

### 5.3 Retry and deadlock behavior

Retry only known transient conditions (deadlock victim, serialization failure, connection interruption before commit certainty) with bounded exponential backoff and jitter. Always retry using the exact same idempotency key and canonical payload. Never create a new key just because the response timed out. Validation, permission, period-lock and idempotency-payload conflicts are not retryable.

After an ambiguous connection loss, query the durable receipt before attempting any compensating action. Never assume a timeout means rollback.

### 5.4 External systems

Never hold a database transaction open while calling payment providers, email, tax gateways or other external services. Commit a durable instruction/outbox event, then deliver asynchronously. Provider callbacks are independently authenticated, deduplicated and reconciled. A provider success callback cannot bypass the normal source receipt and ledger posting controls.

## 6. Required atomic command boundaries

For every command below, the transaction includes the source record, all mandatory synchronous effects, command receipt, audit event and outbox event. If an effect is explicitly asynchronous, the transaction must create a durable pending state and outbox item; UI must not report it as completed until the required downstream state is confirmed.

| Command family | Atomic write set (conditional by actual tender/stock/accounting path) | Critical invariant |
|---|---|---|
| Sales create | invoice + lines + tenders; stock movements/balances/batches/serials; customer receivable/allocation; treasury and/or bank clearing; loyalty; journal; receipt/audit/outbox | no duplicate invoice/stock/tender/loyalty/journal |
| Sales void | void state/reason/approver; reversal stock and serial/batch custody; refund or credit; treasury/bank; loyalty reversal; journal reversal | retain original invoice; refund only unreturned net entitlement |
| Sales return | return + lines + original line allocation; stock disposition and movement; refund/credit tender; customer/loyalty effects; journal | cumulative quantity/value cannot exceed eligible original sale |
| Purchase receipt | purchase document/lines; stock/cost layers/batches/serials; supplier payable; payment and allocation if paid; cash/bank; journal | receipt and settlement distinct; one receipt effect |
| Purchase return | return/lines; stock decrease; cash refund/debt reduction/store credit settlement; supplier allocation; journal | settlement components reconcile and cannot be duplicated |
| Expense | expense; cashbox or bank movement; expense journal; receipt/audit/outbox | one custody effect; correct branch/legal entity |
| Stock transfer | transfer + lines/events; source reservation/dispatch and destination receipt movements; custody/serial/batch updates | in-transit stock is not simultaneously available at both ends |
| Partner current account | immutable advance/loan/repayment event; linked cash/bank movement; partner subledger; journal | origin and repayment linked; never alter capital by implication |
| Partner withdrawal/advance | immutable typed event; cash/bank movement; partner projection; journal | withdrawal differs from advance; only approved withdrawal affects withdrawn-capital measure |
| Partner exit settlement | approved liability; payment event; cash/bank movement; settlement balance; journal | cumulative paid <= approved due; preserve approval snapshot |
| Opening balance approval | opening record + all generated inventory/AR/AP/cash/bank/partner events + journals + receipt/audit/outbox | one-time posting; never re-run approval effects |
| Shift close | immutable counted/expected tender snapshot; variance event; related custody/journal entries if policy requires | one closeout per shift; no post-close unapproved mutation |
| Period close | close run, reconciliation snapshots, blockers, period status and close journals per approved policy | atomic period state transition; no posting into locked period |
| Seat assignment | seat allocation + entitlement recalculation + audit | concurrent assignments cannot exceed purchased seats |
| Trial conversion | subscription and entitlement activation + trial transition + billing reference + audit | same tenant/data; trial cannot restart or fork identity |
| Workflow approval | approval event + state transition + command/outbox receipt | authorized actor, current version, no duplicate approval |

The detailed per-command contracts, exact reads/writes and lock keys are in [Command Transaction Catalog](MALVIA-COMMAND-TRANSACTION-CATALOG-v1.md).

## 7. Inventory, returns and allocations

- Lock the stock-balance row(s) for every item/location affected before availability is finalized.
- For multi-line commands, lock all balance rows in deterministic sorted order.
- Batch allocation and serial custody changes occur in the same transaction as the invoice/transfer/return source.
- Serial uniqueness and active custody are enforced by unique/partial unique constraints or a serialized state row protected by lock.
- Stock movement is append-only; current balance is a controlled projection updated in the same transaction or rebuilt from the ledger under a defined strategy.
- Transfer dispatch reduces source available custody and creates in-transit custody; receipt adds destination custody. A transfer is not a sale or purchase at group level.
- Returns point to original invoice/purchase lines. The server locks original lines or a dedicated returnable-quantity aggregate and checks cumulative approved/posted quantities.
- Return disposition (saleable, damaged, quarantine, supplier return) must be explicit and inventory/accounting treatment defined before implementation.
- Reservation allocation must be checked under lock; expired reservations are released by an auditable command, not by silently ignoring rows.

**OPEN:** whether negative stock is allowed, for which roles/branches/items, and whether backorders are supported. Do not choose a default in code until approved. Same-branch warehouse transfers are valid when source and destination warehouses differ; branch inequality is not a transfer invariant.

## 8. Accounting and custody invariants

1. A posted journal balances independently for each legal entity and currency; debit total equals credit total at approved precision.
2. A journal cannot post to a closed period. The server determines the applicable period using approved business-date/timezone rules.
3. Source event + posting purpose + accounting book has one posting identity; template version is recorded as evidence, not part of the key that permits reposting. Duplicate posting returns the original receipt.
4. Posted journals and ledger events are immutable. Reversal journals link to the original journal and preserve the audit chain.
5. Cashbox, bank, card-clearing and partner ledgers are separate custody/subledger dimensions. Do not derive cash balance by summing bank rows or vice versa.
6. Cashbox/bank transfers create linked source and destination events, not income or expense. The two sides reconcile in amount/currency and transfer identity.
7. Partner capital, partner current account advances/repayments, withdrawals and exit liabilities/payments are separate event classes.
8. Customer/supplier balances are derived from invoices, credits, payments and explicit allocations; snapshots may be cached but cannot be the sole accounting source.
9. Tax-inclusive/exclusive treatment, rounding, currency conversion, FX gain/loss and minor-unit policy remain subject to accountant approval.
10. If the product permits source commit with accounting pending, the pending status, retry owner, alert, reconciliation and customer-facing semantics must be explicit. Otherwise all required journal posting is synchronous and failure rolls back the source command.

## 9. Append-only audit, outbox and retention

- Audit event is inserted in the same transaction as the business state change. It records actor, tenant, action, source type/ID, branch/legal entity context, timestamp, correlation/command/receipt IDs and safe before/after summary or hashes.
- Do not store passwords, tokens, full payment credentials or unnecessary personal data in audit payloads.
- Outbox event is inserted in the same transaction as the committed business change. A worker may deliver it more than once; consumers maintain an inbox/deduplication receipt.
- Audit and financial event history is not cascade-deleted when a user, branch, item or source document is deactivated. Use RESTRICT, soft retirement or explicit anonymization policy where legally permitted.
- Retention, privacy erasure and archival must preserve statutory accounting records and referential evidence; legal policy remains OPEN.

## 10. RLS and connection-pooling safeguards

Row Level Security is defense in depth, not a substitute for authenticated service-layer authorization. If enabled:
- application code sets tenant and actor context with transaction-local settings (`SET LOCAL`) inside each transaction;
- pooled connections MUST NOT retain tenant context across requests;
- use a non-owner application role that is subject to RLS; table owners and privileged maintenance roles require separate controls;
- every query still carries tenant predicates and server-side branch/module checks;
- background workers and migrations use explicit narrowly scoped roles;
- tests prove context is reset on commit, rollback, exception and connection reuse.

Do not rely on session-level `SET` with a shared pool. Exact RLS policy design and deployment role model require security review.

## 11. Foreign-key deletion policy

Default to `ON DELETE RESTRICT` for business and financial relationships. No cascading delete across posted invoices, returns, stock movements, payments, treasury, bank, partner events, journals, audit or command receipts.

Use CASCADE only for disposable, strictly owned draft/configuration children where deletion is approved and cannot remove business evidence. Prefer status retirement over delete for users, branches, warehouses, registers, accounts, catalog items and workflow versions referenced by history. SET NULL is allowed only for optional attribution fields where preserving the event is more important than the live actor reference; retain actor snapshot/immutable audit identity.

## 12. Index strategy

Required index families:
- every tenant FK prefix: `(tenant_id, foreign_id)`;
- business lookup/uniqueness: tenant + branch/legal entity + document type/series/number;
- active-session lookup by tenant/user/device and expiry/revocation;
- branch-scoped date reports: tenant + branch + business_date/occurred_at;
- stock balance unique key: tenant + item + warehouse + location;
- source-effect unique keys for movements, tenders, payments, journals and reversals;
- outbox pending delivery by status/next_attempt_at and stable ID;
- command receipt lookup by idempotency scope and command ID;
- partial indexes for active assignments, active reservations, open shifts and unposted/pending journals where predicates are stable.

Avoid redundant indexes on every JSONB field. Add JSONB GIN indexes only for bounded metadata queries with measured need. Review index write amplification and query plans at realistic tenant/branch scale. Partitioning is not assumed; decide only after volume and retention measurements.

## 13. Safe failure semantics

| Failure | Required behavior |
|---|---|
| Tenant/branch/module authorization denied | no source or ledger writes; safe denial code |
| Unique document number conflict | rollback; caller obtains a new server sequence through approved flow |
| Same idempotency key and same payload | return original receipt |
| Same key, different payload | conflict; no writes |
| Stock/serial concurrency conflict | rollback or explicit partial workflow; never oversell silently |
| Cumulative return limit exceeded | rollback; return eligible quantity and safe explanation |
| Closed period | reject posting; no source mutation unless an approved pending workflow exists |
| Journal unbalanced | rollback mandatory posting; alert and trace ID |
| Deadlock/serialization failure | retry same command identity with bounded backoff |
| External provider unavailable | durable pending outbox state; no false settlement |
| Response lost after commit | lookup/retry same idempotency key; return original receipt |

## 14. Release-blocking test matrix

| ID | Scenario | Expected result |
|---|---|---|
| DB-001 | Tenant A child references Tenant B parent ID | composite FK rejects |
| DB-002 | User with Branch A access requests Branch B read/export/post | server denies; zero data leakage |
| DB-003 | Two concurrent requests allocate final seat | only one succeeds if capacity is one |
| DB-004 | Concurrent invoice numbering on same branch/series | unique numbers; no duplicate committed number |
| DB-005 | Same command key/payload submitted concurrently | one effect set, one durable receipt |
| DB-006 | Same key with changed amount/payload | IDEMPOTENCY_CONFLICT |
| DB-007 | Response lost after transaction commit, then retry | original receipt returned; no duplicate |
| DB-008 | Two sales compete for same limited stock | approved stock policy enforced under lock |
| DB-009 | Two commands allocate same serial unit | at most one succeeds |
| DB-010 | Concurrent returns exceed original sold quantity | aggregate limit enforced; excess rejected |
| DB-011 | Purchase return settlements exceed return value | rejected |
| DB-012 | Cashbox transfer posts one side only | transaction rolls back or durable explicit pending transfer; never silently complete |
| DB-013 | Partner advance is classified as capital withdrawal | validation rejects mismatched event type |
| DB-014 | Opening approval command replayed | one set of effects; original receipt |
| DB-015 | Journal debit/credit imbalance | no posted journal |
| DB-016 | Posting to closed period | rejected without partial writes |
| DB-017 | Outbox insert fails with source update | entire transaction rolls back |
| DB-018 | Worker delivers event twice | consumer inbox applies one effect |
| DB-019 | Pooled connection reused after tenant transaction | no previous tenant context leaks |
| DB-020 | User/branch referenced by financial history is retired | history retained; delete restricted |
| DB-021 | Migration encounters unmapped branch | record quarantined/reviewed; no default assignment |
| DB-022 | Offline outbox retry uses same operation identity | receipt reconciles; no duplicate financial effect |

## 15. Decisions that remain OPEN

No implementation may silently settle these:
- UUID vs legacy text IDs and exact migration mapping;
- money/quantity precision, rounding and currency minor-unit rules;
- supported currencies, FX source, rate timestamp and realized/unrealized FX policy;
- negative stock, backorder and reservation expiry behavior;
- batch/serial uniqueness scope and disposition workflow;
- invoice numbering gaps, offline numbering and legal series policy;
- customer/supplier subledger allocation and shared-party ownership;
- legal entity vs branch ownership of central cash/bank accounts and expenses;
- accounting posting timing and source-commit/pending-posting policy;
- tax treatment, inclusive/exclusive pricing and credit-note rounding;
- partial reversals and correction approval;
- seat counting, concurrent device/session rules and trial eligibility;
- RLS roles, retention, privacy and audit archive policy;
- PostgreSQL partitioning and index thresholds.

**Approval gate:** engineering, security and accounting review this document; unresolved items receive named decisions before schema DDL or command implementation. This document alone does not authorize runtime changes.


## Review clarification — accounting pending mode

Atomicity has two mutually exclusive, explicitly selected modes per command family:

1. **Synchronous posting:** source, required stock/subledger/custody effects, journal, posting receipt, command receipt, audit and outbox commit in one database transaction. Any mandatory failure rolls everything back.
2. **Approved pending-posting mode:** source and required operational effects commit atomically with a visible pending-posting case, command receipt, audit and outbox. The later posting attempt is a separate transaction that atomically commits the balanced journal and posting receipt, or records a retryable/rejected exception. A pending source is never represented as posted.

The default mode for each event family remains OPEN until the owner and accountant approve it. This removes any implication that all source events and journals are always committed together when pending posting is permitted.


## Typed relationship and optional-scope constraint notes

Polymorphic `type + id` fields are provenance references unless a typed FK is explicitly defined. For opening-balance lines, payment-instrument counterparties and receipt serials, use typed nullable foreign keys with category CHECK constraints or dedicated association tables. Do not claim generic polymorphic FK enforcement. For multi-tender customer/supplier receipts, enforce tender-line sums against the receipt header and exactly one valid custody destination per tender line.


## Posting uniqueness rule

The canonical posting uniqueness key is tenant + legal entity + accounting book + source event + posting purpose. The selected template version is stored on the receipt/journal for audit but cannot be used to create a second posting for the same source purpose after a template update. Additional postings require a distinct approved purpose or a reversal/replacement flow.


## Cross-document consistency review

- [MALVIA-DESIGN-CONSISTENCY-REVIEW-v1.md](MALVIA-DESIGN-CONSISTENCY-REVIEW-v1.md) — resolved cross-document conflicts, canonical invariants, remaining approval decisions and release-blocking verification checklist. Design review only; no implementation approval.


## Book-account validation

A tenant chart account is not automatically valid in every accounting book. Enforce an effective `book_accounts` assignment for each journal line at the journal posting date. Posting templates are scoped to legal entity and book. Test cross-book account misuse as a release-blocking validation failure.
