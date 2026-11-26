/** Case catalog shared by the protocol document, the result schema tests and the example file. */
export interface TenantCase {
  id: string;
  title: string;
  expected: string;
}

export const TENANT_TEST_CASES: readonly TenantCase[] = [
  { id: 'TC-01', title: 'Pre-flight: size and hash', expected: 'Tenant Test Export reports a UTF-8 size well under 10 MB and a 64-hex SHA-256; Studio shows no validation errors.' },
  { id: 'TC-02', title: 'Upload to Site Pages', expected: 'The .html file uploads through "Upload HTML page" into Site Pages without an error or a size/type rejection.' },
  { id: 'TC-03', title: 'Open as draft', expected: 'The draft opens; styles are applied; all baseline sections are visible; no blank page and no "unsupported content" banner.' },
  { id: 'TC-04', title: 'Publish', expected: 'Publishing succeeds and the page is reachable at its published URL.' },
  { id: 'TC-05', title: 'Reopen after publish', expected: 'Closing and reopening the page (and opening it in a new tab) renders identically to the draft.' },
  { id: 'TC-06', title: 'Versioning', expected: 'Version history lists the upload/publish versions; restoring or viewing a previous version renders correctly.' },
  { id: 'TC-07', title: 'Responsive behavior', expected: 'At about 1280, 768 and 375 CSS px: no horizontal page scroll, table scrolls inside its own region, long text wraps, KPIs stay readable.' },
  { id: 'TC-08', title: 'Same-site link', expected: 'The same-site link navigates to the target page (record whether in the frame, top window or a new tab).' },
  { id: 'TC-09', title: 'External link', expected: 'Without allow-listing the domain SharePoint blocks or warns; after allow-listing it navigates. Record exact behavior.' },
  { id: 'TC-10', title: 'HTML-lookalike workbook text', expected: 'Every markup-like value displays as literal text; no image loads, no script runs, no formatting is applied.' },
  { id: 'TC-11', title: 'Special characters and encoding', expected: 'Accents, CJK, RTL, emoji and typographic punctuation display exactly as authored; no mojibake.' },
  { id: 'TC-12', title: 'SharePoint sanitization/transformation', expected: 'Retrieved or inspected markup equals the uploaded markup, or every difference is recorded as a transformation.' },
  { id: 'TC-13', title: 'Iframe inspection', expected: 'The page renders in an iframe; record its sandbox tokens, src/srcdoc form and allow attributes.' },
  { id: 'TC-14', title: 'CSP inspection', expected: 'Record whether the meta CSP is present in the rendered document, the effective Content-Security-Policy header, and any violation messages.' },
  { id: 'TC-15', title: 'Console errors', expected: 'No console errors originate from the page content. Platform-originated messages are recorded separately.' },
  { id: 'TC-16', title: 'Copilot edit of one text element', expected: 'Copilot changes the targeted paragraph only; KPIs, table, callout and links remain intact; every other change is recorded.' },
  { id: 'TC-17', title: 'Retrieved content comparison', expected: 'A file retrieved from SharePoint has the same SHA-256 as the upload, or the differences are recorded.' },
  { id: 'TC-18', title: 'Keyboard and zoom smoke test', expected: 'Links and the table scroll region are reachable by keyboard with a visible focus ring; 200% zoom keeps content usable.' },
  { id: 'TC-19', title: 'Direct canvas edit of one text element', expected: 'In SharePoint edit mode the paragraph can be selected, edited and saved; the rest of the page is unchanged; no CSP violations appear in the console.' },
];
