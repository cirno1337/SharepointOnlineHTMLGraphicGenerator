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
