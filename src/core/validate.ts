import { MAX_HTML_BYTES } from './capabilities';
import type { Project } from './project';

export type Severity = 'error' | 'warning';
export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  componentId?: string;
}

/** Validate the authored project (accessibility + data integrity). */
export function validateProject(project: Project): Issue[] {
  const issues: Issue[] = [];
  const comps = project.page.components;
  if (comps.length === 0) issues.push({ severity: 'error', code: 'empty-page', message: 'The page has no components.' });
  if (!project.page.title.trim()) issues.push({ severity: 'error', code: 'no-title', message: 'The page needs a title.' });

  const h1s = comps.filter((c) => c.type === 'heading' && c.level === 1);
  if (h1s.length === 0) issues.push({ severity: 'warning', code: 'no-h1', message: 'Add one level-1 heading for the page.' });
  if (h1s.length > 1) issues.push({ severity: 'warning', code: 'multi-h1', message: 'Use only one level-1 heading.' });

  let lastLevel = 0;
  for (const c of comps) {
    if (c.type === 'heading') {
      if (!c.text.trim()) issues.push({ severity: 'error', code: 'empty-heading', message: 'Heading is empty.', componentId: c.id });
      if (lastLevel && c.level > lastLevel + 1) {
        issues.push({ severity: 'warning', code: 'heading-skip', message: `Heading level jumps from h${lastLevel} to h${c.level}.`, componentId: c.id });
      }
      lastLevel = c.level;
    }
    if (c.type === 'kpi') {
      if (!c.label.trim()) issues.push({ severity: 'error', code: 'kpi-label', message: 'KPI needs a label.', componentId: c.id });
      if (c.binding && c.binding.snapshot.kind !== 'scalar') {
        issues.push({ severity: 'error', code: 'kpi-binding', message: 'KPI must bind to a single value.', componentId: c.id });
      }
    }
    if (c.type === 'table') {
      if (!c.caption.trim()) issues.push({ severity: 'warning', code: 'table-caption', message: 'Table should have a caption.', componentId: c.id });
      if (c.binding && c.binding.snapshot.kind !== 'table') {
        issues.push({ severity: 'error', code: 'table-binding', message: 'Table must bind to an Excel table.', componentId: c.id });
      }
    }
  }
  return issues;
}

const EXTERNAL_ATTR = /\b(?:src|href|action|poster|data|srcset)\s*=\s*["']?\s*(?:https?:)?\/\//i;
const FORBIDDEN_SCRIPT_APIS: [RegExp, string][] = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\blocalStorage\b/, 'localStorage'],
  [/graph\.microsoft\.com/i, 'Microsoft Graph URL'],
  [/_api\//, 'SharePoint REST URL'],
];

/** Validate final exported HTML against documented SharePoint HTML Page constraints. */
export function validateHtml(html: string): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, code: string, message: string) => issues.push({ severity, code, message });

  const bytes = new TextEncoder().encode(html).length;
  if (bytes > MAX_HTML_BYTES) add('error', 'size', `HTML is ${(bytes / 1048576).toFixed(1)} MB; the limit is 10 MB.`);

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  for (const [, attrs = '', body = ''] of scripts) {
    if (/\bsrc\s*=/i.test(attrs)) add('error', 'external-script', 'External scripts are not supported by SharePoint HTML Pages.');
    for (const [re, name] of FORBIDDEN_SCRIPT_APIS) {
      if (re.test(body)) add('error', 'forbidden-api', `Script uses ${name}, which is blocked in SharePoint HTML Pages.`);
    }
  }
  if (scripts.length > 0) add('warning', 'inline-script', 'Page contains inline script; review manually (Studio itself exports none).');

  if (/\son[a-z]+\s*=/i.test(stripTextNodesAndStyle(html))) add('error', 'inline-handler', 'Inline event handler attributes are not allowed.');
  if (/javascript:/i.test(stripTextNodesAndStyle(html))) add('error', 'javascript-url', 'javascript: URLs are not allowed.');
  if (EXTERNAL_ATTR.test(stripTextNodesAndStyle(html))) add('error', 'external-resource', 'External resources are not confirmed to load in SharePoint HTML Pages.');
  if (/<link\b/i.test(html)) add('error', 'link-tag', '<link> elements are not allowed.');
  if (/url\(\s*["']?\s*(?:https?:)?\/\//i.test(html) || /@import/i.test(html)) add('error', 'external-css', 'External CSS resources are not allowed.');
  if (/<iframe\b/i.test(html)) add('warning', 'iframe', 'Nested iframes are undocumented for HTML Pages.');
  if (/<form\b/i.test(html)) add('warning', 'form', 'HTML forms are undocumented for HTML Pages; submissions to external endpoints will be blocked.');
  if (/sourceMappingURL=|\/@vite\/|__vite|data-gjs|gjs-|grapesjs|react-refresh/i.test(html)) {
    add('error', 'editor-runtime', 'Export contains editor/development runtime artifacts.');
  }
  return issues;
}

/** Remove text content between tags so that escaped user text can't trigger attribute heuristics. */
function stripTextNodesAndStyle(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/>[^<]*</g, '><');
}
