# SharePoint HTML Pages LiveData: Observed Contract Revision 1

**Observed date: 2026-11-26. Contract revision: `observed-2026-11-r1`. Single tenant.**

> **This implementation relies on an undocumented behavior observed in a specific SharePoint Online tenant. Microsoft may change or remove it without notice.**
>
> This is **not** a public API, **not** a supported SDK, **not** a stable contract and **not** a Microsoft guarantee. Studio treats it as experimental and feature-flagged (`VITE_EXPERIMENTAL_EXCEL_LIVE=true`; decision D-014).
>
> **Release gate (updated 2026-11-27):** LD-07 passed once for one non-admin TEST_VIEWER in one tenant (see section 23 and the experiment ledger): a viewer with page access but no workbook access received no workbook data. This is `TENANT_OBSERVED_ONCE` and not Microsoft-documented. LiveData remains experimental and is not production ready.

Evidence classes used below: `MICROSOFT_DOCUMENTED`, `TENANT_OBSERVED_REPRODUCED` (more than once), `TENANT_OBSERVED_ONCE`, `HYPOTHESIS`, `FAILED_IN_CURRENT_TEST`, `UNKNOWN`. Experiment records are in [livedata-experiments.md](livedata-experiments.md). All values in examples are synthetic.

## 1. Executive summary

In one test tenant, a Copilot-generated "live Excel" HTML page carried a JSON manifest. The SharePoint HTML viewer read it, fetched the listed workbook on the viewer's side, and injected the result into the sandboxed frame as `window.__LD_RESULTS__`. The page itself made no network call. An uploaded copy of that page behaved the same. A manifest with only `spItemUrl` and `fileName` was enough. Studio's own static CSP blocked the page script; adding `script-src 'unsafe-inline'` fixed it. The page's Refresh button re-ran the host fetch, but data lagged the workbook edit by a period of one to several minutes.

Studio implements this as an experimental provider. It cannot discover `spItemUrl` offline, so the item URL is entered manually.

## 2. Microsoft-documented capabilities (`MICROSOFT_DOCUMENTED`)

Checked 2026-11-26 ([microsoft-documentation-2026-11-26.md](microsoft-documentation-2026-11-26.md)): live data from lists and Excel (the blog post also names CSV) exists; arbitrary fetch and outbound API calls are blocked; HTML renders in a sandboxed iframe with extra CSP rules; inline JavaScript in the same file is supported; scripts from other CDNs are not, except Chart.js, Mermaid, React, Fluent UI and Babylon from a Microsoft-managed CDN; localStorage is unavailable; 10 MB file limit; direct editing and Copilot editing are documented as supported. **Nothing about the live-data authoring contract is documented.**

## 3. Undocumented tenant observations

Everything in sections 5 to 15 is undocumented. Classes are given per item.

## 4. Experimental method

Variants were built inside the browser from the stored bytes of a working generated page (so no identifier left the browser), changing one variable, uploaded as new pages through Site Pages, and viewed in a fresh tab in view mode. Page frames could not be inspected with DevTools; conclusions come from rendering, the stored file, and response headers read by a script on the SharePoint page. Studio's own runtime has **not** yet been run in a tenant.

## 5. Manifest structure

```html
<script type="application/json" class="ka-livedata-manifest">
[{"spItemUrl":"https://<host>/_api/v2.0/drives/<driveId>/items/<itemId>","fileName":"status.xlsx"}]
</script>
```

The Copilot-generated page also carried `filePath`, `label` and `cslViewLink`, and its runtime kept a copy of the same list in a `CONFIG` object. `TENANT_OBSERVED_REPRODUCED` (manifest present on every working page).

## 6. Field requirement matrix

