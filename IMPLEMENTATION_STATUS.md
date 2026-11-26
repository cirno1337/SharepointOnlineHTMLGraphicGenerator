# Implementation status

Last audit: 2026-11-26 (milestone M1, vertical slice). Gate commands pass: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, plus `npm run test:e2e`.

## Complete
- Typed project model with Zod validation on load (`src/core/project.ts`).
- Local `.xlsx` import in the browser, never uploaded; cell, single-cell named range and table bindings.
- Snapshot export: bound values embedded; export works with no workbook (`tests/export.test.ts`).
- Fixture workbook: sheet `Summary`, `B7 = 17`, `B8` formula with cached result 34, name `OpenIssues`, table `Issues` (Title, Status, Owner, DueDate, Priority). Binding `Summary!B7` to a KPI is exercised in unit and e2e tests; exported HTML contains `17`.
- Escaping: malicious cell values, headers, titles and captions are neutralised (DOM-parsed assertions: no `script/img/svg/iframe/form` elements, no `on*` attributes).
- Export validator and capability registry (`src/core/validate.ts`, `src/core/capabilities.ts`).
- Refresh workflow with before/after preview, error reporting, accept/cancel.
- Verified exported HTML has no GrapesJS/Vite/React/source maps/network references/scripts (unit + e2e).
- Every visible control is functional (audited: outline add/move/delete, inspector fields, bind/unbind, import, refresh, save/open project, export, accent colour).

## Partially complete
- Accessibility: semantic landmarks, labelled controls, focus styles, live regions, table captions and scroll-region labels. Not yet audited with a screen reader or axe; contrast checked by hand only.
- Excel: no range binding (arbitrary `A1:C9`), no filters/aggregates, only the first 8×20 cells are previewed (any address can be typed). Named ranges must be single-cell.
- Project open/save is covered by schema tests but has no e2e test.

## Missing
- Image, chart, list, accordion components; asset folder export.
- Multi-page projects; undo/redo; drag and drop.
- Workbook-name matching on refresh and structure checks beyond "binding still resolves".
- Audit of Playwright accessibility (axe) checks.

## Experimental
- Live Excel: `excel-live` provider exists as a disabled stub (`available: false`). The UI only lists it in the capability panel.

## Blocked by undocumented SharePoint behavior
- Live Excel/list/CSV data binding contract (mechanism, metadata, permissions, rename/move behavior).
- `<form>` and iframe support, exact CSP, browser support matrix, versioning behavior.
- Real-tenant validation of an exported page has not been done.
