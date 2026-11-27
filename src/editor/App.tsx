import { useMemo, useReducer, useState } from 'react';
import { applyRefresh, planRefresh, type RefreshPlan } from '../core/excel/refresh';
import type { WorkbookData } from '../core/excel/types';
import { exportContext, renderPage } from '../core/export/render';
import { compileManifest } from '../core/livedata/manifest';
import { buildMockResults, mockFixtureWorkbook, mockInjectionScript, type MockScenario } from '../core/livedata/mock';
import { emptyProject, LEGACY_CELL_NOTICE, parseProject, type Component } from '../core/project';
import { BASELINE_TEMPLATE_NAME, buildBaselineProject } from '../core/templates/baseline';
import { validateHtml, validateProject } from '../core/validate';
import { downloadText, safeFileName } from './download';
import { LIVE_ENABLED } from './flags';
import { Inspector } from './Inspector';
import { LiveDataPanel } from './LiveDataPanel';
import { Outline } from './Outline';
import { CapabilitiesPanel, RefreshPanel, ValidationPanel } from './Panels';
import { Preview } from './Preview';
import { reducer } from './state';
import { TenantExportPanel } from './TenantExportPanel';
import { WorkbookPanel, type Pick } from './WorkbookPanel';

export function App() {
  const [project, dispatch] = useReducer(reducer, undefined, emptyProject);
  const [selectedId, setSelectedId] = useState<string | null>(project.page.components[0]?.id ?? null);
  const [workbook, setWorkbook] = useState<WorkbookData | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [plan, setPlan] = useState<{ plan: RefreshPlan; fileName: string } | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [scenario, setScenario] = useState<MockScenario>('ok');

  const html = useMemo(() => renderPage(project), [project]);
  const issues = useMemo(
    () => [...validateProject(project, { liveEnabled: LIVE_ENABLED }), ...validateHtml(html, { profile: project.page.exportProfile })],
    [project, html],
  );
  const interactive = project.page.exportProfile === 'interactive-safe';
  // Mock LiveData preview only: sanitized fixture or the locally imported workbook, never SharePoint.
  const mockScript = useMemo(() => {
    if (!interactive) return null;
    const used = new Set(project.page.components.flatMap((c) => (c.type === 'liveKpi' ? [c.sourceId] : [])));
    const manifest = compileManifest(project.page.liveSources, used);
    return mockInjectionScript(buildMockResults(manifest.entries, workbook ?? mockFixtureWorkbook(), scenario));
  }, [interactive, project.page.components, project.page.liveSources, workbook, scenario]);
  const hasErrors = issues.some((i) => i.severity === 'error');
  const selected = project.page.components.find((c) => c.id === selectedId) ?? null;
  const hasBindings = project.page.components.some((c) => (c.type === 'kpi' || c.type === 'table') && c.binding);

  function exportHtml() {
    if (hasErrors) return;
    downloadText(safeFileName(project.page.title, 'html'), 'text/html;charset=utf-8', renderPage(project, exportContext()));
    setMessage({ kind: 'ok', text: 'Exported. Upload the file to a Site Pages library using "Upload HTML page".' });
  }

  function saveProject() {
    if (project.page.liveSources.length > 0 && !window.confirm('This project contains SharePoint workbook item URLs (tenant host and workbook identifiers). Do not commit or share the project file. Save it?')) return;
    downloadText(safeFileName(project.name, 'studio.json'), 'application/json', JSON.stringify(project, null, 2));
  }

  function loadBaseline() {
    if (!window.confirm(`Replace the current project with the "${BASELINE_TEMPLATE_NAME}" template? Unsaved changes will be lost.`)) return;
    const p = buildBaselineProject();
    dispatch({ type: 'load', project: p });
    setSelectedId(p.page.components[0]?.id ?? null);
    setMessage({ kind: 'ok', text: `Loaded template "${BASELINE_TEMPLATE_NAME}". Edit the same-site link target before a tenant test.` });
  }

  async function openProject(file: File | undefined) {
    if (!file) return;
    try {
      const r = parseProject(JSON.parse(await file.text()));
      if (!r.ok) return setMessage({ kind: 'error', text: `Invalid project file: ${r.error}` });
      dispatch({ type: 'load', project: r.project });
      setSelectedId(r.project.page.components[0]?.id ?? null);
      setMessage(
        r.legacyComponentIds.length > 0
          ? { kind: 'error', text: `Opened ${r.project.name}. ${r.legacyComponentIds.length} Live KPI(s) used a removed cell-address selection. ${LEGACY_CELL_NOTICE}` }
          : { kind: 'ok', text: `Opened ${r.project.name}.` },
      );
    } catch {
      setMessage({ kind: 'error', text: 'The file is not valid JSON.' });
    }
  }

  function update(c: Component) {
    dispatch({ type: 'update', component: c });
  }

  return (
    <>
      <header className="topbar">
        <h1>SharePoint HTML Studio</h1>
        <label className="field inline">
          Project name
          <input value={project.name} onChange={(e) => dispatch({ type: 'rename', name: e.target.value })} />
        </label>
        <label className="field inline">
          Page title
          <input value={project.page.title} onChange={(e) => dispatch({ type: 'page', patch: { title: e.target.value } })} />
        </label>
        <label className="field inline">
          Accent
          <input type="color" value={project.page.accent} onChange={(e) => dispatch({ type: 'page', patch: { accent: e.target.value } })} />
        </label>
        <button type="button" onClick={saveProject}>
          Save project
        </button>
        <label className="field inline">
          Open project
          <input type="file" accept="application/json,.json" data-testid="open-project" onChange={(e) => void openProject(e.target.files?.[0])} />
        </label>
        <button type="button" onClick={loadBaseline}>
          Load “{BASELINE_TEMPLATE_NAME}” template
        </button>
        <button type="button" className="primary" onClick={exportHtml} disabled={hasErrors} aria-describedby="export-hint">
          Export HTML
        </button>
        <span id="export-hint" className="muted">
          {hasErrors ? 'Fix validation errors to export.' : interactive ? 'Single self-contained file with Studio’s inline LiveData runtime (experimental).' : 'Single self-contained file, no scripts.'}
        </span>
      </header>
      <div role="status" aria-live="polite" className={message ? `banner ${message.kind}` : 'sr-only'}>
        {message?.text}
      </div>
      <main className="layout">
        <div className="col">
          <Outline components={project.page.components} selectedId={selectedId} onSelect={setSelectedId} dispatch={dispatch} liveEnabled={LIVE_ENABLED} />
          <WorkbookPanel
            workbook={workbook}
            hasBindings={hasBindings}
            onLoaded={(wb) => {
              setWorkbook(wb);
              setMessage({ kind: 'ok', text: `Loaded ${wb.fileName} locally.` });
            }}
            onPick={setPick}
            onRefresh={(wb) => setPlan({ plan: planRefresh(project, wb), fileName: wb.fileName })}
          />
        </div>
        <div className="col wide">
          <Preview html={html} interactive={interactive} mockScript={mockScript} />
        </div>
        <div className="col">
          {plan && (
            <RefreshPanel
              plan={plan.plan}
              fileName={plan.fileName}
              onCancel={() => setPlan(null)}
              onAccept={() => {
                dispatch({ type: 'load', project: applyRefresh(project, plan.plan) });
                setMessage({ kind: 'ok', text: `Refreshed ${plan.plan.changed} bound value(s). Re-export to publish.` });
                setPlan(null);
              }}
            />
          )}
          {LIVE_ENABLED && <LiveDataPanel project={project} dispatch={dispatch} scenario={scenario} onScenario={setScenario} />}
          <TenantExportPanel project={project} hasErrors={hasErrors} liveEnabled={LIVE_ENABLED} />
          <Inspector component={selected} workbook={workbook} pick={pick} liveSources={project.page.liveSources} onChange={update} />
          <ValidationPanel issues={issues} />
          <CapabilitiesPanel />
        </div>
      </main>
    </>
  );
}
