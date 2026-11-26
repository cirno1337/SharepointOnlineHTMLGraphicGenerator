# LiveData implementation audit

Date: 2026-11-26. Scope: the local implementation of experimental SharePoint Live Excel (observed contract revision `observed-2026-11-r1`). Method: a separate adversarial pass after the first implementation, reading the code as an attacker and as a user, probing with failing tests, then fixing. No tenant operations were performed in this phase.

**Recommendation: continue the experiment. Readiness: `READY_FOR_CONTROLLED_TENANT_TEST`.** Not ready for a limited pilot until LD-07 passes. Studio's own runtime has never run in a tenant.

## Findings and corrections

Severity: BLOCKER, HIGH, MEDIUM, LOW. "Fixed" means corrected in this milestone with a regression test where the behavior is testable.

### Found during the audit and fixed

| ID | Sev | Finding | Impact | Correction |
|---|---|---|---|---|
| A1 | HIGH | The preview inserted the mock script with `html.replace('<head>', script)`. `String.replace` expands `$&`, `$'` and `` $` `` in the replacement, and the script contains workbook text. | A workbook cell such as `$'` duplicated the page into the script or broke out of the JSON string, running attacker text inside the preview frame (sandboxed, no same-origin, so blast radius limited). | New `injectMockScript` with a replacer function; regression test with `$&`, `$'`, `` $` ``, `$1`, `$$` and `</script>` payloads. |
| A2 | MEDIUM | `sheetToCsv` looped over the whole used range (up to 1,048,576 x 16,384). The first regression test never finished. | Importing a large workbook froze the editor. | Work is now proportional to populated cells and bounded by the runtime limits (10,000 rows, 499 columns); timing test (<500 ms). |
| A3 | MEDIUM | The "Source" select's accessible name included its option text (label wrapping a select), so it could not be found by name. | Screen-reader users and tests could not identify the control. | Explicit `aria-label` on the three new selects. |
| A4 | LOW | Each KPI `<section aria-labelledby>` exposed an implicit region landmark. | Landmark noise with several KPIs. | `role="group"` (test asserts it). |
| A5 | MEDIUM | The Tenant Test Export panel did not show the export profile or that the file contains the workbook item URL. | A tester could share an export unaware it carries tenant identifiers. | Panel now shows the profile, the contract revision, source count and an identifier warning; the report records the same facts. |
| A6 | MEDIUM | `tsx` (used by `npm run schemas`) cannot import Vite's `?raw`. | Schema generation broke. | Runtime source is generated into `runtime.generated.ts` by `npm run runtime`; a drift test fails if they diverge. |
| A7 | MEDIUM | Two Playwright preview servers collided on Vite's single-preview command lock. | e2e could not start the second (flagged) build. | `--bypass-lock`, separate output directory. |
| A8 | LOW | ESLint scanned the new `dist-live` output (4,541 errors). | Lint gate failed. | Added to ignores and `.gitignore`. |
| A9 | LOW | `capabilities.ts` and the old provider stub still said live Excel was a disabled stub and omitted the Microsoft-managed libraries. | Stale claims. | Updated wording; documented library capability added. |

### Reviewed and found sound (with evidence)

- Architecture: transport (`spItemUrl`, `fileName`) and Excel selection (worksheet + single cell) are separate types; the provider has no network code (test traps `fetch`); the old snapshot provider is untouched and remains the default.
- Security: no `innerHTML`/`eval`/`Function`/dynamic import/worker/network/storage API in the runtime (test greps the source; validator forbids them in any export); values rendered with `textContent`; identifiers masked as `ref-xxxxxxxx` in every visible diagnostic (tests include a hostile host error with a tenant string); manifest JSON embedded with `<`, `>`, `&`, U+2028/9 escaped; sharing links never emitted; unsafe item URLs (scheme, credentials, query, signature, token) rejected.
- Runtime: results looked up with `hasOwnProperty` (prototype-key test); every failure is per KPI (isolation test); duplicate initialisation guarded; one `setTimeout` (cooldown), no `setInterval`, no polling.
- CSP: Interactive Safe differs from Static Safe by `script-src 'unsafe-inline'` only; the validator requires the meta to equal the profile's policy; Static Safe output is byte-identical to the a0525ce export (golden SHA-256 computed from that commit).
- Tests assert behavior (states, text, DOM, posted messages, requests, storage) rather than snapshots.

### Unresolved risks (not fixable locally)

| ID | Sev | Risk | Needed |
|---|---|---|---|
| U1 | BLOCKER for pilot | Viewer isolation unknown: a user who can open the page but not the workbook might see data. | LD-07 with approved test users. If data appears: SECURITY BLOCKER. |
| U2 | HIGH | A1 addressing is an unverified assumption; the observed generated page skipped blank rows. A wrong assumption shows the wrong cell with no error. | LD-09 probe page in a controlled test; change addressing if it fails. Warning always shown meanwhile. |
| U3 | MEDIUM | The runtime assumes `__LD_RESULTS__` exists when the page runs (as the generated page did). If a host injects later, the page shows the editor message. No retry is implemented on purpose. | LD-10. |
| U4 | MEDIUM | If the CSP differs in another tenant and blocks the inline script, the page keeps showing "Loading live data…" with no explanation. | Controlled test; consider a static note. |
| U5 | MEDIUM | SharePoint rewrites uploaded files (mso block, xmlns, 34-byte difference seen) and a comment in the generated runtime mentions a security layer that rewrites some script globals. Studio's runtime might be altered. | LD-10 compare stored vs exported file. |
| U6 | MEDIUM | Refresh lag unquantified; the first refresh after an edit returned the old value. | LD-05 follow-up. |
| U7 | LOW | `base-uri` and `form-action` unset in both profiles (the exporter never emits `<base>`/`<form>`; the validator rejects `<base>` and warns on `<form>`). | Review after tenant evidence. |
| U8 | LOW | `postMessage(..., '*')` as observed; content-free. | Narrow only with documented target. |
| U9 | LOW | Number/date text from the host is unverified; formats other than "as is" apply only to plain numeric text. | LD-09. |
| U10 | LOW | `cslViewLink` is stored but never used. | Revisit after LD-07. |

### Deferred

Live table/range/chart, multiple-workbook UI, list and CSV sources, source discovery, permission diagnostics, contract-change detection, semantic DOM comparison.

## Gates at the time of writing

typecheck, lint, build: pass. Unit tests: 179 pass (65 original + 114 new). Playwright: 16 pass (7 original, 9 LiveData). All run on Windows with Node 26 and the installed Microsoft Edge (`PW_CHROMIUM_PATH`).
