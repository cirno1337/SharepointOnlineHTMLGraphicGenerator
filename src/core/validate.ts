import { MAX_HTML_BYTES } from './capabilities';
import { INTERACTIVE_CSP, STATIC_CSP } from './export/render';
import { CELL_ADDRESSING_NOTICE, LIVE_CELL_ADDRESSING_ENABLED, LIVEDATA_WARNING, MAX_LIVE_SOURCES, PERMISSION_BLOCKER_NOTICE } from './livedata/constants';
import { RUNTIME_SOURCE } from './livedata/runtime';
import { parseLiveCellAddress, parseSpItemUrl, validateLiveSourceShape } from './livedata/source';
import type { ExportProfile, Project } from './project';

export type Severity = 'error' | 'warning';
export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  componentId?: string;
}

export interface ValidateProjectOptions {
  /** VITE_EXPERIMENTAL_EXCEL_LIVE. When false, any Live Excel component is an error. */
  liveEnabled?: boolean;
}

/** Validate the authored project (accessibility + data integrity). */
export function validateProject(project: Project, opts: ValidateProjectOptions = {}): Issue[] {
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
    if (c.type === 'link' && !c.text.trim()) {
      issues.push({ severity: 'error', code: 'link-text', message: 'Link needs visible text.', componentId: c.id });
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
  issues.push(...validateLive(project, opts));
  return issues;
}

function validateLive(project: Project, opts: ValidateProjectOptions): Issue[] {
  const issues: Issue[] = [];
  const { page } = project;
  const live = page.components.filter((c): c is Extract<typeof c, { type: 'liveKpi' }> => c.type === 'liveKpi');
  const err = (code: string, message: string, componentId?: string) => issues.push({ severity: 'error', code, message, componentId });
  const warn = (code: string, message: string, componentId?: string) => issues.push({ severity: 'warning', code, message, componentId });

  if (page.liveSources.length > MAX_LIVE_SOURCES) err('live-too-many-sources', `At most ${MAX_LIVE_SOURCES} live sources are supported.`);
  if (live.length === 0) {
    if (page.exportProfile === 'interactive-safe') {
      warn('interactive-without-live', 'Interactive Safe is selected but the page has no Live Excel component. Use Static Safe unless you need live data.');
    }
    return issues;
  }
  if (!opts.liveEnabled) {
    err('live-disabled', 'SharePoint Live Excel is experimental and disabled in this build. Remove the Live Excel components or build with VITE_EXPERIMENTAL_EXCEL_LIVE=true.');
  }
  if (page.exportProfile !== 'interactive-safe') err('live-needs-interactive', 'Live Excel components need the Interactive Safe export profile.');
  warn('live-experimental', LIVEDATA_WARNING);
  warn('live-permissions', PERMISSION_BLOCKER_NOTICE);
  if (!LIVE_CELL_ADDRESSING_ENABLED) {
    for (const c of live) err('live-addressing-disabled', CELL_ADDRESSING_NOTICE, c.id);
  }

  const reported = new Set<string>();
  for (const c of live) {
    if (!c.label.trim()) err('live-label', 'Live KPI needs a label.', c.id);
    if (!c.worksheet.trim()) err('live-worksheet', 'Live KPI needs a worksheet name.', c.id);
    if (parseLiveCellAddress(c.cell) === null) err('live-cell', 'Live KPI cell must be a single cell such as B7.', c.id);
    if (c.warnAt !== undefined && c.criticalAt !== undefined && c.criticalAt < c.warnAt) {
      warn('live-thresholds', 'The critical threshold is lower than the warning threshold.', c.id);
    }
    const source = page.liveSources.find((x) => x.id === c.sourceId);
    if (!source) {
      err('live-source-missing', 'Live KPI refers to a source that does not exist.', c.id);
      continue;
    }
    if (reported.has(source.id)) continue;
    reported.add(source.id);
    for (const p of validateLiveSourceShape(source)) {
      issues.push({ severity: p.severity, code: `live-source-${p.code}`, message: `${source.displayName || source.id}: ${p.message}` });
    }
  }
  return issues;
}

// Resource-loading attributes only. <a href> is navigation, handled separately below.
const EXTERNAL_ATTR = /\b(?:src|action|formaction|poster|data|srcset)\s*=\s*["']?\s*(?:https?:)?\/\//i;
const RESOURCE_ATTR = /\s(?:src|srcset|action|formaction|poster|data)\s*=/gi;
const FORBIDDEN_SCRIPT_APIS: [RegExp, string][] = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bsessionStorage\b/, 'sessionStorage'],
  [/\bindexedDB\b/, 'indexedDB'],
  [/document\.cookie/, 'document.cookie'],
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\b|\bFunction\s*\(/, 'the Function constructor'],
  [/\bimportScripts\b|\bimport\s*\(/, 'dynamic import'],
  [/\bnew\s+(?:Shared)?Worker\b|serviceWorker/, 'a Worker'],
  [/\.(?:innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write/, 'HTML string injection'],
  [/graph\.microsoft\.com/i, 'Microsoft Graph URL'],
  [/_api\//, 'SharePoint REST URL'],
];
const REST_ONLY = 'SharePoint REST URL';

export interface ValidateHtmlOptions {
  /** When given, the CSP and the allowed scripts are checked against this export profile. */
  profile?: ExportProfile;
}

function validateManifestBody(body: string, add: (severity: Severity, code: string, message: string) => void): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    add('error', 'manifest-invalid', 'The LiveData manifest is not valid JSON.');
    return;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_LIVE_SOURCES) {
    add('error', 'manifest-invalid', 'The LiveData manifest must be a non-empty array of sources.');
    return;
  }
  for (const e of parsed as unknown[]) {
    const o = e as Record<string, unknown> | null;
    const keys = o && typeof o === 'object' ? Object.keys(o).sort().join(',') : '';
    if (!o || typeof o !== 'object' || keys !== 'fileName,spItemUrl' || typeof o.spItemUrl !== 'string' || typeof o.fileName !== 'string' || !parseSpItemUrl(o.spItemUrl)) {
      add('error', 'manifest-invalid', 'Each LiveData manifest entry must contain exactly spItemUrl (observed shape) and fileName.');
      return;
    }
  }
}

/** Validate final exported HTML against documented SharePoint HTML Page constraints. */
export function validateHtml(html: string, opts: ValidateHtmlOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, code: string, message: string) => issues.push({ severity, code, message });

  const bytes = new TextEncoder().encode(html).length;
  if (bytes > MAX_HTML_BYTES) add('error', 'size', `HTML is ${(bytes / 1048576).toFixed(1)} MB; the limit is 10 MB.`);

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  let manifestCount = 0;
  let runtimeCount = 0;
  let otherCount = 0;
  for (const [, attrs = '', body = ''] of scripts) {
    if (/\bsrc\s*=/i.test(attrs)) add('error', 'external-script', 'External scripts are not supported by SharePoint HTML Pages.');
    const isManifest = /\btype\s*=\s*"application\/json"/i.test(attrs) && /\bclass\s*=\s*"ka-livedata-manifest"/i.test(attrs);
    if (isManifest) {
      // JSON data, not executable. The item URL legitimately contains "/_api/"; everything else stays forbidden.
      manifestCount += 1;
      validateManifestBody(body, add);
    }
    for (const [re, name] of FORBIDDEN_SCRIPT_APIS) {
      if (isManifest && name === REST_ONLY) continue;
      if (re.test(body)) add('error', 'forbidden-api', `Script uses ${name}, which is blocked in SharePoint HTML Pages.`);
    }
    if (!isManifest) {
      if (body.trim() === RUNTIME_SOURCE) runtimeCount += 1;
      else otherCount += 1;
    }
  }
  if (opts.profile === 'interactive-safe') {
    if (otherCount > 0) add('error', 'unexpected-script', "Interactive Safe exports may contain only Studio's own inline runtime and the LiveData manifest.");
    if (runtimeCount > 1 || manifestCount > 1) add('error', 'duplicate-livedata-script', 'The page contains more than one runtime or manifest.');
    if (runtimeCount === 1 && manifestCount === 0) add('error', 'runtime-without-manifest', 'The LiveData runtime has no valid source manifest.');
    if (manifestCount === 1 && runtimeCount === 0) add('error', 'manifest-without-runtime', 'The LiveData manifest has no runtime.');
  } else if (scripts.length > 0) {
    if (opts.profile === 'static-safe') add('error', 'script-in-static', 'Static Safe exports must not contain any script.');
    else add('warning', 'inline-script', 'Page contains inline script; review manually (Studio itself exports none).');
  }
  if (opts.profile) {
    const expected = opts.profile === 'interactive-safe' ? INTERACTIVE_CSP : STATIC_CSP;
    const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
    if (!meta || meta[1] !== expected) add('error', 'csp-profile', 'The Content-Security-Policy meta does not match the selected export profile.');
  }

  if (/\son[a-z]+\s*=/i.test(stripTextNodesAndStyle(html))) add('error', 'inline-handler', 'Inline event handler attributes are not allowed.');
  if (/javascript:/i.test(stripTextNodesAndStyle(html))) add('error', 'javascript-url', 'javascript: URLs are not allowed.');
  if (EXTERNAL_ATTR.test(stripTextNodesAndStyle(html))) add('error', 'external-resource', 'External resources are not confirmed to load in SharePoint HTML Pages.');
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[0]);
    const value = (href?.[1] ?? href?.[2] ?? '').replace(/&#39;/g, "'");
    if (/^https:\/\//i.test(value)) {
      add('warning', 'external-link', 'External link: the destination domain must be in the site\'s HTML Field Security allow list.');
    } else if (/^\/\//.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
      add('error', 'unsafe-link', `Link target "${value.slice(0, 40)}" is not a root-relative path or https URL.`);
    }
  }
  if (/<base\b/i.test(html)) add('error', 'base-tag', '<base> elements are not allowed.');
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
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi, '<script$1></script>')
    .replace(/>[^<]*</g, '><');
}

