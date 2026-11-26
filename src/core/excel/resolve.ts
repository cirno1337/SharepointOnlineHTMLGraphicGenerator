import type { Binding, Selection, SnapshotValue } from '../project';
import { normalizeAddress, parseRange } from './address';
import type { WorkbookData } from './types';

export type ResolveResult = { ok: true; value: SnapshotValue } | { ok: false; error: string };

export function resolveSelection(wb: WorkbookData, sel: Selection): ResolveResult {
  switch (sel.selectionType) {
    case 'cell': {
      const sheet = wb.sheets.find((s) => s.name === sel.worksheet);
      if (!sheet) return { ok: false, error: `Worksheet "${sel.worksheet}" not found.` };
      const addr = normalizeAddress(sel.address);
      if (!addr) return { ok: false, error: `"${sel.address}" is not a valid cell address.` };
      return { ok: true, value: { kind: 'scalar', value: sheet.cells[addr] ?? null } };
    }
    case 'namedRange': {
      const dn = wb.definedNames.find((d) => d.name === sel.name);
      if (!dn) return { ok: false, error: `Named range "${sel.name}" not found.` };
      const range = parseRange(dn.address);
      if (!range || range.top !== range.bottom || range.left !== range.right) {
        return { ok: false, error: `Named range "${sel.name}" is not a single cell; only single-cell names are supported.` };
      }
      return resolveSelection(wb, { selectionType: 'cell', worksheet: dn.worksheet, address: dn.address });
    }
    case 'table': {
      const t = wb.tables.find((x) => x.name === sel.table);
      if (!t) return { ok: false, error: `Table "${sel.table}" not found.` };
      return { ok: true, value: { kind: 'table', columns: t.columns, rows: t.rows } };
    }
  }
}

export function makeBinding(wb: WorkbookData, sel: Selection): { ok: true; binding: Binding } | { ok: false; error: string } {
  const r = resolveSelection(wb, sel);
  if (!r.ok) return r;
  return {
    ok: true,
    binding: {
      provider: 'excel-snapshot',
      workbookName: wb.fileName,
      lastImportedAt: wb.importedAt,
      selection: sel,
      snapshot: r.value,
    },
  };
}
