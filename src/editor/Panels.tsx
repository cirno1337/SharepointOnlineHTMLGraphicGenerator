import { CAPABILITIES } from '../core/capabilities';
import type { RefreshPlan } from '../core/excel/refresh';
import type { Issue } from '../core/validate';

export function ValidationPanel({ issues }: { issues: Issue[] }) {
  const errors = issues.filter((i) => i.severity === 'error').length;
  return (
    <section aria-labelledby="val-h" className="panel">
      <h2 id="val-h">Validation</h2>
      <div role="status" aria-live="polite" data-testid="validation-summary">
        {issues.length === 0 ? 'No issues. Export is ready.' : `${errors} error(s), ${issues.length - errors} warning(s).`}
      </div>
      <ul>
        {issues.map((i, n) => (
          <li key={n} className={i.severity}>
            <strong>{i.severity === 'error' ? 'Error' : 'Warning'}:</strong> {i.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CapabilitiesPanel() {
  return (
    <details className="panel">
      <summary>SharePoint platform capabilities</summary>
      <p className="muted">How Studio classifies platform behavior. Sources are listed in docs/research/sharepoint-html-pages.md.</p>
      <ul>
        {CAPABILITIES.map((c) => (
          <li key={c.id}>
            <span className={`badge badge-${c.status.toLowerCase()}`}>{c.status}</span> {c.label}
            <br />
            <span className="muted">{c.notes}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function RefreshPanel({ plan, fileName, onAccept, onCancel }: { plan: RefreshPlan; fileName: string; onAccept: () => void; onCancel: () => void }) {
  return (
    <section aria-labelledby="ref-h" className="panel" data-testid="refresh-preview">
      <h2 id="ref-h">Refresh preview: {fileName}</h2>
      {plan.changes.length === 0 ? (
        <p>No components are bound to workbook data.</p>
      ) : (
        <ul>
          {plan.changes.map((c) => (
            <li key={c.componentId} className={c.status === 'error' ? 'error' : undefined}>
              {c.label}: {c.status === 'unchanged' ? `${c.before} (unchanged)` : c.status === 'error' ? `cannot refresh — ${c.after}` : `${c.before} → ${c.after}`}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button type="button" onClick={onAccept} disabled={plan.changed === 0}>
          Accept {plan.changed} change(s)
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
