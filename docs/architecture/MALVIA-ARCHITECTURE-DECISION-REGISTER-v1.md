# MALVIA Architecture Decision Register & Sign-off v1

**Prepared:** 2026-11-08  
**Status:** Proposed decisions for explicit review — NONE of the OPEN items below is approved by this document.  
**Scope:** Decision register for the documentation-only modular-platform package in PR #30. This document does not authorize SQL/DDL, runtime code, data migration, production configuration, merge or deployment.

## 1. How to use this register

Each item records the decision owner, recommended default, alternatives/considerations, implementation impact and approval state. Recommendations are proposals to make review concrete; they are not business, accounting, legal or security approvals.

- **Blocking — DDL:** decide before finalizing relevant schema constraints or migration.
- **Blocking — implementation:** decide before enabling relevant production behavior.
- **Blocking — pack launch:** decide before releasing the affected industry pack.
- **Non-blocking:** may remain configurable until the relevant feature is activated.

Approval must record the approver role, exact selected option, date and conditions. Approval of one row does not approve adjacent rows.

## 2. Product, trial and licensing

| ID | Decision / recommended default | Alternatives / considerations | Owner | Gate | Status |
|---|---|---|---|---|---|
| DEC-001 | Trial clock: recommend 14 tenant-local calendar days, starting at the server-recorded activation instant after verification and setup completion. Store UTC timestamps and tenant timezone; show explicit local expiry. | Exactly 336 elapsed hours is simpler and timezone-neutral. Define calendar-day boundary precisely. | Owner + Product/Legal | Implementation | OPEN |
| DEC-002 | Trial offer: use a configurable starter entitlement bundle and configurable seat quota; never hard-code pack or seat counts. | Trial may include all modules, selected industry packs, or restricted features; define quotas and payment-card requirement. | Owner + Commercial | Implementation / launch | OPEN |
| DEC-003 | Trial expiry: recommend suspend new writes, preserve data, provide owner read-only/export access for a defined grace period, then apply approved retention/deletion policy. Never auto-delete on expiry. | Immediate suspension, longer grace, paid archive or reactivation. Proposed 30-day retention is not approved. Legal hold overrides deletion. | Owner + Legal/Security | Implementation | OPEN |
| DEC-004 | Seat counting: recommend count every enabled human user, including admins; owner counts if represented as a user seat. Disabled accounts do not count. Branches are not seats. | Owner-inclusive bundle vs owner-excluded employee count. If owner is excluded, model as a distinct principal and define admin treatment. | Owner + Commercial | DDL + implementation | OPEN |
| DEC-005 | Sessions/devices: recommend one active session per user by default, with auditable revocation and explicit device policy. | One session per device improves usability but increases credential-sharing risk. Define device/concurrency limits. | Owner + Security | Implementation | OPEN |
| DEC-006 | Verification/payment: recommend email or phone verification before trial activation; payment method need not be mandatory unless commercially required. Select providers after regional availability, fee and compliance review. | Phone-only, email-only, business verification or card-required trial. | Owner + Legal/Operations | Launch | OPEN |

## 3. Organization, identity and numbering

| ID | Decision / recommended default | Alternatives / considerations | Owner | Gate | Status |
|---|---|---|---|---|---|
| DEC-007 | Identifiers: recommend UUID primary identifiers for new relational entities; preserve every legacy text ID as immutable legacy/source reference during migration. | Retaining text IDs as primary keys improves compatibility but complicates global identity. Never rewrite historical document numbers. | Engineering + Owner | DDL | OPEN |
| DEC-008 | Username normalization: recommend case-insensitive normalized usernames unique within each tenant; preserve entered display form. Define Unicode normalization and allowed characters. | Case-sensitive usernames or email login. Measure existing usernames before choosing migration behavior. | Owner + Security | DDL + implementation | OPEN |
| DEC-009 | Legal entity/branch mapping: each branch belongs to exactly one legal entity; central warehouse ownership is explicit. Never assign ambiguous legacy records to a default branch; quarantine for owner review. | Tenant may have one or multiple legal entities. Historical ambiguity may need a restricted legacy holding scope. | Owner + Accountant | DDL + migration | OPEN |
| DEC-010 | Document numbering: recommend configurable sequence scope per document type, defaulting to legal entity + branch + register where operationally needed; allocate server-side. Preserve legacy numbers and use a collision-safe offline provisional namespace. | Legal-entity-only or branch-only numbering; statutory rules may dictate scope and gap handling. | Owner + Accountant + Legal | DDL + implementation | OPEN |
| DEC-011 | Number gaps/offline numbering: recommend never reuse committed numbers; allow gaps in internal sequences. Offline provisional numbers remain visibly provisional until server reconciliation. | Jurisdiction-specific books may require a different controlled policy. Validate statutory invoice numbering/e-invoice rules. | Accountant + Legal | Implementation / pack launch | OPEN |

