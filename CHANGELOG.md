# Changelog

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
