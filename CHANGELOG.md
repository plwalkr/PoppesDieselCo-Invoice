# Changelog

## v1.5.28 — 2026-10-05 — neutral palette and repair workspace, not deployed

### Changed

- Kept the established layout and original logo; replaced the ivory/green workspace with white panels, charcoal navigation, neutral gray backgrounds, and restrained logo-red actions. Darkened secondary text, labels, placeholders, estimate badges, and totals for readability.
- Corrected low-contrast calendar export/email, PDF import, signature-save buttons, and diagnostics warning/error badges. Preserved status colors where they convey payment or save state.
- Added persistent vehicle/customer/ticket context and a current-ticket selector shared across the four repair panels. It follows the existing search/customer filters while keeping the open form reachable. Work status remains separate from approval and payment.
- Added a searchable service library using existing shop templates, plus packages saved from ticket labor, diagnostic, parts, and warranty lines. Labor uses the incoming ticket's rates; saved parts keep quantities, pricing, markup, and line notes. Ticket adjustments and overall notes are excluded. Package prices entered into money fields use whole cents.
- Added ticket-specific diagnostic worksheets for concern, codes, checks, findings, correction, and verification. These stay out of customer PDF previews/recovery. An explicit action appends selected findings to customer notes, preserving existing notes and excluding private test/code fields.
- Added service history matched by normalized VIN. Without a VIN, the panel clearly shows the customer's other tickets. History opens the exact record.
- Added keyboard-operable repair tabs and responsive panels. The new module delegates to existing record ownership, pricing, tax, deposit, warranty, storage, and document logic.

### Verification

- All 26 regression tests pass, including worksheet ownership/privacy, customer-summary append, saved package quantities/markup/rate selection, VIN history, independent work status, literal stored-text rendering, cents formatting, and the visible ticket selector's filtering/ownership behavior.
- The browser build reports 23/23 startup checks. No runtime errors were observed; the remaining warning correctly identifies an unpaid parts deposit on a synthetic ticket.
- All six sections checked at 390×844, 1024×1000, and 1440×1000 without page-wide horizontal overflow. All four repair panels were also checked at phone/tablet sizes.
- Sampled visible labels, secondary text, placeholders, controls, summaries, and badges meet the 4.5:1 contrast threshold against computed solid backgrounds after corrections. Expanded pricing, Quick Estimate, and signature dialogs were checked. This is a targeted audit, not a full accessibility certification or gradient/image sampling audit.
- Browser: saved a synthetic Cummins package, reloaded, searched it, and applied it to a fresh ticket. Five lines loaded with unit prices 100.00, 53.20, 44.80, 15.20, and 105.30; the existing calculation produced a $218.50 parts deposit. Worksheet text stayed with its ticket during switching without changing existing service/diagnostic totals.
- Desktop and phone screenshots are saved in ignored `test-results/`. Only synthetic localhost records were used.

### Remaining before deployment

- Review the neutral design in the local preview and draft PR #1. Production remains v1.5.25 on `main`.
- This borrows vehicle-centered estimating/workflow ideas from ProDemand; it does not include licensed OEM labor times, repair procedures, wiring diagrams, or an external repair-information integration. Shop templates require fitment, hours, and price review.
- Define a consistent financial rounding policy before changing the legacy calculator: the tested $323.50 subtotal plus tax displays $15.65 tax but $339.14 total because raw floating-point tax is added before display rounding. New package fields show cents, but tax/total rounding rules remain unchanged in this pass.
- Saved packages currently support adding and searching; package editing, deletion, versioning, and pricing updates remain future work.
- Previous PDF/iPhone, cloud security/conflict, cost-metadata recovery, and attachment-storage checks below remain open. Deploy `index.html`, `shop-theme.css`, `service-desk.js`, and the logo together.

## v1.5.27 — 2026-10-05 — branded service desk, not deployed

### Changed

- Added the owner's original eagle logo, unchanged, to the navigation, browser icon, and customer invoice/estimate header. Kept the established watermark controls.
- Replaced the decorative dashboard shell with a dark ink navigation rail, ivory workspace, restrained red actions, consistent forms/tables, and clearer page headings. Phone navigation stays visible while scrolling and brings the active section into view.
- Added New job and View schedule shortcuts that use the existing workflows. They do not create placeholder records.
- Made margin/collection alerts, required deposits, follow-ups, and recent activity open the exact linked job. Recent activity sorts using record IDs/dates rather than ambiguous customer/title text.
- Put editable line items before the totals. Kept total, balance, deposit, profit, and margin visible; moved supporting calculations into an expandable breakdown. Rates, taxes, and payments remain available in a clearly labeled expandable panel.
- The theme is a separate screen-only stylesheet. Customer PDF generation keeps its established Letter layout, recovery data, privacy fix, and image-loading wait, with a compact logo added to the header.
- Retained database keys, shop settings, pricing calculations, deposits, tax, warranty rules, and the v1.5.26 reliability fixes.

### Verification

