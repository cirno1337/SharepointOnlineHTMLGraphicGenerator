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
