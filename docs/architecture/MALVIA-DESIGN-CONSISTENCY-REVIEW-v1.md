# MALVIA Cross-Document Design Consistency Review v1

**Review status:** Completed static architecture/documentation review; corrections applied to the design package. This is not an accountant's sign-off, security certification, legal opinion, executable-schema review or production-readiness approval.

**Scope:** All 23 architecture documents in PR #30, including the baseline platform, logical/physical data models, Data Dictionary, ERDs, backend/API, command transactions, accounting, branch model, subscriptions/trial, migration and reconciliation artifacts.

**Change boundary:** Documentation only. No application source code, SQL/DDL, database, tenant/customer data, browser storage, API runtime, Vercel deployment or production configuration was changed.

## 1. Review method

The review compared the same business concepts across:
- product and industry-pack composition;
- tenant, legal entity, branch, warehouse, register, cashbox and bank-account ownership;
- logical ERD, physical PostgreSQL design, detailed ERD and per-table Data Dictionary;
- source-of-truth and accounting lifecycle;
- command preconditions, read/write sets, locks, idempotency and reversal behavior;
- trial, seats, subscriptions and download lifecycle;
- migration mapping, offline outbox/journal preservation and cutover/rollback;
- report, subledger, cash/bank and group consolidation assumptions.

It also checked internal Markdown cross-links among the 23 package documents and scanned for stale naming/numbering and malformed inserted table rows. A static document review cannot prove the future SQL or code implementation; executable constraint, concurrency and migration tests remain mandatory.

## 2. Findings corrected in this review

| ID | Severity before correction | Inconsistency / risk found | Correction applied |
|---|---|---|---|
| REV-01 | Critical | Purchase invoice quantities and physical receipt quantities were mixed in parts of the physical model, while the lifecycle required partial receipt support. This could create stock before goods were accepted and make supplier returns ambiguous. | Added separate purchase receipt headers/lines, invoice-to-receipt allocations and receipt-line serial links. Purchase invoice recording does not create stock; only accepted receipt lines do. Purchase returns reference accepted receipt lines. Added separate invoice-record and receipt-post commands. |
| REV-02 | High | Transfer wording could reject transfers between two warehouses in the same branch. The product model explicitly allows multiple warehouses per branch. | Defined the invariant as source warehouse != destination warehouse. Branch IDs may be equal for intra-branch transfers; cross-branch transfers validate both branch scopes. |
| REV-03 | Critical | Document sequence allocation and document unique keys did not share one clear scope. A branch-only sequence could conflict with legal-entity/register/series numbering and offline device numbers. | Introduced configurable legal-entity/branch/register document sequences. All document unique keys must use the exact same resolved scope, document type and series. Offline provisional numbering remains a separately approved collision-safe namespace. |
| REV-04 | High | Nullable branch/register columns in a composite PostgreSQL UNIQUE key can admit duplicate NULL-scoped sequences under normal NULL-distinct semantics. | Required separate partial unique indexes per legal-entity, branch and register scope (or an explicitly reviewed version-supported equivalent), plus scope CHECK constraints and register-to-branch validation. |
| REV-05 | Critical | Including template generation in a posting uniqueness key could allow a template upgrade to create a second journal for the same source event. | Canonical posting uniqueness is tenant + legal entity + accounting book + source event + posting purpose. Template version is retained as immutable evidence, not as a key that permits automatic reposting. A distinct posting requires an approved purpose or reversal/replacement. |
| REV-06 | High | The accounting engine referred to books and book-level balancing, but the physical dictionary did not consistently model book identity on periods, journals and posting receipts. | Added accounting books and explicit book references to fiscal periods, journals and posting receipts. Balancing/close scope is legal entity + book + currency. |
| REV-07 | High | Several business flows existed in lifecycle/financial documents but lacked first-class physical entities in the Data Dictionary. | Added customer receipts/tenders/allocations and AR events; supplier payment tenders/schedules and AP events; expense allocations; payment instruments/events; card settlement batches/lines; bank transfers; reservations/deposits; loyalty ledger; opening-balance batches/lines/effect receipts. |
| REV-08 | High | Idempotency wording varied between tenant+command+key and actor-scoped keys, creating a risk of duplicate effects or receipt disclosure across actors. | Standardized identity to tenant + command type + idempotency key, with initiating actor/device bound to the receipt. A different actor cannot retrieve another actor's response by reusing the key. |
| REV-09 | Critical | Some descriptions could be read as requiring every source event and GL journal to commit together, while other documents allowed an explicitly pending posting workflow. | Defined two mutually exclusive modes: synchronous source + mandatory journal + receipt/audit/outbox in one transaction; or explicitly approved source + pending exception/receipt/audit/outbox followed by a separate journal/posting-receipt transaction. Pending is never presented as posted. |
| REV-10 | High | Logical ERD and physical design used competing cashbox/treasury-account names and duplicated branch on stock balance without a clear ownership rule. | Canonicalized cash custody as cashboxes + append-only treasury movements. Stock-balance branch is derived through the warehouse's required branch FK; stock movement events retain branch attribution. |
| REV-11 | High | Generic `type + id` fields were described alongside strict relational integrity, although polymorphic references are not ordinary enforceable foreign keys. | Clarified that generic source references are provenance only. Where database integrity is required, use typed nullable FKs with CHECK constraints or dedicated association tables. |
| REV-12 | Medium | Customer/supplier receipts could be interpreted as single-tender headers, while the sales/payment model supports split tenders and separate invoice allocations. | Separated receipt header, multiple tender lines and invoice-allocation rows. Tender settlement and AR/AP allocation are independent dimensions. |
| REV-13 | High | Trial activation language differed between tenant provisioning and first-use setup; exact expiry semantics were not fully defined. | Unified the lifecycle: pending tenant setup does not consume trial time; server activates the 14-day trial after verification and the defined setup gate. The choice between 14 tenant-local calendar days and 336 elapsed hours remains explicitly OPEN. |
| REV-14 | Medium | The logical ERD retained stale branch-sequence and treasury-account naming after the physical model changed. | Updated the logical ERD to use document sequences, cashboxes and treasury movements, and aligned stock branch derivation and accounting-book references. |

