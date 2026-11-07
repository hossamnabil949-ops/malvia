# MALVIA Public Website, Customer Portal & 14-Day Trial UX — Draft v1

Status: product and UX specification only. No UI runtime code, payment integration, account creation, tenant provisioning, SQL, or deployment is included. Commercial policy decisions remain pending approval.

## 1. Product promise and information architecture

MALVIA is presented as one modular business platform with industry-specific experiences, not a collection of unrelated applications.

Primary navigation:
- Home
- Solutions (Automotive Parts & Service, Restaurants & Cafes, Supermarket & Retail, Fashion & Apparel, Pharmacy, General Commerce, HR/ERP)
- Platform (Core, Modules, AI, Integrations, Multi-Branch)
- Pricing
- Free 14-Day Trial
- Resources (Guides, Help Center, Contact)
- Sign in / Customer Portal

Arabic and English are first-class languages. Layout direction, navigation, forms, validation, email templates and generated documents follow the selected language (RTL Arabic / LTR English). Currency, tax and date formatting are tenant configuration, not hardcoded from the visitor's locale.

## 2. Public pages and content blocks

### Home
1. Clear headline: one platform, different business workflows.
2. Industry selector with real use-case examples.
3. Platform capabilities: sales, inventory, purchasing, finance, HR, workflow, AI and integrations.
4. Multi-branch overview and consolidated reporting.
5. Short product tour / screenshots or verified product video.
6. Security, backup and data ownership explanation.
7. 14-day trial call to action.
8. Contact/demo request and footer with legal/support links.

### Industry solution page
- Describe the actual workflow and common operating challenges for the selected industry.
- Show the relevant industry pack and reusable business modules separately.
- Provide role-based workflow examples (owner, manager, cashier, stock controller, accountant).
- Explain which features are core, optional, or require a paid module only after commercial entitlements are approved.
- CTA preselects the industry in onboarding but does not provision a tenant until the user confirms.

### Platform / modules page
- Explain shared identity, tenant isolation, branches, permissions, audit, offline sync and integrations.
- Show modules as independent entitlements with dependencies clearly stated.
- Avoid implying every module is included in every plan.
- AI features describe assistance and controlled actions; never promise autonomous financial posting without authorization.

### Pricing page
- Display only approved prices and commercial rules.
- Separate user seats from branch count, since branches are not the licensing meter in the approved product direction.
- Explain included modules, add-ons, billing interval, taxes, renewal, cancellation and support only after those policies are finalized.
- If pricing is not approved, use “Talk to sales” rather than invented prices or plan limits.

## 3. Trial onboarding flow

1. Visitor selects industry / solution.
2. Visitor chooses “Start free 14-day trial”.
3. Create or sign into a MALVIA account; collect only necessary contact and company details.
4. Verify email or phone according to the still-pending identity policy.
5. Confirm company identity, selected industry and timezone/currency defaults.
6. Server provisions a tenant in pending/trial setup state.
7. User creates the first branch and owner profile; branch count is not capped by an arbitrary system constant.
8. User chooses optional starter modules, subject to approved trial bundle.
9. Server atomically activates trial and writes immutable `trial_started_at`, `trial_ends_at`, duration and policy version.
10. Redirect to guided setup and first-use checklist.

The tenant may be provisioned in a pending setup state. The 14-day clock starts only when the server atomically activates the trial after required identity verification and the defined first-use setup gate; not when the installer is downloaded, opened or reinstalled. The server is authoritative for trial time and entitlement. The exact expiry boundary (14 tenant-local calendar days versus 336 elapsed hours) remains an explicit product decision and must be identical across every client.

## 4. Trial workspace experience

First-login checklist:
- Company profile and legal/tax settings
- First branch and operating hours
- Add team members and roles
- Create or import items/services
- Configure warehouses, registers and payment methods
- Opening balances / opening inventory with explicit accounting guidance
- Test sale / sample workflow
- Invite accountant or branch manager
- Review backup and offline sync status

The trial workspace must be usable with realistic sample data while clearly distinguishing sample data from live business records. Importing actual company data must never silently mix with sample records. Before import, show a preview, mapping errors, duplicate detection, totals and rollback/backup plan.

Dashboard trial indicators:
- Days remaining, calculated from server timestamps
- Enabled industry pack and modules
- Seat usage and available seats, only after seat policy is approved
- Branch list and access scope
- Setup completion
- Sync/backup health
- Upgrade / contact sales action

Do not block users with repeated upsell modals. Provide persistent but non-obstructive trial status and clear feature lock explanations.

## 5. Trial expiry and conversion

Trial expiry behavior is not yet approved. The product design must support configurable outcomes without deleting tenant data:
- grace/read-only access
- export window
- retention and deletion schedule
- account reactivation
- payment failure grace period