## 4. Inventory, procurement and payment operations

| ID | Decision / recommended default | Alternatives / considerations | Owner | Gate | Status |
|---|---|---|---|---|---|
| DEC-012 | Inventory costing: recommend weighted-average only as an initial configurable default if confirmed against current practice; retain costing-policy version and never silently recalculate posted history. | FIFO or specific identification may be required for batches/serials, regulated products or existing customer expectations. | Accountant + Owner | DDL + implementation | OPEN |
| DEC-013 | Negative stock/reservations: recommend block negative available stock for normal sales; allow a separately permissioned override only with audit. Reservations reduce availability but do not issue stock. | Allow backorders/negative stock for selected industries or plans. Define offline concurrency behavior. | Owner + Operations + Accountant | Implementation | OPEN |
| DEC-014 | Returns/quarantine: recommend receive returned goods into a non-saleable inspection state until disposition (resellable, damaged, supplier return, scrap). Preserve original line and serial/batch traceability. | Immediate restock may suit selected low-risk goods under controlled policy. | Operations + Accountant | DDL + implementation | OPEN |
| DEC-015 | Procurement timing: recommend support invoice-before-receipt and receipt-before-invoice with unbilled-receipt reconciliation. Only accepted receipt quantities increase stock. | Restrict sequence for simpler customers, but do not collapse invoice and receipt into one entity. | Owner + Accountant + Procurement | DDL + implementation | OPEN |
| DEC-016 | Landed costs: recommend allocate approved freight/duty/handling to receipt lines using configurable basis, with traceable adjustments and no silent rewrite of closed periods. | Expense immediately or allocate by quantity, value, weight or volume. | Accountant + Procurement | DDL + implementation | OPEN |
| DEC-017 | Expense split settlement: recommend multiple tenders per expense, each with its own cashbox/bank/instrument and settlement status; expense recognition remains separate from payment settlement. | Simplified plans may restrict to one tender while preserving future-compatible schema. | Accountant + Owner | DDL + implementation | OPEN |
| DEC-018 | Payment instruments: recommend explicit lifecycle states for cheques, card settlements, bank transfers and chargebacks; distinguish initiation, clearing, settlement, return and reversal. | Exact states depend on provider/bank workflows and local practice. | Accountant + Finance Operations | DDL + implementation | OPEN |

## 5. Accounting, reporting and partner treatment