## 3. Canonical cross-document invariants after correction

These are the common rules that all future implementation documents and code must preserve:

1. **Tenant isolation:** every tenant-owned row and relationship is tenant-safe. Client-supplied tenant/branch IDs are requests, never proof of authorization.
2. **Ownership dimensions:** legal entity, branch, warehouse, stock location, register, cashbox, bank account and collection branch are distinct. A warehouse is not a branch.
3. **Branch scope:** a user can access one, selected or all branches only through explicit server-side grants. Access to a branch does not automatically grant access to every bank account, cashbox, employee or legal entity.
4. **Inventory:** invoice quantity is not received stock. Only accepted receipt lines increase stock. Reservations reduce availability but do not issue stock. Transfers move custody; they are not sales or purchases.
5. **Returns:** sales returns reference original invoice lines; supplier returns reference accepted purchase receipt lines. Cumulative eligible quantity/value is enforced under concurrency control.
6. **Numbering:** sequence allocation and document uniqueness use the same approved scope, document type and series. No MAX(number)+1 or unprotected client counter.
7. **Idempotency:** one durable receipt per tenant + command type + key; actor/device binding prevents receipt disclosure. Same key/same payload returns the original receipt; same key/different payload conflicts.
8. **Accounting:** one posting effect per tenant + legal entity + book + source + purpose. Template version is evidence. Journals balance by legal entity/book/currency under approved precision.
9. **Atomicity:** mandatory synchronous effects commit together. Approved pending posting is a separate, visible lifecycle with its own later atomic posting transaction.
10. **Immutable history:** posted money/stock/audit events are not deleted or silently edited. Corrections use linked reversals/correction events.
11. **Cash and bank:** cashbox custody, bank-book entries, card settlement and GL journals remain separate but traceably linked. Paired transfers are not income or expense.
12. **Opening balances:** each approved opening batch and generated effect has a durable one-time receipt. Migration must never rerun opening approval or demo clearing.
13. **Offline:** pending outbox, transaction journal, sync versions and device identity survive upgrade/cutover until acknowledged or formally reconciled. No retry may mint a new key for the same operation.
14. **Trial:** trial is tenant-owned and server-timed; download, reinstall and device change do not start or reset it. Conversion preserves the same tenant and its data.

## 4. Remaining decisions — intentionally not guessed

