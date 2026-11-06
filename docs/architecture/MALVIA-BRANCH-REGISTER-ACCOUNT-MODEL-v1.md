# MALVIA Branch, Register, Warehouse & Account Model — v1

**Status:** Proposed logical design for owner/accountant review. Not a physical schema or implementation authorization.

## 1. Core separation

These are different business objects and must never share an overloaded identifier:

- **Tenant**: legal/customer workspace and security boundary.
- **Branch**: operational business location or independently managed unit.
- **Warehouse**: physical/logical stock location. Always belongs to exactly one branch, including a central warehouse (which belongs to a designated central branch).
- **POS register**: a selling workstation/counter; belongs to one branch and may be assigned a default warehouse. A register is not a branch or a cash account.
- **Cashbox**: cash custody/accounting container. Belongs to one branch; may be linked to one or more registers under controlled opening/closing policy. Multiple cashboxes per branch are supported.
- **Bank account**: financial account with explicit ownership scope (tenant-central or branch-owned); not a cashbox and not a warehouse.
- **Stock allocation**: quantity reservation/assignment for a demand, order, transfer or channel; not physical stock and not a warehouse.
- **Employee/user**: tenant identity with one or more branch assignments and separately granted role/permissions.

Required identifiers: `tenantId`, `branchId`, `warehouseId`, `registerId`, `cashboxId`, `bankAccountId`, `stockAllocationId`. IDs are immutable, tenant-scoped, and references are validated server-side. A record must not infer branch from warehouse name, device, current UI selection or free-text description.

## 2. Ownership and cardinality

| Object | Owner / scope | Cardinality and constraints |
|---|---|---|
| Branch | Tenant | Tenant has 0..N branches; no fixed system cap |
| Warehouse | Branch | Branch has 0..N warehouses; warehouse belongs to exactly one branch |
| POS register | Branch | Branch has 0..N registers; register has one owning branch |
| Cashbox | Branch | Branch has 0..N cashboxes; register-to-cashbox assignment is time-bounded/audited |
| Bank account | Tenant or branch | Explicit scope; tenant-central account can serve multiple authorized branches |
| Stock allocation | Tenant + source/demand scope | References source warehouse/branch and target demand; quantity cannot exceed allocatable stock |
| User branch assignment | Tenant membership | User can access one, many, or all branches, with effective dates/status |
| Employee profile | Tenant | One profile can have multiple branch work assignments |

No fixed branch count is embedded in code or commercial licensing. Branch creation is controlled by tenant permissions and plan policy only if a future explicit commercial limit is approved.

## 3. Branch context on business records

Every operational transaction must carry immutable `tenantId` and owning `branchId`. Add the specific resource IDs only when applicable:

- Sale/invoice: branch + register + stock-fulfilment warehouse + settlement account references.
- Purchase receipt: receiving branch + receiving warehouse; procurement owner may be tenant-central.
- Expense: branch-owned expense OR tenant-wide expense with explicit allocation lines.
- Treasury movement: owning cashbox/branch or bank account scope; never derive branch from the currently selected screen.
- Bank ledger entry: bank account ID plus origin transaction; branch attribution comes from explicit allocation/origin, not from the bank account name.
- Employee attendance/shift: assigned branch and, when relevant, register/cashbox.
- Stock movement/batch/serial/reservation: source and destination warehouse IDs; branch IDs are validated against those warehouses.
- Customer/supplier: tenant-wide master record; transactions retain branch dimensions. Balance ownership policy remains an accounting decision (see §8).

For historical data, missing branch is represented as **unresolved legacy scope** until reviewed. Do not silently assign all old records to the first branch.

## 4. User access and authorization

A user may be assigned to one branch, selected branches, or all branches. Each assignment has status, effective dates, and optional role override. Authorization is the intersection of:

1. active tenant membership and session;
2. active subscription/module entitlement;
3. role/resource/action permission;
4. explicit branch scope;
5. object-level ownership and workflow state.

A UI branch selector is only a view preference. The server validates every requested branch and every nested record. Requests for unauthorized branches fail closed. "All branches" is an explicit grant, not an empty branch list. Platform support access is separate, time-limited, reason-coded and audited.

## 5. Multi-branch owner view

The owner may choose:
- one branch detail view;
- a selected branch comparison;
- all authorized branches consolidated.

Every aggregate preserves branch-level values and source IDs. Group totals are derived from eligible transactions, not by summing account balance snapshots. Internal transfers are excluded from group revenue, purchases and expenses; they appear in transfer reporting. Shared/central expenses and central bank settlements use explicit allocations and are not duplicated across branches. Reports show currency, period, timezone, scope and calculation version.

