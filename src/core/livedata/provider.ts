import type { WorkbookData } from '../excel/types';
import {
  LIVEDATA_CONTRACT_REVISION,
  LIVEDATA_PROVIDER_EVIDENCE,
  LIVEDATA_WARNING,
  type EvidenceLevel,
} from './constants';
import { compileManifest, type ManifestEntry } from './manifest';
import { buildMockResults, mockFixtureWorkbook, type MockHostResult, type MockScenario } from './mock';
import { parseLiveCellAddress, validateLiveSourceShape, type LiveSource } from './source';

export type ProviderCapability = 'confirmed' | 'experimental' | 'unsupported' | 'unknown';

export interface ValidationResult {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

/** What to read: transport (the source) is separate from Excel selection (worksheet + cell). */
export interface ExcelSelection {
  worksheet: string;
  selection: { type: 'cell'; address: string };
}

export interface LiveExcelConfig {
  source: LiveSource;
  selection: ExcelSelection;
}

export interface CompiledDataBinding {
  manifestEntry: ManifestEntry | null;
  selection: ExcelSelection;
  /** Fields the compiler wrote and the evidence class of the provider as a whole. */
  contractRevision: string;
  evidenceLevel: EvidenceLevel;
}

export interface PreviewContext {
  scenario: MockScenario;
  /** A locally imported workbook, if any. Used only to populate the mock; never uploaded. */
  workbook?: WorkbookData | null;
}

export interface PreviewResult<T> {
  label: 'Mock LiveData preview';
  /** Always false: the preview never talks to SharePoint. */
  connectedToSharePoint: false;
  results: T;
}

export interface DataProvider<TConfig, TResult> {
  id: string;
  capability: ProviderCapability;
  validate(config: TConfig): ValidationResult[];
  compile(config: TConfig): CompiledDataBinding;
  preview(config: TConfig, context: PreviewContext): Promise<PreviewResult<TResult>>;
}

/**
 * EXPERIMENTAL provider for the observed SharePoint HTML Pages LiveData contract (revision 1).
 * It is transport plus a manifest compiler; it never calls SharePoint, Microsoft Graph or REST.
 */
export const sharePointExcelLiveProvider: DataProvider<LiveExcelConfig, Record<string, MockHostResult>> & {
  contractRevision: typeof LIVEDATA_CONTRACT_REVISION;
  evidenceLevel: EvidenceLevel;
  warning: string;
} = {
  id: 'sharepoint-excel-livedata',
  capability: 'experimental',
  contractRevision: LIVEDATA_CONTRACT_REVISION,
  evidenceLevel: LIVEDATA_PROVIDER_EVIDENCE,
  warning: LIVEDATA_WARNING,

  validate(config) {
    const out: ValidationResult[] = [...validateLiveSourceShape(config.source)];
    if (!config.selection.worksheet.trim()) out.push({ severity: 'error', code: 'worksheet-missing', message: 'Enter the worksheet name.' });
    if (config.selection.selection.type !== 'cell' || parseLiveCellAddress(config.selection.selection.address) === null) {
      out.push({ severity: 'error', code: 'cell-invalid', message: 'Use a single cell such as A1, B7 or AA10 (no ranges, rows, columns or sheet names).' });
    }
    return out;
  },

  compile(config) {
    const manifest = compileManifest([config.source]);
    return {
      manifestEntry: manifest.entries[0] ?? null,
      selection: config.selection,
      contractRevision: LIVEDATA_CONTRACT_REVISION,
      evidenceLevel: LIVEDATA_PROVIDER_EVIDENCE,
    };
  },

  preview(config, context) {
    const compiled = compileManifest([config.source]);
    const wb = context.workbook ?? mockFixtureWorkbook();
    return Promise.resolve({
      label: 'Mock LiveData preview' as const,
      connectedToSharePoint: false as const,
      results: buildMockResults(compiled.entries, wb, context.scenario),
    });
  },
};

/** Feature flag: LiveData is off unless VITE_EXPERIMENTAL_EXCEL_LIVE is exactly "true". */
export function isLiveExcelEnabled(env: { VITE_EXPERIMENTAL_EXCEL_LIVE?: string } | undefined): boolean {
  return env?.VITE_EXPERIMENTAL_EXCEL_LIVE === 'true';
}
