# LiveData controlled tenant test protocol

Purpose: validate Studio's own Interactive Safe export and runtime in a real tenant, and settle the questions the lab left open. **Do not start any step that changes sharing, permissions or tenant files without explicit approval from the tenant owner.** Use synthetic data only. Nothing here claims compatibility until results are recorded.

Prerequisites: Studio built with `VITE_EXPERIMENTAL_EXCEL_LIVE=true`; a synthetic workbook (`fixtures/project-status.xlsx` shape: `Summary!B7 = 17`, a table `Issues`) in a test library; permission to upload pages to a test Site Pages library; the workbook's item URL provided by the test owner (never commit it).

## LD-09: addressing and envelope fidelity (run first; read-only apart from uploading a new test page)

Goal: determine whether CSV row 1 / column 1 of the injected data is Excel cell A1, whether a line break follows `<sheet name="...">`, and what `metadata` and number/date text look like.
1. In Studio add the source, then **Download LiveData probe page (LD-09)**.
2. Upload it as a new, clearly named page (`sphs-lab-ld09-probe.html`). Do not overwrite anything.
3. Open it in view mode and read the output: result fields, format, content start, per-sheet line numbers with blank lines visible.
4. Record: on which line `Open issues,17` appears (line 7 means rows are positional; line 1 means leading blank rows are dropped); whether the first CSV column is column A; any metadata keys; how numbers and dates are written.
5. Outcomes: positional from A1 -> upgrade `live-addressing` to a confirmed note. Otherwise -> **change the runtime's addressing before any further test** (do not ship the A1 assumption).

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
