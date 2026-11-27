import { isLiveExcelEnabled } from '../core/livedata/provider';

/**
 * Experimental SharePoint Live Excel is OFF unless the build sets VITE_EXPERIMENTAL_EXCEL_LIVE=true.
 * It relies on an undocumented SharePoint behavior observed in one tenant (see D-014).
 */
export const LIVE_ENABLED: boolean = isLiveExcelEnabled(import.meta.env as { VITE_EXPERIMENTAL_EXCEL_LIVE?: string });
