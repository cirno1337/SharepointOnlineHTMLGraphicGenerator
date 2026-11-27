import { isSafeHref, type Component, type Project } from '../project';
import { STUDIO_BUILD } from '../version';
import { snapshotProvider } from '../providers';
import { FRESHNESS_HINT } from '../livedata/constants';
import type { LiveSelector } from '../livedata/selector';
import { compileManifest, type CompiledManifest } from '../livedata/manifest';
import { RUNTIME_SOURCE } from '../livedata/runtime';
import { escapeHtml, formatCell } from './escape';

/**
 * Content-Security-Policy delivered via <meta http-equiv>. Every directive is justified in
 * docs/security/csp.md. Changing this string is a security decision: update that document,
 * DECISIONS.md and the pinned test in tests/tenant.test.ts together.
 */
export const EXPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
/** Static Safe profile: no script of any kind. Identical to the original policy. */
export const STATIC_CSP = EXPORT_CSP;
/**
 * Interactive Safe profile (experimental). The only change from Static Safe is `script-src 'unsafe-inline'`,
 * the smallest change found to let the LiveData runtime run in one tenant (lab LD-04: Studio's static policy
 * blocked the inline script; adding this directive fixed it). `unsafe-inline` allows ANY inline script in the
 * document, so the export validator requires the only executable script to be Studio's own runtime. Not
 * claimed to work in other tenants. No connect-src, frame-src, external script/style or unsafe-eval.
 */
export const INTERACTIVE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:";

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

/** Only added to Interactive Safe exports that contain a Live KPI, so Static Safe output is unchanged. */
const LIVE_CSS = `
.sphs-live{gap:.4rem}
.sphs-live__badge{align-self:flex-start;padding:.1rem .5rem;border:1px solid #8a5a00;border-radius:999px;font-size:.8rem;font-weight:600}
.sphs-live__meta,.sphs-live__hint,.sphs-live__diag,.sphs-live__refresh-status,.sphs-live__threshold{color:var(--muted);font-size:.85rem}
.sphs-live__message{font-size:.95rem}
.sphs-live[data-sphs-state="error"] .sphs-live__message{font-weight:600}
.sphs-live--warning{border-left-color:#8a5a00}
.sphs-live--critical{border-left-color:#a4262c}
.sphs-live__threshold{font-weight:600}
.sphs-live__refresh{align-self:flex-start;padding:.35rem .8rem;border:1px solid var(--accent);border-radius:4px;background:#fff;color:#0a4f8f;font:inherit;cursor:pointer}
.sphs-live__refresh:disabled{opacity:.6;cursor:default}
.sphs-live__refresh:focus-visible{outline:3px solid #005a9e;outline-offset:2px}
.sphs-live [hidden]{display:none}
.sphs-live__diag,.sphs-live__hint,.sphs-live__meta,.sphs-live__message,.sphs-live__refresh-status{overflow-wrap:anywhere}
`.trim();

interface RenderOptions {
  interactive: boolean;
  manifest: CompiledManifest | null;
}

