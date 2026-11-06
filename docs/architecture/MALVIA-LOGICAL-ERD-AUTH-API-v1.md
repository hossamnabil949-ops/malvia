# MALVIA — Logical ERD, Authorization and API Contracts v1
**Status:** Design draft; not executable SQL  
**Branch:** `docs/malvia-platform-design-package-v1`  
**Purpose:** Convert the verified legacy resource inventory into a tenant-safe relational target without changing production.

## 1. Modeling rules

- Every tenant-owned row carries `tenant_id`; tenant ID is part of uniqueness and foreign-key scope.
- Every operational record that belongs to a branch carries `branch_id`; branchless records are allowed only for explicitly tenant-wide concepts.
- `warehouse_id` is a stock location, never a synonym for `branch_id`.
- POS operations may additionally carry `register_id`, `shift_id`, and `actor_user_id`.
- Money movement rows carry the actual cash/bank account scope and immutable source references.
- Business document IDs and legacy IDs remain stable during migration.
- Shared catalogs (e.g. country/currency/industry metadata) are platform-owned and read-only to tenants; tenant customizations are tenant-owned.
- No tenant identifier supplied by the browser is trusted without matching the authenticated membership context.

## 2. Logical ERD — platform and commercial core

| Table | Key columns / relationships | Notes |
|---|---|---|
| tenants | id, legal_name, display_name, timezone, locale, status, created_at | One isolated customer/company boundary |
| tenant_profiles | tenant_id, tax identifiers, address, contact data | Sensitive fields protected by least privilege |
| users | id, login identifier, password/auth provider reference, status | Global identity; credentials not duplicated per tenant |
| tenant_memberships | id, tenant_id, user_id, membership_status, is_owner | Unique active membership per tenant/user |
| roles | id, tenant_id nullable for platform roles, code, name | System roles + tenant-defined roles |
| permissions | id, code, domain, action, scope_type | Stable permission catalog |
| role_permissions | role_id, permission_id, conditions | Role grant |
| membership_roles | membership_id, role_id | Many-to-many roles |
| user_branch_assignments | membership_id, branch_id, assignment_role, valid_from/to | One user may access selected branches or all via explicit scope grant |
| industry_catalog | id, code, name, version | Platform-managed industry catalog |
| tenant_industries | tenant_id, industry_id, status, configuration | A tenant may activate multiple industry solutions |
| module_catalog | id, code, version, dependencies | Shared module catalog |
| industry_module_defaults | industry_id, module_id, default_enabled | Recommended composition, not an authorization grant |
| tenant_module_entitlements | tenant_id, module_id, status, starts_at, ends_at, source_subscription_id | Authoritative feature entitlement |
| plans | id, code, version, pricing model, status | Commercial plan versions |
| plan_modules | plan_id, module_id, limits/config | Modules and limits included in plan |
| subscriptions | id, tenant_id, plan_id, status, period, provider reference | Billing lifecycle |
| subscription_items | subscription_id, item_type, catalog_id, quantity, price | User seats, modules, add-ons |
| trial_policies | id, version, duration_days, rules_json, status | Approved policy version snapshot |
| trial_enrollments | id, tenant_id, policy_id, starts_at, expires_at, status, converted_subscription_id | One trial lifecycle per eligible tenant |
| trial_events | id, trial_id, event_type, actor, occurred_at, metadata | Append-only audit |
| usage_counters | tenant_id, period, metric_code, quantity | AI/storage/messaging quota metering |
| billing_events | id, tenant_id, provider, external_event_id, status | Idempotent webhook processing |
| download_releases | id, platform, architecture, channel, version, artifact_uri, sha256, signature, published_at | Immutable release metadata |
| platform_audit_events | id, actor_user_id, tenant_id nullable, action, target, occurred_at | Security and admin audit |

## 3. Logical ERD — organization and operations

