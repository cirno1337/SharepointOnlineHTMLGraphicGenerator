import vm from 'node:vm';
import { LIVEDATA_CONTRACT_REVISION } from '../src/core/livedata/constants';
import type { LiveSource } from '../src/core/livedata/source';
import { RUNTIME_SOURCE } from '../src/core/livedata/runtime';
import { emptyProject, newComponent, type Component, type Project } from '../src/core/project';

/** Synthetic item URL: reserved .example host, fake identifiers. Never a real tenant value. */
export const FIXTURE_ITEM_URL = 'https://tenant-a.example/_api/v2.0/drives/b!FIXTUREDRIVE0001/items/01FIXTUREITEM0001';
export const FIXTURE_ITEM_URL_2 = 'https://tenant-a.example/_api/v2.0/drives/b!FIXTUREDRIVE0002/items/01FIXTUREITEM0002';

export function fixtureSource(over: Partial<LiveSource> = {}): LiveSource {
  return {
    id: 'src1',
    displayName: 'Synthetic status',
    kind: 'sharepoint-excel-livedata',
    contractRevision: LIVEDATA_CONTRACT_REVISION,
    spItemUrl: FIXTURE_ITEM_URL,
    fileName: 'status.xlsx',
    acknowledgedExperimental: true,
    ...over,
  };
}

type LiveKpi = Extract<Component, { type: 'liveKpi' }>;
export function fixtureLiveKpi(over: Partial<LiveKpi> = {}): LiveKpi {
  const base = newComponent('liveKpi') as LiveKpi;
  return { ...base, id: 'k1', label: 'Open issues', sourceId: 'src1', worksheet: 'Summary', cell: 'B7', ...over };
}

export function liveProject(opts: { sources?: LiveSource[]; kpis?: LiveKpi[]; profile?: Project['page']['exportProfile'] } = {}): Project {
  const p = emptyProject();
  p.page.exportProfile = opts.profile ?? 'interactive-safe';
  p.page.liveSources = opts.sources ?? [fixtureSource()];
  p.page.components = [...p.page.components, ...(opts.kpis ?? [fixtureLiveKpi()])];
  return p;
}

export interface RuntimeCore {
  LIMITS: Record<string, number>;
  parseEnvelope(content: unknown): { ok: boolean; code?: string; sheets?: { name: string; csv: string }[] };
  parseCsv(text: unknown): { ok: boolean; code?: string; rows?: string[][] };
  parseCell(a: unknown): { col: number; row: number } | null;
  readCell(sheets: { name: string; csv: string }[], ws: string, addr: string): { ok: boolean; code?: string; value?: string; empty?: boolean };
  resolveKpi(cfg: Cfg, manifest: unknown, results: unknown): { ok: boolean; code?: string; value?: string; empty?: boolean; ref?: string; hostCode?: string; hostFormat?: string };
  present(cfg: Cfg, res: ReturnType<RuntimeCore['resolveKpi']>, loadedAt: string): Vm;
  formatValue(raw: string, fmt: string): string;
  maskRef(s: string): string;
}
export interface Cfg {
  source: number;
  sheet: string;
  cell: string;
  format: string;
  prefix: string;
  suffix: string;
  emptyText: string;
  errorText: string;
  showLoadedAt: boolean;
  showRefresh: boolean;
  warnAt: number | null;
  criticalAt: number | null;
  fallbackValue: string | null;
  fallbackAt: string;
}
export interface Vm {
  mode: 'live' | 'fallback' | 'error';
  code: string;
  ref: string;
  value: string;
  message: string;
  badge: string;
  meta: string;
  status: string;
  diag: string;
}

export const baseCfg: Cfg = {
  source: 0,
  sheet: 'Summary',
  cell: 'B7',
  format: 'auto',
  prefix: '',
  suffix: '',
  emptyText: 'No value',
  errorText: '',
  showLoadedAt: true,
  showRefresh: true,
  warnAt: null,
  criticalAt: null,
  fallbackValue: null,
  fallbackAt: '',
};

/** Runs the exact exported runtime in an isolated context without a DOM; network and storage APIs trap if touched. */
export function loadRuntimeCore(): { core: RuntimeCore; touched: string[] } {
  const touched: string[] = [];
  const trap = (name: string) => () => {
    touched.push(name);
    throw new Error(`runtime touched ${name}`);
  };
  const win: Record<string, unknown> = {
    fetch: trap('fetch'),
    XMLHttpRequest: trap('XMLHttpRequest'),
    WebSocket: trap('WebSocket'),
    EventSource: trap('EventSource'),
    localStorage: undefined,
  };
  const sandbox: Record<string, unknown> = { window: win, fetch: trap('fetch'), XMLHttpRequest: trap('XMLHttpRequest'), WebSocket: trap('WebSocket'), EventSource: trap('EventSource') };
  vm.createContext(sandbox);
  vm.runInContext(RUNTIME_SOURCE, sandbox);
  const rt = win.SPHSRuntime as { core: RuntimeCore };
  return { core: rt.core, touched };
}

/** Cross-realm values compare poorly; normalise through JSON. */
export const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * The Summary worksheet as the host delivered it in LD-09: Excel rows 1 to 6 are empty and ABSENT, so
 * `Open issues` (Excel A7) is the first CSV row. Excel row numbers are not preserved.
 */
export const SUMMARY_CSV = 'Open issues,17\nDoubled,34\n';
/** Exact framing observed in LD-09 (synthetic values): line break after the opening tag and before the closing tag, blank line between sheets. */
export const OBSERVED_LD09_CONTENT =
  '<sheet name="Summary">\nOpen issues,23\nDoubled,46\n</sheet>\n\n<sheet name="Issues">\nTitle,Status,Owner,DueDate,Priority\nLogin fails on Safari,Open,Ana,2026-12-01,High\nSlow dashboard,Open,Ben,2026-12-05,Medium\nTypo in footer,Closed,Cy,2026-11-20,Low\n</sheet>';
/** Observed result shape: no error / errorCode fields; metadata has only fileName and extension. */
export const OBSERVED_LD09_RESULT = { format: 'xlsx-sheets', content: OBSERVED_LD09_CONTENT, metadata: { fileName: 'status.xlsx', extension: 'xlsx' } };
export function envelope(sheets: Record<string, string>): string {
  return Object.entries(sheets)
    .map(([n, csv]) => `<sheet name="${n}">\n${csv}</sheet>`)
    .join('\n\n');
}
