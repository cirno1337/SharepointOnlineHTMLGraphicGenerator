import { useState } from 'react';
import { SELECTOR_SEMANTICS_NOTICE, LIVEDATA_CONTRACT_REVISION, LIVEDATA_UI_WARNING, PERMISSION_BLOCKER_NOTICE } from '../core/livedata/constants';
import { MOCK_SCENARIOS, type MockScenario } from '../core/livedata/mock';
import { renderProbePage } from '../core/livedata/probe';
import { compileManifest } from '../core/livedata/manifest';
import { sanitizedDiagnostic, validateLiveSourceShape, type LiveSource } from '../core/livedata/source';
import type { Project } from '../core/project';
import { downloadText } from './download';
import type { Action } from './state';

interface Props {
  project: Project;
  dispatch: (a: Action) => void;
  scenario: MockScenario;
  onScenario: (s: MockScenario) => void;
}

const EMPTY = { displayName: '', fileName: '', spItemUrl: '', filePath: '', label: '', cslViewLink: '', ack: false };

export function LiveDataPanel({ project, dispatch, scenario, onScenario }: Props) {
  const { liveSources, exportProfile } = project.page;
  const [form, setForm] = useState(EMPTY);
  const [problems, setProblems] = useState<ReturnType<typeof validateLiveSourceShape>>([]);
  const [diag, setDiag] = useState<string | null>(null);

  function draft(): LiveSource {
    return {
      id: `src${liveSources.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      displayName: form.displayName.trim() || form.fileName.trim(),
      kind: 'sharepoint-excel-livedata',
      contractRevision: LIVEDATA_CONTRACT_REVISION,
      spItemUrl: form.spItemUrl.trim(),
      fileName: form.fileName.trim(),
      filePath: form.filePath.trim() || undefined,
      label: form.label.trim() || undefined,
      cslViewLink: form.cslViewLink.trim() || undefined,
      acknowledgedExperimental: form.ack,
    };
  }

  function validate() {
    setProblems(validateLiveSourceShape(draft()));
  }

  function add() {
    const d = draft();
    const p = validateLiveSourceShape(d);
    setProblems(p);
    if (p.some((x) => x.severity === 'error')) return;
    dispatch({ type: 'page', patch: { liveSources: [...liveSources, d] } });
    setForm(EMPTY);
    setProblems([]);
  }

  function copyDiagnostic(s: LiveSource) {
    const text = JSON.stringify(sanitizedDiagnostic(s), null, 2);
    setDiag(text);
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  function downloadProbe() {
    const manifest = compileManifest(liveSources);
    downloadText('livedata-probe.html', 'text/html;charset=utf-8', renderProbePage(manifest));
  }

  const interactive = exportProfile === 'interactive-safe';

  return (
    <section aria-labelledby="live-h" className="panel" data-testid="live-panel">
      <h2 id="live-h">
        SharePoint Live Excel <span className="badge badge-experimental">Experimental</span>
      </h2>
      <p role="note" className="error" data-testid="live-warning">
        {LIVEDATA_UI_WARNING}
      </p>
      <p className="muted">{PERMISSION_BLOCKER_NOTICE}</p>

      <fieldset>
        <legend>Data mode</legend>
        <label className="field">
          <span>
            <input type="radio" name="data-mode" checked={!interactive} onChange={() => dispatch({ type: 'page', patch: { exportProfile: 'static-safe' } })} /> Snapshot, recommended (Static Safe: no script)
          </span>
        </label>
        <label className="field">
          <span>
            <input type="radio" name="data-mode" checked={interactive} onChange={() => dispatch({ type: 'page', patch: { exportProfile: 'interactive-safe' } })} /> SharePoint Live Excel, experimental (Interactive Safe: inline script)
          </span>
        </label>
      </fieldset>

      {interactive && (
        <>
          <label className="field">
            Mock LiveData preview scenario
            <select aria-label="Mock LiveData preview scenario" value={scenario} onChange={(e) => onScenario(e.target.value as MockScenario)}>
              {MOCK_SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">{SELECTOR_SEMANTICS_NOTICE}</p>

          <h3>Sources</h3>
          {liveSources.length === 0 ? (
            <p className="muted">No sources yet. Add one below.</p>
          ) : (
            <ul>
              {liveSources.map((s) => (
                <li key={s.id}>
                  {s.displayName} <span className="muted">({s.fileName}; item URL not shown)</span>{' '}
                  <button type="button" onClick={() => copyDiagnostic(s)}>
                    Copy sanitized diagnostic
                  </button>{' '}
                  <button type="button" onClick={() => dispatch({ type: 'page', patch: { liveSources: liveSources.filter((x) => x.id !== s.id) } })}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {diag && (
            <pre className="muted" data-testid="live-diagnostic">
              {diag}
            </pre>
          )}

          <fieldset>
            <legend>Add SharePoint Live Excel source</legend>
            <p className="muted">Studio cannot discover the item URL. Enter it manually. It contains your tenant host and workbook identifiers: treat it as sensitive, and note that saving the project JSON includes it.</p>
            <label className="field">
              Display name
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </label>
            <label className="field">
              Workbook file name (with extension)
              <input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="status.xlsx" />
            </label>
            <label className="field">
              spItemUrl (https://host/_api/v2.0/drives/…/items/…)
              <input value={form.spItemUrl} onChange={(e) => setForm({ ...form, spItemUrl: e.target.value })} autoComplete="off" spellCheck={false} />
            </label>
            <label className="field">
              filePath (optional, not exported)
              <input value={form.filePath} onChange={(e) => setForm({ ...form, filePath: e.target.value })} />
            </label>
            <label className="field">
              label (optional, not exported)
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </label>
            <label className="field">
              cslViewLink (optional, stored only, never exported)
              <input value={form.cslViewLink} onChange={(e) => setForm({ ...form, cslViewLink: e.target.value })} autoComplete="off" spellCheck={false} />
            </label>
            <p className="muted">Observed contract revision: {LIVEDATA_CONTRACT_REVISION}</p>
            <label className="field">
              <span>
                <input type="checkbox" checked={form.ack} onChange={(e) => setForm({ ...form, ack: e.target.checked })} /> I understand this uses an undocumented, experimental SharePoint behavior that may change without notice.
              </span>
            </label>
            {problems.length > 0 && (
              <ul>
                {problems.map((p) => (
                  <li key={p.code} className={p.severity} role={p.severity === 'error' ? 'alert' : undefined}>
                    <strong>{p.severity === 'error' ? 'Error' : 'Warning'}:</strong> {p.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="row wrap">
              <button type="button" onClick={validate}>
                Validate shape
              </button>
              <button type="button" onClick={add}>
                Add source
              </button>
            </div>
            <p className="muted">“Validate shape” only checks the text format. It does not contact SharePoint and does not prove the URL works.</p>
          </fieldset>

          <h3>Diagnostics</h3>
          <button type="button" onClick={downloadProbe} disabled={liveSources.length === 0}>
            Download LiveData probe page (LD-09)
          </button>
          <p className="muted">A controlled-test page that prints the structure of the data SharePoint injects (it shows workbook values as text). Use only with a synthetic workbook, and upload it only when your tenant test plan allows.</p>
        </>
      )}
    </section>
  );
}