| Table | Key columns / relationships | Current resource lineage |
|---|---|---|
| branches | id, tenant_id, code, name, address, status | New explicit branch master; do not infer from warehouse names |
| warehouses | id, tenant_id, branch_id, code, name, status | warehouses |
| registers | id, tenant_id, branch_id, code, name, status | New POS register identity |
| employee_profiles | id, tenant_id, user_id nullable, legacy_employee_id, employment fields | employees |
| employee_branch_assignments | employee_profile_id, branch_id, role, dates | New; current Employee type has no reviewed branch assignment |
| products | id, tenant_id, sku, barcode identifiers, descriptive/catalog fields | parts |
| product_alternatives | id, tenant_id, product_id, alternate identifiers and pricing | AutoPart.alternatives |
| product_compatibilities | product_id, industry reference, fitment fields | compatibleModels / carModels |
| stock_balances | tenant_id, branch_id, warehouse_id, product_id, on_hand, reserved, version | stockLevels + stockQuantity compatibility |
| stock_movements | id, tenant_id, branch_id, warehouse_id, product_id, qty_delta, balance_after, source type/id, actor | stockMovements |
| stock_transfers | id, tenant_id, source/destination branch+warehouse, status, references | stockTransfers |
| stock_batches | id, tenant_id, branch_id, warehouse_id, product_id, batch_no, expiry | stockBatches |
| serial_units | id, tenant_id, branch_id, warehouse_id, product_id, serial_no, status | serialUnits |
| customers | id, tenant_id, customer master fields | customers |
| suppliers | id, tenant_id, supplier master fields | suppliers |
| sales_invoices | id, tenant_id, branch_id, register_id, shift_id, customer_id, cashier_id, legacy fields | invoices |
| sales_invoice_lines | id, invoice_id, product_id, quantity, unit price, cost snapshot, tax, returned qty | Invoice.items |
| sales_payments | id, invoice_id, method, amount, bank_account_id | Invoice.payments |
| sales_settlements | id, invoice_id, amount, date/time, receipt reference | Invoice.settlementPayments |
| sales_returns | id, tenant_id, branch_id, invoice_id, refund treatment, status | salesReturns |
| sales_return_lines | id, return_id, invoice_line_id, product_id, quantity, amount | SalesReturn.items |
| purchase_invoices | id, tenant_id, branch_id, warehouse_id, supplier_id, totals, status | purchaseInvoices |
| purchase_invoice_lines | id, purchase_invoice_id, product_id, quantity, cost, tax, returned qty | PurchaseInvoice.items |
| purchase_returns | id, tenant_id, branch_id, purchase_invoice_id, supplier_id, settlement data | purchaseReturns |
| purchase_return_lines | id, purchase_return_id, purchase_invoice_line_id, quantity, amount | PurchaseReturn.items |
| supplier_payments | id, tenant_id, branch_id, supplier_id, amount, payment account, source | supplierPayments |
| supplier_payment_schedules | id, tenant_id, supplier_id, invoice_id, plan and due data | supplierPaymentSchedules |
| expenses | id, tenant_id, branch_id nullable, title, category, amount, date, account | expenses |
| expense_allocations | expense_id, branch_id, allocation_basis, amount | New for tenant-wide allocated expenses |
| treasury_accounts | id, tenant_id, branch_id nullable, code, type, status | New normalized cashbox/account identity |
| treasury_transactions | id, tenant_id, branch_id, treasury_account_id, type, amount, source reference | treasury |
| bank_accounts | id, tenant_id, branch_id nullable, ownership_scope, bank metadata | bankAccounts; scope policy remains open |
| bank_ledger_entries | id, tenant_id, bank_account_id, source reference, amount, occurred_at | bankLedgerEntries |
| card_settlements | id, tenant_id, branch_id, bank_account_id, amounts, batch references | cardSettlements |
| cheques | id, tenant_id, branch_id, direction, lifecycle, linked account/source | cheques |
| shifts | id, tenant_id, branch_id, register_id, employee_id, opened/closed, status | shifts |
| reservations | id, tenant_id, branch_id, customer fields, expiry, status | reservations; auto industry module |
| inventory_discrepancies | id, tenant_id, branch_id, warehouse_id, product_id, evidence, resolution | inventoryErrors |
| loyalty_accounts | id, tenant_id, customer_id, balance | New |
| loyalty_ledger | id, tenant_id, customer_id, branch_id nullable, source, points_delta | loyaltyLedger |
| partners | id, tenant_id, ownership and capital fields | partners |
| partner_capital_entries | id, tenant_id, partner_id, amount, type, effective date | Existing partner/capital history; exact source mapping needed |
| partner_withdrawals | id, tenant_id, partner_id, amount, kind, treasury source | partnerWithdrawals |
| partner_current_account_entries | id, tenant_id, partner_id, amount, type, treasury transaction | partnerCurrentAccountTransactions |
| partner_exit_settlements | id, tenant_id, partner_id, snapshot amounts, status | partnerExitSettlements |
| partner_settlement_payments | id, tenant_id, settlement_id, amount, account/source | partnerSettlementPayments |
| opening_balance_batches | id, tenant_id, status, effective_date, approved_by | openingBalances |
| opening_balance_lines | id, batch_id, category, entity reference, amount, quantity, cost | OpeningBalanceLine |
| audit_events | id, tenant_id, branch_id nullable, actor, action, entity reference, payload | auditLog |
| idempotency_records | tenant_id, actor, operation_key, request_hash, response reference | Existing sync/agent idempotency patterns |

**Important:** this is a logical target, not a finalized physical schema. Exact columns, indexes, decimal precision, deletion rules, and legacy nested-object mappings require the full field-level migration worksheet and domain-owner approval.

## 4. Scope ownership matrix

