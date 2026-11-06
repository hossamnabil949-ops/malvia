# MALVIA — Accounting Engine & Posting Orchestration (Draft v1)

**Status:** Target architecture proposal. This is not an approved accounting policy, physical schema, API implementation, account-code list, or final debit/credit map. Owner and qualified accountant approval is required before posting templates are activated.

## 1. Purpose and boundaries

The Accounting Engine converts approved business source events into immutable, balanced general-ledger (GL) journal entries and traceable subledger effects. It is the controlled bridge between industry workflows and shared accounting services.

It must not collapse distinct concepts:
- **Operational source event:** what happened in the business (sale, receipt, return, expense, shift close, partner transaction).
- **Custody movement:** physical cash or wallet movement and its responsible cashbox/person.
- **Bank-book movement:** a movement recorded against a bank account or statement.
- **Subledger movement:** customer, supplier, inventory, card-clearing or partner detail.
- **GL journal:** the accounting representation under an approved posting template and accounting policy.

A source event may create multiple related records, but each record has its own identity and lifecycle. A treasury movement is not itself proof of a GL posting; a bank-ledger row is not the GL; and a GL journal does not replace operational detail.

## 2. Target processing pipeline

1. **Receive command:** authenticated actor submits a business command through a server-owned endpoint.
2. **Authorize:** validate tenant, active session, role/permission, module entitlement, legal entity, branch scope, account scope and device/session status.
3. **Validate source:** validate business invariants, source references, quantities, amounts, currency, period eligibility and current aggregate versions.
4. **Commit source event:** persist the immutable business event and required operational state changes atomically.
5. **Resolve accounting context:** determine legal entity, book, branch attribution, accounting date, currency, tax context and policy/template versions.
6. **Build posting proposal:** resolve a versioned template and produce candidate journal lines plus subledger/custody/bank effects.
7. **Validate posting:** verify balanced totals by book/currency, permitted account dimensions, control-account rules, period status, source uniqueness and reconciliation invariants.
8. **Commit posting receipt:** persist journal, journal lines, subledger effects and posting receipt atomically with the source event where synchronous posting is required.
9. **Publish downstream events:** write an outbox event in the same database transaction; projections, reports and integrations consume it idempotently.
10. **Return receipt:** return source ID, posting status, journal IDs, template version, accounting date, warnings and trace/correlation ID.

The preferred target for financially material operations is one server-side database transaction covering source state, journal, subledger changes, idempotency receipt and outbox record. If a workflow legitimately spans asynchronous external settlement, model separate linked events and receipts rather than pretending that the external step is atomic.

## 3. Command envelope

Every command should carry or derive:
- tenant ID and authenticated actor/session (never trusted solely from client payload);
- command type and schema version;
- stable client-generated command ID and idempotency key;
- source object ID or server-generated ID;
- explicit legal-entity/book context where more than one exists;
- branch attribution and operational location identifiers, each independently validated;
- event occurrence time, client capture time and server received time;
- accounting date request, with server policy deciding eligibility;
- currency and precision context;
- expected aggregate/resource version for concurrency control;
- source references and line-level details;
- reason/evidence/approval references for sensitive actions;
- correlation ID and causation ID for linked commands.

The server derives authoritative tenant, actor, entitlements and allowed scope from the session. A client-supplied branch, date, amount, permission, template ID or approval flag is a request, not authority.

## 4. Source-event and posting states

Keep source lifecycle separate from accounting lifecycle.

**Source event states (illustrative):** received → validated → committed → cancelled/reversed (where business rules permit). Rejected commands remain diagnosable but must not create financial effects.

**Posting states (illustrative):**
- `not_required`: explicitly non-financial event under approved policy;
- `pending`: source committed but posting awaits a controlled dependency;
- `proposed`: candidate lines built but not posted;
- `posted`: immutable journal and receipt committed;
- `rejected`: posting blocked with reason and no journal;
- `reversed`: a linked reversal journal has been posted;
- `superseded`: a proposal/template version was replaced before posting.

Do not use a generic `success` flag to imply both source commit and GL posting. The UI must distinguish “operation saved” from “accounting posted”. A committed source with failed posting must enter a visible, retryable exception queue; it must not silently disappear or be reported as fully accounted.

