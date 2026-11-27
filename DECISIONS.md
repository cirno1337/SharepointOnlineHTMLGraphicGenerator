# Decisions

## D-001 Own component model instead of GrapesJS
The editor uses a small typed component model (Zod-validated) rendered by React. GrapesJS would add a large runtime, an editor-state format, and a risk of leaking `gjs-*` artifacts into exports. Revisit if free-form layout is needed.

## D-002 ExcelJS for workbook parsing, lazy loaded
npm `xlsx` (SheetJS) is stale on the registry (0.18.5) with known advisories. ExcelJS reads cached formula results without evaluating them. It is imported dynamically so the editor's first load stays ~105 KB gzip.

## D-003 Snapshot-only binding; live Excel is a disabled stub
Microsoft documents live Excel data but not its authoring contract. Binding stores provenance plus the selected values only (never the whole workbook). `excel-live` is `EXPERIMENTAL`, `available: false`, and must not be replaced by Graph/REST calls.

## D-004 Exports contain zero scripts
Inline JS is documented as supported, but nothing in v0.1 needs it, and no script means no sandbox/CSP risk. Any future interactivity will be inline-only, validated, and tested for no network or `localStorage` use.

## D-005 Validate the HTML, not just the model
`validateHtml` runs on the final string, so the guarantees hold even if the renderer changes. Text nodes are stripped before attribute heuristics so user text such as "fetch(" is not a false positive.

## D-006 Preview is the real export in a `sandbox=""` iframe
No separate preview renderer; what you see is the exported HTML.

## D-007 No workbook names in the export
Binding provenance (workbook name, sheet, address) lives in the project JSON only. The exported page contains values, not metadata.