export interface ExportScan {
  scriptCount: number;
  /** Elements/attributes that would load a resource: src, srcset, poster, data, action, <link>, url(), @import. */
  resourceReferenceCount: number;
  linkTagCount: number;
  inlineHandlerCount: number;
  sameSiteLinkCount: number;
  externalLinkCount: number;
}

/** Count constructs that must be zero (or known) in a static export. Independent of the severity logic above. */
export function scanExport(html: string): ExportScan {
  const body = stripTextNodesAndStyle(html);
  // CSS is scanned separately so that user *text* such as "url(" is never miscounted.
  const css = (html.match(/<style[\s\S]*?<\/style>/gi) ?? []).join('\n');
  const markup = `${body}\n${css}`;
  const anchors = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => /\shref\s*=\s*"([^"]*)"/i.exec(m[0])?.[1] ?? '');
  return {
    scriptCount: (body.match(/<script\b/gi) ?? []).length,
    resourceReferenceCount:
      (body.match(RESOURCE_ATTR) ?? []).length + (markup.match(/url\(/gi) ?? []).length + (markup.match(/@import/gi) ?? []).length + (body.match(/<link\b/gi) ?? []).length,
    linkTagCount: (body.match(/<link\b/gi) ?? []).length,
    inlineHandlerCount: (body.match(/\son[a-z]+\s*=/gi) ?? []).length,
    sameSiteLinkCount: anchors.filter((h) => h.startsWith('/')).length,
    externalLinkCount: anchors.filter((h) => /^https:\/\//i.test(h)).length,
  };
}