## 6. Warehouse and stock model

- Every warehouse belongs to a branch; central warehouse is attached to a designated central branch.
- A branch can have multiple warehouses (store, backroom, service bay, quarantine, damaged/returns, transit where operationally needed).
- Stock is warehouse-level and item/variant/lot/serial-aware where the industry pack requires it.
- Available = on-hand − reserved − blocked/quarantined, subject to the relevant stock policy. Do not treat a branch total or a cached product quantity as authoritative.
- Transfers retain source and destination warehouse/branch, requested/dispatched/received quantities, actor, timestamps, and discrepancy reasons.
- Reservations/allocations do not move physical stock; dispatch/receipt events do.

### Transfer lifecycle

New transfer workflow states: `DRAFT`, `REQUESTED`, `APPROVED` (when policy requires), `DISPATCHED`, `IN_TRANSIT`, `PARTIALLY_RECEIVED`, `RECEIVED`, `SHORTAGE_RECORDED`, `DAMAGE_RECORDED`, `CANCELLED`.

Rules:
- Dispatch decreases source available/on-hand according to the chosen posting point and records a transit position; receipt increases destination on-hand only for accepted quantity.
- Partial receipt, shortage, damage, rejection and cancellation are separate auditable events; no silent overwrite of quantities.
- Cancellation after dispatch requires a compensating return/receipt event, not deletion.
- Prevent negative stock unless an explicit tenant policy and permission allow it.
- Existing legacy transfers were immediate balance moves. Migrate them as completed historical transfers with equal dispatched/received quantity and original timestamps where available. Never fabricate an in-transit state for legacy rows.

## 7. POS, cashbox and closeout

- Register identity and device identity are separate. A device can be reassigned only through an audited operation.
- A register has one branch and a configured default warehouse; the user must be authorized for both.
- A cash session/shift opens against a cashbox and register (or a documented non-register channel), with opening float, cashier, timestamps, counted close, expected balance and variance.
- Split tender can settle across cashbox, bank, wallet or other configured methods. Each settlement line references its actual account and originating invoice.
- Cashbox transfer between branches is a transfer, not income/expense.
- Offline invoice numbering must remain unique across branch/register/device; server-issued sequence reservations or collision-safe identifiers are required. Preserve legacy invoice numbers and device codes during migration.
- Duplicate command retries return the original operation receipt; they must not post a second invoice, payment, stock move or loyalty event.

## 8. Accounting policy decisions still open

The model supports alternatives but does not choose accounting treatment silently:

1. **Customer/supplier balances:** tenant-wide subledger with branch dimensions, or branch subledgers with consolidated view. Recommendation for design: retain a single party identity and immutable transaction-level branch allocation; expose both branch and tenant-wide views. Accountant must approve settlement allocation and transfer-of-balance rules before posting logic.
2. **Bank account ownership:** support tenant-central and branch-owned accounts with explicit scope. Approval required for cross-branch usage, reconciliation and allocation.
3. **Company-wide expenses:** support direct tenant-level expenses and explicit allocation lines; do not force arbitrary branch selection. Allocation basis (fixed, percentage, headcount, usage) requires owner/accountant policy.
4. **Central procurement:** procurement may be tenant-owned while each receipt is branch/warehouse-specific. Payables and landed cost allocation need approval.
5. **Opening balances:** allow a tenant opening batch with branch-scoped lines; preserve source and reconciliation. No automatic balancing entry without approved accounting policy.

## 9. Migration invariants

Preserve existing tenant IDs, invoice/purchase/return IDs, invoice numbers, dates, item IDs, batch/serial links, bank ledger, treasury, partner capital/current-account/withdrawal/advance/exit records, opening balances, audit history and offline outbox/journal. Warehouse IDs remain warehouse IDs; they are never reused as branch IDs. Map only with evidence. Ambiguous records enter a review queue. Migration is idempotent and produces source-to-target mapping plus before/after reconciliation.

## 10. Acceptance gates

- Cross-tenant and unauthorized-branch reads/writes are rejected server-side, including nested arrays, exports, AI and agent actions.
- User assigned to branches A and C cannot access B; owner with all-branches grant can consolidate and drill down.
- Multiple warehouses, registers and cashboxes per branch work independently.
- Central warehouse always has a designated branch.
- Register/cashbox/warehouse mismatch is rejected.
- Partial transfer, shortage, damage and retry scenarios reconcile exactly.
- Internal transfers do not inflate consolidated P&L.
- Legacy immediate transfers remain completed and auditable.
- No existing data, pending outbox or transaction journal is cleared by migration.

**Gate:** logical design only. Physical ERD, accounting policy, SQL and runtime rollout require separate approval.