- All 18 regression tests pass: the prior 15 plus exact dashboard job links (including duplicate labels), deposit/margin links, and workspace shortcuts/headings. The generated print-document check also verifies the absolute logo URL.
- Browser: every section checked at 390×844, 1024×1000, and 1440×1000 with no page-wide horizontal overflow. Phone payment fields use 16px text; line-item pricing stays in a separate keyboard-scrollable region; navigation remains at the top during scrolling.
- Browser: a $12.50 payment remained on the service ticket after opening a different ticket from Recent Activity and switching back. Service and diagnostic totals remained $210.70 and $158.03. The disposable payment was reset to $0 afterward.
- Quick Estimate opens and closes in the new theme. Schedule Week/Month controls and document preview are checked separately in the browser. The real CDN build reports 22/22 startup checks.
- Screenshots in ignored `test-results/` show desktop, phone, and invoice preview. Synthetic QA records were used; production records were not changed.

### Remaining before deployment

- Review the new design in the local preview and existing draft PR #1. Production remains v1.5.25 on `main`.
- Verify actual Save as PDF and pagination with the new logo on desktop and iPhone. The print-document structure is tested, but the browser's native print/save handoff is not automated.
- The original logo is about 1.7 MB. It is served locally with the app; all theme/asset files must be deployed together. Any future optimized derivative should preserve the owner's original artwork.
- The prior risks below still apply: customer PDF recovery includes cost metadata, cloud access/security and snapshot conflicts need owner-account testing, and large attachments can exhaust browser storage. This visual release does not turn the current local-storage app into a multi-user commercial platform.

## v1.5.26 — 2026-10-05 — review branch, not deployed

### Changed

- Fixed invoice switching so the outgoing form cannot overwrite the newly selected job. Loading now uses the requested job ID explicitly.
- Preserved the open invoice during job searches, customer filtering, and customer-list refreshes. Creating a ticket opens its own clean invoice.
- Fixed reimporting the currently open document so imported lines and notes survive the tab transition.
- Kept payment decimals editable and cleared paid status when a balance remains. Preserved zero line quantities on reload.
- Made navigation scroll horizontally, kept mobile navigation visible while scrolling, restored page zoom, improved touch targets and date fields, and compacted mobile money/document fields.
- Contained the wide line-item table in a keyboard-accessible horizontal scroll area. Notes can grow, resize, and scroll, including after switching from a hidden tab. Screen preview totals now wrap into a readable grid.
- Prevented mouse-wheel changes to focused number inputs while allowing normal page scrolling. Added field labels and keyboard focus indicators.
- Showed local save failures persistently. Invalid stored JSON is protected from automatic overwrite; older databases without settings still upgrade.
- Used the existing financial calculation for job/recent-job totals, including diagnostic minimums, warranty treatment, supplies, discounts, and tax.
- Escaped customer/job text and invoice notes in the edited HTML rendering paths.
- Excluded shop-only internal notes from the customer PDF recovery payload. Full JSON backups retain them. Existing PDF exports are unaffected.
- Added four startup checks for save health, form ownership, cloud client availability, and PDF library availability. Library checks do not prove backend connectivity or authorization.

### Verification

- 15 isolated regression tests cover switching, filtering, ticket creation, quantities, literal HTML, payment entry/state, wheel behavior, financial totals, diagnostic minimums, parts deposits/tax, warranties, private notes, storage failures, legacy upgrades, reimport, and generated print recovery text.
- Baseline comparison before the final additions: v1.5.25 failed 9 of 12 regression cases; its three business-rule checks passed. The patched build passed all 12 at that stage.
- Browser: live production v1.5.25 showed 18/18 startup checks; local v1.5.26 showed 22/22 with the real CDN libraries.
- Browser: two separate tickets retained their notes and prices across selection, filtering, and reload. Two-hour service: $210.70; half-hour diagnostic with the existing minimum: $158.03.
- Responsive checks at 390×844 and 1440×1000: no page-wide horizontal overflow, pricing columns reachable, mobile navigation remains at the top during scrolling. Local screenshots are in ignored `test-results/`.
- Schedule Week/Month view switching was checked. The generated PDF action reached the native print handoff, where browser automation timed out; final PDF save and pagination are not verified.

### Remaining checks and risks before deployment

- Export a full production JSON backup before upgrading; preserve originals of historical PDF/intake documents.
- Verify actual Save as PDF, multiple pages, photos, signatures, and recovery import on iPhone Safari and desktop Chrome/Edge. Responsive Chromium testing is not a real iPhone test.
- Verify authenticated Supabase save/load, row-level security, and snapshot conflicts with the owner's account. No real records were uploaded or replaced during this work.
- PDF recovery text still includes line costs and pricing metadata under the existing recovery design. It is base64, not encryption. Review whether customer PDFs should omit those fields; use JSON backups for complete shop recovery. Older PDFs may also contain private notes.
- Legacy pricing rules still replace some zero/80/100 labor or diagnostic prices, and some zero-valued money settings fall back to defaults. These were retained to avoid changing pricing policy without a dedicated review.
- Customer deletion still deletes associated jobs; review appointment/document references and recovery behavior before redesigning deletion.
- Whole-database localStorage saves run on input. Large photos can exhaust browser storage; the new warning makes failure visible, but larger attachment storage and save batching remain future work.
- The Supabase CDN URL follows major version 2 rather than an exact version. Dependency pinning, offline support, modularization, and a broader HTML-safety audit remain future work.
- `main` still serves v1.5.25. This review branch requires merge approval before production deployment.
