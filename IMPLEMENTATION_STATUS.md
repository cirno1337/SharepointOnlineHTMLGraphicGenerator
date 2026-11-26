# Implementation status

Last audit: milestone M2 (real-tenant validation preparation). Gates: `npm run typecheck`, `npm run lint`, `npm test` (65 unit tests), `npm run build`, `npm run test:e2e` (7 tests; run with `PW_CHROMIUM_PATH` when Playwright's own browser is not installed) all pass.

> **No SharePoint compatibility is claimed.** Every statement about how SharePoint renders, sanitises or sandboxes a Studio export is unverified until `docs/testing/real-tenant-baseline.md` has been run in a real tenant and the results reviewed.

## Complete (verified by automated tests in this repo)
- Typed project model with Zod validation; components: heading, text, callout, KPI, table, link, export info.
- Local `.xlsx` import (never uploaded), snapshot bindings (cell, single-cell named range, table), refresh-with-preview.
- Static export: single self-contained HTML, zero scripts, zero resource references, escaped values, pinned CSP meta, UTF-8 without BOM.
- Export validator and `scanExport` counters (scripts, resource references, `<link>`, inline handlers, same-site/external links).
- **SharePoint Compatibility Baseline** template with every diagnostic element (tests/tenant.test.ts).
- **Tenant Test Export**: exact UTF-8 size, % of 10 MB, SHA-256 (Web Crypto), validation report JSON (Zod-validated), stale-result detection. Downloaded bytes verified equal to the displayed hash and size in e2e; downloaded file verified in a real browser to make zero requests, show no CSP violations and keep its styles.
- Tenant result schema, generated JSON Schemas + example, secret-pattern guard, `npm run validate-result`; drift tests.
- CSP review (`docs/security/csp.md`) and a test pinning the policy and its documentation.

## Partially complete
- Accessibility: semantic structure, labelled controls, focus styles, live regions. No axe or screen-reader audit yet; the baseline's TC-18 covers keyboard/zoom in the tenant only.
- Excel: no arbitrary ranges/filters/aggregates (deliberately out of scope); named ranges must be single-cell.
- Project open/save has schema tests but no e2e test.
- Build id is `<version>+<sha>[.dirty]`, baked at Vite start/build; testers must use a clean checkout.

## Missing
- Charts, images/asset folder export, multi-page projects, undo/redo (out of scope this milestone).
- Folder export. The validation report is therefore a separate download, not an adjacent file.

## Experimental
- Live Excel: disabled stub (`excel-live`, `available: false`). Unchanged.

## Blocked by undocumented SharePoint behavior / awaiting tenant evidence
- Whether the meta CSP is kept, stripped, or conflicts with platform-injected content (TC-12/13/14/19).
- Iframe `sandbox` tokens and `src`/`srcdoc` form; link behavior inside the frame (TC-08/09, D-008).
- Sanitisation/transformation of markup and attributes; retrieved-file equality (TC-12/17).
- Versioning, Copilot edit side effects, direct canvas edit, responsive behavior in the real frame (TC-06/07/16/19).
- Live Excel/list binding contract; `<form>`/iframe support; exact platform CSP.

## Review items
See DECISIONS.md D-008 (links without `target`), D-012 (CSP; unused `img-src data:`; keep meta at all?), D-009 (build id requires a clean checkout).

## Baseline for the LiveData milestone (recorded 2026-11-26, before any code change)
Branch `claude/quirky-mayer-makdmo` (local, created from `main` at be7326c; the remote branch of that name is an ancestor of `main`). Working tree: only an unrelated `package-lock.json` version sync (0.1.0 -> 0.2.0) produced by `npm install`.
Gates on Windows, Node 26.13.1, npm 11.20.0:
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass, 65 tests in 3 files
- `npm run build`: pass (one chunk-size warning, pre-existing)
- `npm run test:e2e`: pass, 7 tests, using `PW_CHROMIUM_PATH` set to the installed Microsoft Edge (`/opt/pw-browsers/chromium` does not exist on this machine)