## 5. Idempotency, concurrency and atomicity

- Enforce a unique idempotency receipt scoped to tenant + command namespace + key. Store a canonical request hash and the final result.
- Same key + same canonical payload returns the original receipt; same key + different payload is a conflict requiring a new command, not a replay.
- Add a unique posting constraint on source event + posting purpose + accounting book + effective template generation, unless an approved multi-part posting design explicitly requires multiple receipts.
- A retry must never repeat stock, customer/supplier balance, cash/bank, loyalty, partner or GL effects.
- Use database transactions and row/aggregate locking or optimistic version checks for competing sales, returns, settlements and stock allocations.
- Enforce cumulative return quantities, serial uniqueness, available stock, credit limits, settlement limits and source state on the server at commit time.
- Persist a durable operation receipt and an outbox record in the same transaction. Consumers record processed event IDs and are safe to retry.
- Do not rely on browser localStorage merge as the authority for financial conflict resolution. Preserve offline commands in a durable client outbox, but let the server accept, reject or queue each command with a resolvable reason.

## 6. Posting template resolution and versioning

Resolve templates by a deterministic context tuple:
- tenant/legal entity and accounting book;
- shared core event type;
- industry pack and enabled feature set;
- source document subtype and relevant settlement/payment method;
- accounting policy version and effective date;
- tax jurisdiction/tax profile where applicable;
- currency and approved valuation method.

A template version is immutable after activation. Changes create a new version with author, reviewer, approver, effective-from date, change rationale, test evidence and compatibility notes. A posted journal stores the exact template/version and policy snapshot used. Pack upgrades must not silently re-post or reinterpret historical transactions.

Separate template configuration from user-editable transaction data. A tenant administrator must not be able to change account mapping or tax logic merely by editing a source invoice.

## 7. Industry event adapters over a shared ledger

Industry packs publish source events and dimensions; they do not create isolated accounting engines.

| Industry pack | Example source events / dimensions | Shared accounting treatment boundary |
|---|---|---|
| Auto parts & service | parts sale, labor operation, workshop job, warranty claim, core/old-part return, vehicle/job reference | Revenue, inventory/COGS, receivable, tax and warranty policy remain shared and approved centrally |
| Restaurant & café | dine-in/takeaway order, table service, modifier, recipe consumption, waste, tips, aggregator settlement | Food cost, tips, service charge and aggregator clearing require explicit policy |
| Supermarket & general retail | barcode sale, weighted/approved cost issue, promotion, basket return, till shift | Retail sales, inventory, tax, tender and till controls share common posting services |
| Clothing & fashion | size/color variant, exchange, markdown, seasonal stock, gift card | Variant inventory and exchange valuation map to shared stock/revenue controls |
| Pharmacy | batch/lot sale, expiry, controlled return, supplier rebate, insurance claim | Lot traceability, regulated return and payer settlement need domain controls and approved policy |

An adapter validates industry-specific source data and emits canonical accounting events. It must not hard-code account numbers or bypass shared authorization, period locks, idempotency, audit or reconciliation.

## 8. Canonical event contract

A canonical accounting event should include:
- event ID, event type, schema version and event status;
- source entity type/ID and source line IDs;
- tenant, legal entity/book and branch attribution;
- event/received/accounting timestamps;
- currency and exact decimal amount components;
- counterparty and subledger references;
- inventory item/location/lot/serial references when relevant;
- tax/discount/fee/rounding components as separately identified source facts;
- settlement and custody references;
- approval/evidence references;
- actor, device/session and audit correlation;
- causation/reversal relationship.

Preserve source facts; do not send only a precomputed grand total if the policy needs line-level tax, discount, fee, return or allocation detail. Amount precision and rounding rules must be defined per currency and approved accounting policy.

## 9. Reversals, corrections and late events

Posted journals are append-only. Never edit or delete posted journal lines. Corrections use a linked reversal and, where needed, a replacement event/journal with a reason and approval. A business cancellation after posting must invoke the relevant void/return/reversal workflow, not erase history.

Offline events carry original occurrence time and server receipt time. The server determines the accounting date under the approved period policy. If the requested period is locked, preserve the event, reject posting into the locked period, and route it to a controlled late-event queue. No browser clock, retry or device reinstall can bypass a period lock.