| Data / action | Tenant scope | Branch scope | Warehouse / register / account scope |
|---|---|---|---|
| User identity and login | Yes | No | No |
| Membership and seat usage | Yes | No | No |
| Industry and module subscription | Yes | No | No |
| Branch directory | Yes | Branch records | No |
| Employee profile | Yes | Assignment records | No |
| Product master | Yes | Optional branch assortment | Stock is warehouse-scoped |
| Inventory quantity and movement | Yes | Required | Warehouse required; register not applicable |
| Sales invoice and return | Yes | Required | Register/shift required where POS; warehouse required for stock issue |
| Purchase receipt | Yes | Required | Receiving warehouse required |
| Customer/supplier master | Yes | Shared master by default | Ledger policy pending |
| Customer/supplier money ledger | Yes | Branch dimension required | Account/source dimension required |
| Expense | Yes | Branch or explicit allocation | Cash/bank source when paid |
| Treasury | Yes | Account's owning scope | Treasury account required |
| Bank ledger | Yes | Account's owning scope | Bank account required |
| Partner capital/current account | Yes | Optional source branch only | Cash/bank source for settlement |
| Audit event | Yes | Optional | Actor always required where authenticated |
| Trial/subscription/download release | Yes | No | Device is not entitlement authority |

## 5. Authorization decision model

Each request must pass these checks in order:

1. Authenticate the user/session and revoke expired or disabled sessions.
2. Resolve the tenant only from the authenticated membership or a validated tenant switch.
3. Confirm tenant is active and trial/subscription permits the requested operation.
4. Confirm industry pack and module entitlement.
5. Confirm the user's role/permission for the domain action.
6. Confirm branch assignment or explicit all-branches grant.
7. Confirm resource row belongs to the tenant and authorized branch.
8. Confirm warehouse/register/account is within that branch and user scope.
9. Apply state-transition and financial invariants server-side.
10. Record actor, tenant, branch, idempotency key and audit event.

### Permission examples

| Permission code (illustrative) | Scope | Example |
|---|---|---|
| `tenant.settings.manage` | Tenant | Configure company settings |
| `tenant.users.manage` | Tenant | Invite/deactivate users subject to seats |
| `branch.view` | Assigned branches | View branch dashboard |
| `branch.manage` | Assigned branches | Maintain branch settings |
| `sales.invoice.create` | Branch | Create invoice in authorized branch |
| `sales.return.approve` | Branch | Approve return under policy |
| `inventory.adjust` | Branch + warehouse | Adjust authorized stock |
| `inventory.transfer` | Source + destination branch | Transfer with two-sided confirmation |
| `finance.expense.create` | Branch or tenant allocation | Create properly attributed expense |
| `finance.bank.view` | Account scope | View authorized bank account |
| `reports.group.view` | Tenant | Consolidated cross-branch reports |
| `reports.branch.view` | Assigned branches | Drill into permitted branch |
| `platform.trial.manage` | Platform operator | Extend/close trial with reason |
| `platform.release.publish` | Platform operator | Publish signed client release |

These codes are examples for the target catalog; they do not assert that existing UI permissions already enforce them. Client-side tab visibility is never an authorization boundary.

## 6. API contracts — minimum common envelope

### Authenticated request context (server-derived)
- `user_id`
- `tenant_id`
- `membership_id`
- `role/permission grants`
- `authorized branch scopes`
- `session_id`
- `entitlement snapshot/version`

Client may request a branch context, but server must validate membership and resource ownership before using it.

### Resource sync envelope (target)
```json
{
  "tenantId": "server-derived",
  "branchId": "selected-authorized-branch",
  "resource": "salesInvoices",
  "operationId": "stable-idempotency-key",
  "baseVersion": 12,
  "operations": [
    { "op": "upsert", "id": "legacy-stable-id", "data": {} }
  ]
}
```

The example is conceptual. The existing resource snapshot sync remains compatible until an explicit versioned API migration. New API must reject tenant/branch mismatch, duplicate operation IDs, stale state transitions and over-return/over-settlement conditions.

### Required API families
- `/api/auth/*`: signup verification, login, session refresh/revoke, tenant selection.
- `/api/tenants/*`: profile, memberships, tenant settings.
- `/api/branches/*`: branch lifecycle and user assignments.
- `/api/entitlements/*`: read-only effective entitlements; writes restricted to billing/platform service.
- `/api/trials/*`: self-service enrollment and status; extension is platform-only.
- `/api/subscriptions/*`: checkout, subscription status and billing history.
- `/api/downloads/*`: release metadata and controlled artifact redirect.
- `/api/{domain}/*`: branch-aware domain operations.
- `/api/sync/*`: versioned, tenant/branch-aware sync and idempotent conflict handling.
- `/api/reports/*`: branch-filtered and tenant-consolidated reports with drill-down authorization.

## 7. Migration mapping and safety gates

