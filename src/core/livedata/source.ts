import { z } from 'zod';
import { LIVEDATA_CONTRACT_REVISION, MAX_EXCEL_COLUMN, MAX_EXCEL_ROW } from './constants';

/**
 * Shape observed for spItemUrl in the test tenant: an absolute https URL
 *   https://<host>/_api/v2.0/drives/<driveId>/items/<itemId>
 * with no credentials, query or fragment. The host name identifies the tenant and is treated as
 * sensitive configuration. Studio never calls this URL; it is only data inside the page manifest.
 */
const SP_ITEM_URL_RE =
  /^https:\/\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)\/_api\/v2\.0\/drives\/([A-Za-z0-9_!-]{8,200})\/items\/([A-Za-z0-9]{8,200})$/;

const SENSITIVE_QUERY =
  /(?:^|[?&#;])(?:sig|sv|se|sp|spr|srt|ss|st|sr|token|access_token|id_token|refresh_token|code|key|apikey|api_key|secret|client_secret|password|pwd|tempauth|authkey|auth|signature)=/i;
// eslint-disable-next-line no-control-regex
const FILE_NAME_RE = /^[^\\/:*?"<>|\u0000-\u001f]{1,255}\.(?:xlsx|xlsm|xls|csv)$/i;

export type SourceProblem = { severity: 'error' | 'warning'; code: string; message: string };

export function parseSpItemUrl(url: string): { host: string; driveId: string; itemId: string } | null {
  const m = SP_ITEM_URL_RE.exec(url);
  return m ? { host: m[1] as string, driveId: m[2] as string, itemId: m[3] as string } : null;
}

/** Short, non-reversible tag for diagnostics so full identifiers never appear in UI, logs or reports. */
export function maskIdentifier(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `ref-${h.toString(16).padStart(8, '0')}`;
}

const text = (max: number) => z.string().max(max);

export const LiveSourceSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, _ or - only.'),
  displayName: text(120),
  kind: z.literal('sharepoint-excel-livedata'),
  contractRevision: z.literal(LIVEDATA_CONTRACT_REVISION),
  /** Sensitive: contains the tenant host and drive/item identifiers. Never log, commit or put in reports. */
  spItemUrl: text(600),
  fileName: text(255),
  /** Human reference only. Not emitted (LD-01-B). */
  filePath: text(600).optional(),
  label: text(255).optional(),
  /** A sharing link. Stored only if the user typed it; NEVER emitted into the page. */
  cslViewLink: text(2000).optional(),
  acknowledgedExperimental: z.boolean(),
  tenantAlias: text(60).optional(),
  lastValidatedAt: text(40).optional(),
});
export type LiveSource = z.infer<typeof LiveSourceSchema>;

export function validateLiveSourceShape(source: LiveSource): SourceProblem[] {
  const out: SourceProblem[] = [];
  const err = (code: string, message: string) => out.push({ severity: 'error', code, message });
  const warn = (code: string, message: string) => out.push({ severity: 'warning', code, message });

  const url = source.spItemUrl.trim();
  if (!url) err('item-url-missing', 'Enter the workbook item URL.');
  else if (/^\s*(?:javascript|data|vbscript|file|blob):/i.test(url)) err('item-url-scheme', 'The item URL must start with https://.');
  else if (/^https:\/\/[^/]*@/i.test(url)) err('item-url-credentials', 'The item URL must not contain credentials.');
  else if (/[?#]/.test(url) || SENSITIVE_QUERY.test(url)) err('item-url-query', 'The item URL must not contain a query string, fragment, signature or token.');
  else if (!parseSpItemUrl(url)) err('item-url-shape', 'Unexpected item URL shape. Revision 1 expects https://<host>/_api/v2.0/drives/<driveId>/items/<itemId> as observed in one tenant.');
  else
    warn(
      'item-url-sensitive',
      'The item URL contains your tenant host name and workbook identifiers. Treat it as sensitive: do not commit it or paste it into tickets. Its shape is not verified against SharePoint.',
    );

  const fn = source.fileName.trim();
  if (!fn) err('file-name-missing', 'Enter the workbook file name including its extension. The observed host needed it (LD-01).');
  else if (!FILE_NAME_RE.test(fn)) err('file-name-shape', 'The file name must end in .xlsx, .xlsm, .xls or .csv and contain no path characters.');

  if (source.cslViewLink) {
    const l = source.cslViewLink.trim();
    if (/^\s*(?:javascript|data|vbscript|file|blob):/i.test(l) || !/^https:\/\//i.test(l) || /^https:\/\/[^/]*@/i.test(l) || SENSITIVE_QUERY.test(l)) {
      err('csl-link-unsafe', 'The sharing link must be a plain https URL with no credentials or signature.');
    } else {
      warn('csl-link-not-emitted', 'The sharing link is stored in the project only. Studio does not put it in the exported page (not needed in the lab, role untested).');
    }
  }
  if (!source.acknowledgedExperimental) err('not-acknowledged', 'Tick the acknowledgement that this uses an undocumented, experimental SharePoint behavior.');
  return out;
}

/** What may be shared in a bug report: structure only, identifiers masked, no host. */
export function sanitizedDiagnostic(source: LiveSource): Record<string, unknown> {
  const p = parseSpItemUrl(source.spItemUrl.trim());
  return {
    kind: source.kind,
    contractRevision: source.contractRevision,
    itemUrlShapeValid: p !== null,
    itemUrlRef: maskIdentifier(source.spItemUrl.trim()),
    fileNameExtension: /\.([A-Za-z0-9]+)$/.exec(source.fileName.trim())?.[1]?.toLowerCase() ?? null,
    hasFilePath: !!source.filePath,
    hasLabel: !!source.label,
    hasSharingLink: !!source.cslViewLink,
    acknowledgedExperimental: source.acknowledgedExperimental,
  };
}

/** Strict canonical single-cell A1 address: uppercase letters then row, within Excel's bounds. */
export function parseLiveCellAddress(addr: string): { col: number; row: number } | null {
  const m = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(addr);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1] as string) col = col * 26 + (ch.charCodeAt(0) - 64);
  const row = Number(m[2]);
  if (col > MAX_EXCEL_COLUMN || row > MAX_EXCEL_ROW) return null;
  return { col, row };
}

export const LiveCellAddressSchema = z
  .string()
  .max(10)
  .refine((a) => parseLiveCellAddress(a) !== null, 'Use a single cell such as A1, B7 or AA10 (no ranges, rows, columns or sheet names).');
