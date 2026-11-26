// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MAX_HTML_BYTES } from '../src/core/capabilities';
import { EXPORT_CSP, renderPage, type RenderContext } from '../src/core/export/render';
import { parseProject, type Project } from '../src/core/project';
import {
  BASELINE_TEMPLATE_NAME,
  EXTERNAL_PLACEHOLDER,
  HTML_LOOKALIKES,
  LONG_UNBROKEN_TEXT,
  SAME_SITE_PLACEHOLDER,
  SPECIAL_CHARACTERS_TEXT,
  buildBaselineProject,
} from '../src/core/templates/baseline';
import { buildExampleResult } from '../src/core/tenant/example';
import { TENANT_TEST_CASES } from '../src/core/tenant/cases';
import { sha256Hex, utf8ByteLength } from '../src/core/tenant/hash';
import { ValidationReportSchema, createTenantTestExport, percentOfLimit } from '../src/core/tenant/report';
import { TenantTestResultSchema, findSensitive } from '../src/core/tenant/result-schema';
import { scanExport, validateHtml, validateProject } from '../src/core/validate';

const CTX: RenderContext = { exportedAt: '2026-12-01T09:30:00.000Z', studioBuild: '0.2.0+abc1234' };
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const baselineHtml = () => renderPage(buildBaselineProject(), CTX);

