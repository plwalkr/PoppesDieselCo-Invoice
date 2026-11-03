# Vehicle record contract — schema 1

The existing browser database and storage key remain in use. This is an additive relationship layer, not a new database or parallel application.

| Record | Relationship and source of truth |
| --- | --- |
| Customer | Existing `customers[].id`; optional `archivedAt` hides the customer from new-work selectors without deleting history. |
| Vehicle | New `vehicles[].id`; normalized VIN, identity fields, customer references, private technical notes and structured recommendations. |
| Job / repair order | Existing `jobs[].id` and `customerId`, with optional `vehicleId`. Original vehicle fields remain historical ticket snapshots. |
| Estimate / invoice | Existing job `docType`, document number, approval, lines and payment fields. No duplicate estimate/invoice calculation or record is introduced. |
| Diagnostic record | Existing per-job `diagnosticRecord`; the vehicle timeline reads it through the job relationship. Future sessions/measurements can extend this model. |
| Attachments | Existing job photos and `sourceDocumentIds`; the timeline references the source ticket rather than duplicating media. |

## Migration and identity

- `shopOsSchemaVersion: 1` records the additive foundation. Old backups without `vehicles` remain valid and migrate when loaded.
- Repeated migration preserves vehicle IDs, notes, recommendations, customer/job IDs and financial snapshots.
- Automatic shared history requires the same complete 17-character VIN after trimming and uppercasing. Format matching does not validate a VIN checksum, ownership or fitment.
- Missing/incomplete VINs stay separate even when customer, year, make and model match. Existing explicit `vehicleId` links remain usable. Customer-only vehicle descriptions create unlinked descriptive records if no other vehicle record exists for that customer.
- An operator can explicitly link the current ticket. Conflicting nonempty VINs are blocked. A changed ticket VIN does not rename another vehicle or erase its memory.
- VIN corrections/manual linking can leave an older record without tickets. It is retained to protect notes and recommendations; merge/unlink/archive tools require a later identity-review workflow.
- Vehicle identity is a projection of the latest nonempty linked ticket fields. Original job identity and customer references remain unchanged. Customers on service records are recorded associations, not verified ownership transfers.
- Mileage history reads actual ticket odometer values, including zero, and identifies the source ticket/date. It does not invent past readings or use the highest mileage as a substitute for chronology.

## Recommendations and technical memory

Recommendations contain `id`, `text`, `system`, `status`, optional `sourceJobId`, and timestamps. Statuses are Open, Deferred, Resolved and Declined. Older freeform advisories keep their original text and an unknown status until an operator explicitly starts tracking them.

Technical notes, recommendations, diagnostics and historical work are private shop data. Full JSON backups retain them. Customer PDFs keep the existing document scope; they do not embed the vehicle collection or its technical memory. Existing job-cost recovery metadata remains a separate documented risk.

No health scores or repair outcomes are inferred from invoices. A quoted part is labeled as a recorded line, rather than proof of installation. Further structured diagnostics, verified system assessments and cross-vehicle knowledge search are later phases.

## Rollback

Export a full JSON backup before production upgrade. Reverting the UI code does not roll back browser/cloud data. The earlier application may ignore additive fields and cannot manage their relationships; use a known pre-upgrade backup if a full data rollback is required. Whole-database import/cloud load still replaces the local snapshot, including vehicle memory.