1. Freeze a versioned source snapshot per tenant and record source resource versions.
2. Create tenant/branch mapping; legacy tenant receives one explicitly designated primary branch.
3. Map legacy warehouses to warehouses under that primary branch. The implicit `main` warehouse must be represented without changing total stock.
4. Map each resource using stable legacy IDs and deterministic source references.
5. Import master data before dependent documents; import ledger/source documents before derived balances.
6. Recompute stock balances from movements and compare to legacy stockQuantity/stockLevels; do not overwrite silently.
7. Reconcile customer/supplier balances to invoices, returns, payments and opening balances after the approved ledger policy.
8. Reconcile treasury and bank balances to immutable entries and opening balances.
9. Reconcile partner capital, withdrawals, current accounts and exit settlements independently.
10. Compare invoice/return totals, tax, discounts, COGS and profit reports over fixed date windows.
11. Run dual-read/dual-write only with idempotency and rollback plan; never run destructive backfill on production without explicit approval.
12. Cut over tenant by tenant after zero unexplained variance and verified backup/restore.

### Blocking accounting decisions

- Customer/supplier balances: one tenant-wide ledger with branch dimensions vs separate branch subledgers and consolidated view.
- Bank account ownership: tenant-central, branch-owned, or both with explicit scope.
- Company-wide expense: tenant-level entry with allocation lines vs mandatory branch assignment.
- Central warehouse: must belong to a designated central branch; never branchless.
- Opening balances: approve whether opening batch is tenant-wide or contains independently scoped branch lines.

## 8. Verification gaps before physical ERD / SQL

- Inspect all nested interfaces beyond the excerpts and map every nested line/payment/allocation.
- Inspect every API route, report query, agent operation, import/export and offline journal mutation for branch context.
- Inventory all local storage keys and migration/reset behavior.
- Confirm the exact license registry schema and all owner/admin operations.
- Decide user authentication model (global identity with memberships vs tenant-local identities) and account recovery/MFA policy.
- Decide trial verification, seat count, included modules, expiry grace and retention.
- Decide payment provider and Egypt-market billing/reconciliation requirements.
- Complete privacy/data retention review for customer, employee, pharmacy and other industry-sensitive data.
- Define data export, tenant deletion, legal hold and backup restore controls.

**No SQL is included by design.** This package must be reviewed and approved before schema creation, runtime implementation, tenant migration, or production deployment.


## 9. Detailed branch/register/account and industry model addenda

The detailed ownership, lifecycle and acceptance rules are maintained in:
- `MALVIA-BRANCH-REGISTER-ACCOUNT-MODEL-v1.md`: distinct Branch, Warehouse, POS Register, Cashbox, Bank Account and Stock Allocation identities; user multi-branch assignments; central warehouse ownership; transfer lifecycle; POS closeout; consolidated reporting; unresolved accounting choices.
- `MALVIA-INDUSTRY-PACKS-AND-COMMON-MODULES-v1.md`: shared platform contracts and industry pack boundaries for restaurants, auto parts/service, supermarket/retail, clothing and pharmacy.

Logical ERD clarifications:
- Add `cashboxes` as explicit branch-owned cash custody accounts; do not overload `treasury_accounts` without a future approved mapping.
- Add `register_cashbox_assignments` with effective interval and audit actor; do not hard-code one cashbox per branch/register.
- Add `stock_allocations` with source warehouse, demand reference, quantity, status and expiry; allocations reserve availability but do not post physical movement.
- Add transfer event/line tables for dispatch, transit, partial receipt, shortage, damage and cancellation; legacy immediate transfers map to completed history.
- Add `subscription_seat_ledger` / membership seat assignments and versioned entitlement grants as append-only commercial records; the current `maxEmployees` field is not itself a seat ledger.
- Industry pack entities are additive extensions over shared contracts; no industry-specific cash, user, tenant or accounting ledger is permitted.

The above is a logical extension only. Exact physical table/column names and accounting treatment remain subject to design approval.

## 10. Financial ownership and consolidation companion
See MALVIA-FINANCIAL-OWNERSHIP-SUBLEDGER-CONSOLIDATION-v1.md for the proposed tenant-wide AR/AP subledgers with branch dimensions, branch-owned cashboxes, central/branch bank-account scopes, expense allocations, consolidated reporting, opening-balance controls and the target balanced journal architecture. This is a proposed policy model; chart of accounts, posting templates and statutory treatment require owner/accountant approval.


## Related backend API and service contract

- [Backend API, domain services and command contracts](MALVIA-BACKEND-API-SERVICES-AND-COMMAND-CONTRACT-v1.md) — shared server request pipeline, domain boundaries, versioned read/command/sync APIs, authorization, idempotency, atomic transaction boundaries, safe responses, legacy compatibility and acceptance tests. Design only; no endpoint implementation is authorized.
