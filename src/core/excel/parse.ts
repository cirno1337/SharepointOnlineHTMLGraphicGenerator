import type { CellValue } from '../project';
import { cellAddress, parseRange } from './address';
import type { DefinedName, SheetData, TableData, WorkbookData } from './types';

export const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;
export const MAX_CELLS = 200_000;

export class WorkbookError extends Error {}

/** Convert any ExcelJS cell value to a plain scalar. Formulas yield their cached result only. */
export function toScalar(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('error' in o) return String(o.error);
    if ('result' in o) return toScalar(o.result); // formula / sharedFormula: cached result, never evaluated
    if ('formula' in o || 'sharedFormula' in o) return null; // formula without cached result
    if ('richText' in o && Array.isArray(o.richText)) {
      return o.richText.map((p: { text?: unknown }) => String(p.text ?? '')).join('');
    }
    if ('text' in o) return toScalar(o.text); // hyperlink: keep visible text only
  }
  return null;
}

function splitRef(ref: string): { sheet: string; address: string } | null {
  const i = ref.lastIndexOf('!');
  if (i < 0) return null;
  let sheet = ref.slice(0, i);
  if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
  return { sheet, address: ref.slice(i + 1).replace(/\$/g, '') };
}

export async function parseWorkbook(buffer: ArrayBuffer, fileName: string): Promise<WorkbookData> {
  if (buffer.byteLength > MAX_WORKBOOK_BYTES) throw new WorkbookError('Workbook is larger than 20 MB.');
  if (!/\.xlsx$/i.test(fileName)) throw new WorkbookError('Only .xlsx workbooks are supported.');
  const { default: ExcelJS } = await import('exceljs'); // lazy: keeps the editor's first load small
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new WorkbookError('The file could not be read as an .xlsx workbook.');
  }

  let total = 0;
  const sheets: SheetData[] = [];
  const tables: TableData[] = [];
  for (const ws of wb.worksheets) {
    const cells: Record<string, CellValue> = {};
    let maxRow = 0;
    let maxCol = 0;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const v = toScalar(cell.value);
        if (v === null) return;
        total += 1;
        if (total > MAX_CELLS) throw new WorkbookError(`Workbook has more than ${MAX_CELLS} non-empty cells.`);
        cells[cellAddress(rowNumber, colNumber)] = v;
        maxRow = Math.max(maxRow, rowNumber);
        maxCol = Math.max(maxCol, colNumber);
      });
    });
    sheets.push({ name: ws.name, cells, maxRow, maxCol });

    // exceljs typings declare [Table, void][] but getTables() returns Table[] at runtime.
    for (const t of ws.getTables() as unknown as { table: unknown }[]) {
      const model = t.table as { name: string; tableRef: string; columns: { name: string }[] };
      const range = parseRange(model.tableRef);
      if (!range) continue;
      const rows: CellValue[][] = [];
      for (let r = range.top + 1; r <= range.bottom; r += 1) {
        const row: CellValue[] = [];
        for (let c = range.left; c <= range.right; c += 1) row.push(cells[cellAddress(r, c)] ?? null);
        rows.push(row);
      }
      tables.push({
        name: model.name,
        worksheet: ws.name,
        ref: model.tableRef,
        columns: model.columns.map((c) => c.name),
        rows,
      });
    }
  }

  const definedNames: DefinedName[] = [];
  const dn = wb.definedNames.model as { name: string; ranges: string[] }[];
  for (const d of dn) {
    const first = d.ranges[0] ? splitRef(d.ranges[0]) : null;
    if (first) definedNames.push({ name: d.name, worksheet: first.sheet, address: first.address });
  }

  return { fileName, importedAt: new Date().toISOString(), sheets, tables, definedNames };
}
