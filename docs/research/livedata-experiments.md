# LiveData experiment ledger

Evidence classes: `MICROSOFT_DOCUMENTED`, `TENANT_OBSERVED_REPRODUCED` (more than once), `TENANT_OBSERVED_ONCE`, `HYPOTHESIS`, `FAILED_IN_CURRENT_TEST`, `UNKNOWN`. Nothing here is promoted beyond its class. Tenant alias: `tenant-A` (single tenant). Workbook alias: `wb-synthetic-status` (Studio's synthetic fixture). Browser: Microsoft Edge (Chromium) driven through the Claude browser extension; exact version not recorded. Identifiers (host, drive id, item id, sharing links) are never recorded here.

## Completed before this milestone (2026-11-26, Studio baseline a0525ce plus Copilot-generated page)

### LD-00 Generated live page renders
- Source page: Copilot-created page from `wb-synthetic-status` (name withheld). Variable: none. Control: n/a.
- Expected: unknown. Actual: view mode showed KPI 17 and the 3-row Issues table with a Refresh button; edit mode showed a banner "Live data isn't available while editing" and a "No prefetched result" error.
- Result: pass. Class: `TENANT_OBSERVED_ONCE` (generation done once; view-mode behavior re-observed on each copy below). Security impact: page makes no network calls. Follow-up: LD-01.

### LD-02 Marker requirement
- Variable: removed `<meta name="ms-sp-authoring-source" content="agent">`. Control: byte copy of the generated page (live-copy).
- Expected: unknown. Actual: both rendered 17 and the table with fresh load timestamps. Marker confirmed absent in stored variant.
- Result: pass (marker not required). Class: `TENANT_OBSERVED_ONCE` (one variant tested). Evidence: screenshot of the view, retrieved-file regex check. Security impact: none. Follow-up: repeat once in LD-01-G to upgrade to REPRODUCED.

### LD-03 Manifest requirement
- Variable: removed the `ka-livedata-manifest` script, page CONFIG kept. Control: live-copy.
- Actual: error "No prefetched result for <item URL>"; KPI and table did not render.
- Result: pass (manifest required for prefetch). Class: `TENANT_OBSERVED_ONCE`. Security impact: the host trusts page-supplied manifest content to choose what to prefetch; permission behavior is untested (LD-07). Follow-up: reproduce in LD-01.

### LD-00b Uploaded copy receives data
- Variable: page uploaded through Site Pages -> Create or upload -> Upload HTML page instead of created by Copilot. Control: Copilot-created page.
- Actual: identical live render. Stored size 19,032 bytes vs 19,066 source.
- Class: `TENANT_OBSERVED_REPRODUCED` (live-copy and live-nomarker both uploaded and both worked). Security impact: any page author can reference any workbook item URL they know; whether the host enforces the viewer's access is LD-07.

### Canvas edit / Copilot write-back (not LiveData)
- Class: `FAILED_IN_CURRENT_TEST` (documented as supported). See `docs/issues/copilot-and-canvas-edit-failures.md` once written.

## Planned in this milestone (not yet run)
LD-01 minimal manifest fields; LD-04 Studio CSP compatibility; LD-05 refresh semantics (needs the synthetic workbook edited, approved designation); LD-06 multiple sources (needs a second authorized workbook, otherwise BLOCKED_REQUIRES_APPROVAL); LD-07 permission behavior (BLOCKED_REQUIRES_APPROVAL: needs a restricted test user); LD-08 failure states (local fixtures).

## LD-01 Minimal manifest fields (in progress, 2026-11-26 ~15:27 local)
Method: variants built inside the browser from the stored bytes of the working generated page; only the manifest array entry changes (kept keys listed); uploaded through Create or upload -> Upload HTML page as new `sphs-lab-ld01-<variant>.html` pages; viewed in a fresh tab in view mode. Browser: Microsoft Edge (Chromium). Studio commit: n/a (hand-built variants). Control: live-copy (full manifest) rendered KPI 17 and the table.

| ID | Kept manifest keys | Result | Class |
|---|---|---|---|
| LD-01-A | spItemUrl | Page ran (Loaded timestamp shown, Refresh button) but showed "Summary B7 is unavailable." and no Issues table. This is NOT the "No prefetched result" error seen when the whole manifest is removed. The host returned a result for the key, but the page could not find the Summary sheet in it. | TENANT_OBSERVED_ONCE |
| LD-01-B | spItemUrl, fileName | Uploaded as sphs-lab-ld01-b.html; **not yet viewed** (browser window went black before viewing) | UNKNOWN |
| LD-01-C..G | not yet uploaded | not run | UNKNOWN |

Hypothesis (HYPOTHESIS, untested): the host may use `fileName` (its extension) to choose the result `format`; without it the content may not arrive as the `xlsx-sheets` envelope. LD-01-B decides this.
Security impact so far: none beyond LD-00b (page-chosen item URL).
Follow-up: view B; then upload and view C, D, E, F, G; classify each as REQUIRED / OPTIONAL / NOT USED / INCONCLUSIVE.
Tenant files created in this lab so far: sphs-lab-ld01-a.html, sphs-lab-ld01-b.html (Site Pages). Nothing deleted or overwritten.
