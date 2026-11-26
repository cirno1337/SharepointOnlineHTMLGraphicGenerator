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

## LD-01 Minimal manifest fields (2026-11-26, about 15:27 to 15:40 local)
Method: variants built inside the browser from the stored bytes of the working generated page; only the manifest array entry changes (kept keys listed); uploaded via Create or upload -> Upload HTML page as new `sphs-lab-ld01-<variant>.html` pages; viewed in a fresh tab in view mode. Browser: Microsoft Edge (Chromium), driven through the Claude browser extension. Tenant alias `tenant-A`; workbook alias `wb-synthetic-status`. Control: `live-copy` (full manifest) rendered KPI 17 and the table. All variants keep every other byte of the page.

| ID | Kept manifest keys | Actual result | Result | Class |
|---|---|---|---|---|
| LD-01-A | spItemUrl | Page ran (loaded timestamp, Refresh) but showed "Summary B7 is unavailable." and no table. Not the "No prefetched result" error. | fail | TENANT_OBSERVED_ONCE |
| LD-01-B | spItemUrl, fileName | KPI 17 and the Issues table rendered, fresh load timestamp | **pass (minimal working manifest)** | TENANT_OBSERVED_ONCE |
| LD-01-H (extra) | filePath, fileName (no spItemUrl) | "Failed to load data: No prefetched result for <item URL>" | fail | TENANT_OBSERVED_ONCE |
| LD-01-C, D, E, F, G | supersets of B | **not run.** B already passes without filePath, label and cslViewLink, so those are not needed for rendering. Individual effects are inferred, not tested. | not run | UNKNOWN |

Field requirement matrix (observed runtime only, one tenant):

| Field | Verdict | Basis |
|---|---|---|
| spItemUrl | REQUIRED: it is the key the host prefetches and injects under; without it the page reports "No prefetched result for <url>" | LD-01-H, LD-03 |
| fileName | REQUIRED when spItemUrl is present (A fails, B passes). Mechanism unknown. HYPOTHESIS: the host derives the result format from the file extension. | LD-01-A vs B |
| filePath | NOT NEEDED for rendering (B passes without it); individual removal untested | LD-01-B |
| label | NOT NEEDED for rendering; individual removal untested | LD-01-B |
| cslViewLink | NOT NEEDED for rendering in the author's session; role for other viewers UNKNOWN (LD-07 blocked) | LD-01-B |

Do not infer security significance from runtime necessity alone: every run so far used the author's own access.

Implications: (1) Studio cannot generate a working live page offline because it cannot know `spItemUrl`; Revision 1 therefore needs manual entry of the item URL (as planned). (2) `fileName` must be emitted with it. (3) Optional fields should be emitted only when intentionally kept, since their purpose for other viewers is untested.
Security impact: unchanged from LD-00b; the page chooses what the host prefetches.
Follow-up: LD-04 (Studio CSP), LD-05 (refresh), LD-07 (blocked), LD-08 (local fixtures).
Tenant files created in this lab: sphs-lab-ld01-a.html, sphs-lab-ld01-b.html, sphs-lab-ld01-h.html (Site Pages). Nothing deleted, renamed or overwritten; no sharing change.

## LD-04 Studio CSP compatibility (2026-11-26, about 15:40 to 15:45 local)
Control: `live-copy` (working LiveData page, no CSP meta; renders KPI 17 and the table). Browser: Microsoft Edge (Chromium). Tenant `tenant-A`, workbook `wb-synthetic-status`. Method: only a `<meta http-equiv="Content-Security-Policy">` inserted as the first element of `<head>`; uploaded as a new page; viewed in a fresh tab in view mode. Studio's policy was not loosened for the first test.

