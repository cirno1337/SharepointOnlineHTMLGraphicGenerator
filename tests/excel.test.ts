import { describe, expect, it } from 'vitest';
import { parseWorkbook, WorkbookError } from '../src/core/excel/parse';
import { resolveSelection } from '../src/core/excel/resolve';
import { buildMaliciousWorkbook, buildStatusWorkbook } from './helpers';

describe('parseWorkbook', () => {
  it('reads sheets, cached formula results, names and tables', async () => {
    const wb = await parseWorkbook(await buildStatusWorkbook(), 'ProjectStatus.xlsx');
    const summary = wb.sheets.find((s) => s.name === 'Summary');
    expect(summary?.cells.B7).toBe(17);
    expect(summary?.cells.B8).toBe(34); // cached result, formula not evaluated
    expect(wb.definedNames).toContainEqual({ name: 'OpenIssues', worksheet: 'Summary', address: 'B7' });
    const t = wb.tables.find((x) => x.name === 'Issues');
    expect(t?.columns).toEqual(['Title', 'Status', 'Owner', 'DueDate', 'Priority']);
    expect(t?.rows).toHaveLength(3);
    expect(t?.rows[0]?.[3]).toBe('2026-12-01');
  });

  it('rejects non-xlsx names and corrupt data', async () => {
    await expect(parseWorkbook(new ArrayBuffer(8), 'a.xlsx')).rejects.toBeInstanceOf(WorkbookError);
    await expect(parseWorkbook(new ArrayBuffer(8), 'a.csv')).rejects.toBeInstanceOf(WorkbookError);
  });

  it('keeps formula text out of values', async () => {
    const wb = await parseWorkbook(await buildMaliciousWorkbook(), 'm.xlsx');
    const v = wb.sheets[0]?.cells.B8;
    expect(v).toBe('"><script>alert(2)</script>');
    expect(JSON.stringify(wb)).not.toContain('HYPERLINK');
  });
});

describe('resolveSelection', () => {
  it('resolves cell, named range and table; reports errors', async () => {
    const wb = await parseWorkbook(await buildStatusWorkbook(), 'ProjectStatus.xlsx');
    expect(resolveSelection(wb, { selectionType: 'cell', worksheet: 'Summary', address: 'B7' })).toEqual({ ok: true, value: { kind: 'scalar', value: 17 } });
    expect(resolveSelection(wb, { selectionType: 'namedRange', name: 'OpenIssues' })).toEqual({ ok: true, value: { kind: 'scalar', value: 17 } });
    const t = resolveSelection(wb, { selectionType: 'table', table: 'Issues' });
    expect(t.ok && t.value.kind === 'table' && t.value.rows.length).toBe(3);
    expect(resolveSelection(wb, { selectionType: 'cell', worksheet: 'Nope', address: 'A1' }).ok).toBe(false);
    expect(resolveSelection(wb, { selectionType: 'table', table: 'Nope' }).ok).toBe(false);
  });
});

describe('fixture formula cell Summary!B8 (evidence consistency)', () => {
  // Formula text and cached result are asserted separately on purpose: the tenant lab compared
  // B8 before/after a B7 change (34 -> 46), which is only consistent with `B7*2`, not `B7^2`.
  it('stores formula text B7*2 and cached result 34 as separate properties', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildStatusWorkbook());
    const cell = wb.getWorksheet('Summary')?.getCell('B8');
    expect(cell?.formula).toBe('B7*2');
    expect(cell?.result).toBe(34);
    expect((cell?.result as number) / 17).toBe(2); // doubling relationship with B7 = 17
  });

  it('the committed fixture file matches the generator (formula and cached result)', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const buf = readFileSync('fixtures/project-status.xlsx');
    await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const cell = wb.getWorksheet('Summary')?.getCell('B8');
    expect(cell?.formula).toBe('B7*2');
    expect(cell?.result).toBe(34);
  });
});
