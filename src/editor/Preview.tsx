interface Props {
  html: string;
  /** Interactive Safe pages need scripts; they get `allow-scripts` only (never same-origin) plus mock host data. */
  interactive?: boolean;
  /** `<script>` defining window.__LD_RESULTS__ for the MOCK LiveData preview. Never part of an export. */
  mockScript?: string | null;
}

/** Renders the real export output in a sandboxed iframe (no same-origin; scripts only for Interactive Safe). */
export function Preview({ html, interactive = false, mockScript = null }: Props) {
  const doc = interactive && mockScript ? html.replace('<head>', `<head>\n${mockScript}`) : html;
  return (
    <section aria-labelledby="preview-h" className="panel preview">
      <h2 id="preview-h">Preview</h2>
      {interactive && (
        <p className="banner ok" data-testid="mock-banner">
          <strong>Mock LiveData preview.</strong> Not connected to SharePoint: the values below come from sanitized fixture data or a workbook you imported locally. No network requests are made.
        </p>
      )}
      <iframe title="Exported page preview" sandbox={interactive ? 'allow-scripts' : ''} srcDoc={doc} />
    </section>
  );
}
