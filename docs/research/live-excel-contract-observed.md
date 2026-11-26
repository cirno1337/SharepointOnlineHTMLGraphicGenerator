# SharePoint HTML Pages LiveData: Observed Contract Revision 1

**Observed date: 2026-11-26. Contract revision: `observed-2026-11-r1`. Single tenant.**

> **This implementation relies on an undocumented behavior observed in a specific SharePoint Online tenant. Microsoft may change or remove it without notice.**
>
> This is **not** a public API, **not** a supported SDK, **not** a stable contract and **not** a Microsoft guarantee. Studio treats it as experimental and feature-flagged (`VITE_EXPERIMENTAL_EXCEL_LIVE=true`; decision D-014).
>
> **Release blocker:** Permission isolation has not yet been validated with a viewer who can access the page but not the workbook. LiveData is not approved for limited pilot until LD-07 passes.

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

`format === 'xlsx-sheets'`; `content` holds one block per worksheet: `<sheet name="Summary"> CSV text </sheet>` repeated. Tables are not delivered as objects. `TENANT_OBSERVED_ONCE` for the exact framing (the generated page's own extractor was `<sheet name="X">([\s\S]*?)</sheet>`). **Unknown:** whether a line break follows the opening tag; whether the CSV starts at cell A1 (see section 9).

## 9. CSV parsing behavior and cell addressing

The generated page dropped blank lines and read the KPI as "the first non-blank row, second column" rather than `B7`. So whether CSV row 1 / column 1 is Excel A1 is **UNKNOWN**. Studio assumes it is and warns (`live-addressing`). The LD-09 probe page ([docs/testing/livedata-controlled-tenant-test.md](../testing/livedata-controlled-tenant-test.md)) settles it. Studio's runtime parses RFC 4180 CSV (quoted commas, doubled quotes, multiline fields, CRLF/LF/CR, BOM) and treats every value as text.

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
- A1 addressing is an unverified assumption until LD-09.
- Studio's runtime must be validated in a controlled tenant test (LD-09 first) before any pilot.
