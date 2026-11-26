import type { SheetData, WorkbookData } from '../excel/types';
import { colToLetters } from '../excel/address';
import type { ManifestEntry } from './manifest';
import { safeJsonForScript } from './manifest';

/**
 * Mock LiveData preview adapter (local editor only). It builds the same `__LD_RESULTS__` shape the
 * observed SharePoint host injects, from SANITIZED fixture data or from a locally imported workbook.
 * It is never connected to SharePoint and makes no network requests.
 */
export type MockScenario = 'ok' | 'missing' | 'host-error' | 'missing-worksheet' | 'missing-cell' | 'malformed' | 'unsupported-format' | 'empty';

export const MOCK_SCENARIOS: readonly { id: MockScenario; label: string }[] = [
  { id: 'ok', label: 'Successful result' },
  { id: 'missing', label: 'No prefetched result (editor / missing key)' },
  { id: 'host-error', label: 'Host error (result.error)' },
  { id: 'missing-worksheet', label: 'Worksheet not found' },
  { id: 'missing-cell', label: 'Cell not found' },
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

/** Serialise a parsed sheet to CSV from A1 (blank rows and columns are kept so cell positions hold). */
export function sheetToCsv(sheet: SheetData): string {
  const lines: string[] = [];
  for (let r = 1; r <= sheet.maxRow; r++) {
    const cols: string[] = [];
    for (let c = 1; c <= sheet.maxCol; c++) {
      const v = sheet.cells[`${colToLetters(c)}${r}`];
      cols.push(v === undefined || v === null ? '' : csvField(String(v)));
    }
    lines.push(cols.join(','));
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

function escName(n: string): string {
  return n.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function workbookToEnvelope(wb: WorkbookData, rename?: (n: string) => string): string {
  return wb.sheets.map((s) => `<sheet name="${escName(rename ? rename(s.name) : s.name)}">\n${sheetToCsv(s)}</sheet>`).join('\n');
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
      case 'missing-cell':
        base.content = wb.sheets.map((s) => `<sheet name="${escName(s.name)}">\n</sheet>`).join('\n');
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
