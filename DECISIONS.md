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
