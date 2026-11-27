import type { SheetData, WorkbookData } from '../excel/types';
import { parseAddress } from '../excel/address';
import { LIVEDATA_LIMITS } from './constants';
import type { ManifestEntry } from './manifest';
import { safeJsonForScript } from './manifest';

/**
 * Mock LiveData preview adapter (local editor only). It builds the same `__LD_RESULTS__` shape the
 * observed SharePoint host injects, from SANITIZED fixture data or from a locally imported workbook.
 * It is never connected to SharePoint and makes no network requests.
 */
export type MockScenario = 'ok' | 'missing' | 'host-error' | 'missing-worksheet' | 'label-not-found' | 'duplicate-label' | 'missing-value' | 'malformed' | 'unsupported-format' | 'empty';

export const MOCK_SCENARIOS: readonly { id: MockScenario; label: string }[] = [
  { id: 'ok', label: 'Successful result' },
  { id: 'missing', label: 'No prefetched result (editor / missing key)' },
  { id: 'host-error', label: 'Host error (result.error)' },
  { id: 'missing-worksheet', label: 'Worksheet not found' },
  { id: 'label-not-found', label: 'Row label not found' },
  { id: 'duplicate-label', label: 'Duplicate row label (ambiguous)' },
  { id: 'missing-value', label: 'Adjacent value missing' },
  { id: 'malformed', label: 'Malformed envelope' },
  { id: 'unsupported-format', label: 'Unsupported format' },
  { id: 'empty', label: 'Empty content' },
];

export interface MockHostResult {
  content: string | null;
  format: string | null;
  metadata: null;
  error: string | null;
  errorCode: string | null;
}

function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Serialise a parsed sheet to CSV in the shape LD-09 observed: leading blank rows are dropped (CSV row 1 is the
 * first non-empty worksheet row), columns start at column A, interior blank rows are kept as empty lines and each
 * row is written only up to its last populated cell. The output does NOT preserve Excel row numbers.
 * Work is proportional to the number of POPULATED cells (not the used-range size) and bounded by the runtime's own
 * row and column limits (anything beyond them would be rejected by the runtime anyway). An unbounded loop over a
 * huge imported used range froze the editor (found in the adversarial audit).
 */