## 10. Security, audit and segregation of duties

- All financial commands require a valid employee session and server-side tenant/branch/module authorization.
- Platform operators, tenant owners, finance preparers, reviewers and approvers have distinct scopes.
- High-risk operations (manual journals, template activation, period reopen, write-off, material adjustment, export and reversal) require policy-based independent approval.
- Record before/after state references, actor, approver, reason, timestamp, source IDs, template/policy versions and correlation ID.
- AI/agent interfaces may propose or explain commands, but cannot bypass the same command authorization, validation, approval, idempotency or audit path.
- Exports and reports use the same authorized scope and calculation versions as the underlying ledgers.

## 11. Failure handling and operational observability

Classify failures as authorization, validation, concurrency, period lock, missing mapping, unbalanced proposal, dependency unavailable, duplicate replay or internal failure. Return safe diagnostic codes and trace IDs; do not expose secrets, employee data, SQL values or stack traces.

Provide queues and dashboards for:
- committed source events awaiting posting;
- rejected proposals and missing mappings;
- outbox delivery/retry;
- reconciliation breaks;
- late offline events;
- reversal/correction awaiting approval.

A retry is safe only when the original idempotency identity is reused and the server can prove whether the transaction committed. Manual replay must never mint a fresh key to repeat an already committed financial event.

## 12. Migration from the current MALVIA application

The inspected application currently persists most resources as tenant/resource JSON documents and performs multi-resource client-side writes. This target engine is not present in the current runtime.

Migration must:
1. Preserve existing source IDs, document numbers, timestamps, tenant identity, branch ambiguity and return/payment links.
2. Import historical source facts and existing operational ledgers as evidence, not fabricate historical GL journals.
3. Create migration receipts and reconcile opening/control totals before enabling new posting.
4. Mark legacy events with explicit accounting status (for example, legacy-unposted, migrated-opening, or reviewed) only after policy approval.
5. Never run opening-balance approval or financial side effects again merely because a document was imported.
6. Route ambiguous branch attribution, duplicate legacy settlement and inconsistent snapshots to review.
7. Keep the old path read-only or safely gated during cutover; support rollback without deleting accepted new events.

## 13. Acceptance tests

1. Duplicate sale command returns the same receipt and creates one invoice, one stock effect and one journal.
2. Same idempotency key with changed payload is rejected as conflict.
3. Concurrent sale commands cannot oversell the same controlled stock/serial.
4. Return cannot exceed the original eligible quantity across concurrent devices.
5. Source commit and journal either commit together or produce a visible pending exception under the explicitly chosen workflow.
6. Treasury cash movement, bank-book entry, subledger effect and GL journal remain separately traceable.
7. Every posted journal is balanced under its book/currency rules and references a source and template version.
8. A template change affects only events eligible after its effective date.
9. Locked-period offline retry cannot backdate into the closed period.
10. Reversal leaves the original journal intact and links both entries.
11. Unauthorized branch, module, legal-entity or account scope is rejected server-side.
12. AI/agent command uses the same authenticated server command path.
13. Outbox delivery can be retried without duplicate downstream effects.
14. Reports and exports reconcile to the same posted ledger and authorized scope.
15. Migration imports do not create duplicate receipts, opening balances or financial effects.

## 14. Approval gates and unresolved decisions

Before implementation, obtain documented owner/accountant decisions for:
- legal entity and accounting book boundaries;
- accounting basis, fiscal calendar, currency and decimal/rounding rules;
- statutory chart/account codes and normal balances;
- tax point, VAT treatment, recoverability and jurisdiction;
- inventory costing, service revenue recognition, deposits, tips, loyalty and warranty;
- discount, card fee, aggregator, bank fee, shortage/overage and partner policies;
- manual journal permissions, materiality and approval thresholds;
- synchronous vs pending posting for each event family;
- late offline event and locked-period treatment;
- retention, audit and migration evidence requirements.

**Implementation gate:** This document authorizes design discussion only. Do not generate SQL, activate posting templates, create account codes, migrate live balances or change production behavior until the owner and qualified accountant approve the policy and the design passes review.
