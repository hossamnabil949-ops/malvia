# MALVIA Common Modules & Industry Packs — v1

**Status:** Product/domain design proposal. Industry scope is extensible; no industry pack is declared production-ready by this document.

## 1. Product composition

MALVIA is one multi-tenant platform. A tenant activates one or more industry packs and shared modules. The pack supplies terminology, workflows, required fields, validation, reports and optional UI composition; it does not fork identity, permissions, accounting, inventory or sync infrastructure.

Composition layers:
1. **Core Platform:** tenant identity, users, roles, branch scope, subscriptions, entitlements, audit, settings, localization, notifications, API, sync, files, integrations and AI governance.
2. **Shared Business Modules:** POS/sales, customers, suppliers, purchasing, inventory, returns, pricing, payments, finance/accounting, treasury, bank ledger, workforce/HR, workflow/approvals, reports and exports.
3. **Industry Pack:** domain entities and lifecycle rules specific to an industry.
4. **Optional Features:** loyalty, delivery, reservations, advanced costing, serial/lot traceability, payroll, advanced analytics, integrations and automation.

## 2. Shared contracts

Every pack must reuse:
- Tenant/user/role/permission and branch authorization.
- Branch, warehouse, register, cashbox and account ownership model.
- Product/item master with industry-defined extensions; stable IDs and units of measure.
- Sales order/invoice/payment/return lifecycle and idempotent server commands.
- Supplier/purchase/receipt/return/payable lifecycle.
- Inventory ledger, warehouse stock, reservations, batches/expiry/serials where enabled.
- Accounting source references and posting policy; no pack invents a separate cash ledger.
- Audit events, approvals, notifications, attachments, search, reporting and exports.
- Subscription/module entitlements and server-side API enforcement.
- Offline sync protocol, durable operation receipts, conflict resolution and data export.

Industry-specific screens must call shared commands and contracts; they cannot bypass server authorization or directly mutate accounting balances.

## 3. Industry packs

### 3.1 Restaurants & cafés

Domain entities/workflows:
- Dining areas, tables, table status and table merge/split.
- Guest check/order with dine-in, takeaway and delivery channels.
- Order lines, modifiers, add-ons, notes, combos and course sequencing.
- Kitchen/bar tickets, station routing, preparation states, re-fire/void with audit.
- Recipes/BOM and ingredient consumption; configurable yield, waste and unit conversion.
- Food cost, theoretical vs actual consumption, stock depletion and variance.
- Reservations/waitlist, deposits and no-show policy (optional).
- Delivery dispatch/aggregators and delivery fees (optional).

Must reuse POS, payments, customer, supplier, inventory, purchasing, accounting, user and report modules. Kitchen tickets are not invoices; order edits and payment settlement must reconcile with the sales lifecycle. Recipe consumption must be traceable and must not silently change historical cost.

### 3.2 Auto parts & vehicle service

Domain entities/workflows:
- Vehicle make/model/year/engine/trim and VIN/chassis/plate identifiers with privacy controls.
- Fitment/compatibility catalog linking parts to vehicle attributes and confidence/source.
- Service order/job card, diagnosis, estimate, customer approval, labor operations and parts issue.
- Work bays, technicians, time booking, inspection checklist and service status.
- Parts reservation/issue/return linked to job card; warranty and core/old-part return where applicable.
- Service invoice combines labor and parts through shared sales/accounting contracts.

Must reuse inventory, serial/batch, purchasing, supplier, customer, POS, payments, accounting and HR. Compatibility is a catalog relation, not an unchecked free-text filter. VIN and customer vehicle history require access controls and retention policy.

### 3.3 Supermarket & general retail

Domain entities/workflows:
- Barcode/GTIN and alternate codes; weighed/variable-weight items and scale integration.
- Fast checkout, scan-and-go where enabled, cashier shifts and returns.
- Promotions, price rules, bundles, coupons and loyalty.
- Variants, units, packs, weighted items, batches and expiry.
- Shelf/replenishment and stock count workflows.
- Multi-lane register operations and high-volume inventory movement.

Must reuse shared POS, product, stock, procurement, returns, pricing, payments and finance. Promotion calculation and tax rounding are centralized/versioned to keep receipt, report and export consistent.

### 3.4 Clothing & fashion

Domain entities/workflows:
- Style/product with size, color, fit and other configurable variant dimensions.
- Variant matrix, per-variant barcode, stock and replenishment.
- Season/collection, size charts and assortment.
- Exchanges and returns that retain original variant and price allocation.
- Transfers between branches for size/color balancing.

Must reuse shared product, inventory, POS, purchasing, returns, customer and reporting. A sellable variant is a stock identity; do not collapse all variants into one parent quantity.

### 3.5 Pharmacy

Domain entities/workflows:
- Product identity with batch/lot, expiry and traceability.
- FEFO issue policy and expiry alerts/recall handling.
- Supplier and purchasing traceability; damaged/expired/quarantine stock.
- Prescription-related workflow only where jurisdiction, licensing, privacy and professional requirements are reviewed and approved.
- Regulated-product controls only after local legal/compliance analysis and authorization model are defined.

The platform must not assume that a generic retail workflow is sufficient for pharmacy compliance. Sensitive health/prescription data requires separate privacy, access, audit, retention and regulatory review before implementation.

### 3.6 Other commerce and service industries

Use a configurable pack contract for additional verticals (electronics, wholesale, services, distribution, beauty, etc.). New pack must declare its entities, events, validation, reports, offline behavior, permission map, accounting touchpoints and migration mapping before development.

## 4. Module dependency and entitlement rules

- Industry pack declares required shared modules and optional dependencies.
- Entitlement resolution is server-side and versioned.
- A tenant may buy shared modules independently when dependency rules permit.
- UI visibility is not authorization; API and background jobs enforce entitlements.
- Existing records remain readable/exportable under a future expiry policy, but access behavior is a commercial/legal decision, not assumed here.
- Cross-pack sharing of customers, suppliers, products or employees uses stable tenant identity and explicit data ownership.

## 5. Pack lifecycle and extension rules

Each pack version defines compatibility, schema extensions, feature flags, migrations, reports, permission catalogue and test fixtures. Pack installation is additive and reversible only where no posted business data depends on it. Deactivation must not delete historical records; it may disable new transactions while retaining authorized inquiry/export. Upgrades require migration preview, backup, idempotent execution and rollback plan.

## 6. Acceptance gates for a new pack

1. Domain expert validates workflow and terminology.
2. Shared contract reuse is documented; duplicate ledger/identity avoided.
3. Branch, warehouse, register and account scope is explicit.
4. Accounting events and reversals are mapped.
5. Role/permission and sensitive-data matrix is complete.
6. Online/offline behavior and idempotency are tested.
7. Reports reconcile with source transactions and exports.
8. Import/migration mapping and sample reconciliation are provided.
9. Localization, accessibility and mobile/POS usability are tested.
10. Entitlement, upgrade, downgrade and deactivation behavior is approved.

**Gate:** This is a product architecture catalogue, not approval to implement regulated workflows or accounting rules.
