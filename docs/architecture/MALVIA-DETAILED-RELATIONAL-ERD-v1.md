# MALVIA Detailed Relational ERD v1

**Status:** Conceptual relationship specification; companion to the PostgreSQL Physical Design and Data Dictionary. Not executable DDL. All tenant-owned relationships carry tenant scope; diagrams abbreviate that repeated composite key rule.

## 1. Platform, identity and organization

~~~mermaid
erDiagram
  TENANTS ||--o{ SUBSCRIPTIONS : has
  TENANTS ||--o{ USERS : contains
  TENANTS ||--o{ LEGAL_ENTITIES : owns
  TENANTS ||--o{ ROLES : defines
  SUBSCRIPTIONS ||--o{ SUBSCRIPTION_SEATS : purchases
  SUBSCRIPTIONS ||--o{ SEAT_ASSIGNMENTS : allocates
  USERS ||--o{ SEAT_ASSIGNMENTS : occupies
  USERS ||--o{ USER_ROLES : assigned
  ROLES ||--o{ USER_ROLES : grants
  ROLES ||--o{ ROLE_PERMISSIONS : contains
  USERS ||--o{ USER_BRANCH_ASSIGNMENTS : scoped
  BRANCHES ||--o{ USER_BRANCH_ASSIGNMENTS : authorizes
  USERS ||--o{ SESSIONS : authenticates
  DEVICES ||--o{ SESSIONS : hosts
  LEGAL_ENTITIES ||--o{ BRANCHES : operates
  BRANCHES ||--o{ LOCATIONS : has
  BRANCHES ||--o{ REGISTERS : hosts
  REGISTERS ||--o{ REGISTER_CASHBOX_ASSIGNMENTS : maps
  CASHBOXES ||--o{ REGISTER_CASHBOX_ASSIGNMENTS : assigned
  BRANCHES ||--o{ BRANCH_SEQUENCES : numbers
~~~

## 2. Catalog and inventory

~~~mermaid
erDiagram
  ITEMS ||--o{ ITEM_UNITS : measured
  ITEMS ||--o{ ITEM_PRICES : priced
  PRICE_LISTS ||--o{ ITEM_PRICES : contains
  ITEMS ||--o{ ITEM_ATTRIBUTE_VALUES : described
  ITEM_ATTRIBUTES ||--o{ ITEM_ATTRIBUTE_VALUES : defines
  BRANCHES ||--o{ WAREHOUSES : owns
  WAREHOUSES ||--o{ STOCK_LOCATIONS : contains
  ITEMS ||--o{ STOCK_BALANCES : balanced
  WAREHOUSES ||--o{ STOCK_BALANCES : holds
  STOCK_LOCATIONS ||--o{ STOCK_BALANCES : located
  ITEMS ||--o{ STOCK_MOVEMENTS : moves
  WAREHOUSES ||--o{ STOCK_MOVEMENTS : custody
  STOCK_MOVEMENTS ||--o{ STOCK_BATCH_MOVEMENTS : allocates
  STOCK_BATCHES ||--o{ STOCK_BATCH_MOVEMENTS : tracks
  ITEMS ||--o{ SERIAL_UNITS : serialized
  SERIAL_UNITS ||--o{ SERIAL_EVENTS : history
  STOCK_TRANSFERS ||--|{ STOCK_TRANSFER_LINES : contains
  STOCK_TRANSFERS ||--o{ STOCK_TRANSFER_EVENTS : lifecycle
  INVENTORY_COUNTS ||--|{ INVENTORY_COUNT_LINES : counts
~~~

## 3. Sales and procurement

~~~mermaid
erDiagram
  CUSTOMERS ||--o{ SALES_ORDERS : places
  SALES_ORDERS ||--|{ SALES_ORDER_LINES : contains
  CUSTOMERS ||--o{ INVOICES : billed
  BRANCHES ||--o{ INVOICES : originates
  REGISTERS ||--o{ INVOICES : issued_at
  INVOICES ||--|{ INVOICE_LINES : contains
  INVOICES ||--o{ INVOICE_PAYMENTS : paid_by
  INVOICES ||--o{ SALES_RETURNS : returned
  SALES_RETURNS ||--|{ SALES_RETURN_LINES : contains
  INVOICE_LINES ||--o{ SALES_RETURN_LINES : references
  SALES_RETURNS ||--o{ SALES_RETURN_TENDERS : refunded_by
  SUPPLIERS ||--o{ PURCHASE_INVOICES : supplies
  BRANCHES ||--o{ PURCHASE_INVOICES : receives
  WAREHOUSES ||--o{ PURCHASE_INVOICES : stocks
  PURCHASE_INVOICES ||--|{ PURCHASE_INVOICE_LINES : contains
  SUPPLIERS ||--o{ SUPPLIER_PAYMENTS : paid
  SUPPLIER_PAYMENTS ||--o{ SUPPLIER_PAYMENT_ALLOCATIONS : allocated
  PURCHASE_INVOICES ||--o{ SUPPLIER_PAYMENT_ALLOCATIONS : settled
  PURCHASE_INVOICES ||--o{ PURCHASE_RETURNS : returned
  PURCHASE_RETURNS ||--|{ PURCHASE_RETURN_LINES : contains
  PURCHASE_RETURNS ||--o{ PURCHASE_RETURN_SETTLEMENTS : settled
  REGISTERS ||--o{ SHIFTS : operated
  SHIFTS ||--o| SHIFT_CLOSEOUTS : closes
~~~

## 4. Finance and accounting

~~~mermaid
erDiagram
  BRANCHES ||--o{ CASHBOXES : owns
  CASHBOXES ||--o{ TREASURY_MOVEMENTS : records
  CASHBOXES ||--o{ CASHBOX_TRANSFERS : source_or_destination
  BANK_ACCOUNTS ||--o{ BANK_LEDGER_ENTRIES : records
  BANK_ACCOUNTS ||--o{ BANK_STATEMENT_IMPORTS : imports
  BANK_STATEMENT_IMPORTS ||--|{ BANK_STATEMENT_LINES : contains
  PARTNERS ||--o{ PARTNER_CAPITAL_EVENTS : capital
  PARTNERS ||--o{ PARTNER_CURRENT_ACCOUNT_EVENTS : current_account
  PARTNERS ||--o{ PARTNER_WITHDRAWALS : withdraws
  PARTNERS ||--o{ PARTNER_EXIT_SETTLEMENTS : exits
  PARTNER_EXIT_SETTLEMENTS ||--o{ PARTNER_EXIT_PAYMENTS : paid
  LEGAL_ENTITIES ||--o{ FISCAL_PERIODS : periods
  FISCAL_PERIODS ||--o{ PERIOD_CLOSE_RUNS : closes
  CHART_OF_ACCOUNTS ||--o{ JOURNAL_LINES : account
  JOURNALS ||--|{ JOURNAL_LINES : contains
  POSTING_TEMPLATES ||--o{ JOURNALS : template
  JOURNALS ||--o| JOURNAL_REVERSALS : reversed_by
  SOURCE_EVENTS ||--o{ POSTING_RECEIPTS : posted_once
  POSTING_RECEIPTS }o--o| JOURNALS : creates
~~~

## 5. Workflow, sync and audit

~~~mermaid
erDiagram
  WORKFLOW_DEFINITIONS ||--|{ DEFINITION_VERSIONS : versions
  DEFINITION_VERSIONS ||--|{ WORKFLOW_STEPS : defines
  DEFINITION_VERSIONS ||--o{ WORKFLOW_INSTANCES : starts
  WORKFLOW_INSTANCES ||--o{ WORKFLOW_TASKS : creates
  WORKFLOW_TASKS ||--o{ WORKFLOW_APPROVALS : receives
  COMMAND_RECEIPTS ||--o{ COMMAND_EVENTS : records
  COMMAND_RECEIPTS ||--o{ OUTBOX_EVENTS : emits
  DEVICES ||--o{ DEVICE_CURSORS : syncs
  USERS ||--o{ AUDIT_EVENTS : acts
  SESSIONS ||--o{ AUDIT_EVENTS : correlates
  INTEGRATION_CONNECTIONS ||--o{ WEBHOOK_DELIVERIES : delivers
~~~

## 6. Relationship and ownership rules

| Relationship | Required enforcement |
|---|---|
| Tenant → every tenant-owned row | tenant_id NOT NULL; composite FK includes tenant_id |
| Legal entity → branch | branch belongs to exactly one legal entity |
| Branch → warehouse/register/cashbox | independent entities; warehouse is not branch; register is not cashbox |
| User → branch assignments | explicit valid-time assignments; all-branch access is explicit |
| Invoice → branch/register | invoice's originating branch/register is immutable after posting |
| Invoice payment → collection branch/custody | payment may be collected at a different authorized branch; keep separate attribution |
| Purchase invoice → receiving branch/warehouse | preserve both operational attribution and stock custody |
| Transfer → source/destination branch | transfer lines and lifecycle events preserve quantities at each stage |
| Stock movement → source document | immutable source type/id/line and idempotency receipt |
| Treasury movement → cashbox | cash custody book, not GL or bank ledger |
| Bank ledger entry → bank account | bank book, separate from cashbox and GL |
| Partner events → partner | capital/current-account/withdrawal/advance/exit types remain separate |
| Journal → source event | one posting receipt per source/purpose; reversal references original |
| Outbox event → command receipt | atomic creation with business command; delivery retry is idempotent |

## 7. Composite tenant key pattern

For a tenant-owned parent `parent(tenant_id,id)` and child `child(tenant_id,parent_id)`:

~~~sql
-- Illustrative pattern only; not approved or executable migration.
PRIMARY KEY (tenant_id, id);
FOREIGN KEY (tenant_id, parent_id)
  REFERENCES parent (tenant_id, id);
~~~

Every tenant-owned FK follows this pattern, including multi-parent joins. Global catalogs may use global IDs only when they contain no tenant data and are immutable/versioned. Never rely on application filtering alone.

## 8. Important cardinalities and transactional invariants

- Invoice has one or more lines; payments may be split across multiple tenders.
- Sales return line references the exact original invoice line; cumulative returns cannot exceed eligible sold quantity.
- Purchase return line references original purchase line; stock return, supplier debt reduction, cash refund and supplier credit are separate settlement effects.
- Stock balance is a projection of immutable movements plus reservation policy; batches and serial custody reconcile to it.
- Transfer has source and destination branches; dispatch and receipt are separate events. Legacy completed transfers remain completed.
- One active session per user/device policy and seat assignment policy must be explicitly selected; do not infer from current local session behavior.
- A command receipt guarantees duplicate retry does not create duplicate invoice, stock, treasury, bank, partner or journal effects.
- A journal's lines balance under approved currency and accounting policy; the database command transaction enforces it.
- Cashbox transfer is a paired movement, not income/expense. Bank transfer and internal branch movement follow explicit policies.
- Group reports aggregate branch dimensions without merging custody ledgers or losing source branch.

## 9. Review gates

This ERD does not settle UUID strategy, branch mapping of legacy data, tax, currency/FX, stock valuation, account codes, debit/credit directions, RLS, partitioning, retention, FK delete actions or trial policy. Those decisions require named owner/accountant/security/engineering approval before DDL.