function domId(id: string): string {
  return `sphs-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/** Selector data attributes. A removed positional selector is emitted as "unsupported" (validation blocks that export). */
function selectorAttrs(sel: LiveSelector): string[] {
  if (sel.type !== 'label-adjacent') return ['data-sphs-selector="unsupported"'];
  return [
    'data-sphs-selector="label-adjacent"',
    `data-sphs-label="${escapeHtml(sel.label).replace(/\r/g, '&#13;')}"`,
    `data-sphs-match-col="${sel.matchColumn}"`,
    `data-sphs-value-offset="${sel.valueOffset}"`,
    `data-sphs-case="${sel.caseSensitive ? 1 : 0}"`,
    `data-sphs-trim="${sel.trim ? 1 : 0}"`,
    `data-sphs-allow-empty="${sel.allowEmptyValue ? 1 : 0}"`,
  ];
}

function renderLiveKpi(c: Extract<Component, { type: 'liveKpi' }>, opts: RenderOptions): string {
  const label = escapeHtml(c.label);
  if (!opts.interactive) {
    // Static Safe cannot run the runtime: show an honest placeholder (validation also blocks export).
    return `<div class="sphs-kpi"><span class="sphs-kpi__label">${label}</span><strong class="sphs-kpi__value">—</strong><span>Live data requires the Interactive Safe profile.</span></div>`;
  }
  const index = opts.manifest?.indexBySourceId.get(c.sourceId);
  const attrs: string[] = [
    'data-sphs-live="kpi"',
    `data-sphs-source="${index === undefined ? -1 : index}"`,
    `data-sphs-sheet="${escapeHtml(c.worksheet)}"`,
    ...selectorAttrs(c.selector),
    `data-sphs-format="${c.numberFormat}"`,
    `data-sphs-show-loaded="${c.showLoadedAt ? 1 : 0}"`,
    `data-sphs-show-refresh="${c.showRefresh ? 1 : 0}"`,
  ];
  if (c.prefix) attrs.push(`data-sphs-prefix="${escapeHtml(c.prefix)}"`);
  if (c.suffix) attrs.push(`data-sphs-suffix="${escapeHtml(c.suffix)}"`);
  if (c.emptyText) attrs.push(`data-sphs-empty-text="${escapeHtml(c.emptyText)}"`);
  if (c.errorText) attrs.push(`data-sphs-error-text="${escapeHtml(c.errorText)}"`);
  if (c.warnAt !== undefined) attrs.push(`data-sphs-warn="${c.warnAt}"`);
  if (c.criticalAt !== undefined) attrs.push(`data-sphs-critical="${c.criticalAt}"`);
  if (c.fallback) {
    attrs.push(`data-sphs-fallback-value="${escapeHtml(c.fallback.value)}"`);
    if (c.fallback.importedAt) attrs.push(`data-sphs-fallback-at="${escapeHtml(c.fallback.importedAt)}"`);
  }
  const lid = domId(c.id);
  return (
    `<section class="sphs-kpi sphs-live" role="group" ${attrs.join(' ')} aria-labelledby="${lid}-label">` +
    `<span class="sphs-kpi__label" id="${lid}-label">${label}</span>` +
    `<strong class="sphs-kpi__value">—</strong>` +
    `<span class="sphs-live__badge" hidden></span>` +
    `<span class="sphs-live__threshold" hidden></span>` +
    `<span class="sphs-live__meta" hidden></span>` +
    `<span class="sphs-live__message" role="status">Loading live data…</span>` +
    `<span class="sphs-live__diag" hidden></span>` +
    `<button type="button" class="sphs-live__refresh" hidden>Refresh data</button>` +
    `<span class="sphs-live__refresh-status" role="status" aria-live="polite"></span>` +
    `<small class="sphs-live__hint">${escapeHtml(FRESHNESS_HINT)}</small>` +
    `</section>`
  );
}

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

function renderComponent(c: Component, ctx: RenderContext | undefined, opts: RenderOptions): string {
  switch (c.type) {
    case 'liveKpi':
      return renderLiveKpi(c, opts);
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
  const interactive = page.exportProfile === 'interactive-safe';
  const liveIds = new Set(page.components.flatMap((c) => (c.type === 'liveKpi' ? [c.sourceId] : [])));
  const hasLive = liveIds.size > 0 || page.components.some((c) => c.type === 'liveKpi');
  const manifest = interactive && hasLive ? compileManifest(page.liveSources, liveIds) : null;
  const opts: RenderOptions = { interactive, manifest };
  const body = page.components.map((c) => renderComponent(c, ctx, opts)).join('\n');
  const css = CSS.replace('__ACCENT__', accent) + (interactive && hasLive ? `\n${LIVE_CSS}` : '');
  const scripts = interactive && hasLive ? `\n${manifest?.scriptTag ?? ''}\n<script>\n${RUNTIME_SOURCE}\n</script>` : '';
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${interactive ? INTERACTIVE_CSP : STATIC_CSP}">
<meta name="generator" content="SharePoint HTML Studio">
<title>${escapeHtml(page.title)}</title>
<style>
${css}
</style>
</head>
<body>
<main>
${body}
</main>${scripts}
</body>
</html>
`;
}
