/**
 * SharePoint HTML Pages LiveData: Observed Contract Revision 1 (observed 2026-11-26, one tenant).
 *
 * WARNING: this relies on an undocumented behavior observed in a specific SharePoint Online tenant.
 * Microsoft may change or remove it without notice. It is not a public API, not a supported SDK,
 * not a stable contract and not a Microsoft guarantee. See docs/research/live-excel-contract-observed.md.
 */
export const LIVEDATA_CONTRACT_REVISION = 'observed-2026-11-r1' as const;
export const LIVEDATA_OBSERVED_DATE = '2026-11-26';

export type EvidenceLevel =
  | 'microsoft-documented'
  | 'tenant-observed-reproduced'
  | 'tenant-observed-once'
  | 'hypothesis'
  | 'unknown';

/** Classification of the provider as a whole (the manifest/prefetch mechanism was reproduced on several uploaded pages). */
export const LIVEDATA_PROVIDER_EVIDENCE: EvidenceLevel = 'tenant-observed-reproduced';

export const LIVEDATA_WARNING =
  'This implementation relies on an undocumented behavior observed in a specific SharePoint Online tenant. Microsoft may change or remove it without notice.';

export const LIVEDATA_UI_WARNING =
  'This feature uses an undocumented SharePoint HTML Pages behavior observed in a test tenant. It may change without notice. Use Excel Snapshot for predictable production output.';

export const PERMISSION_BLOCKER_NOTICE =
  'Permission isolation has not yet been validated with a viewer who can access the page but not the workbook. LiveData is not approved for limited pilot until LD-07 passes.';

/**
 * LD-09 (2026-11-27, one tenant, TENANT_OBSERVED_ONCE): the host's xlsx-sheets CSV is a TRIMMED grid. Leading blank
 * worksheet rows are absent (Excel Summary!B7 arrived as the first CSV row) and the metadata carries only fileName and
 * extension, so Excel coordinates cannot be restored. Positional A1 selection of live data is NOT supported (D-020).
 * Live Excel uses semantic selectors over the trimmed grid (D-021). Snapshot Excel (local import) is unaffected.
 */
export const SELECTOR_SEMANTICS_NOTICE =
  'LiveData may omit leading blank worksheet rows. Selection therefore uses visible row content instead of Excel cell coordinates. This relies on an undocumented grid observed in one tenant (LD-09); it is not Excel row or cell addressing.';

export const FRESHNESS_HINT = 'Recent workbook changes may take time to appear.';
export const EDITOR_UNAVAILABLE_MESSAGE =
  'Live data is unavailable in the SharePoint editor. Publish or preview the page to load current data.';

/** The one message the observed generated page posted to its parent to request a reload. Fixed; carries no data. */
export const REFRESH_MESSAGE_TYPE = 'ka-html-viewer-refresh';

/** Hard bounds enforced by the exported runtime (and mirrored by tests). */
export const LIVEDATA_LIMITS = {
  maxContentChars: 2_000_000,
  maxSheets: 50,
  maxRows: 10_000,
  maxCellsPerRow: 500,
  maxCellChars: 5_000,
  maxSheetNameChars: 255,
} as const;


export const MAX_LIVE_SOURCES = 10;

/**
 * Manifest fields Studio emits, with the evidence for each (see docs/research/livedata-experiments.md, LD-01).
 * Anything not listed as emitted is NOT written into the page.
 */
export const MANIFEST_FIELD_EVIDENCE = {
  spItemUrl: { emitted: true, evidence: 'tenant-observed-reproduced', basis: 'LD-01-H, LD-03: the host keys the prefetch by this value; without it the page reports "No prefetched result"' },
  fileName: { emitted: true, evidence: 'tenant-observed-once', basis: 'LD-01-A fails and LD-01-B passes: needed alongside spItemUrl (mechanism unknown)' },
  filePath: { emitted: false, evidence: 'tenant-observed-once', basis: 'LD-01-B passes without it; kept in the project JSON only as a human reference' },
  label: { emitted: false, evidence: 'tenant-observed-once', basis: 'LD-01-B passes without it' },
  cslViewLink: { emitted: false, evidence: 'unknown', basis: 'LD-01-B passes without it; it is a sharing link (sensitive); its role for other viewers is untested (LD-07)' },
} as const satisfies Record<string, { emitted: boolean; evidence: EvidenceLevel; basis: string }>;
