import { useState } from 'react';
import { createTenantTestExport, type TenantExport } from '../core/tenant/report';
import type { Project } from '../core/project';
import { downloadText } from './download';

interface Props {
  project: Project;
  hasErrors: boolean;
  liveEnabled?: boolean;
}

export function TenantExportPanel({ project, hasErrors, liveEnabled = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TenantExport | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await createTenantTestExport(project, undefined, { liveEnabled }));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : 'Tenant test export failed.');
    } finally {
      setBusy(false);
    }
  }

  const stale = result !== null && result.source !== project;
  const r = result?.report;

  return (
    <section aria-labelledby="tenant-h" className="panel" data-testid="tenant-panel">
      <h2 id="tenant-h">Tenant test export</h2>
      <p className="muted">
        Generates the normal export for the selected profile plus a separate validation report with exact size and SHA-256. Static Safe contains no script. Interactive Safe (experimental) contains only Studio's inline runtime and a manifest holding the workbook item URL (tenant host and identifiers). No network calls, credentials or sharing links are added.
        Follow docs/testing/real-tenant-baseline.md. Passing here does not prove SharePoint compatibility.
      </p>
      <button type="button" onClick={() => void run()} disabled={busy || hasErrors} aria-describedby="tenant-hint">
        Tenant Test Export
      </button>
      <p id="tenant-hint" className="muted">
        {hasErrors ? 'Fix validation errors first.' : busy ? 'Generating…' : ''}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div role="status" aria-live="polite">
        {stale && <p className="error">The project changed after this export. Run Tenant Test Export again.</p>}
      </div>
      {r && result && (
        <>
          <dl className="facts" data-testid="tenant-facts">
            <div>
              <dt>File</dt>
              <dd>{r.html.fileName}</dd>
            </div>
            <div>
              <dt>UTF-8 size</dt>
              <dd data-testid="tenant-bytes">{r.html.utf8Bytes.toLocaleString('en-US')} bytes</dd>
            </div>
            <div>
              <dt>Of 10 MB limit</dt>
              <dd data-testid="tenant-percent">{r.html.percentOfLimit}%</dd>
            </div>
            <div>
              <dt>SHA-256</dt>
              <dd className="mono" data-testid="tenant-sha">
                {r.html.sha256}
              </dd>
            </div>
            <div>
              <dt>Validation</dt>
              <dd>
                {r.validation.errorCount} error(s), {r.validation.warningCount} warning(s)
              </dd>
            </div>
            <div>
              <dt>Scripts / resource references</dt>
              <dd>
                {r.checks.scriptCount} / {r.checks.resourceReferenceCount}
              </dd>
            </div>
            <div>
              <dt>Links (same-site / external)</dt>
              <dd>
                {r.checks.sameSiteLinkCount} / {r.checks.externalLinkCount}
              </dd>
            </div>
            <div>
              <dt>Studio build</dt>
              <dd className="mono">{r.studio.build}</dd>
            </div>
          </dl>
          <div className="row wrap">
            <button type="button" disabled={stale} onClick={() => downloadText(result.htmlFileName, 'text/html;charset=utf-8', result.html)}>
              Download HTML
            </button>
            <button type="button" disabled={stale} onClick={() => downloadText(result.reportFileName, 'application/json', result.reportJson)}>
              Download validation report (JSON)
            </button>
          </div>
          <p className="muted">Upload only the HTML file to SharePoint. Keep the report with your test notes.</p>
        </>
      )}
    </section>
  );
}
