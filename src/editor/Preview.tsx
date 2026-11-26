interface Props {
  html: string;
}

/** Renders the real export output in a fully sandboxed iframe (no scripts, no same-origin). */
export function Preview({ html }: Props) {
  return (
    <section aria-labelledby="preview-h" className="panel preview">
      <h2 id="preview-h">Preview</h2>
      <iframe title="Exported page preview" sandbox="" srcDoc={html} />
    </section>
  );
}
