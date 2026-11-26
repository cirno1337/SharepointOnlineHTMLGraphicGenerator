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

## LD-05 Refresh semantics (2026-11-26, about 15:42 to 15:49 local)
Setup: live page `sphs-lab-ld04-c.html` (LD-04-C variant: working page with `script-src 'unsafe-inline'` CSP) loaded in its own tab, showing KPI 17, "Loaded 15:42:57". Browser: Microsoft Edge (Chromium). Tenant `tenant-A`, workbook `wb-synthetic-status`.
Authorization events: Excel for the web first blocked editing with a sensitivity-label requirement; the owner then instructed to set up the label "General", which was applied (no other label, no other setting). No sharing change.
Steps and observations:
1. Applied label General (banner cleared, document showed Saved).
2. Changed Summary!B7 from 17 to 23 (formula cell B8 showed 46, consistent with the fixture formula `=B7*2`; an earlier note misread the formula bar as `=B7^2`, which would give 529); autosave completed (cloud-check icon), about 15:44 to 15:45.
3. The live page was NOT reloaded. Left it idle: no automatic update (page shows "Loaded 15:42:57", value 17). The page does not poll.
4. Clicked only the page's Refresh button at about 15:46:07: the "Loaded" timestamp changed to 15:46:07 (so the frame re-initialised and the host re-ran its prefetch), but the value stayed **17**.
5. About 90 seconds idle, no change.
6. Clicked Refresh again at about 15:48:36: "Loaded 15:48:36", value **23**.
Result: refresh by the page's own button works without a manual page reload (pass), but the data seen by the first refresh (about 1 to 2 minutes after the save) was stale. A propagation or caching delay of between roughly 1 and 4 minutes after the workbook edit is likely (HYPOTHESIS: server-side caching of the prefetch or of the converted sheet content; exact delay UNKNOWN, one observation).
Class: refresh re-prefetches: TENANT_OBSERVED_ONCE. Staleness after the first refresh: TENANT_OBSERVED_ONCE. Page does not auto-poll: TENANT_OBSERVED_ONCE.
Not measured: whether the iframe element itself was replaced (the Loaded timestamp changing implies at least a script re-run); errors or banners (none visible).
Security impact: the page can show data that is minutes stale without any indication; Studio's UI should show the loaded timestamp and must not describe the value as real time.
Follow-up for the implementation: show "Loaded <time>" and the refresh result; document the delay; debounce Refresh.
State left in the tenant: workbook label General applied; Summary!B7 left at **23** (not restored; restoring needs no sharing change but was not requested). The workbook still has the view-only sharing link from earlier.

## Correction note (evidence consistency), recorded before the implementation phase
Summary!B8 in the synthetic workbook is `=B7*2` with cached result 34 (verified in the generator `tests/helpers.ts`, in the committed fixture `fixtures/project-status.xlsx` raw XML `<f>B7*2</f><v>34</v>`, and by a new regression test that asserts formula text and cached result separately). The tenant observation (B8: 34 -> 46 when B7 went 17 -> 23) matches `B7*2`. The earlier LD-05 note of `=B7^2` was a misreading of the Excel formula bar and has been corrected; `B7^2` would have produced 529. No tenant workbook change was made to normalise this.

## Implementation-phase additions (2026-11-26, local only; no tenant operations)

### LD-01-A reinterpreted (HYPOTHESIS, from reading the generated page's code)
The Copilot-generated page's `render()` read the KPI as `headers[1]` of the first NON-BLANK line of the Summary CSV (it filtered blank lines before parsing) and showed "Summary B7 is unavailable" when that line had fewer than two columns. So the LD-01-A message means the sheet text it received did not parse to a two-column first line; it does not prove the host returned no data. It also means the lab never exercised positional addressing: whether CSV row 1 / column 1 is Excel A1 is UNKNOWN. Studio assumes it is, shows the `live-addressing` warning, and ships a probe page to settle it (LD-09).

### Evidence classification review
- LD-02 (marker not required): `TENANT_OBSERVED_ONCE` (one variant; LD-01 variants B and H never carried it either, which is consistent but is not a repeat of the same test).
- LD-03 (manifest required): `TENANT_OBSERVED_REPRODUCED` (removing it failed in LD-03, and a manifest without `spItemUrl` failed in LD-01-H with the same message).
- Uploaded pages receive data: `TENANT_OBSERVED_REPRODUCED` (several uploaded variants).
- Provider-level classification used in code: `tenant-observed-reproduced` (manifest mechanism), while individual field findings keep their own class.

### LD-06 multiple sources: `BLOCKED_REQUIRES_APPROVAL`
No second already-authorized synthetic workbook exists and creating one would need a sharing link. Not run. Local coverage only: manifest deduplication, distinct sources, invalid source skipped, and per-KPI isolation are unit-tested against Studio's runtime.

### LD-07 permission behavior: `BLOCKED_REQUIRES_APPROVAL` (required security gate)
Not run. Protocol in `docs/testing/livedata-controlled-tenant-test.md`. LiveData is not approved for limited pilot until it passes.

### LD-08 failure states: local fixtures, done
Covered by unit tests against the exact exported runtime run in an isolated VM, and by e2e in a real browser: missing `__LD_RESULTS__`, missing key, `error`/`errorCode`, empty content, unsupported format, malformed envelope, missing worksheet, missing cell, bad address, empty cell, duplicate sheet names (first wins), Unicode sheet names, quoted commas/quotes/newlines, CRLF/LF/CR, BOM, formula-, markup- and script-looking values, oversized input (content, sheets, rows, columns, cell length). No tenant action was needed. Class: not a tenant observation; behavior of Studio's own code.

### LD-09 envelope and addressing fidelity probe: PLANNED
`renderProbePage` generates the diagnostic page; protocol in the controlled tenant test document. Not uploaded (no tenant operations in this phase).

### Read-only inspection performed during this phase
One read-only fetch of the Copilot-generated page's stored file from the author's browser to read how it indexed CSV rows. No tenant content was changed.