| ID | CSP meta added | Actual result | Result | Class |
|---|---|---|---|---|
| LD-04-B | `default-src 'none'; style-src 'unsafe-inline'; img-src data:` (Studio's exact policy) | Static markup and styling rendered (lede text, Refresh button) but no "Loaded" timestamp, no KPI, no table: the inline script did not run. | **fail (expected from CSP semantics: script-src falls back to default-src)** | TENANT_OBSERVED_ONCE |
| LD-04-C | `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:` | KPI 17, Issues table, fresh "Loaded" timestamp and Refresh button all rendered | **pass** | TENANT_OBSERVED_ONCE |

Observations:
- The CSP meta survives in the stored file byte-for-byte and stays first in `<head>` (stored size 19,146 vs 19,195 uploaded).
- The server response header on the page file contains only a `frame-ancestors` list (Microsoft hosts); it has no script-src, style-src or default-src (checked on the LD-04-B file). So the meta policy is the only script policy applied to the page document by that header. Whether the host adds a CSP to the sandboxed frame document itself is UNKNOWN (the frame is a `blob:` document; its headers are not observable from the page).
- Console CSP errors were not accessible (no DevTools through the extension). The failure signature is inferred from rendering only.
- The host injection of `window.__LD_RESULTS__` and the page's own inline script both worked under the C policy, so the host does not need any other directive that Studio omitted (no connect-src, no frame-src, no script-src host allow-list).

Minimal required change from Studio's current CSP: add `script-src 'unsafe-inline'`. Not tested: whether a hash or nonce would work instead (see below), `script-src 'unsafe-inline'` with `default-src 'none'` vs without; refresh under CSP (LD-05).
Security tradeoff: `script-src 'unsafe-inline'` allows any inline script in the document, so the CSP no longer blocks injected inline script. Mitigations: all dynamic text is escaped before emission, workbook data is only ever inserted as text, `default-src 'none'` still blocks connect-src, frames, objects, fonts, images except data:, workers and external scripts; `base-uri` and `form-action` are still unset (they do not fall back to default-src).
Nonce/hash practicality (HYPOTHESIS, reasoning not tested): a nonce in an uploaded static file is not secret (same bytes for every viewer), so it adds no protection against an attacker who can edit the file; a hash is possible but fragile: SharePoint rewrote the stored file (34-byte difference seen in the live-copy upload; mso block and xmlns attributes are inserted), and a comment in the generated runtime says the host's security layer rewrites some script globals, so a hash of the script text could silently stop matching. Hash testing is a follow-up experiment.
Security impact: Studio's interactive profile must differ from the static profile only in `script-src 'unsafe-inline'`; the static profile keeps the current policy and no script.
Follow-up: add `base-uri 'none'; form-action 'none'` to the interactive profile only after a tenant test shows they do not break rendering (UNKNOWN today); LD-05.
Tenant files created: sphs-lab-ld04-b.html, sphs-lab-ld04-c.html (Site Pages). Nothing deleted, renamed or overwritten; no sharing change.

## LD-05 Refresh semantics (2026-11-26, about 15:43 local) : BLOCKED_REQUIRES_APPROVAL
Setup done: live page `sphs-lab-ld04-c.html` (working variant) loaded in its own tab showing KPI 17, "Loaded 15:42:57". The synthetic workbook `wb-synthetic-status` was opened for editing in Excel for the web in another tab.
Blocker: before editing, Excel for the web showed a banner "Add sensitivity label: your organization requires you to label this document before editing" with a "Select label" button. Choosing a sensitivity label is a compliance/classification setting on the organization's data; it was not authorized, so no label was chosen and the workbook was not edited. The only interaction was a click that selected an empty cell (B5, because the banner shifted the grid). Summary!B7 is unchanged (17).
Result: blocked, not inconclusive. No refresh claim is made. Class for refresh behavior: UNKNOWN (the Refresh button was not yet exercised; the generated runtime posts `{type:'ka-html-viewer-refresh'}` to the parent, which is a documented-by-code observation only).
Needs approval: which sensitivity label (if any) to apply to the synthetic workbook, or an alternative way to change B7 (for example uploading a new version of the file, which also needs approval because it replaces content).
Tenant side effects: none beyond the pages listed above. The workbook still has the view-only sharing link created earlier with approval.
