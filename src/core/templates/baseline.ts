import type { WorkbookData } from '../excel/types';
import { makeBinding } from '../excel/resolve';
import type { Binding, Component, Project, Selection } from '../project';

export const BASELINE_TEMPLATE_NAME = 'SharePoint Compatibility Baseline';

/** Text that must survive every layer (editor, export, SharePoint) as plain characters. */
export const SPECIAL_CHARACTERS_TEXT =
  'Accents: café, naïve, Zoë, Łódź. Symbols: © ® ™ € £ ¥ § ¶ ½ ≤ ≥ ≠ ∞. CJK: 日本語 中文 한국어. RTL: שלום עולם. Emoji: 😀 🚀. ' +
  'Punctuation: “curly quotes” ‘apostrophes’ — em dash, en–dash, ellipsis…. Markup characters as text: & < > " \'.';

export const LONG_UNBROKEN_TEXT = 'LONGUNBROKENSTRING'.repeat(9) + '-ends-here';

const LONG_PARAGRAPH = Array.from(
  { length: 6 },
  (_, i) => `Sentence ${i + 1}: this paragraph is deliberately long so that wrapping, line height and maximum line length can be inspected at narrow widths.`,
).join(' ');

/** Values that look like markup, formulas, URLs or scripts. They must be displayed as literal text. */
export const HTML_LOOKALIKES = [
  '<b>bold?</b> & <script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '=HYPERLINK("https://example.com","click")',
  '"quoted" & \'single\' <!-- not a comment -->',
  'javascript:alert(1)',
] as const;

/**
 * Synthetic workbook compiled into the template. It mirrors fixtures/project-status.xlsx
 * (Summary!B7 = 17, table Issues) and adds hostile-looking text. It contains no real data.
 */
export function baselineWorkbook(): WorkbookData {
  return {
    fileName: 'baseline-synthetic.xlsx',
    importedAt: '2026-11-26T00:00:00.000Z',
    sheets: [
      {
        name: 'Summary',
        cells: { A7: 'Open issues', B7: 17, A8: 'Doubled', B8: 34, A9: 'Markup-like text', B9: '<b>17</b> & <i>open</i>' },
        maxRow: 9,
        maxCol: 2,
      },
    ],
    definedNames: [{ name: 'OpenIssues', worksheet: 'Summary', address: 'B7' }],
    tables: [
      {
        name: 'Issues',
        worksheet: 'Issues',
        ref: 'A1:E8',
        columns: ['Title', 'Status', 'Owner', 'DueDate', 'Priority'],
        rows: [
          ['Login fails on Safari', 'Open', 'Ana', '2026-12-01', 'High'],
          ['Slow dashboard', 'Open', 'Ben', '2026-12-05', 'Medium'],
          [HTML_LOOKALIKES[0], 'Open', 'Ana <ana@example.com>', '2026-12-09', HTML_LOOKALIKES[4]],
          [HTML_LOOKALIKES[1], 'Closed', 'Cy', '2026-11-20', 'Low'],
          [HTML_LOOKALIKES[2], 'Open', 'Dee', '2026-12-10', 'Medium'],
          [HTML_LOOKALIKES[3], 'Open', 'Eli', '2026-12-11', 'High'],
          [LONG_UNBROKEN_TEXT, 'Open', 'Fay', '2026-12-12', 'Low'],
        ],
      },
    ],
  };
}

function bind(wb: WorkbookData, sel: Selection): Binding {
  const r = makeBinding(wb, sel);
  if (!r.ok) throw new Error(`Baseline template is inconsistent: ${r.error}`);
  return r.binding;
}

export const SAME_SITE_PLACEHOLDER = '/sites/REPLACE-WITH-YOUR-SITE/SitePages/REPLACE-WITH-ANOTHER-PAGE.aspx';
export const EXTERNAL_PLACEHOLDER = 'https://example.com/studio-external-link-test';

/**
 * The template for the real-tenant test. It carries placeholders only: no tenant URLs, ever.
 * The tester edits the same-site link in the Inspector before exporting (see docs/testing).
 */
export function buildBaselineProject(): Project {
  const wb = baselineWorkbook();
  const c: Component[] = [
    { id: 'b-h1', type: 'heading', level: 1, text: BASELINE_TEMPLATE_NAME },
    {
      id: 'b-intro',
      type: 'text',
      text: 'This page tests how SharePoint renders a Studio static export. All data is synthetic. Nothing here is real, and none of it should be reused.',
    },
    { id: 'b-h-special', type: 'heading', level: 2, text: 'Special characters' },
    { id: 'b-special', type: 'text', text: SPECIAL_CHARACTERS_TEXT },
    { id: 'b-callout', type: 'callout', tone: 'warning', text: 'Callout: this note must keep its warning border and remain readable.' },
    { id: 'b-h-kpi', type: 'heading', level: 2, text: 'KPIs' },
    { id: 'b-kpi-manual', type: 'kpi', label: 'Manual KPI (typed in the editor)', value: '42', prefix: '', suffix: ' items' },
    {
      id: 'b-kpi-bound',
      type: 'kpi',
      label: 'Open issues (snapshot of Summary!B7)',
      value: '0',
      prefix: '',
      suffix: '',
      binding: bind(wb, { selectionType: 'cell', worksheet: 'Summary', address: 'B7' }),
    },
    {
      id: 'b-kpi-markup',
      type: 'kpi',
      label: 'Markup-like workbook text (Summary!B9) must appear literally',
      value: '',
      prefix: '',
      suffix: '',
      binding: bind(wb, { selectionType: 'cell', worksheet: 'Summary', address: 'B9' }),
    },
    { id: 'b-h-table', type: 'heading', level: 2, text: 'Excel-bound table' },
    {
      id: 'b-table',
      type: 'table',
      caption: 'Issues (snapshot of Excel table "Issues"; some values look like HTML and must render as text)',
      columns: [],
      rows: [],
      binding: bind(wb, { selectionType: 'table', table: 'Issues' }),
    },
    { id: 'b-h-wrap', type: 'heading', level: 2, text: 'Wrapping' },
    { id: 'b-long', type: 'text', text: LONG_PARAGRAPH },
    { id: 'b-unbroken', type: 'text', text: LONG_UNBROKEN_TEXT },
    { id: 'b-h-links', type: 'heading', level: 2, text: 'Links' },
    { id: 'b-link-same', type: 'link', text: 'Same-site link (placeholder: edit the target before exporting)', href: SAME_SITE_PLACEHOLDER },
    { id: 'b-link-ext', type: 'link', text: 'External link (placeholder: example.com)', href: EXTERNAL_PLACEHOLDER },
    { id: 'b-stamp', type: 'stamp' },
  ];
  return {
    schemaVersion: 1,
    name: BASELINE_TEMPLATE_NAME,
    page: { title: BASELINE_TEMPLATE_NAME, lang: 'en', accent: '#0f6cbd', exportProfile: 'static-safe', liveSources: [], components: c },
  };
}