## D-008 Links are navigation-only: root-relative or https, no `target`
`link` components accept only `/path` or `https://…` (schema + renderer + validator). `javascript:`, `data:`, protocol-relative, `http:` and `mailto:` are rejected. External https links are a **warning** (the destination domain needs the site's HTML Field Security allow list per Microsoft), not an error, because links are navigation, not resource loads. No `target` attribute is emitted because how the sandboxed frame handles `_blank`/top navigation is undocumented; the tenant protocol (TC-08/09) records the observed behavior. **Needs review** once results exist.

## D-009 Export timestamp and build id are injected at export time, not stored
`renderPage(project, ctx)` takes a `RenderContext`; the preview passes none and shows "(set at export time)". This keeps projects deterministic and avoids a fake timestamp in the preview. The build id is `<version>+<git sha>[.dirty]`, baked in by Vite `define`. Testers must run from a clean, recorded commit.

## D-010 Baseline template carries a synthetic workbook, placeholders only
The template compiles in a synthetic `WorkbookData` (mirrors `fixtures/project-status.xlsx`, adds markup-like values) so bindings are real snapshot bindings and refresh still works. Link targets are placeholders (`REPLACE-WITH-…`, `example.com`). Studio never writes a tenant URL, credential or identifier into an export; the tester edits the same-site link locally and must not commit the project file (`*.studio.json` is git-ignored).

## D-011 Tenant evidence is validated by schema, with a secret-pattern guard
`TenantTestResultSchema` (Zod) is the source of truth; JSON Schemas and the example are generated (`npm run schemas`) and a test fails on drift. Free-text fields reject JWT-like strings, Bearer/cookie/Authorization text, token names, signed-URL parameters and `*.sharepoint.com` hosts. This is a safety net, not a guarantee; the protocol forbids HAR files and header dumps.

## D-012 CSP unchanged; reviewed on paper only
`default-src 'none'; style-src 'unsafe-inline'; img-src data:` is pinned by a test and justified in `docs/security/csp.md`. It was **not** loosened. Risks (platform-injected scripts/styles, edit mode, sanitizer behavior) are documented with failure signatures and a diagnostic "variant B" (meta line removed) that can only remove restrictions Studio added. Open review items: keep unused `img-src data:`? Keep the meta at all if SharePoint strips it or already covers it?

## D-013 Hash and size are computed in the editor from the exact string written
SHA-256 uses Web Crypto over the UTF-8 bytes; size uses `TextEncoder`. The download Blob is the same string with `charset=utf-8` and no BOM; an e2e test proves downloaded bytes match the displayed hash and size. Web Crypto needs a secure context (https or localhost); otherwise the panel shows an explicit error instead of a fake hash.

## D-014 Observed SharePoint LiveData contract is experimental and feature-flagged
Status: **proposed, 2026-11-26.** In one test tenant, a Copilot-generated live-Excel page carried a `<script type="application/json" class="ka-livedata-manifest">` manifest; the SharePoint viewer prefetched the listed workbook and injected `window.__LD_RESULTS__` (keyed by the manifest's item URL) into the sandboxed frame; the page itself made no network calls. An uploaded copy behaved the same; removing the manifest stopped it; removing the `ms-sp-authoring-source` meta did not. Microsoft documents that live Excel/list/CSV data exists but publishes none of this (see `docs/research/microsoft-documentation-2026-11-26.md`).
Decision: Studio may implement a **SharePoint Live Excel** provider only as an *experimental*, opt-in feature (`VITE_EXPERIMENTAL_EXCEL_LIVE=true`), clearly labelled, with Snapshot remaining the default and recommended path. Every claim about the mechanism is classified (`docs/research/livedata-experiments.md`) and the contract is called "Observed Contract Revision 1", never an API. The exported page performs no fetch/XHR/WebSocket/beacon/storage access; Studio never calls Graph or SharePoint REST (the item URL appears only as data inside the manifest). No permission or sharing change is ever made by Studio. LiveData stays experimental until the restricted-viewer permission test passes or its failure is explicitly accepted. Supersedes D-003's "disabled stub" only when the flag is on.
Consequences: the export validator's `_api/` rule needs a narrowly scoped exception for the manifest value (it must still reject `_api/` inside executable script); tracked in the audit.

## D-015 Two export profiles: Static Safe (default, unchanged) and Interactive Safe (experimental)
Static Safe keeps the original policy and output (a test pins the baseline template export to the SHA-256 of the a0525ce export). Interactive Safe differs only by `script-src 'unsafe-inline'` (evidence: LD-04, one tenant) and may contain only Studio's own inline runtime plus the JSON manifest; the validator compares the executable script to the runtime source byte for byte and checks the CSP matches the profile. Nonce/hash was not adopted: a nonce in a static file is not secret and SharePoint rewrites the stored file (hash fragility is a hypothesis). No `connect-src`, `frame-src`, external script/style or `unsafe-eval`. The CSP is not claimed to work in other tenants.

## D-016 LiveData is transport; the exported runtime is plain JS and generated into a TS module
`src/core/livedata/runtime.src.js` is the single source of truth (linted, runs in a VM in unit tests, runs in a browser in e2e). `scripts/make-runtime.ts` generates `runtime.generated.ts` so Vite, Vitest and tsx all import it without bundler-specific `?raw`; a test fails on drift. Excel selection (worksheet + single A1 cell) is separate from the data source (`spItemUrl` + `fileName`).

## D-017 Manifest emits only evidenced fields; item URL entered manually
Only `spItemUrl` and `fileName` are emitted (LD-01). `filePath`, `label` and `cslViewLink` are kept in the project only; the sharing link is never exported. Studio cannot discover `spItemUrl` offline and never calls Graph or SharePoint REST; the user pastes it. The export validator allows the `/_api/` substring only inside the JSON manifest, never in executable script. The exported page therefore contains tenant identifiers and is tenant-specific; the validation report records that.

## D-018 Freshness and fallback wording
The runtime says "Loaded from SharePoint at {time}", never "last updated" or "real-time", adds "Recent workbook changes may take time to appear.", disables Refresh briefly, announces via aria-live, promises nothing, and never polls or retries. A snapshot fallback is optional, always labelled "Snapshot fallback" with its own timestamp, and never shown as live.

## D-019 Cell addressing assumed CSV starts at A1 (SUPERSEDED by D-020)
The first implementation treated the first CSV row/column as row 1/column A, unverified. LD-09 disproved it (see D-020).

## D-020 Arbitrary A1 addressing of live data is disabled (LD-09, 2026-11-27)
LD-09 (one tenant, `TENANT_OBSERVED_ONCE`): the host's `xlsx-sheets` CSV drops leading blank worksheet rows. Excel `Summary!A7:B8` arrived as the first two CSV rows, and `metadata` carries only `fileName` and `extension`, so worksheet coordinates cannot be restored. Reading "CSV row 7, column 2" for `B7` would show nothing or, with other layouts, the wrong cell. Decision: do not guess. Validation reports error `live-addressing-disabled` for every Live KPI (export blocked), the runtime returns state `addressing-unsupported` and never a value, and the provider reports `addressing-disabled`. Snapshot Excel A1 binding (local import) is unchanged. Constant: `LIVE_CELL_ADDRESSING_ENABLED = false`. Re-enable only with a selector that is proven against host data (for example row-label or table-header lookup, which needs a separate design and tenant evidence, see `docs/research/livedata-experiments.md`). Unobserved: leading blank columns, interior blank rows.
