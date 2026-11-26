import { z } from 'zod';
import { MAX_LIVE_SOURCES } from './livedata/constants';
import { LiveCellAddressSchema, LiveSourceSchema } from './livedata/source';

/** A scalar spreadsheet value after sanitising. Dates are ISO strings; formulas are cached results. */
export const CellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type CellValue = z.infer<typeof CellValueSchema>;

const MAX_TEXT = 5000;
const text = (max = MAX_TEXT) => z.string().max(max);

export const SelectionSchema = z.discriminatedUnion('selectionType', [
  z.object({ selectionType: z.literal('cell'), worksheet: text(255), address: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/) }),
  z.object({ selectionType: z.literal('namedRange'), name: text(255) }),
  z.object({ selectionType: z.literal('table'), table: text(255) }),
]);
export type Selection = z.infer<typeof SelectionSchema>;

export const SnapshotValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scalar'), value: CellValueSchema }),
  z.object({
    kind: z.literal('table'),
    columns: z.array(text(255)).max(100),
    rows: z.array(z.array(CellValueSchema).max(100)).max(5000),
  }),
]);
export type SnapshotValue = z.infer<typeof SnapshotValueSchema>;

/** Provenance + embedded values. No live connection is ever implied by this object. */
export const BindingSchema = z.object({
  provider: z.literal('excel-snapshot'),
  workbookName: text(255),
  lastImportedAt: z.string().max(40),
  selection: SelectionSchema,
  snapshot: SnapshotValueSchema,
});
export type Binding = z.infer<typeof BindingSchema>;

/**
 * Links are navigation only. Allowed: root-relative paths ("/sites/...") and https URLs.
 * Rejected: javascript:, data:, protocol-relative (//host), backslashes, whitespace, other schemes.
 */
const HREF_RE = /^(?:\/(?![/\\])[^\s]*|https:\/\/[^\s/?#]+[^\s]*)$/;
export const HrefSchema = z.string().max(2000).regex(HREF_RE, 'Use a root-relative path (/sites/...) or an https:// URL.');
export function isSafeHref(href: string): boolean {
  return HREF_RE.test(href) && href.length <= 2000;
}
export function linkKind(href: string): 'external' | 'same-site' {
  return href.startsWith('https://') ? 'external' : 'same-site';
}

const base = { id: z.string().min(1).max(64) };

export const ComponentSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('heading'), text: text(300), level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  z.object({ ...base, type: z.literal('text'), text: text() }),
  z.object({ ...base, type: z.literal('callout'), tone: z.enum(['info', 'warning', 'success']), text: text() }),
  z.object({ ...base, type: z.literal('link'), text: text(300), href: HrefSchema }),
  z.object({ ...base, type: z.literal('stamp') }),
  z.object({
    ...base,
    type: z.literal('kpi'),
    label: text(200),
    value: text(200),
    prefix: text(20).default(''),
    suffix: text(20).default(''),
    binding: BindingSchema.optional(),
  }),
  z.object({
    ...base,
    type: z.literal('table'),
    caption: text(300),
    columns: z.array(text(255)).max(100),
    rows: z.array(z.array(CellValueSchema).max(100)).max(5000),
    binding: BindingSchema.optional(),
  }),
  /**
   * EXPERIMENTAL SharePoint Live Excel KPI (observed contract revision 1). Reads one cell of the
   * workbook data the SharePoint viewer injects at view time. The optional fallback is a labelled
   * snapshot value; it is never shown as live data.
   */
  z.object({
    ...base,
    type: z.literal('liveKpi'),
    label: text(200),
    sourceId: z.string().max(64),
    worksheet: text(255),
    cell: LiveCellAddressSchema,
    prefix: text(20).default(''),
    suffix: text(20).default(''),
    numberFormat: z.enum(['auto', 'integer', 'decimal1', 'decimal2']).default('auto'),
    emptyText: text(100).default('No value'),
    errorText: text(200).default(''),
    showLoadedAt: z.boolean().default(true),
    showRefresh: z.boolean().default(true),
    warnAt: z.number().finite().optional(),
    criticalAt: z.number().finite().optional(),
    fallback: z.object({ value: text(200), importedAt: z.string().max(40).optional() }).optional(),
  }),
]);
export type Component = z.infer<typeof ComponentSchema>;
export type ComponentType = Component['type'];

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  name: text(200),
  page: z.object({
    title: text(200),
    lang: z.string().regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/).default('en'),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0f6cbd'),
    /** static-safe: no script, snapshot data only (default). interactive-safe: experimental LiveData runtime. */
    exportProfile: z.enum(['static-safe', 'interactive-safe']).default('static-safe'),
    liveSources: z.array(LiveSourceSchema).max(MAX_LIVE_SOURCES).default([]),
    components: z.array(ComponentSchema).max(500),
  }),
});
export type Project = z.infer<typeof ProjectSchema>;
export type ExportProfile = Project['page']['exportProfile'];

export function emptyProject(): Project {
  return {
    schemaVersion: 1,
    name: 'Untitled project',
    page: {
      title: 'Project status',
      lang: 'en',
      accent: '#0f6cbd',
      exportProfile: 'static-safe',
      liveSources: [],
      components: [{ id: 'c1', type: 'heading', level: 1, text: 'Project status' }],
    },
  };
}

let counter = 0;
export function newId(): string {
  counter += 1;
  return `c${Date.now().toString(36)}${counter}`;
}

export function newComponent(type: ComponentType): Component {
  const id = newId();
  switch (type) {
    case 'heading':
      return { id, type, level: 2, text: 'New heading' };
    case 'text':
      return { id, type, text: 'Write something here.' };
    case 'callout':
      return { id, type, tone: 'info', text: 'Important note.' };
    case 'link':
      return { id, type, text: 'Link text', href: '/sites/REPLACE-WITH-SITE/SitePages/REPLACE-WITH-PAGE.aspx' };
    case 'stamp':
      return { id, type };
    case 'kpi':
      return { id, type, label: 'Metric', value: '0', prefix: '', suffix: '' };
    case 'table':
      return { id, type, caption: 'Data table', columns: ['Column A', 'Column B'], rows: [['A1', 'B1']] };
    case 'liveKpi':
      return {
        id,
        type,
        label: 'Live metric',
        sourceId: '',
        worksheet: 'Summary',
        cell: 'B7',
        prefix: '',
        suffix: '',
        numberFormat: 'auto',
        emptyText: 'No value',
        errorText: '',
        showLoadedAt: true,
        showRefresh: true,
      };
  }
}

export function parseProject(json: unknown): { ok: true; project: Project } | { ok: false; error: string } {
  const r = ProjectSchema.safeParse(json);
  if (r.success) return { ok: true, project: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5).join('; ') };
}