These remain release gates. The design supports them, but neither this review nor the documents silently selects a business/accounting policy.

| Area | Decision still required |
|---|---|
| Trial clock | 14 tenant-local calendar days vs exactly 336 elapsed hours; tenant timezone and boundary display |
| Trial commercial offer | Seat allowance, included industry pack/modules, quotas, verification provider, payment requirement |
| Trial expiry | Grace/read-only/export behavior, retention duration, legal hold, deletion/reactivation policy; proposed 30-day retention is not approved |
| Licensing | Seat counting, owner seat, inactive users, concurrent devices/sessions, grace/suspension |
| Identity | UUID vs legacy text IDs; username normalization; one active session per user vs per device |
| Organization | Existing tenant-to-legal-entity and legacy branch mapping; central branch ownership; ambiguous historical records |
| Numbering | Legal/entity/branch/register/series scope per document type, gap rules, offline provisional namespace and statutory requirements |
| Inventory | Costing method, negative-stock/backorder/reservation policy, batch/serial uniqueness scope, return disposition and quarantine |
| Procurement | Receipt-before-invoice/unlinked receipt policy, supplier external-reference duplicate policy, landed-cost treatment |
| Payments | Split/partial expense settlement policy, wallet/card clearing semantics, bank transfer pending states, cheque lifecycle and chargebacks |
| Accounting | Statutory/management book definitions, chart of accounts, debit/credit templates, tax/VAT, currency/FX, precision and rounding |
| Posting timing | Synchronous vs pending GL posting for each command family; late offline events and closed-period treatment |
| Partner accounting | Capital/current account/advance/withdrawal/exit settlement classification and approval authority |
| Reports | Statutory vs management allocation, report calculation/version policy, valuation and consolidation rules |
| Security | RLS role model, Neon/pool behavior, support/break-glass access, export authorization and audit retention |
| Legal/compliance | Egypt e-invoice/tax obligations and pharmacy/prescription data safeguards before those packs are implemented |

## 5. Verification checklist for the next engineering stage

- [ ] Convert the Data Dictionary and ERD into reviewed executable DDL only after the unresolved choices are signed off.
- [ ] Test composite tenant FKs and all branch/account nested-reference authorization paths.
- [ ] Test all three document-sequence scope variants, including concurrent requests and NULL-scope uniqueness.
- [ ] Test same-branch warehouse transfer and cross-branch transfer separately.
- [ ] Test partial purchase receipts, over-receipt, rejected quantities, serial duplicates and purchase returns against accepted receipt lines.
- [ ] Test split-tender receipt headers, tender totals, unapplied amounts and invoice allocations independently.
- [ ] Test posting idempotency across template upgrades; prove a source event cannot be posted twice for the same purpose/book.
- [ ] Test synchronous rollback and approved pending-posting recovery separately.
- [ ] Test accounting books, fiscal periods, close/reopen and balanced journals per legal entity/book/currency.
- [ ] Test opening-balance approval replay and migration import without repeating any generated effect.
- [ ] Test offline outbox/journal recovery, duplicate callbacks, lost responses and post-cutover rollback/forward repair.
- [ ] Run accountant, security, business-owner and operations sign-offs; a clean code build alone is not acceptance.

## 6. Review result

The package's internal relative Markdown links were checked against the 23-file PR document set; no missing local document targets were found. The schema, command and lifecycle documents were amended to address the inconsistencies listed above.

**Disposition:** suitable for continued architecture review as a Draft design package. It is **not** an approved implementation baseline until the remaining owner/accountant/security decisions and the executable verification gates are completed.

Related core documents:
- [PostgreSQL Data Dictionary](MALVIA-POSTGRESQL-DATA-DICTIONARY-v1.md)
- [Detailed Relational ERD](MALVIA-DETAILED-RELATIONAL-ERD-v1.md)
- [Physical PostgreSQL Design](MALVIA-PHYSICAL-DATABASE-POSTGRESQL-DESIGN-v1.md)
- [Database Constraints & Transaction Specification](MALVIA-DATABASE-CONSTRAINTS-AND-TRANSACTION-SPEC-v1.md)
- [Command Transaction Catalog](MALVIA-COMMAND-TRANSACTION-CATALOG-v1.md)
