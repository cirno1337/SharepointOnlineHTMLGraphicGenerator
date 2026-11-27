# SharePoint HTML Studio

Open-source visual editor that exports constrained, accessible HTML for **SharePoint Online HTML Pages**. It is not a generic website builder: every export is validated against the documented platform limits (see [docs/research](docs/research/sharepoint-html-pages.md)).

## Quick start
```bash
npm install
npm run dev
```

## Excel workflow (v0.1: local import + snapshot)
1. Add a KPI or Table, import an `.xlsx` (parsed in the browser, never uploaded).
2. Click a cell (or pick a named range / table) and **Bind**.
3. **Export HTML** and upload the file via Site Pages → *Upload HTML page*.
4. When the workbook changes, import the new file under **Refresh bound values**, review the change preview, accept, re-export.

The exported value is a **snapshot**; it does not update by itself. Live Excel is experimental and unavailable until Microsoft documents the binding contract.

## Real-tenant validation
Studio's export has **not** been verified in a SharePoint tenant. Use **Load “SharePoint Compatibility Baseline” template → Tenant Test Export** and follow [docs/testing/real-tenant-baseline.md](docs/testing/real-tenant-baseline.md). The CSP is reviewed in [docs/security/csp.md](docs/security/csp.md).

## Experimental: SharePoint Live Excel (off by default)
Build with `VITE_EXPERIMENTAL_EXCEL_LIVE=true` to enable an experimental mode that uses an undocumented SharePoint HTML Pages behavior observed in one tenant. It may change without notice; use Excel Snapshot for predictable output. Read [docs/research/live-excel-contract-observed.md](docs/research/live-excel-contract-observed.md) and [docs/security/livedata-threat-model.md](docs/security/livedata-threat-model.md) first. Permission isolation has not been validated (LD-07), so it is not approved for pilot.

## Scripts
`npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run test:e2e` (set `PW_CHROMIUM_PATH` to use an existing Chromium) · `npm run fixtures` · `npm run schemas` · `npm run validate-result -- <file>`

## Layout
`src/core` pure logic (model, Excel, export, validation) · `src/editor` React UI · `tests`, `e2e` · `fixtures` synthetic data. The editor and exported page are separate runtimes: nothing under `src/editor` is ever included in an export.
