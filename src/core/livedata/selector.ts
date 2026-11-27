import { z } from 'zod';

/**
 * Semantic selectors for SharePoint Live Excel (decision D-021).
 *
 * LD-09 (one tenant, TENANT_OBSERVED_ONCE) showed that the host's xlsx-sheets CSV is a TRIMMED grid: leading blank
 * worksheet rows are absent and metadata has no coordinates. Selection therefore uses visible row content, never
 * Excel row numbers or A1 addresses. `label-adjacent` is a design DERIVED from that single observation. It is not
 * Microsoft-documented, not guaranteed SharePoint behavior and not an Excel-coordinate equivalent.
 */
export const SELECTOR_LIMITS = { maxLabelChars: 255, maxMatchColumn: 499, maxValueOffset: 499 } as const;

/** Schema accepts any text/integer so that old or odd projects still LOAD; `validateSelector` decides what may be exported. */
export const LabelAdjacentSelectorSchema = z.object({
  type: z.literal('label-adjacent'),
  label: z.string().max(5000),
  /** Zero-based column whose text is compared with the label (shown to users as Column 1, 2, ...). */
  matchColumn: z.number().int().min(-1_000_000).max(1_000_000),
  /** Relative column of the value: valueColumn = matchColumn + valueOffset. Never 0. */
  valueOffset: z.number().int().min(-1_000_000).max(1_000_000),
  matchMode: z.literal('exact'),
  caseSensitive: z.boolean(),
  trim: z.boolean(),
  /** When false (default) an empty adjacent value is an error instead of an empty KPI. */
  allowEmptyValue: z.boolean().default(false),
});
export type LabelAdjacentSelector = z.infer<typeof LabelAdjacentSelectorSchema>;

/**
 * Legacy positional selector from projects saved before LD-09. It is carried so the project loads, is shown with a
 * warning and stays blocked from export. It is never converted into another selector automatically.
 */
export const DeprecatedCellSelectorSchema = z.object({ type: z.literal('deprecated-cell'), address: z.string().max(40) });
export type DeprecatedCellSelector = z.infer<typeof DeprecatedCellSelectorSchema>;

export const LiveSelectorSchema = z.discriminatedUnion('type', [LabelAdjacentSelectorSchema, DeprecatedCellSelectorSchema]);
export type LiveSelector = z.infer<typeof LiveSelectorSchema>;

export function defaultLabelAdjacent(label = ''): LabelAdjacentSelector {
  return { type: 'label-adjacent', label, matchColumn: 0, valueOffset: 1, matchMode: 'exact', caseSensitive: false, trim: true, allowEmptyValue: false };
}

export interface SelectorProblem {
  code: 'selector-unsupported' | 'label-empty' | 'label-too-long' | 'match-column-invalid' | 'value-offset-invalid';
  message: string;
}

/** Same rules, codes and limits as the exported runtime (a parity test runs both on the same inputs). */
export function validateSelector(sel: LiveSelector): SelectorProblem[] {
  if (sel.type !== 'label-adjacent') {
    return [{ code: 'selector-unsupported', message: 'This Live KPI uses the removed cell-address selection. Choose “Row label + adjacent value” and configure it manually.' }];
  }
  const out: SelectorProblem[] = [];
  const effective = sel.trim ? sel.label.trim() : sel.label;
  if (effective === '') out.push({ code: 'label-empty', message: 'Enter the row label to look for.' });
  if (sel.label.length > SELECTOR_LIMITS.maxLabelChars) out.push({ code: 'label-too-long', message: `The row label is longer than ${SELECTOR_LIMITS.maxLabelChars} characters.` });
  if (!Number.isInteger(sel.matchColumn) || sel.matchColumn < 0 || sel.matchColumn > SELECTOR_LIMITS.maxMatchColumn) {
    out.push({ code: 'match-column-invalid', message: `The label column must be between Column 1 and Column ${SELECTOR_LIMITS.maxMatchColumn + 1}.` });
  }
  const colOk = Number.isInteger(sel.matchColumn) && sel.matchColumn >= 0;
  if (!Number.isInteger(sel.valueOffset) || sel.valueOffset === 0 || Math.abs(sel.valueOffset) > SELECTOR_LIMITS.maxValueOffset || (colOk && sel.matchColumn + sel.valueOffset < 0)) {
    out.push({ code: 'value-offset-invalid', message: 'The value offset must be a non-zero whole number that keeps the value column inside the worksheet (not before Column 1).' });
  }
  return out;
}
