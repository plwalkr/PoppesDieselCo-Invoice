# Poppe’s Diesel Co. Shop Manager

Continued from the existing GitHub Pages application, not a replacement app.

## Baseline and architecture

- Production inspected October 5, 2026: **v1.5.25 (2026-06-14)**.
- Baseline commit: `728fa3fef0e832cf5708b777fe1dc8df7ea155a2` on `main`.
- Latest successful Pages deployment inspected: run `27507910596` for that commit.
- `index.html` contains the UI, styles, calculations, diagnostics, and persistence. There is no application build step, framework, or local server backend.
- `index1.html` is the older v1.5.23 copy and remains untouched.
- Local database: `poppe_shop_db_v112`; UI state: `pdc_ui_state`; watermark: `pdc_wm_dataurl`. Existing keys and database format are retained.
- Optional cloud backup uses Supabase JS v2 from jsDelivr, Supabase authentication, shop organization lookup, and whole database snapshots. No backend credentials or policies were changed.
- PDF import uses pdf.js 3.11.174. PDF generation uses a print iframe and the browser print dialog, with an embedded recovery payload. Full JSON import/export remains available.
- VIN decoding uses the existing NHTSA endpoint. Calendar exports use the existing ICS workflow. Email actions use the existing mailto workflow.

## Local development

Serve this directory with any static HTTP server, for example `python -m http.server 8765 --bind 127.0.0.1`, then open `http://127.0.0.1:8765/`.

Localhost has separate browser storage from production. Use disposable records for testing. Do not upload real backups to this public repository.

## Regression checks

Install test-only dependencies with `npm ci` and run `npm test` (or `node tests/workflow.test.cjs`). Node 20 or later is recommended. Deployment does not require Node or these dependencies.

The tests load the actual HTML application in an isolated DOM with synthetic records. External CDN/network services and signature drawing are not exercised by those tests. Browser validation and deployment limits are recorded in [CHANGELOG.md](CHANGELOG.md).

## Deployment

The inspected Pages setup deploys `main`. Changes on the review branch do not replace the production app. Before merging, export a production JSON backup and complete the remaining checks in the changelog. Reverting the application commit restores the prior code; it does not restore browser or cloud data.
