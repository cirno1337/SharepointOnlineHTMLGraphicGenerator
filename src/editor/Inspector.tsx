import { useState } from 'react';
import { normalizeAddress } from '../core/excel/address';
import { makeBinding } from '../core/excel/resolve';
import type { WorkbookData } from '../core/excel/types';
import { defaultLabelAdjacent, validateSelector, type LabelAdjacentSelector } from '../core/livedata/selector';
import type { LiveSource } from '../core/livedata/source';
import { isSafeHref, LEGACY_CELL_NOTICE, linkKind, type Binding, type Component, type Selection } from '../core/project';
import type { Pick } from './WorkbookPanel';

interface Props {
  component: Component | null;
  workbook: WorkbookData | null;
  pick: Pick | null;
  liveSources: LiveSource[];
  onChange: (c: Component) => void;
}

type LiveKpi = Extract<Component, { type: 'liveKpi' }>;

function numOrUndefined(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Whole-number field that keeps what the user types (so "-" can be typed) and commits only valid integers. */
function IntField({ label, caption, value, onCommit }: { label: string; caption: string; value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <label className="field">
      {caption}
      <input
        aria-label={label}
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (/^-?\d+$/.test(e.target.value.trim())) onCommit(Number(e.target.value.trim()));
        }}
        onBlur={() => setText(String(value))}
      />
    </label>
  );
}