Until approved, the design must not hard-code a deletion date or promise permanent retention.

Paid conversion:
- Keep the same tenant ID, branches, users, records, audit trail and integrations.
- Apply subscription and module entitlements transactionally.
- Do not copy the trial tenant into a new paid tenant.
- Show a before/after entitlement summary and any feature that will become unavailable.
- Preserve all existing data even if a paid module is not renewed; access behavior follows the approved retention and downgrade policy.

## 6. Customer portal sitemap

- Overview
- Company profile
- Branches
- Users & seats
- Roles & permissions
- Subscriptions & modules
- Billing & invoices
- Trial status
- Downloads & devices
- Data export / backups
- Integrations
- Security & active sessions
- Support tickets

The portal is tenant-owner/admin only where appropriate. Employees see only their profile, assigned branches, and permitted self-service features. MALVIA internal operations console is a separate application boundary and must never be linked as a customer-facing “master” route.

## 7. Download Center and installation

Initial supported delivery:
- Browser application
- Installable PWA where supported
- Platform-specific install guidance

Future native packages:
- Windows installer
- Android package
- iOS App Store distribution

A download entry appears only when a real artifact exists, is signed where applicable, has a verified version/checksum and is compatible with the user's platform. Never render placeholder download URLs or claim an app-store listing before publication.

Downloads are not the trial activation event and do not own the tenant's license. Reinstalling or switching devices must not restart the trial. Device registration, revocation and concurrent-device limits are separate policy decisions.

## 8. Navigation and page wireframe notes

### Desktop
- Header: logo, solution navigation, language switch, sign in, trial CTA.
- Industry pages: left/upper sub-navigation; central workflow content; right CTA or demo card.
- Customer portal: persistent sidebar grouped by company, people, subscriptions, data and support; central workspace; global tenant/branch selector.
- Workspace: global branch context selector with clear “All branches” state for authorized owners; every branch-specific screen repeats the active branch context near its title.

### Mobile
- Compact top bar with logo, language and account actions.
- Industry selection as stacked cards.
- Portal navigation in an accessible drawer/bottom navigation pattern.
- Branch selector as a prominent, touch-friendly control.
- Trial remaining status visible without covering operational controls.
- Tables support responsive cards or deliberate horizontal scrolling; never hide critical financial columns without an alternate detail view.

## 9. Accessibility, localization and trust

- Full keyboard navigation, visible focus and semantic form labels.
- Accessible color contrast and status not communicated by color alone.
- Arabic number, currency, date and text direction tested across forms, tables, invoices and exported files.
- Do not infer currency/tax country solely from IP address.
- Privacy, terms, data processing, backup, export and account deletion policies must be reviewed and published before public sign-up.
- Explain that each tenant's data is isolated; do not claim certifications or compliance not independently verified.

## 10. Analytics and operational events

Proposed privacy-minimized events:
- solution_viewed
- trial_cta_clicked
- signup_started / signup_completed
- verification_completed
- tenant_provisioning_succeeded / failed
- trial_activated
- onboarding_step_completed
- module_enabled
- branch_created
- invite_sent / accepted
- import_previewed / committed / rolled_back
- trial_converted
- download_started / completed

Do not put credentials, license keys, customer records, invoice line items, payment details or other sensitive business data into analytics payloads.

## 11. Acceptance criteria

- Arabic/English switching preserves selected page and form state.
- Industry selection carries through onboarding without silently activating unpurchased modules.
- Trial begins only once on the server; repeated signup attempts/reinstall/device changes cannot reset the clock.
- Tenant provisioning is idempotent and leaves no partially active account after failure.
- Owner can create multiple branches without branch-count caps; seat rules are enforced separately after approval.
- Customer portal cannot access MALVIA internal operations routes.
- Employees cannot see owner-only billing, exports or other branches without explicit permissions.
- Download Center shows only verified, available artifacts.
- Trial-to-paid conversion preserves tenant ID and all records.
- Expiry behavior is configurable and never deletes data until a separately approved retention policy executes.
- All portal/API operations are tenant-scoped and auditable.

## 12. Decisions still requiring owner approval

1. Verification: email, SMS, both, or manual approval.
2. Trial bundle: which industry pack and modules are enabled by default.
3. Trial seat count and any usage limits.
4. Trial expiry: grace period, read-only period, export window and retention/deletion schedule.
5. Payment provider, supported currencies, taxes, invoices and renewal/cancellation rules.
6. Device registration and concurrent device policy.
7. Native app release sequence and signing/distribution ownership.
8. Public pricing and support tiers.

No decision above should be silently converted into production defaults.