| Field | Verdict (observed runtime) | Class | Studio emits |
|---|---|---|---|
| `spItemUrl` | REQUIRED: without it "No prefetched result for <url>" (LD-01-H, LD-03) | REPRODUCED | yes |
| `fileName` | REQUIRED with `spItemUrl` (A fails, B passes); mechanism unknown, HYPOTHESIS: format chosen from the extension | ONCE | yes |
| `filePath` | not needed (B passes without it); individual removal untested | ONCE | no |
| `label` | not needed; individual removal untested | ONCE | no |
| `cslViewLink` | not needed in the author's session; role for other viewers UNKNOWN | UNKNOWN | no (sharing link, sensitive) |
| `<meta name="ms-sp-authoring-source" content="agent">` | not needed (LD-02) | ONCE | no |

Runtime necessity says nothing about security: every run used the author's own access.

## 7. `__LD_RESULTS__` shape

`window.__LD_RESULTS__[spItemUrl] = { content, format, metadata, error, errorCode }`, injected before the page script ran (observed in generated page code: "host-injected prefetch payload"). A missing key is reported by the generated page as "No prefetched result for <url>". `TENANT_OBSERVED_REPRODUCED`.

## 8. `xlsx-sheets` envelope

`format === 'xlsx-sheets'`; `content` holds one block per worksheet: `<sheet name="Summary"> CSV text </sheet>` repeated. Tables are not delivered as objects. `TENANT_OBSERVED_ONCE` for the exact framing (the generated page's own extractor was `<sheet name="X">([\s\S]*?)</sheet>`). LD-09 observed a line break after the opening tag and before the closing tag and a blank line between sheets; the CSV does **not** start at Excel A1 (see section 9).

## 9. CSV parsing behavior and cell addressing

**LD-09 result (2026-11-27, `TENANT_OBSERVED_ONCE`, one tenant): CSV rows are NOT Excel rows.** The synthetic `Summary` worksheet has `A7 = "Open issues"`, `B7 = 23`, `A8 = "Doubled"`, `B8 = 46` and empty rows 1 to 6. The host delivered a block whose text is `Open issues,23` and `Doubled,46` on two lines (one line break after the opening tag, one before the closing tag): leading blank rows are dropped, so `B7` is not CSV row 7. `metadata` has only `fileName` and `extension` (no used-range or offset), so coordinates cannot be restored. Unobserved: leading blank columns, interior blank rows. Framing seen: a line break after the opening tag and before the closing tag, a blank line between sheets, LF line endings, no `error`/`errorCode` fields on success. Studio therefore **disables arbitrary A1 addressing of live data** (D-020). Studio's runtime still parses RFC 4180 CSV (quoted commas, doubled quotes, multiline fields, CRLF/LF/CR, BOM) and treats every value as text.

## 10. Refresh message

The generated Refresh button posted `window.parent.postMessage({ type: 'ka-html-viewer-refresh' }, '*')`. Studio posts exactly that, no other payload. `TENANT_OBSERVED_ONCE` (read from page code, button exercised in LD-05).

## 11. Iframe observations

The page frame had `sandbox="allow-scripts"` (exact value) and a `blob:` source; no `allow` or `referrerpolicy`. A separate SharePoint-owned frame has `allow-scripts allow-same-origin allow-forms`. `TENANT_OBSERVED_REPRODUCED`.

## 12. CSP behavior

- Studio's static policy (`default-src 'none'; style-src 'unsafe-inline'; img-src data:`) stopped the page script: static markup rendered, no value (LD-04-B). `TENANT_OBSERVED_ONCE`.
- Adding only `script-src 'unsafe-inline'` made the page work (LD-04-C). `TENANT_OBSERVED_ONCE`. Studio's Interactive Safe profile is exactly that policy.
- The stored file keeps the CSP `<meta>` unchanged. The file response header carries only a `frame-ancestors` list and `X-Frame-Options: SAMEORIGIN`. The CSP of the `blob:` frame itself is UNKNOWN.
- Nonce/hash instead of `unsafe-inline`: `HYPOTHESIS` that it is impractical (static file, SharePoint rewrites the file).

## 13. Permissions and sharing

Copilot asked to "create view-only links" for the workbook before saving the page and the card expired if unanswered. Clicking Continue added a sharing link. A viewer without workbook access was **not tested** (LD-07, blocked). The workbook also required a sensitivity label before it could be edited. `UNKNOWN` for viewer isolation.

## 14. Edit mode behavior

In SharePoint edit mode the generated page showed "Live data isn't available while editing" and "No prefetched result". `TENANT_OBSERVED_REPRODUCED`. Studio treats missing data as a normal state and shows its own message.

## 15. Failure modes

Observed: missing key; format/content problems made the generated page say "Summary B7 is unavailable" (LD-01-A). Studio handles and tests: no prefetch, missing key, `error`/`errorCode`, empty content, unsupported format, malformed envelope, missing worksheet, missing cell, bad address, oversized input. Refresh lag (LD-05): the first refresh after a workbook edit returned the old value, a later one the new value. `TENANT_OBSERVED_ONCE`; exact delay and cause UNKNOWN. Not observed: SharePoint-side size limits.

## 16. Security risks

See [../security/livedata-threat-model.md](../security/livedata-threat-model.md). Highest: viewer-isolation UNKNOWN; `script-src 'unsafe-inline'`; the page contains tenant identifiers (the item URL); undocumented contract drift.

## 17. Scope and limitations

One tenant, one browser, one day, one synthetic workbook, author's own account, small data. No DevTools. Studio's runtime not run in a tenant. Nothing here is verified for other tenants, sovereign clouds or later SharePoint versions.

## 18. Reproduction steps

Lab pages were created by copying a Copilot-generated page's stored bytes and editing the manifest or CSP meta (see the experiment ledger for each variable). Studio-side reproduction: build with `VITE_EXPERIMENTAL_EXCEL_LIVE=true`, add a source (manual item URL and file name), add a Live KPI, export Interactive Safe, upload via Site Pages > Create or upload > Upload HTML page, open in view mode. Use the controlled test document first.

## 19. Sanitized examples

```json
{ "spItemUrl": "https://tenant-a.example/_api/v2.0/drives/b!FIXTUREDRIVE0001/items/01FIXTUREITEM0001", "fileName": "status.xlsx" }
```
```
window.__LD_RESULTS__ = { "<spItemUrl>": { "content": "<sheet name=\"Summary\">\n...CSV...\n</sheet>", "format": "xlsx-sheets", "metadata": null, "error": null, "errorCode": null } }
```

## 20. Implementation implications

- Source configuration is manual; Studio never calls Graph or SharePoint REST.
- Exports contain tenant identifiers (the item URL); they are tenant-specific.
- Emit only evidenced fields; keep `filePath`, `label`, `cslViewLink` out of the page.
- Interactive Safe needs `script-src 'unsafe-inline'`; the validator allows only Studio's own runtime and the manifest.
- Show "Loaded from SharePoint at {time}" and the hint "Recent workbook changes may take time to appear."; never call the data real-time.
- A1 addressing of live data is disabled (LD-09 disproved positional rows; D-020). Use Excel Snapshot for cell-addressed values.
- Studio's runtime must be validated in a controlled tenant test (LD-10) before any pilot; LD-10 now needs a selector that does not depend on Excel coordinates.

## 21. Selection: `label-adjacent` (derived design, not an observed contract)

Evidence class of the **selector**: a design DERIVED from one `TENANT_OBSERVED_ONCE` observation (LD-09). It is **not** Microsoft-documented, **not** guaranteed SharePoint behavior and **not** equivalent to Excel row or cell coordinates. It only reads the trimmed CSV grid exactly as LD-09 delivered it:

```
Summary block text:           parsed rows:
Open issues,23                ["Open issues","23"]
Doubled,46                    ["Doubled","46"]

selector {label:"Open issues", matchColumn:0, valueOffset:1}  ->  "23"
```

Semantics (implemented once, in the exported runtime; the editor preview runs the same code):
1. Only column `matchColumn` (zero-based; shown to users as Column 1, 2, ...) of each row is compared.
2. Both sides are normalised: Unicode NFC, then optional trim (JavaScript `trim`), then optional `toLowerCase` (locale-independent; **not** full Unicode case folding, so `STRASSE` does not match `straße`, and a Greek final sigma can differ). No punctuation or diacritic removal, no interior-whitespace collapsing, no numeric coercion, no fuzzy or regex matching.
3. `valueColumn = matchColumn + valueOffset`; `valueOffset` is a non-zero integer and the value column must be at least 0.
4. Exactly one matching row is required. Several matches return `ambiguous-label`; the first match is never returned.
5. Failure codes: `selector-unsupported`, `label-empty`, `label-too-long` (more than 255 characters), `match-column-invalid` (not an integer in 0..499), `value-offset-invalid` (0, more than 499 in magnitude, or before column 1), `label-not-found`, `ambiguous-label`, `adjacent-value-missing` (row shorter than the value column), `adjacent-value-empty` (empty or whitespace-only value, unless `allowEmptyValue`).
6. The returned text is never altered, interpreted as HTML, a formula or a URL; number formatting applies only after selection.

**Unobserved and therefore untrusted:** whether leading blank *columns* are trimmed (so "Column 1" may not be Excel column A), interior blank rows, merged cells, hidden rows, tables, formatted numbers and dates, large sheets. Authors must not treat `matchColumn` as an Excel column letter.

## 22. Studio's own runtime in the tenant (LD-10, 2026-11-27, `TENANT_OBSERVED_ONCE`)

A Studio Interactive Safe export (manifest with only `spItemUrl` and `fileName`, the exact Interactive Safe CSP, Studio's inline runtime, four `label-adjacent` KPIs) uploaded as a new page behaved as designed in view mode: `Open issues` gave `23`, `Doubled` gave `46`, a nonexistent label and an offset beyond the row gave labelled snapshot fallbacks with `label-not-found` and `adjacent-value-missing`, and the failures did not affect the other KPIs. This confirms for one tenant and the author's account:
- the host prefetches for a Studio-generated manifest (not only for the Copilot-generated page);
- `script-src 'unsafe-inline'` keeps the inline runtime working after upload; SharePoint kept the CSP meta unchanged;
- SharePoint rewrites the stored file only by adding `xmlns:mso` and `xmlns:msdt` on `<html>` and an `mso` ContentTypeId comment block (+346 bytes); the manifest, the runtime, the CSP, the selector attributes and the label attributes are byte-identical;
- Refresh makes the host re-run the page (new "Loaded from SharePoint at" time) and keeps working KPIs; the frame is rebuilt, so the temporary disabled state is not visible afterwards;
- in Edit mode the page shows SharePoint's "Live data isn't available while editing" banner and Studio's labelled fallbacks with the editor message; leaving Edit restores live values and the stored file is unchanged.
It does **not** establish viewer isolation (LD-07), refreshed-value latency, leading-blank-column handling (LD-11), behavior in other tenants, or that this will continue to work.

## 23. Permission isolation (LD-07, 2026-11-27, `TENANT_OBSERVED_ONCE`)

For one non-admin TEST_VIEWER account in one tenant, the host's LiveData prefetch followed the **viewer's own access to the workbook**, not the page author's and not the viewer's access to the page:
- page readable, workbook not readable: the host returned an error with code `access-denied`; Studio showed the labelled Snapshot fallback; the live values never appeared;
- after the same account was given Read on the workbook alone: the same page showed the live values without a change to the page, the manifest or any sharing link, and no propagation delay was observed (checked about 23 to 30 seconds after the grant).
Observed side effects of giving the account item-level access: SharePoint's page viewer failed to load once on the first visit (`SpfxLoad`), a SharePoint banner "Something went wrong. We couldn't display this content." appeared while the host reported `access-denied`, the account was added to the site user list and received Limited Access entries on the library and site. Restoration returned the workbook exactly to its baseline and the page to inherited permissions plus one SharePoint-managed Limited Access entry.
The raw host result (`content`, `error`, `errorCode` fields) was not read; only the rendered behavior was observed. Not established: other tenants, other link types (for example a viewer who has opened the organization link), external or guest users, Microsoft 365 group members versus direct grants, sensitivity-label effects, caching after revocation, or that this will continue to hold.
