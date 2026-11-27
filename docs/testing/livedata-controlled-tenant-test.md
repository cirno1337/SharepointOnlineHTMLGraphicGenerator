# LiveData controlled tenant test protocol

Purpose: validate Studio's own Interactive Safe export and runtime in a real tenant, and settle the questions the lab left open. **Do not start any step that changes sharing, permissions or tenant files without explicit approval from the tenant owner.** Use synthetic data only. Nothing here claims compatibility until results are recorded.

Prerequisites: Studio built with `VITE_EXPERIMENTAL_EXCEL_LIVE=true`; a synthetic workbook (`fixtures/project-status.xlsx` shape: `Summary!B7 = 17`, a table `Issues`) in a test library; permission to upload pages to a test Site Pages library; the workbook's item URL provided by the test owner (never commit it).

## LD-09: addressing and envelope fidelity (DONE 2026-11-27: positional A1 disproven; see livedata-experiments.md)

Goal: determine whether CSV row 1 / column 1 of the injected data is Excel cell A1, whether a line break follows `<sheet name="...">`, and what `metadata` and number/date text look like.
1. In Studio add the source, then **Download LiveData probe page (LD-09)**.
2. Upload it as a new, clearly named page (`sphs-lab-ld09-probe.html`). Do not overwrite anything.
3. Open it in view mode and read the output: result fields, format, content start, per-sheet line numbers with blank lines visible.
4. Record: on which line `Open issues,17` appears (line 7 means rows are positional; line 1 means leading blank rows are dropped); whether the first CSV column is column A; any metadata keys; how numbers and dates are written.
5. Result: leading blank rows are dropped (Outcome B). A1 addressing of live data is disabled (D-020). LD-10 must not run with a Live KPI until a verified selector exists; the probe page remains the diagnostic tool.

## LD-10: Studio export in the tenant

1. Export an Interactive Safe page with one Live KPI (`Summary!B7`) and a snapshot fallback; keep the validation report and SHA-256.
2. Upload through Site Pages (Upload HTML page) as `sphs-lab-studio-live-kpi.html`.
3. Check in view mode: value, "Loaded from SharePoint at ...", the hint text, Refresh (message posted, button disabled, status text), no console CSP errors, stored-file transformations, frame sandbox.
4. Check in edit mode: the editor message and the labelled fallback.
5. Check that a missing/renamed worksheet and a bad cell show the expected states.

## LD-05 follow-up: refresh latency

Change a synthetic value, then click Refresh repeatedly at known intervals (no polling code exists in the page) and record when the new value first appears. Needs the test owner to allow editing the synthetic workbook (and any sensitivity label requirement).

## LD-06: multiple sources (`BLOCKED_REQUIRES_APPROVAL`)

Needs a second already-authorized synthetic workbook. Test: two manifest entries, one value from each, distinct keys; a duplicate entry; one valid plus one invalid source (the invalid one must not break the other). Do not create sharing links to run it.

## LD-07: permission behavior (`BLOCKED_REQUIRES_APPROVAL`, REQUIRED security gate)

Needs explicitly authorized test users and permission changes made by the tenant owner.
- A. Author with page and workbook access: expect data.
- B. Viewer with page and workbook access: expect data.
- C. Viewer with page access but **no** workbook access: expect **no workbook data** (an error or unavailable state).
**Invariant:** a viewer without workbook authorization must not receive workbook data. If C shows data: stop LiveData release work, mark a `SECURITY BLOCKER`, preserve sanitized evidence (what appeared, not the data), and do not attempt to work around permissions.
Until A to C are recorded the readiness class cannot exceed `READY_FOR_CONTROLLED_TENANT_TEST`; `READY_FOR_LIMITED_PILOT` requires LD-07 to pass.

## Evidence rules

Follow the secrecy rules in `real-tenant-baseline.md` (no HAR, no headers, no tokens, no host names). Record results in `docs/research/livedata-experiments.md` using its template and classify each as `TENANT_OBSERVED_ONCE`, `TENANT_OBSERVED_REPRODUCED`, `FAILED_IN_CURRENT_TEST`, `HYPOTHESIS` or `UNKNOWN`.

## LD-10 (exact next test): Studio's own export with a `label-adjacent` KPI

Preconditions: this milestone's build with `VITE_EXPERIMENTAL_EXCEL_LIVE=true`; the existing synthetic workbook (rows `Open issues | 23` and `Doubled | 46` on `Summary`); a Studio source for it (item URL typed by the tester, never committed). **No workbook, sharing or permission change is needed.**
1. In Studio add the source, add a Live KPI: worksheet `Summary`, row label `Open issues`, Column 1, offset 1, a snapshot fallback of `0`, case-insensitive and trim on. Add a second KPI with label `Doubled`. Export Interactive Safe; keep the validation report and the file SHA-256 (the report contains the label length only).
2. Upload as a NEW page named `sphs-lab-studio-label-adjacent.html` (do not overwrite anything).
3. View mode: expect `23` and `46` (or the workbook's current values), "Loaded from SharePoint at ...", the hint, no console CSP errors; Refresh posts only the fixed message and disables for about 8 seconds; no fallback badge.
4. Compare the stored file with the export: is `data-sphs-label` unchanged, which attributes did SharePoint rewrite, did the inline runtime survive byte for byte?
5. Edit mode: the editor message and the labelled fallback.
6. Failure checks that need no workbook change: add a third KPI with a label that does not exist (expect `No row matched the label ...` and its fallback) and one with `valueOffset` 5 (expect the missing-value message).
Record sanitized results in the ledger as `TENANT_OBSERVED_ONCE` or `FAILED_IN_CURRENT_TEST`. If the value is wrong or the runtime is altered, stop and do not widen the experiment.

## LD-11 (proposal; needs separate approval because it changes a workbook)
A second synthetic worksheet that separates "trimmed" from "positional" for columns and interior rows: a label in `C3` with its value in `D3`, a label in `A6` with its value in `B6`, a fully blank row 4 and a blank column B. Upload the LD-09 probe page again against it and record which leading columns and interior rows survive. This settles audit item S3 and decides whether `matchColumn` needs a different meaning.
