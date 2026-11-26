import type { Binding, SnapshotValue } from '../project';

export type ProviderStatus = 'CONFIRMED' | 'EXPERIMENTAL';

export interface DataProvider {
  id: string;
  label: string;
  status: ProviderStatus;
  /** Whether this provider can currently be used to produce exported values. */
  available: boolean;
  resolve(binding: Binding): { ok: true; value: SnapshotValue } | { ok: false; error: string };
}

export const snapshotProvider: DataProvider = {
  id: 'excel-snapshot',
  label: 'Excel snapshot (values embedded at export)',
  status: 'CONFIRMED',
  available: true,
  resolve: (binding) => ({ ok: true, value: binding.snapshot }),
};

/**
 * Legacy snapshot-pipeline placeholder; it never resolves a value. Live Excel is implemented separately
 * as the experimental, feature-flagged SharePointExcelLive provider in src/core/livedata/provider.ts
 * (observed contract revision observed-2026-11-r1: undocumented, observed in one tenant). Studio must
 * NOT replace it with Graph/REST calls (see CLAUDE.md and D-014).
 */
export const liveExcelProvider: DataProvider = {
  id: 'excel-live',
  label: 'Live Excel (experimental; see the SharePoint Live Excel provider)',
  status: 'EXPERIMENTAL',
  available: false,
  resolve: () => ({
    ok: false,
    error: 'Live Excel does not resolve values in the editor: values arrive from SharePoint at view time. Use Excel Snapshot for static values.',
  }),
};

/** Compile-time default. The editor reads VITE_EXPERIMENTAL_EXCEL_LIVE (see src/editor/flags.ts). */
export const FEATURE_FLAGS = { liveExcel: false } as const;

export const PROVIDERS: readonly DataProvider[] = [snapshotProvider, liveExcelProvider];
