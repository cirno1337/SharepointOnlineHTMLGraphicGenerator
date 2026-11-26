import { isSafeHref, type Component, type Project } from '../project';
import { STUDIO_BUILD } from '../version';
import { snapshotProvider } from '../providers';
import { escapeHtml, formatCell } from './escape';

/**
 * Content-Security-Policy delivered via <meta http-equiv>. Every directive is justified in
 * docs/security/csp.md. Changing this string is a security decision: update that document,
 * DECISIONS.md and the pinned test in tests/tenant.test.ts together.
 */
export const EXPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

/** Values only known at export time. The editor preview renders without them. */
export interface RenderContext {
  exportedAt: string; // ISO 8601 UTC
  studioBuild: string;
}

export function exportContext(now: Date = new Date()): RenderContext {
  return { exportedAt: now.toISOString(), studioBuild: STUDIO_BUILD };
}

const CSS = `
:root{--accent:__ACCENT__;--ink:#1b1b1b;--muted:#4a4a4a;--line:#c8c6c4;--surface:#f3f2f1}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.5}
main{max-width:64rem;margin:0 auto;padding:1.5rem 1rem 3rem;display:flex;flex-direction:column;gap:1.25rem}
h1,h2,h3{margin:0;line-height:1.25}
h1{font-size:2rem;border-bottom:4px solid var(--accent);padding-bottom:.5rem}
h2{font-size:1.5rem}h3{font-size:1.2rem}
p{margin:0;max-width:70ch;white-space:pre-line}
.sphs-kpi{display:inline-flex;flex-direction:column;gap:.25rem;align-self:flex-start;min-width:12rem;padding:1rem 1.25rem;border:1px solid var(--line);border-left:6px solid var(--accent);border-radius:4px;background:var(--surface)}
.sphs-kpi__label{color:var(--muted);font-size:.95rem}
.sphs-kpi__value{font-size:2.25rem;line-height:1.1}
.sphs-callout{padding:.9rem 1.1rem;border:1px solid var(--line);border-left:6px solid var(--accent);border-radius:4px;background:var(--surface);white-space:pre-line}
.sphs-callout--warning{border-left-color:#8a5a00}
.sphs-callout--success{border-left-color:#0b6a0b}
.sphs-scroll{overflow-x:auto}
.sphs-scroll:focus-visible,a:focus-visible{outline:3px solid #005a9e;outline-offset:2px}
table{border-collapse:collapse;width:100%;min-width:20rem}
caption{text-align:left;font-weight:600;padding:.5rem 0}
th,td{border:1px solid var(--line);padding:.5rem .75rem;text-align:left;vertical-align:top}
thead th{background:var(--surface)}
p,td,th,caption,.sphs-callout,.sphs-kpi__label,.sphs-kpi__value,.sphs-stamp dd,a{overflow-wrap:anywhere}
.sphs-kpi__value{min-width:0}
a{color:#0a4f8f}
.sphs-stamp{margin:0;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
.sphs-stamp div{display:flex;gap:.5rem;flex-wrap:wrap}
.sphs-stamp dt{font-weight:600}.sphs-stamp dd{margin:0}
`.trim();

function kpiValue(c: Extract<Component, { type: 'kpi' }>): string {
  if (c.binding) {
    const r = snapshotProvider.resolve(c.binding);
    if (r.ok && r.value.kind === 'scalar') return formatCell(r.value.value);
  }
  return c.value;
}

function tableData(c: Extract<Component, { type: 'table' }>) {
  if (c.binding) {
    const r = snapshotProvider.resolve(c.binding);
    if (r.ok && r.value.kind === 'table') return { columns: r.value.columns, rows: r.value.rows };
  }
  return { columns: c.columns, rows: c.rows };
}

function renderComponent(c: Component, ctx: RenderContext | undefined): string {
  switch (c.type) {
    case 'heading':
      return `<h${c.level}>${escapeHtml(c.text)}</h${c.level}>`;
    case 'text':
      return `<p>${escapeHtml(c.text)}</p>`;
    case 'callout':
      return `<aside class="sphs-callout sphs-callout--${c.tone}" role="note"><p>${escapeHtml(c.text)}</p></aside>`;
    case 'link':
      // Defense in depth: the schema already rejects unsafe hrefs; never emit one as a link.
      return isSafeHref(c.href)
        ? `<p><a href="${escapeHtml(c.href)}" rel="noopener noreferrer">${escapeHtml(c.text)}</a></p>`
        : `<p>${escapeHtml(c.text)}</p>`;
    case 'stamp': {
      const when = ctx ? `<time datetime="${escapeHtml(ctx.exportedAt)}">${escapeHtml(ctx.exportedAt)}</time>` : '(set at export time)';
      const build = ctx ? escapeHtml(ctx.studioBuild) : '(set at export time)';
      return `<dl class="sphs-stamp"><div><dt>Exported:</dt><dd>${when}</dd></div><div><dt>Studio build:</dt><dd>${build}</dd></div></dl>`;
    }
    case 'kpi':
      return `<div class="sphs-kpi"><span class="sphs-kpi__label">${escapeHtml(c.label)}</span><strong class="sphs-kpi__value">${escapeHtml(c.prefix + kpiValue(c) + c.suffix)}</strong></div>`;
    case 'table': {
      const { columns, rows } = tableData(c);
      const head = columns.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
      const body = rows
        .map((r) => `<tr>${columns.map((_, i) => `<td>${escapeHtml(formatCell(r[i] ?? null))}</td>`).join('')}</tr>`)
        .join('');
      return `<div class="sphs-scroll" role="region" aria-label="${escapeHtml(c.caption || 'Data table')}" tabindex="0"><table><caption>${escapeHtml(c.caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
  }
}

/**
 * Render a project to a single self-contained HTML document.
 * - zero scripts, zero network references, zero editor state
 * - all user and workbook text is HTML-escaped
 */
export function renderPage(project: Project, ctx?: RenderContext): string {
  const { page } = project;
  const accent = /^#[0-9a-fA-F]{6}$/.test(page.accent) ? page.accent : '#0f6cbd';
  const lang = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(page.lang) ? page.lang : 'en';
  const body = page.components.map((c) => renderComponent(c, ctx)).join('\n');
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">
<meta name="generator" content="SharePoint HTML Studio">
<title>${escapeHtml(page.title)}</title>
<style>
${CSS.replace('__ACCENT__', accent)}
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}