describe('baseline template contains every diagnostic element', () => {
  const doc = parse(baselineHtml());
  const text = doc.body.textContent ?? '';

  it('has exactly one H1 with the template name, and a valid heading outline', () => {
    expect([...doc.querySelectorAll('h1')].map((h) => h.textContent)).toEqual([BASELINE_TEMPLATE_NAME]);
    expect(validateProject(buildBaselineProject()).filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('has normal paragraph text, special characters and long text', () => {
    expect(doc.querySelector('main > p')?.textContent).toContain('tests how SharePoint renders');
    expect(text).toContain(SPECIAL_CHARACTERS_TEXT);
    expect(text).toContain('😀');
    expect(text).toContain(LONG_UNBROKEN_TEXT);
    expect(text).toContain('Sentence 6:');
  });
  it('has a callout', () => {
    expect(doc.querySelector('aside.sphs-callout[role="note"]')?.textContent).toContain('Callout');
  });
  it('has a manual KPI and an Excel-bound KPI from Summary!B7', () => {
    const project = buildBaselineProject();
    const manual = project.page.components.find((c) => c.id === 'b-kpi-manual');
    const bound = project.page.components.find((c) => c.id === 'b-kpi-bound');
    expect(manual?.type === 'kpi' && manual.binding).toBeFalsy();
    expect(bound?.type === 'kpi' && bound.binding?.selection).toEqual({ selectionType: 'cell', worksheet: 'Summary', address: 'B7' });
    const values = [...doc.querySelectorAll('.sphs-kpi__value')].map((e) => e.textContent);
    expect(values).toContain('42 items');
    expect(values).toContain('17');
  });
  it('has the bound Issues table with the five fields', () => {
    const project = buildBaselineProject();
    const t = project.page.components.find((c) => c.type === 'table');
    expect(t?.type === 'table' && t.binding?.selection).toEqual({ selectionType: 'table', table: 'Issues' });
    expect([...doc.querySelectorAll('thead th')].map((e) => e.textContent)).toEqual(['Title', 'Status', 'Owner', 'DueDate', 'Priority']);
    expect(doc.querySelectorAll('tbody tr').length).toBe(7);
    expect(doc.querySelector('table caption')?.textContent).toContain('Issues');
  });
  it('has one same-site and one external placeholder link, with no tenant URL', () => {
    const hrefs = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([SAME_SITE_PLACEHOLDER, EXTERNAL_PLACEHOLDER]);
    expect(baselineHtml()).not.toMatch(/sharepoint\.com|\.onmicrosoft\.com|_api\//i);
    for (const a of doc.querySelectorAll('a')) expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('has an export timestamp and the Studio build identifier', () => {
    expect(doc.querySelector('time')?.getAttribute('datetime')).toBe(CTX.exportedAt);
    expect(doc.querySelector('dl.sphs-stamp')?.textContent).toContain(CTX.studioBuild);
  });
  it('shows a placeholder, not a fake time, when rendered without an export context (preview)', () => {
    const preview = parse(renderPage(buildBaselineProject()));
    expect(preview.querySelector('time')).toBeNull();
    expect(preview.body.textContent).toContain('(set at export time)');
  });
  it('survives a JSON round trip through the project schema', () => {
    const r = parseProject(JSON.parse(JSON.stringify(buildBaselineProject())));
    expect(r.ok).toBe(true);
  });
});

describe('special and malicious-looking workbook values remain text', () => {
  const doc = parse(baselineHtml());
  it('renders every lookalike value literally in the table or KPI', () => {
    const cells = [...doc.querySelectorAll('td')].map((e) => e.textContent);
    for (const v of HTML_LOOKALIKES) expect(cells).toContain(v);
    const kpis = [...doc.querySelectorAll('.sphs-kpi__value')].map((e) => e.textContent);
    expect(kpis).toContain('<b>17</b> & <i>open</i>');
  });
  it('creates no elements or handlers from them', () => {
    expect(doc.querySelectorAll('script,img,svg,iframe,form,object,embed,b,i,style:not(head style)').length).toBe(0);
    const attrs = [...doc.querySelectorAll('*')].flatMap((el) => el.getAttributeNames());
    expect(attrs.filter((a) => a.startsWith('on'))).toEqual([]);
    const links = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(links.some((h) => /^javascript:/i.test(h))).toBe(false);
  });
  it('is not flagged by the validator (text is not code)', () => {
    expect(validateHtml(baselineHtml()).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('static-export guarantees on the baseline', () => {
  const html = baselineHtml();
  it('exports no scripts', () => {
    expect(html).not.toMatch(/<script/i);
    expect(scanExport(html).scriptCount).toBe(0);
    expect(scanExport(html).inlineHandlerCount).toBe(0);
  });
  it('exports no network resource references (anchors are navigation, not resources)', () => {
    const doc = parse(html);
    expect(doc.querySelectorAll('[src],[srcset],[poster],[data],[action],[formaction],link,base,object,embed,iframe,form').length).toBe(0);
    expect(html).not.toMatch(/url\(|@import/i);
    expect(scanExport(html)).toMatchObject({ resourceReferenceCount: 0, linkTagCount: 0, sameSiteLinkCount: 1, externalLinkCount: 1 });
  });
  it('reports the external link as a warning, never an error', () => {
    const issues = validateHtml(html);
    expect(issues.find((i) => i.code === 'external-link')?.severity).toBe('warning');
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('contains no editor runtime or workbook file names', () => {
    expect(html).not.toMatch(/grapesjs|sourceMappingURL|__vite|baseline-synthetic/i);
  });
});

describe('link safety', () => {
  const withHref = (href: string): unknown => ({
    ...buildBaselineProject(),
    page: { ...buildBaselineProject().page, components: [{ id: 'l', type: 'link', text: 'x', href }] },
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', '//evil.example/x', 'http://insecure.example', 'mailto:a@b.c', '/ok path', '\\\\host\\share', 'relative/path'])('rejects %s', (href) => {
    expect(parseProject(withHref(href)).ok).toBe(false);
  });
  it.each(['/sites/a/SitePages/b.aspx', 'https://example.com/x?y=1#z'])('accepts %s', (href) => {
    expect(parseProject(withHref(href)).ok).toBe(true);
  });
  it('renders an unsafe href that bypassed the schema as plain text', () => {
    const p = buildBaselineProject();
    p.page.components = [{ id: 'l', type: 'link', text: 'click', href: 'javascript:alert(1)' }];
    const html = renderPage(p, CTX);
    expect(html).not.toMatch(/<a\b/);
    expect(html).toContain('<p>click</p>');
  });
});

describe('exact UTF-8 byte size', () => {
  it('counts bytes, not characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('日')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
    const s = baselineHtml();
    expect(utf8ByteLength(s)).toBe(Buffer.byteLength(s, 'utf8'));
    expect(utf8ByteLength(s)).toBeGreaterThan(s.length);
  });
  it('equals the size of the Blob the editor downloads (no BOM)', () => {
    const s = baselineHtml();
    expect(new Blob([s], { type: 'text/html;charset=utf-8' }).size).toBe(utf8ByteLength(s));
  });
  it('computes the percentage of the 10 MB limit', () => {
    expect(percentOfLimit(MAX_HTML_BYTES)).toBe(100);
    expect(percentOfLimit(MAX_HTML_BYTES / 2)).toBe(50);
    expect(percentOfLimit(0)).toBe(0);
  });
});

describe('SHA-256', () => {
  it('matches known vectors, including multi-byte text', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex('😀')).toBe(createHash('sha256').update('😀', 'utf8').digest('hex'));
  });
  it('changes when the output changes', async () => {
    const a = baselineHtml();
    const b = renderPage(buildBaselineProject(), { ...CTX, exportedAt: '2026-12-01T09:30:01.000Z' });
    const p = buildBaselineProject();
    p.page.title = 'Changed';
    const c = renderPage(p, CTX);
    const [ha, hb, hc, ha2] = await Promise.all([sha256Hex(a), sha256Hex(b), sha256Hex(c), sha256Hex(baselineHtml())]);
    expect(new Set([ha, hb, hc]).size).toBe(3);
    expect(ha2).toBe(ha); // deterministic for identical output
  });
});

describe('Tenant Test Export', () => {
  it('produces HTML identical to the normal export and a schema-valid report', async () => {
    const project = buildBaselineProject();
    const t = await createTenantTestExport(project, CTX);
    expect(t.html).toBe(renderPage(project, CTX));
    expect(ValidationReportSchema.safeParse(JSON.parse(t.reportJson)).success).toBe(true);
    expect(t.report.html.sha256).toBe(createHash('sha256').update(t.html, 'utf8').digest('hex'));
    expect(t.report.html.utf8Bytes).toBe(Buffer.byteLength(t.html, 'utf8'));
    expect(t.report.html.csp).toBe(EXPORT_CSP);
    expect(t.report.checks).toMatchObject({ scriptCount: 0, resourceReferenceCount: 0, sameSiteLinkCount: 1, externalLinkCount: 1 });
    expect(t.report.validation.errorCount).toBe(0);
    expect(t.report.project).toEqual({ componentCount: project.page.components.length, boundComponentCount: 3 });
    expect(t.source).toBe(project);
  });
  it('adds no tenant information to the page or the report', async () => {
    const t = await createTenantTestExport(buildBaselineProject(), CTX);
    for (const s of [t.html, t.reportJson]) expect(s).not.toMatch(/sharepoint\.com|onmicrosoft|access_token|bearer|cookie|eyJ[A-Za-z0-9]/i);
  });
  it('surfaces validation errors in the report instead of hiding them', async () => {
    const p = buildBaselineProject();
    p.page.components = [];
    const t = await createTenantTestExport(p, CTX);
    expect(t.report.validation.errorCount).toBeGreaterThan(0);
  });
});

describe('CSP is pinned', () => {
  it('has exactly the reviewed directives and appears once, first in <head>', () => {
    expect(EXPORT_CSP).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    const html = baselineHtml();
    expect(html.match(/Content-Security-Policy/g)?.length).toBe(1);
    const doc = parse(html);
    const metas = [...doc.head.children];
    expect(metas.findIndex((e) => e.getAttribute('http-equiv') === 'Content-Security-Policy')).toBeLessThanOrEqual(2);
    expect(doc.head.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toBe(EXPORT_CSP);
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<style>'));
  });
  it('is documented directive by directive', () => {
    const doc = readFileSync('docs/security/csp.md', 'utf8');
    for (const d of EXPORT_CSP.split(';').map((x) => x.trim())) expect(doc).toContain(`\`${d}\``);
    expect(doc).toContain(EXPORT_CSP);
  });
});

describe('tenant test result schema', () => {
  it('accepts the committed example and the example covers every protocol case', () => {
    const example = JSON.parse(readFileSync('docs/testing/tenant-test-result.example.json', 'utf8'));
    const r = TenantTestResultSchema.safeParse(example);
    expect(r.error?.issues).toBeUndefined();
    expect(example.cases.map((c: { id: string }) => c.id)).toEqual(TENANT_TEST_CASES.map((c) => c.id));
  });
  it('keeps committed example and JSON Schemas in sync with the code (run `npm run schemas`)', () => {
    const read = (f: string) => JSON.parse(readFileSync(`docs/testing/${f}`, 'utf8'));
    expect(read('tenant-test-result.example.json')).toEqual(JSON.parse(JSON.stringify(buildExampleResult())));
    expect(read('tenant-test-result.schema.json')).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(TenantTestResultSchema))));
    expect(read('validation-report.schema.json')).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(ValidationReportSchema))));
  });
  it('requires the protocol document to describe every case id', () => {
    const doc = readFileSync('docs/testing/real-tenant-baseline.md', 'utf8');
    for (const c of TENANT_TEST_CASES) expect(doc).toContain(c.id);
  });
  const base = () => structuredClone(buildExampleResult());
  it('rejects bad hashes, sizes and missing sanitization confirmation', () => {
    const a = base();
    a.html.sha256 = 'XYZ';
    expect(TenantTestResultSchema.safeParse(a).success).toBe(false);
    const b = base();
    b.html.utf8Bytes = MAX_HTML_BYTES + 1;
    expect(TenantTestResultSchema.safeParse(b).success).toBe(false);
    const c = { ...base(), sanitizationConfirmed: false };
    expect(TenantTestResultSchema.safeParse(c).success).toBe(false);
  });
  it('rejects statuses without an actual result, and failures without observations', () => {
    const a = base();
    const first = a.cases[0];
    if (!first) throw new Error('no case');
    first.status = 'fail';
    first.actual = '';
    first.observations = [];
    const r = TenantTestResultSchema.safeParse(a);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message).join()).toMatch(/actual result|observation/);
  });
  it.each([
    ['a JWT', 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0'],
    ['a Bearer token', 'Authorization worked with Bearer abc123'],
    ['a cookie header', 'saw Cookie: FedAuth=zzz'],
    ['a signed URL', 'https://x/y?sig=abc&se=2026'],
    ['a tenant hostname', 'opened https://contoso.sharepoint.com/sites/x'],
  ])('rejects observations containing %s', (_n, text) => {
    expect(findSensitive(text)).not.toBeNull();
    const a = base();
    const c = a.cases[0];
    if (!c) throw new Error('no case');
    c.observations = [text];
    expect(TenantTestResultSchema.safeParse(a).success).toBe(false);
  });
  it('accepts redacted observations', () => {
    expect(findSensitive('Opened [tenant] page; CSP header recorded without other headers.')).toBeNull();
  });
  it('rejects evidence entries that are paths or URLs', () => {
    const a = base();
    const c = a.cases[0];
    if (!c) throw new Error('no case');
    c.evidence = [{ label: 'x', fileName: 'https://host/file.png' }];
    expect(TenantTestResultSchema.safeParse(a).success).toBe(false);
  });
});

describe('project type sanity', () => {
  it('template is a valid Project', () => {
    const p: Project = buildBaselineProject();
    expect(parseProject(p).ok).toBe(true);
  });
});