/** Inspector for the EXPERIMENTAL Live Excel KPI. Excel selection (sheet + cell) is separate from the data source. */
function LiveKpiEditor({ c, liveSources, onChange }: { c: LiveKpi; liveSources: LiveSource[]; onChange: (c: Component) => void }) {
  const sel = c.selector;
  const problems = sel.type === 'label-adjacent' ? validateSelector(sel) : [];
  const setSel = (patch: Partial<LabelAdjacentSelector>) => {
    if (sel.type === 'label-adjacent') onChange({ ...c, selector: { ...sel, ...patch } });
  };
  return (
    <>
      <p role="note" className="error">
        Experimental. Uses an undocumented SharePoint behavior; see the Live Excel panel.
      </p>
      <label className="field">
        Label
        <input value={c.label} onChange={(e) => onChange({ ...c, label: e.target.value })} />
      </label>
      <label className="field">
        Source
        <select aria-label="Source" value={c.sourceId} onChange={(e) => onChange({ ...c, sourceId: e.target.value })}>
          <option value="">(choose a source)</option>
          {liveSources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Worksheet
        <input value={c.worksheet} onChange={(e) => onChange({ ...c, worksheet: e.target.value })} />
      </label>
      <label className="field">
        Selection method
        <select
          aria-label="Selection method"
          value={sel.type}
          onChange={(e) => {
            if (e.target.value === 'label-adjacent' && sel.type !== 'label-adjacent') onChange({ ...c, selector: defaultLabelAdjacent('') });
          }}
        >
          {sel.type === 'deprecated-cell' && (
            <option value="deprecated-cell" disabled>
              Cell address (removed)
            </option>
          )}
          <option value="label-adjacent">Row label + adjacent value</option>
        </select>
      </label>
      {sel.type === 'deprecated-cell' ? (
        <p role="alert" className="error" data-testid="legacy-selector">
          {LEGACY_CELL_NOTICE} (Old address: {sel.address}.) It is not converted automatically.
        </p>
      ) : (
        <>
          <p className="muted">
            Example: a worksheet row <strong>Open issues | 23</strong> with label “Open issues”, label column 1 and value offset 1 shows 23. LiveData may omit leading blank worksheet rows. Selection therefore uses visible row content instead of Excel cell coordinates.
          </p>
          <label className="field">
            Row label
            <input aria-label="Row label" value={sel.label} aria-invalid={problems.some((p) => p.code === 'label-empty' || p.code === 'label-too-long')} onChange={(e) => setSel({ label: e.target.value })} />
          </label>
          <IntField label="Label column" caption="Label column (1 = first column of the delivered data; SharePoint may omit empty leading columns, which was not observed)" value={sel.matchColumn + 1} onCommit={(n) => setSel({ matchColumn: n - 1 })} />
          <IntField label="Value offset" caption="Value offset (columns from the label; 1 = next column, negative = left)" value={sel.valueOffset} onCommit={(n) => setSel({ valueOffset: n })} />
          <label className="field">
            <span>
              <input type="checkbox" checked={sel.caseSensitive} onChange={(e) => setSel({ caseSensitive: e.target.checked })} /> Case-sensitive match
            </span>
          </label>
          <label className="field">
            <span>
              <input type="checkbox" checked={sel.trim} onChange={(e) => setSel({ trim: e.target.checked })} /> Trim matching whitespace
            </span>
          </label>
          <label className="field">
            <span>
              <input type="checkbox" checked={sel.allowEmptyValue} onChange={(e) => setSel({ allowEmptyValue: e.target.checked })} /> Allow an empty adjacent value
            </span>
          </label>
          {problems.length > 0 && (
            <ul role="alert" className="error">
              {problems.map((p) => (
                <li key={p.code}>{p.message}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <label className="field">
        Prefix
        <input value={c.prefix} onChange={(e) => onChange({ ...c, prefix: e.target.value })} />
      </label>
      <label className="field">
        Suffix
        <input value={c.suffix} onChange={(e) => onChange({ ...c, suffix: e.target.value })} />
      </label>
      <label className="field">
        Number format
        <select aria-label="Number format" value={c.numberFormat} onChange={(e) => onChange({ ...c, numberFormat: e.target.value as LiveKpi['numberFormat'] })}>
          <option value="auto">As in workbook</option>
          <option value="integer">Integer</option>
          <option value="decimal1">1 decimal</option>
          <option value="decimal2">2 decimals</option>
        </select>
      </label>
      <label className="field">
        Empty-state text
        <input value={c.emptyText} onChange={(e) => onChange({ ...c, emptyText: e.target.value })} />
      </label>
      <label className="field">
        Error-state text (optional)
        <input value={c.errorText} onChange={(e) => onChange({ ...c, errorText: e.target.value })} />
      </label>
      <label className="field">
        <span>
          <input type="checkbox" checked={c.showLoadedAt} onChange={(e) => onChange({ ...c, showLoadedAt: e.target.checked })} /> Show “Loaded from SharePoint at …”
        </span>
      </label>
      <label className="field">
        <span>
          <input type="checkbox" checked={c.showRefresh} onChange={(e) => onChange({ ...c, showRefresh: e.target.checked })} /> Show Refresh button
        </span>
      </label>
      <label className="field">
        Warning at or above (optional)
        <input value={c.warnAt ?? ''} onChange={(e) => onChange({ ...c, warnAt: numOrUndefined(e.target.value) })} />
      </label>
      <label className="field">
        Critical at or above (optional)
        <input value={c.criticalAt ?? ''} onChange={(e) => onChange({ ...c, criticalAt: numOrUndefined(e.target.value) })} />
      </label>
      <fieldset>
        <legend>Snapshot fallback (optional)</legend>
        <p className="muted">Shown only when live data is unavailable, always labelled “Snapshot fallback”. Never shown as live.</p>
        <label className="field">
          Fallback value
          <input
            value={c.fallback?.value ?? ''}
            onChange={(e) => onChange({ ...c, fallback: e.target.value === '' ? undefined : { value: e.target.value, importedAt: c.fallback?.importedAt ?? new Date().toISOString() } })}
          />
        </label>
      </fieldset>
    </>
  );
}

function describeBinding(b: Binding): string {
  const s = b.selection;
  const src = s.selectionType === 'cell' ? `${s.worksheet}!${s.address}` : s.selectionType === 'namedRange' ? `name ${s.name}` : `table ${s.table}`;
  return `${b.workbookName} · ${src} · imported ${b.lastImportedAt.slice(0, 10)} · snapshot (does not update automatically)`;
}

function BindingEditor({ component, workbook, pick, onChange }: { component: Extract<Component, { type: 'kpi' | 'table' }>; workbook: WorkbookData | null; pick: Pick | null; onChange: (c: Component) => void }) {
  const isKpi = component.type === 'kpi';
  const [kind, setKind] = useState<'cell' | 'namedRange' | 'table'>(isKpi ? 'cell' : 'table');
  const [sheet, setSheet] = useState('');
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [table, setTable] = useState('');
  const [error, setError] = useState<string | null>(null);

  // A click in the workbook grid fills the cell fields (derived, adjusting state during render).
  const [lastPick, setLastPick] = useState<Pick | null>(null);
  if (pick && pick !== lastPick) {
    setLastPick(pick);
    setSheet(pick.worksheet);
    setAddress(pick.address);
    if (isKpi) setKind('cell');
  }

  if (!workbook) return <p className="muted">Import a workbook to bind this {component.type} to Excel data.</p>;

  function bind() {
    if (!workbook) return;
    let sel: Selection;
    if (kind === 'cell') {
      const addr = normalizeAddress(address);
      if (!addr) return setError(`"${address}" is not a valid cell address, e.g. B7.`);
      sel = { selectionType: 'cell', worksheet: sheet || workbook.sheets[0]?.name || '', address: addr };
    } else if (kind === 'namedRange') {
      sel = { selectionType: 'namedRange', name: name || workbook.definedNames[0]?.name || '' };
    } else {
      sel = { selectionType: 'table', table: table || workbook.tables[0]?.name || '' };
    }
    const r = makeBinding(workbook, sel);
    if (!r.ok) return setError(r.error);
    if (isKpi && r.binding.snapshot.kind !== 'scalar') return setError('A KPI needs a single value, not a table.');
    if (!isKpi && r.binding.snapshot.kind !== 'table') return setError('A table component needs an Excel table.');
    setError(null);
    onChange({ ...component, binding: r.binding });
  }

  return (
    <fieldset>
      <legend>Excel data (snapshot)</legend>
      {component.binding ? (
        <p data-testid="binding-info">
          Bound: {describeBinding(component.binding)}{' '}
          <button type="button" onClick={() => onChange({ ...component, binding: undefined })}>
            Remove binding
          </button>
        </p>
      ) : (
        <p className="muted">Not bound. Showing the static value below.</p>
      )}
      {isKpi && (
        <label className="field">
          Source type
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="cell">Cell</option>
            <option value="namedRange">Named range</option>
          </select>
        </label>
      )}
      {kind === 'cell' && (
        <>
          <label className="field">
            Worksheet
            <select value={sheet || workbook.sheets[0]?.name} onChange={(e) => setSheet(e.target.value)}>
              {workbook.sheets.map((s) => (
                <option key={s.name}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Cell address (or click a cell in the workbook panel)
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="B7" />
          </label>
        </>
      )}
      {kind === 'namedRange' && (
        <label className="field">
          Named range
          <select value={name || workbook.definedNames[0]?.name || ''} onChange={(e) => setName(e.target.value)}>
            {workbook.definedNames.map((d) => (
              <option key={d.name}>{d.name}</option>
            ))}
          </select>
        </label>
      )}
      {kind === 'table' && (
        <label className="field">
          Excel table
          <select value={table || workbook.tables[0]?.name || ''} onChange={(e) => setTable(e.target.value)}>
            {workbook.tables.map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="button" onClick={bind} disabled={(kind === 'table' && workbook.tables.length === 0) || (kind === 'namedRange' && workbook.definedNames.length === 0)}>
        Bind to {kind === 'cell' ? 'cell' : kind === 'namedRange' ? 'named range' : 'table'}
      </button>
    </fieldset>
  );
}

export function Inspector({ component, workbook, pick, liveSources, onChange }: Props) {
  if (!component) {
    return (
      <section aria-labelledby="insp-h" className="panel">
        <h2 id="insp-h">Inspector</h2>
        <p className="muted">Select a component in the outline to edit it.</p>
      </section>
    );
  }
  const c = component;
  return (
    <section aria-labelledby="insp-h" className="panel">
      <h2 id="insp-h">Inspector: {c.type}</h2>
      {c.type === 'heading' && (
        <>
          <label className="field">
            Text
            <input value={c.text} onChange={(e) => onChange({ ...c, text: e.target.value })} />
          </label>
          <label className="field">
            Level
            <select value={c.level} onChange={(e) => onChange({ ...c, level: Number(e.target.value) as 1 | 2 | 3 })}>
              <option value={1}>Heading 1</option>
              <option value={2}>Heading 2</option>
              <option value={3}>Heading 3</option>
            </select>
          </label>
        </>
      )}
      {c.type === 'text' && (
        <label className="field">
          Text
          <textarea rows={4} value={c.text} onChange={(e) => onChange({ ...c, text: e.target.value })} />
        </label>
      )}
      {c.type === 'callout' && (
        <>
          <label className="field">
            Tone
            <select value={c.tone} onChange={(e) => onChange({ ...c, tone: e.target.value as typeof c.tone })}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
            </select>
          </label>
          <label className="field">
            Text
            <textarea rows={3} value={c.text} onChange={(e) => onChange({ ...c, text: e.target.value })} />
          </label>
        </>
      )}
      {c.type === 'link' && (
        <>
          <label className="field">
            Link text
            <input value={c.text} onChange={(e) => onChange({ ...c, text: e.target.value })} />
          </label>
          <label className="field">
            Target (root-relative path like /sites/… or an https:// URL)
            <input value={c.href} aria-invalid={!isSafeHref(c.href)} aria-describedby="href-help" onChange={(e) => onChange({ ...c, href: e.target.value })} />
          </label>
          <p id="href-help" className={isSafeHref(c.href) ? 'muted' : 'error'} role={isSafeHref(c.href) ? undefined : 'alert'}>
            {isSafeHref(c.href)
              ? linkKind(c.href) === 'external'
                ? 'External link. The destination domain must be in the site’s HTML Field Security allow list.'
                : 'Same-site link. Replace any REPLACE-WITH-… placeholder with a real path before a tenant test.'
              : 'Not a valid target. Only root-relative paths and https:// URLs are exported; the link will render as plain text.'}
          </p>
        </>
      )}
      {c.type === 'liveKpi' && <LiveKpiEditor key={c.id} c={c} liveSources={liveSources} onChange={onChange} />}
      {c.type === 'stamp' && (
        <p className="muted">Renders the export timestamp and Studio build identifier. Values are filled in at export time; the preview shows a placeholder.</p>
      )}
      {c.type === 'kpi' && (
        <>
          <label className="field">
            Label
            <input value={c.label} onChange={(e) => onChange({ ...c, label: e.target.value })} />
          </label>
          <label className="field">
            Static value {c.binding && '(overridden by binding)'}
            <input value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value })} />
          </label>
          <label className="field">
            Prefix
            <input value={c.prefix} onChange={(e) => onChange({ ...c, prefix: e.target.value })} />
          </label>
          <label className="field">
            Suffix
            <input value={c.suffix} onChange={(e) => onChange({ ...c, suffix: e.target.value })} />
          </label>
          <BindingEditor key={c.id} component={c} workbook={workbook} pick={pick} onChange={onChange} />
        </>
      )}
      {c.type === 'table' && (
        <>
          <label className="field">
            Caption
            <input value={c.caption} onChange={(e) => onChange({ ...c, caption: e.target.value })} />
          </label>
          {!c.binding && (
            <>
              <label className="field">
                Columns (comma-separated)
                <input value={c.columns.join(', ')} onChange={(e) => onChange({ ...c, columns: e.target.value.split(',').map((s) => s.trim()) })} />
              </label>
              <label className="field">
                Rows (one per line, cells separated by |)
                <textarea rows={4} value={c.rows.map((r) => r.join(' | ')).join('\n')} onChange={(e) => onChange({ ...c, rows: e.target.value.split('\n').map((l) => l.split('|').map((s) => s.trim())) })} />
              </label>
            </>
          )}
          <BindingEditor key={c.id} component={c} workbook={workbook} pick={pick} onChange={onChange} />
        </>
      )}
    </section>
  );
}
