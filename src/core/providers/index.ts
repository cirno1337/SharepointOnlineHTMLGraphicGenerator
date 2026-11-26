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
 * Experimental placeholder for live Excel data.
 * Microsoft documents that live Excel data exists in HTML Pages but does not publish the
 * binding contract. Until it is documented and validated in a real tenant this provider
 * never resolves anything and must NOT be replaced by Graph/REST calls (see CLAUDE.md).
 */
export const liveExcelProvider: DataProvider = {
  id: 'excel-live',
  label: 'Live Excel (experimental)',
  status: 'EXPERIMENTAL',
  available: false,
  resolve: () => ({
    ok: false,
    error: 'Live Excel is not available: the SharePoint HTML Page data-binding contract is undocumented.',
  }),
};

export const FEATURE_FLAGS = { liveExcel: false } as const;

export const PROVIDERS: readonly DataProvider[] = [snapshotProvider, liveExcelProvider];
