import type { CellValue } from '../project';

export interface SheetData {
  name: string;
  /** Non-empty cells only, keyed by A1 address. Values only: never formulas, never HTML. */
  cells: Record<string, CellValue>;
  maxRow: number;
  maxCol: number;
}
export interface TableData {
  name: string;
  worksheet: string;
  ref: string;
  columns: string[];
  rows: CellValue[][];
}
export interface DefinedName {
  name: string;
  worksheet: string;
  address: string; // single cell "B7" or range "B7:C9"
}
export interface WorkbookData {
  fileName: string;
  importedAt: string;
  sheets: SheetData[];
  tables: TableData[];
  definedNames: DefinedName[];
}
