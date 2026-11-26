import { useState } from 'react';
import { colToLetters, cellAddress } from '../core/excel/address';
import { parseWorkbook } from '../core/excel/parse';
import type { WorkbookData } from '../core/excel/types';

export interface Pick {
  worksheet: string;
  address: string;
}

interface Props {
  workbook: WorkbookData | null;
  onLoaded: (wb: WorkbookData) => void;
  onPick: (p: Pick) => void;
  onRefresh: (wb: WorkbookData) => void;
  hasBindings: boolean;
}

const GRID_ROWS = 20;
const GRID_COLS = 8;

async function readWorkbook(file: File): Promise<WorkbookData> {
  return parseWorkbook(await file.arrayBuffer(), file.name);
}

export function WorkbookPanel({ workbook, onLoaded, onPick, onRefresh, hasBindings }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string>('');

  async function handle(file: File | undefined, mode: 'import' | 'refresh') {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const wb = await readWorkbook(file);
      if (mode === 'import') {
        onLoaded(wb);
        setSheetName(wb.sheets[0]?.name ?? '');
      } else {
        onRefresh(wb);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the workbook.');
    } finally {
      setLoading(false);
    }
  }

  const sheet = workbook?.sheets.find((s) => s.name === sheetName) ?? workbook?.sheets[0];
  const rows = sheet ? Math.min(Math.max(sheet.maxRow, 1), GRID_ROWS) : 0;
  const cols = sheet ? Math.min(Math.max(sheet.maxCol, 1), GRID_COLS) : 0;

  return (
    <section aria-labelledby="wb-h" className="panel">
      <h2 id="wb-h">Excel workbook</h2>
      <p className="muted">Parsed in your browser. The file is never uploaded. Only the values you bind are embedded in the export.</p>
      <label className="field">
        Import workbook (.xlsx)
        <input type="file" accept=".xlsx" data-testid="import-workbook" onChange={(e) => void handle(e.target.files?.[0], 'import')} />
      </label>
      {hasBindings && (
        <label className="field">
          Refresh bound values from a newer workbook
          <input type="file" accept=".xlsx" data-testid="refresh-workbook" onChange={(e) => void handle(e.target.files?.[0], 'refresh')} />
        </label>
      )}
      <div role="status" aria-live="polite">
        {loading && <p>Reading workbook…</p>}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!workbook && !loading && !error && <p className="muted">No workbook loaded.</p>}
      {workbook && sheet && (
        <>
          <p>
            <strong>{workbook.fileName}</strong> — {workbook.sheets.length} sheet(s), {workbook.tables.length} table(s), {workbook.definedNames.length} name(s)
          </p>
          <label className="field">
            Sheet
            <select value={sheet.name} onChange={(e) => setSheetName(e.target.value)}>
              {workbook.sheets.map((s) => (
                <option key={s.name}>{s.name}</option>
              ))}
            </select>
          </label>
          <div className="grid-scroll" role="region" aria-label="Sheet preview">
            <table className="grid">
              <caption className="sr-only">Cells of {sheet.name}. Select a cell to use it as the binding source.</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Row</span>
                  </th>
                  {Array.from({ length: cols }, (_, c) => (
                    <th scope="col" key={c}>
                      {colToLetters(c + 1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rows }, (_, r) => (
                  <tr key={r}>
                    <th scope="row">{r + 1}</th>
                    {Array.from({ length: cols }, (_, c) => {
                      const addr = cellAddress(r + 1, c + 1);
                      const v = sheet.cells[addr];
                      return (
                        <td key={c}>
                          <button type="button" className="cell" aria-label={`${addr}: ${v ?? 'empty'}`} onClick={() => onPick({ worksheet: sheet.name, address: addr })}>
                            {v === undefined ? '' : String(v)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(sheet.maxRow > GRID_ROWS || sheet.maxCol > GRID_COLS) && (
            <p className="muted">Showing A1:{cellAddress(GRID_ROWS, GRID_COLS)}. Type any other address in the inspector.</p>
          )}
        </>
      )}
    </section>
  );
}
