# LiveData implementation audit

Date: 2026-11-26. Scope: the local implementation of experimental SharePoint Live Excel (observed contract revision `observed-2026-11-r1`). Method: a separate adversarial pass after the first implementation, reading the code as an attacker and as a user, probing with failing tests, then fixing. No tenant operations were performed in this phase.

**Recommendation: continue the experiment. Readiness: `READY_FOR_LIMITED_PILOT` (controlled, labelled, one tenant; updated after LD-07 on 2026-11-27).** Earlier text in this file about READY_FOR_CONTROLLED_TENANT_TEST is historical. Studio runtime ran in the tenant in LD-10 and permission isolation passed in LD-07, both one-tenant observations.

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
| U1 | RESOLVED for one tenant | Viewer isolation: LD-07 PASS (`TENANT_OBSERVED_ONCE`): without workbook access the host returned `access-denied` and no live value appeared; with workbook access live values appeared. | Repeat in other tenants and for other link types before relying on it broadly. |
| U2 | RESOLVED BY DISABLING | LD-09 (2026-11-27) disproved the A1 assumption: leading blank rows are dropped and metadata has no coordinates. | Arbitrary A1 addressing disabled (D-020). Live KPI export is blocked until a verified selector exists. |
| U3 | LOW (observed OK) | The runtime assumes `__LD_RESULTS__` exists when the page runs. LD-10: it did in the tenant (view mode); in Edit mode it is absent and the editor state is shown. | none |
| U4 | LOW (observed OK) | A different CSP in another tenant could block the inline script. LD-10: the policy survived upload and the runtime ran. | Other tenants untested. |
| U5 | LOW (observed OK) | SharePoint rewrites uploaded files. LD-10: only xmlns:mso/msdt and an mso comment block were added; runtime, manifest, CSP and selector attributes byte-identical. | Later SharePoint versions untested. |
| U6 | MEDIUM (open) | Refresh lag after a workbook change is unquantified; LD-10 did not change the workbook. | LD-05 follow-up. |
| U7 | LOW | `base-uri` and `form-action` unset in both profiles (the exporter never emits `<base>`/`<form>`; the validator rejects `<base>` and warns on `<form>`). | Review after tenant evidence. |
| U8 | LOW | `postMessage(..., '*')` as observed; content-free. | Narrow only with documented target. |
| U9 | LOW | Number/date text from the host: LD-09 saw plain numbers (`23`) and ISO-looking dates (`2026-12-01`); formatting of currency, percentages and real date serials is unobserved. | Further synthetic layouts. |
| U10 | LOW | `cslViewLink` is stored but never used. | Revisit after LD-07. |

### Deferred

Live table/range/chart, multiple-workbook UI, list and CSV sources, source discovery, permission diagnostics, contract-change detection, semantic DOM comparison.

## Gates at the time of writing

typecheck, lint, build: pass. Unit tests: 179 pass (65 original + 114 new). Playwright: 16 pass (7 original, 9 LiveData). All run on Windows with Node 26 and the installed Microsoft Edge (`PW_CHROMIUM_PATH`).

## Label-adjacent selector audit (2026-11-27)

Method: adversarial pass after the implementation, aimed at duplicate labels, first-match behavior, Unicode and whitespace, sensitive labels in reports, hostile values, deprecated-selector migration, accidental positional fallback, per-KPI isolation, case-normalization surprises, negative offsets, wide rows, 10,000-row performance and runtime/editor parity. No tenant operations.

| ID | Sev | Finding | Correction |
|---|---|---|---|
| S1 | MEDIUM (fixed) | A whitespace-only adjacent value (spaces, NBSP) passed the "empty" check and would have rendered as a blank value presented as live data. | Emptiness is decided on the trimmed text; real values are never altered. Regression tests. |
| S2 | MEDIUM (fixed) | The numeric editor fields reset to `0` while typing `-`, so a negative value offset could not be entered. | `IntField` keeps the typed text and commits only valid integers; e2e types `-1`. |
| S3 | MEDIUM (documented, open) | If the host also trims leading blank columns, "Column 1" differs from Excel column A and the mock (which keeps column positions) could disagree with the tenant. | Editor text says the delivered data may omit empty leading columns; LD-11 proposes the layout that settles it. Not fixable locally. |
| S4 | LOW (documented) | `toLowerCase` is not Unicode case folding (sharp s versus SS, Greek final sigma). | Documented in the contract, the code comment and tests that pin the behavior. |
| S5 | LOW (documented) | A label containing a NUL character would be altered by the HTML parser (attribute value) and then not match, giving `label-not-found`, not a wrong value. A carriage return in a label is preserved with a character reference. | Harmless failure mode; noted. |
| S6 | LOW | Row-label uniqueness can change when the workbook changes; the KPI then shows `ambiguous-label` with the labelled fallback if present. | By design; no silent first-match. |

Reviewed and sound (with tests): the first of several matches is never returned; no positional path remains (`readCell` and `parseCell` were removed and a test asserts they do not exist); legacy projects load as `deprecated-cell`, are never converted and stay blocked; reports contain the label length only; hostile labels and values stay inert text (no element, link or script; dollar-pattern strings, U+2028, closing script tags); one failing KPI does not affect another; 10,000 rows resolve well under 500 ms; very wide rows (500 cells) behave; TypeScript and runtime selector validation agree on every case in the parity table.

Unresolved: S3 (leading blank columns), the permission gate LD-07 (still required for any pilot), refresh latency, whether SharePoint preserves the `data-sphs-label` attribute exactly, and Studio's runtime has still never run in a tenant. Readiness: `READY_FOR_CONTROLLED_TENANT_TEST`.

## LD-10 outcome (2026-11-27)
Studio's own export ran in the tenant and the label-adjacent selector returned 23 and 46 from the observed trimmed grid; failure cases were isolated and labelled; SharePoint preserved the manifest, runtime, CSP and selector attributes. Items U3 to U5 are downgraded to LOW (observed OK, one tenant). Still open: U1 viewer isolation (LD-07, required before any pilot), U6 refresh latency, S3 leading blank columns (LD-11), other tenants. No code change was needed. Readiness stays `READY_FOR_CONTROLLED_TENANT_TEST`; it cannot reach `READY_FOR_LIMITED_PILOT` until LD-07 passes.

## LD-07 outcome (2026-11-27)
Permission isolation was tested with a separately authenticated non-admin TEST_VIEWER. Case C (page yes, workbook no): `access-denied` host result, labelled Snapshot fallbacks, 23 and 46 never shown. Case B (same user, Read on the workbook added): 23 and 46 live, failing KPIs still isolated. Restoration: workbook identical to baseline; page back to inherited permissions plus one SharePoint-managed Limited Access entry for TEST_VIEWER and a site user list entry (`PARTIALLY_RESTORED`, no content access); both items denied again. **LD-07 PASS, `TENANT_OBSERVED_ONCE`.** The no-pilot gate in the threat model is satisfied for one tenant; remaining conditions for a limited pilot are in `IMPLEMENTATION_STATUS.md`. Not covered: other tenants, guests, the organization link redeemed by a viewer, labels, raw host payload fields, revocation caching.