| ID | Decision / recommended default | Alternatives / considerations | Owner | Gate | Status |
|---|---|---|---|---|---|
| DEC-019 | Accounting books: recommend separate statutory and management books only when required; otherwise begin with one approved book while keeping book identity explicit. | One book is simpler; multiple books support differing policies but add reconciliation complexity. | Accountant + Owner | DDL | OPEN |
| DEC-020 | Chart of accounts/posting templates: no account codes or debit/credit directions are approved here. Require accountant-approved chart, event mapping, tax treatment, effective dates and test examples before GL posting. | Run shadow/proposal mode until sign-off; never represent proposed postings as posted accounting. | Accountant | DDL + implementation | OPEN |
| DEC-021 | Tax/VAT/e-invoicing: require Egypt-specific tax/legal review of applicable business types, registration, invoice/credit-note formats, integration and retention before statutory issuance. | Rules vary by entity, turnover, industry and current regulations; this register makes no legal determination. | Accountant + Egyptian Tax/Legal Adviser | Pack launch | OPEN |
| DEC-022 | Currency/FX/precision/rounding: store amounts in exact decimal form with explicit currency; define scale, rate source/time, conversion gain/loss and rounding per approved policy. Never use binary floating-point for authoritative postings. | Functional currency and multi-currency requirements vary by tenant/legal entity. | Accountant + Engineering | DDL | OPEN |
| DEC-023 | Posting timing: recommend synchronous atomic posting for routine commands when mappings/services are available; use visible pending-posting only for explicitly approved exception classes. Pending is never posted. | Define behavior per command family and failure mode. | Accountant + Engineering | DDL + implementation | OPEN |
| DEC-024 | Partner transactions: preserve distinct event types for capital contribution, current-account advance/repayment, withdrawal/distribution and exit settlement. No event silently changes another category; accountant defines treatment and approval limits. | Classification depends on legal agreements and tax/accounting treatment. | Accountant + Owner | DDL + implementation | OPEN |
| DEC-025 | Reports/consolidation: recommend one versioned calculation contract per metric shared by UI, exports and API; group totals reconcile to branch detail, and inter-branch transfers do not inflate revenue/expense. | Statutory and management reports may differ, but differences must be named/versioned. | Accountant + Product | Implementation | OPEN |

## 6. Security, privacy and compliance

| ID | Decision / recommended default | Alternatives / considerations | Owner | Gate | Status |
|---|---|---|---|---|---|
| DEC-026 | Database RLS/pooling: recommend tenant-aware roles/policies with transaction-local tenant context safely set for every pooled connection; prove isolation with adversarial tests. | Application-only tenant filtering is insufficient as the sole defense. Exact Neon pooling/RLS design requires engineering review. | Security + Engineering | DDL + implementation | OPEN |
| DEC-027 | Support/break-glass: recommend no standing unrestricted support access to tenant data. Use time-limited, reason-coded, approved least-privilege access, auditable and revocable. | Support sees operational metadata by default; exceptional content access requires approval. | Owner + Security | Implementation | OPEN |
| DEC-028 | Exports/audit retention: require authenticated owner/admin session, explicit export permission, authorized branch scope and immutable export audit. Define retention with legal/accountant review. | Tenant-wide export may be a separate elevated permission. | Owner + Security + Legal | Implementation | OPEN |
| DEC-029 | Industry compliance: before pharmacy launch, obtain specialist review for prescription/controlled-product, batch/expiry, patient and insurance safeguards. Review applicable Egyptian privacy, tax and sector requirements before each industry launch. | Exclude regulated workflows until requirements and controls are approved. | Legal + Security + Industry Owner | Pack launch | OPEN |

## 7. Approval ledger

No approval is implied by preparing this register. Record approvals only after the authorized person explicitly confirms the exact choice.

| Decision ID | Selected option / approved wording | Approver role | Conditions / evidence | Approval date | State |
|---|---|---|---|---|---|
| DEC-___ |  |  |  |  | OPEN |

## 8. Implementation gates

1. **Before DDL:** resolve DEC-007, DEC-009, DEC-010, DEC-012, DEC-014 where represented structurally, DEC-015, DEC-017, DEC-018, DEC-019, DEC-022 and DEC-026, or explicitly model configurable alternatives without irreversible defaults.
2. **Before financial posting:** DEC-020, DEC-021, DEC-023, DEC-024 and applicable period-close, currency and reconciliation policies require accountant/security approval and executable tests.
3. **Before trial/paid launch:** approve DEC-001 through DEC-006 and retention/expiry rules.
4. **Before industry-pack launch:** resolve DEC-011, DEC-013, DEC-014, DEC-021 and DEC-029 for that pack.
5. **Before production migration:** branch mapping, legacy reconciliation, outbox/journal preservation, export/backup authorization, rollback and cutover acceptance must pass the migration checklist.
6. **No silent defaults:** unresolved items remain OPEN; implementation may not infer approval from this register, PR review or a successful build.

## 9. Scope and sign-off boundary

This is a decision aid, not a signed approval record, legal/tax opinion, accountant sign-off, security certification or implementation authorization. The architecture package remains Draft until required decisions are approved. SQL/DDL, runtime changes, database migration, merge and Production deployment each require separate explicit authorization.