export function sheetToCsv(sheet: SheetData): string {
  const maxRow = Math.min(sheet.maxRow, LIVEDATA_LIMITS.maxRows);
  const maxCol = Math.min(sheet.maxCol, LIVEDATA_LIMITS.maxCellsPerRow - 1);
  const byRow = new Map<number, Map<number, string>>();
  let lastRow = 0;
  for (const [addr, value] of Object.entries(sheet.cells)) {
    const p = parseAddress(addr);
    if (!p || p.row > maxRow || p.col > maxCol || value === null || value === undefined) continue;
    let row = byRow.get(p.row);
    if (!row) byRow.set(p.row, (row = new Map()));
    row.set(p.col, String(value));
    if (p.row > lastRow) lastRow = p.row;
  }
  // LD-09: the host drops LEADING blank rows (Summary B7 arrived as the first CSV row). Interior blank rows,
  // leading blank columns and trailing handling were not observed; interior rows are kept as empty lines here.
  if (byRow.size === 0) return '';
  let firstRow = lastRow;
  for (const r of byRow.keys()) if (r < firstRow) firstRow = r;
  const lines: string[] = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const row = byRow.get(r);
    if (!row) {
      lines.push('');
      continue;
    }
    const width = Math.max(...row.keys());
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(csvField(row.get(c) ?? ''));
    lines.push(cells.join(','));
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

function escName(n: string): string {
  return n.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Envelope in the shape LD-09 observed: `<sheet name="X">\n` rows `\n</sheet>`, sheets separated by a blank line.
 * `shapeCsv` lets a mock scenario alter the CSV text (for example to duplicate rows).
 */
export function workbookToEnvelope(wb: WorkbookData, rename?: (n: string) => string, shapeCsv?: (csv: string) => string): string {
  return wb.sheets
    .map((s) => {
      const csv = sheetToCsv(s);
      return `<sheet name="${escName(rename ? rename(s.name) : s.name)}">\n${shapeCsv ? shapeCsv(csv) : csv}</sheet>`;
    })
    .join('\n\n');
}

function mapCells(wb: WorkbookData, f: (v: SheetData['cells'][string]) => SheetData['cells'][string]): WorkbookData {
  return { ...wb, sheets: wb.sheets.map((s) => ({ ...s, cells: Object.fromEntries(Object.entries(s.cells).map(([k, v]) => [k, f(v)])) })) };
}

/** Keep only column A so every row lacks its adjacent value. */
function keepFirstColumn(wb: WorkbookData): WorkbookData {
  return { ...wb, sheets: wb.sheets.map((s) => ({ ...s, cells: Object.fromEntries(Object.entries(s.cells).filter(([k]) => parseAddress(k)?.col === 1)) })) };
}

/** Tiny sanitized workbook used when no local workbook has been imported. Contains no real data. */
export function mockFixtureWorkbook(): WorkbookData {
  return {
    fileName: 'mock-fixture.xlsx',
    importedAt: '2026-01-01T00:00:00.000Z',
    sheets: [
      { name: 'Summary', cells: { A7: 'Open issues', B7: 17, A8: 'Doubled', B8: 34 }, maxRow: 8, maxCol: 2 },
      { name: 'Issues', cells: { A1: 'Title', B1: 'Status', A2: 'Example, with comma', B2: 'Open' }, maxRow: 2, maxCol: 2 },
    ],
    tables: [],
    definedNames: [],
  };
}

export function buildMockResults(entries: readonly ManifestEntry[], wb: WorkbookData, scenario: MockScenario): Record<string, MockHostResult> {
  const out: Record<string, MockHostResult> = {};
  if (scenario === 'missing') return out;
  for (const e of entries) {
    const base: MockHostResult = { content: null, format: 'xlsx-sheets', metadata: null, error: null, errorCode: null };
    switch (scenario) {
      case 'ok':
        base.content = workbookToEnvelope(wb);
        break;
      case 'host-error':
        base.error = 'Mock host error';
        base.errorCode = 'mock-error';
        break;
      case 'missing-worksheet':
        base.content = workbookToEnvelope(wb, (n) => `${n} (renamed)`);
        break;
      case 'label-not-found':
        base.content = workbookToEnvelope(mapCells(wb, (v) => (typeof v === 'string' ? ` (renamed)` : v)));
        break;
      case 'duplicate-label':
        base.content = workbookToEnvelope(wb, undefined, (csv) => csv + csv);
        break;
      case 'missing-value':
        base.content = workbookToEnvelope(keepFirstColumn(wb));
        break;
      case 'malformed':
        base.content = '<sheet name="Summary">unterminated';
        break;
      case 'unsupported-format':
        base.format = 'rows';
        base.content = workbookToEnvelope(wb);
        break;
      case 'empty':
        base.content = '';
        break;
    }
    out[e.spItemUrl] = base;
  }
  return out;
}

/** `<script>` that defines window.__LD_RESULTS__ for the preview frame (injected by the editor, never exported). */
export function mockInjectionScript(results: Record<string, MockHostResult>): string {
  return `<script>window.__LD_RESULTS__=${safeJsonForScript(results)};</script>`;
}

/**
 * Insert the mock script right after `<head>`. A replacer FUNCTION is required: with a replacement string,
 * `$&`, `$'` and `` $` `` in workbook text would be expanded by String.replace and could corrupt or break
 * out of the script (found in the adversarial audit).
 */
export function injectMockScript(html: string, script: string): string {
  return html.replace('<head>', () => `<head>\n${script}`);
}
