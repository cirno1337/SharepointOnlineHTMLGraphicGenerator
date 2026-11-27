# Changelog

## 0.2.0 — Unreleased (milestone M2: real-tenant validation preparation)
### Added
- **SharePoint Compatibility Baseline** template (H1, paragraph, special characters, callout, manual KPI, Excel-bound KPI `Summary!B7`, Excel-bound `Issues` table, long/unbroken text, same-site and external placeholder links, markup-like workbook values, export timestamp and Studio build id).
- `link` and `stamp` (export info) components; link targets restricted to root-relative paths and https.
- **Tenant Test Export**: normal static export plus a separate machine-readable validation report (exact UTF-8 bytes, % of 10 MB, SHA-256, CSP, script/resource/link counts, validation issues). Report downloads separately because Studio has no folder export.
- `docs/testing/real-tenant-baseline.md` (19-case manual protocol), result Zod schema with secret-pattern guard, generated JSON Schemas and example (`npm run schemas`), `npm run validate-result`.
- `docs/security/csp.md`: directive-by-directive CSP review; CSP value exported as `EXPORT_CSP` and pinned by a test.
- 50 new unit tests and 3 new e2e tests (baseline content, text-only workbook values, no scripts/resource references, UTF-8 size, SHA-256, schema validation, real-browser check of the downloaded file).
### Changed
- `renderPage(project, ctx?)` accepts a render context; export validator treats external `<a href>` as a warning and rejects `<base>`; CSS wraps long unbroken text (`overflow-wrap:anywhere`).
- Top bar is sticky (carried over from M1 fix); Export HTML now stamps the export time/build when an export-info component is present.
### Not done
- No SharePoint compatibility is claimed. The manual tenant protocol has not been run.

## 0.1.0 — Unreleased
### Added
- Editor (React + Vite): outline, inspector, sandboxed live preview, validation panel, platform capability panel.
- Components: heading, text, callout, KPI, table. Project save/open as validated JSON.
- Excel local import (`.xlsx`, browser-only), snapshot bindings for cell, single-cell named range and Excel table.
- Refresh-snapshot workflow with change preview (`17 → 23`) and accept/cancel.
- Static export: single self-contained HTML, no scripts, escaped values, restrictive CSP meta.
- Export validator for documented SharePoint constraints (10 MB, no external scripts/resources, no fetch/XHR/WebSocket/Graph/REST/localStorage, no editor runtime).
- Vitest unit tests and Playwright e2e tests; synthetic fixture `fixtures/project-status.xlsx`.
- Research notes with Microsoft sources.

## 0.3.0 — Unreleased (experimental SharePoint Live Excel)
### Added (feature-flagged: `VITE_EXPERIMENTAL_EXCEL_LIVE=true`; off by default)
- Experimental SharePoint Live Excel based on an undocumented behavior observed in one tenant (contract revision `observed-2026-11-r1`): manifest compiler, inline runtime, xlsx-sheets and CSV parsers, A1 cell selection, Live Excel KPI, snapshot fallback, Mock LiveData preview, LD-09 probe page.
- Export profiles: Static Safe (default, byte-identical to the previous export) and Interactive Safe (adds `script-src 'unsafe-inline'`).
- Validation report: `exportProfile` and `liveData` section; schemas regenerated.
- Docs: observed contract, experiment ledger, threat model, controlled tenant test protocol, audit, Copilot issue write-up.
### Changed
- Export validator is profile-aware (strict manifest, runtime equality, CSP-matches-profile, extra forbidden APIs).
### Not done
- LD-06, LD-07 (security gate), LD-10; no list/range/table/chart live components; no tenant validation of Studio's runtime.

### 0.3.0 addendum: LD-09 (2026-11-27)
- Fixed (by disabling): A1 addressing of live data. The host CSV drops leading blank rows, so a CSV row is not an Excel row. Live KPIs now fail validation with `live-addressing-disabled`; the runtime reports `addressing-unsupported` and never a value; the mock preview emits the observed shape. Snapshot Excel A1 binding is unchanged.
