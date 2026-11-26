import ExcelJS from 'exceljs';

export const FIXTURE_ISSUES: (string | number | Date)[][] = [
  ['Login fails on Safari', 'Open', 'Ana', new Date('2026-12-01T00:00:00Z'), 'High'],
  ['Slow dashboard', 'Open', 'Ben', new Date('2026-12-05T00:00:00Z'), 'Medium'],
  ['Typo in footer', 'Closed', 'Cy', new Date('2026-11-20T00:00:00Z'), 'Low'],
];

/** Build the synthetic ProjectStatus workbook used by tests and e2e. */
export async function buildStatusWorkbook(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('Summary');
  summary.getCell('A7').value = 'Open issues';
  summary.getCell('B7').value = 17;
  summary.getCell('A8').value = 'Doubled';
  summary.getCell('B8').value = { formula: 'B7*2', result: 34 };
  wb.definedNames.add('Summary!$B$7', 'OpenIssues');

  const issues = wb.addWorksheet('Issues');
  issues.addTable({
    name: 'Issues',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium2' },
    columns: [{ name: 'Title' }, { name: 'Status' }, { name: 'Owner' }, { name: 'DueDate' }, { name: 'Priority' }],
    rows: FIXTURE_ISSUES,
  });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Workbook whose values try to break out of HTML. */
export async function buildMaliciousWorkbook(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('Summary');
  s.getCell('B7').value = '<img src=x onerror=alert(1)>';
  s.getCell('B8').value = { formula: 'HYPERLINK("javascript:alert(1)","x")', result: '"><script>alert(2)</script>' };
  const t = wb.addWorksheet('Issues');
  t.addTable({
    name: 'Issues',
    ref: 'A1',
    headerRow: true,
    columns: [{ name: '<b>Title</b>' }, { name: 'Status' }],
    rows: [['<script>fetch("https://graph.microsoft.com/v1.0/me")</script>', 'a" onmouseover="alert(3)']],
  });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
