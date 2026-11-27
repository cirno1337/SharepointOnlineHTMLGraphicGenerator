import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EXPORT_CSP, INTERACTIVE_CSP, STATIC_CSP, renderPage } from '../src/core/export/render';
import { LIVEDATA_CONTRACT_REVISION } from '../src/core/livedata/constants';
import { compileManifest } from '../src/core/livedata/manifest';
import { PROBE_SOURCE, renderProbePage } from '../src/core/livedata/probe';
import { isLiveExcelEnabled, sharePointExcelLiveProvider } from '../src/core/livedata/provider';
import { RUNTIME_SOURCE } from '../src/core/livedata/runtime';
import { emptyProject, parseProject } from '../src/core/project';
import { BASELINE_TEMPLATE_NAME, buildBaselineProject } from '../src/core/templates/baseline';
import { ValidationReportSchema, createTenantTestExport } from '../src/core/tenant/report';
import { scanExport, validateHtml, validateProject } from '../src/core/validate';
import { defaultLabelAdjacent } from '../src/core/livedata/selector';
import { FIXTURE_ITEM_URL, fixtureLiveKpi, fixtureSource, liveProject } from './livedataFixtures';

const CTX = { exportedAt: '2026-01-02T03:04:05.000Z', studioBuild: '0.2.0+test' };
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const errorCodes = (html: string, profile: 'static-safe' | 'interactive-safe') => validateHtml(html, { profile }).filter((i) => i.severity === 'error').map((i) => i.code);

describe('Static Safe profile is unchanged', () => {
  it('is byte-identical to the a0525ce export of the baseline template (golden computed from that commit)', () => {
    const p = buildBaselineProject();
    for (const c of p.page.components) if (c.type === 'link' && c.id === 'b-link-same') c.href = '/sites/example-site/SitePages/Home.aspx';
    const html = renderPage(p, { exportedAt: CTX.exportedAt, studioBuild: '0.2.0+golden' });
    expect(new TextEncoder().encode(html).length).toBe(6556);
    expect(sha(html)).toBe('ed7510608803f96849dddc45cc8924303cd96e69de400539f42f8952aed9bb2d');
  });
  it('keeps its CSP, contains no script and no runtime, and works with snapshot components', () => {
    const html = renderPage(buildBaselineProject(), CTX);
    expect(STATIC_CSP).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    expect(EXPORT_CSP).toBe(STATIC_CSP);
    expect(html).toContain(`content="${STATIC_CSP}"`);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('sphs-live');
    expect(html).not.toContain('__LD_RESULTS__');
    expect(html).not.toContain('ka-livedata-manifest');
    expect(scanExport(html).scriptCount).toBe(0);
    expect(errorCodes(html, 'static-safe')).toEqual([]);
    expect(html).toContain('<strong class="sphs-kpi__value">17</strong>'); // Excel-bound snapshot KPI still renders
  });
  it('is the default profile, even for projects saved before profiles existed', () => {
    expect(emptyProject().page.exportProfile).toBe('static-safe');
    const old = { schemaVersion: 1, name: 'old', page: { title: 't', lang: 'en', accent: '#0f6cbd', components: [{ id: 'h', type: 'heading', level: 1, text: 'x' }] } };
    const r = parseProject(old);
    expect(r.ok && r.project.page.exportProfile).toBe('static-safe');
    expect(r.ok && r.project.page.liveSources).toEqual([]);
  });
  it('shows an honest placeholder (and validation blocks export) if a Live KPI is in a static project', () => {
    const p = liveProject({ profile: 'static-safe' });
    const html = renderPage(p, CTX);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('requires the Interactive Safe profile');
    expect(validateProject(p, { liveEnabled: true }).map((i) => i.code)).toContain('live-needs-interactive');
  });
});

describe('Interactive Safe profile', () => {
  const p = liveProject({ sources: [fixtureSource({ filePath: '/sites/x/y.xlsx', label: 'L', cslViewLink: 'https://h.example/:x:/s/p' })] });
  const html = renderPage(p, CTX);

  it('uses the evidence-based CSP: only script-src unsafe-inline differs from Static Safe', () => {
    expect(INTERACTIVE_CSP).toBe("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:");
    expect(html).toContain(`content="${INTERACTIVE_CSP}"`);
    expect(INTERACTIVE_CSP.replace("script-src 'unsafe-inline'; ", '')).toBe(STATIC_CSP);
    expect(INTERACTIVE_CSP).toContain("default-src 'none'");
    for (const banned of ['connect-src', 'frame-src', 'unsafe-eval', 'http', '*']) expect(INTERACTIVE_CSP).not.toContain(banned);
  });
  it('contains exactly Studio\'s runtime and one manifest, nothing else executable', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(2);
    const manifest = scripts.find((s) => /ka-livedata-manifest/.test(s[1]!))!;
    const runtime = scripts.find((s) => !/ka-livedata-manifest/.test(s[1]!))!;
    expect(manifest[1]).toBe(' type="application/json" class="ka-livedata-manifest"');
    expect(JSON.parse(manifest[2]!)).toEqual([{ spItemUrl: FIXTURE_ITEM_URL, fileName: 'status.xlsx' }]);
    expect(runtime[1]).toBe('');
    expect(runtime[2]!.trim()).toBe(RUNTIME_SOURCE);
    expect(errorCodes(html, 'interactive-safe')).toEqual([]);
  });
  it('contains no network, storage or dynamic-code API and no external resource', () => {
    for (const banned of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /localStorage/, /sessionStorage/, /\beval\b/, /\bFunction\s*\(/, /new Function/, /importScripts/, /\bsrc\s*=/i, /<link\b/i, /<iframe/i, /<form/i, /@import/, /url\(/]) {
      expect(html, String(banned)).not.toMatch(banned);
    }
    // The only URL in the file is the manifest's item URL (data, not a resource).
    const urls = html.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    expect(urls.every((u) => u === FIXTURE_ITEM_URL)).toBe(true);
    expect(scanExport(html).resourceReferenceCount).toBe(0);
  });
  it('contains no credentials, sharing links, optional manifest fields or authoring marker', () => {
    for (const secret of ['h.example', 'cslViewLink', 'filePath', '/sites/x/y.xlsx', 'ms-sp-authoring-source', 'Bearer', 'access_token', 'refresh_token', 'client_secret', 'Authorization', 'sig=', 'tempauth', 'cookie', 'password']) {
      expect(html.toLowerCase(), secret).not.toContain(secret.toLowerCase());
    }
  });
  it('renders accessible, escaped KPI markup with the freshness hint and no live value baked in', () => {
    const k = html.match(/<section class="sphs-kpi sphs-live"[\s\S]*?<\/section>/)![0];
    expect(k).toContain('role="group"');
    expect(k).toContain('role="group"'); // a labelled group, not a landmark per KPI
    expect(k).toContain('aria-labelledby="sphs-k1-label"');
    expect(k).toContain('data-sphs-source="0"');
    expect(k).toContain('data-sphs-sheet="Summary"');
    expect(k).toContain('data-sphs-selector="label-adjacent" data-sphs-label="Open issues" data-sphs-match-col="0" data-sphs-value-offset="1"');
    expect(k).toContain('class="sphs-live__refresh" hidden>Refresh data</button>');
    expect(k).toContain('role="status" aria-live="polite"');
    expect(k).toContain('Recent workbook changes may take time to appear.');
    expect(k).toContain('Loading live data');
    expect(k).not.toMatch(/\b17\b/);
  });
  it('escapes hostile component text in markup and attributes', () => {
    const evil = liveProject({
      kpis: [fixtureLiveKpi({ label: '<img src=x onerror=alert(1)>', worksheet: '"><script>alert(1)</script>', prefix: '"\'<', errorText: '</script><b>x</b>', emptyText: '"onload="x', fallback: { value: '<i>1</i>', importedAt: '"><x>' } })],
    });
    const out = renderPage(evil, CTX);
    expect([...out.matchAll(/<script\b/g)]).toHaveLength(2);
    expect(out).not.toContain('<img src=x');
    expect(out).not.toContain('<script>alert');
    expect(out).not.toMatch(/<b>x<\/b>/);
    expect(errorCodes(out, 'interactive-safe')).toEqual([]);
  });
  it('sets fallback attributes only when a fallback exists and puts the live KPI under the same freshness wording', () => {
    expect(html).not.toContain('data-sphs-fallback-value');
    const withFb = renderPage(liveProject({ kpis: [fixtureLiveKpi({ fallback: { value: '12', importedAt: '2026-11-01' } })] }), CTX);
    expect(withFb).toContain('data-sphs-fallback-value="12"');
    expect(withFb).toContain('data-sphs-fallback-at="2026-11-01"');
    expect(html).not.toMatch(/last updated|real-time|realtime|guaranteed/i);
  });
  it('only emits sources that a KPI uses, deduplicated', () => {
    const two = liveProject({
      sources: [fixtureSource({ id: 'src1' }), fixtureSource({ id: 'src2', spItemUrl: FIXTURE_ITEM_URL.replace('0001', '0002') }), fixtureSource({ id: 'unused', spItemUrl: FIXTURE_ITEM_URL.replace('0001', '0003') })],
      kpis: [fixtureLiveKpi({ id: 'a', sourceId: 'src1' }), fixtureLiveKpi({ id: 'b', sourceId: 'src1', worksheet: 'Other' }), fixtureLiveKpi({ id: 'c', sourceId: 'src2' })],
    });
    const out = renderPage(two, CTX);
    const m = JSON.parse(/ka-livedata-manifest">([\s\S]*?)<\/script>/.exec(out)![1]!);
    expect(m).toHaveLength(2);
    expect(out).not.toContain('0003');
  });
  it('emits no runtime when there is no Live KPI, and warns', () => {
    const none = emptyProject();
    none.page.exportProfile = 'interactive-safe';
    const out = renderPage(none, CTX);
    expect(out).not.toMatch(/<script/i);
    expect(validateProject(none).map((i) => i.code)).toContain('interactive-without-live');
  });
});

describe('export validator for LiveData', () => {
  const html = renderPage(liveProject(), CTX);
  const tamper = (f: (s: string) => string) => f(html);

  it('rejects any extra script, in either profile', () => {
    expect(errorCodes(tamper((s) => s.replace('</main>', '</main><script>var x=1</script>')), 'interactive-safe')).toContain('unexpected-script');
    expect(errorCodes(html, 'static-safe')).toEqual(expect.arrayContaining(['script-in-static', 'csp-profile']));
  });
  it('rejects a modified runtime and forbidden APIs inside it', () => {
    const bad = tamper((s) => s.replace("'use strict';", "'use strict'; fetch('x'); eval('1');"));
    const codes = errorCodes(bad, 'interactive-safe');
    expect(codes).toContain('unexpected-script');
    expect(codes).toContain('forbidden-api');
    for (const api of ['sessionStorage.x', 'document.cookie', 'new Function("1")', 'el.innerHTML = x', 'new Worker("a")']) {
      expect(errorCodes(tamper((s) => s.replace("'use strict';", `'use strict'; ${api};`)), 'interactive-safe'), api).toContain('forbidden-api');
    }
  });
  it('requires the CSP to match the selected profile', () => {
    expect(errorCodes(tamper((s) => s.replace(INTERACTIVE_CSP, STATIC_CSP)), 'interactive-safe')).toContain('csp-profile');
    expect(errorCodes(tamper((s) => s.replace(INTERACTIVE_CSP, `${INTERACTIVE_CSP}; connect-src *`)), 'interactive-safe')).toContain('csp-profile');
    expect(errorCodes(tamper((s) => s.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')), 'interactive-safe')).toContain('csp-profile');
  });
  it('validates the manifest strictly', () => {
    const swap = (json: string) => tamper((s) => s.replace(/(ka-livedata-manifest">)[\s\S]*?(<\/script>)/, `$1${json}$2`));
    expect(errorCodes(swap('not json'), 'interactive-safe')).toContain('manifest-invalid');
    expect(errorCodes(swap('[]'), 'interactive-safe')).toContain('manifest-invalid');
    expect(errorCodes(swap(JSON.stringify([{ spItemUrl: FIXTURE_ITEM_URL }])), 'interactive-safe')).toContain('manifest-invalid');
    expect(errorCodes(swap(JSON.stringify([{ spItemUrl: FIXTURE_ITEM_URL, fileName: 'a.xlsx', cslViewLink: 'https://x.example/' }])), 'interactive-safe')).toContain('manifest-invalid');
    expect(errorCodes(swap(JSON.stringify([{ spItemUrl: 'https://graph.microsoft.com/v1.0/x', fileName: 'a.xlsx' }])), 'interactive-safe')).toEqual(expect.arrayContaining(['manifest-invalid', 'forbidden-api']));
  });
  it('allows the "/_api/" item URL only inside the JSON manifest, never in executable script', () => {
    expect(validateHtml(html, { profile: 'interactive-safe' }).some((i) => i.code === 'forbidden-api')).toBe(false);
    const inRuntime = tamper((s) => s.replace("'use strict';", "'use strict'; var u = '/_api/v2.0/x';"));
    expect(errorCodes(inRuntime, 'interactive-safe')).toContain('forbidden-api');
  });
  it('requires manifest and runtime together and not duplicated', () => {
    const noRuntime = tamper((s) => s.replace(/<script>\n[\s\S]*?<\/script>/, ''));
    expect(errorCodes(noRuntime, 'interactive-safe')).toContain('manifest-without-runtime');
    const noManifest = tamper((s) => s.replace(/<script type="application\/json"[\s\S]*?<\/script>/, ''));
    expect(errorCodes(noManifest, 'interactive-safe')).toContain('runtime-without-manifest');
    const dup = tamper((s) => s.replace('</body>', `${/<script type="application\/json"[\s\S]*?<\/script>/.exec(s)![0]}</body>`));
    expect(errorCodes(dup, 'interactive-safe')).toContain('duplicate-livedata-script');
  });
});

describe('project validation for Live Excel', () => {
  const codes = (p = liveProject(), liveEnabled = true) => validateProject(p, { liveEnabled }).map((i) => i.code);
  it('is blocked unless the feature flag is on', () => {
    expect(codes(liveProject(), false)).toContain('live-disabled');
    expect(codes(liveProject(), true)).not.toContain('live-disabled');
    expect(isLiveExcelEnabled(undefined)).toBe(false);
    expect(isLiveExcelEnabled({})).toBe(false);
    expect(isLiveExcelEnabled({ VITE_EXPERIMENTAL_EXCEL_LIVE: 'false' })).toBe(false);
    expect(isLiveExcelEnabled({ VITE_EXPERIMENTAL_EXCEL_LIVE: '1' })).toBe(false);
    expect(isLiveExcelEnabled({ VITE_EXPERIMENTAL_EXCEL_LIVE: 'true' })).toBe(true);
  });
  it('always surfaces the experimental and permission warnings', () => {
    const issues = validateProject(liveProject(), { liveEnabled: true });
    const byCode = Object.fromEntries(issues.map((i) => [i.code, i]));
    expect(byCode['live-experimental']?.severity).toBe('warning');
    expect(byCode['live-experimental']?.message).toContain('undocumented behavior observed in a specific SharePoint Online tenant');
    expect(byCode['live-permissions']?.message).toContain('LD-07');
  });
  it('LD-09: no positional selection exists; the provider validates the semantic selector', () => {
    const cfg = { source: fixtureSource(), selection: { worksheet: 'Summary', selection: defaultLabelAdjacent('Open issues') } };
    expect(sharePointExcelLiveProvider.validate(cfg).filter((i) => i.severity === 'error')).toEqual([]);
    expect(sharePointExcelLiveProvider.validate({ ...cfg, selection: { worksheet: 'Summary', selection: defaultLabelAdjacent('') } }).map((i) => i.code)).toContain('label-empty');
    expect(sharePointExcelLiveProvider.validate({ ...cfg, selection: { worksheet: 'Summary', selection: { type: 'deprecated-cell', address: 'B7' } } }).map((i) => i.code)).toContain('selector-unsupported');
  });
  it('reports missing sources, bad selectors and unsafe source configuration', () => {
    expect(codes(liveProject({ kpis: [fixtureLiveKpi({ sourceId: 'missing' })] }))).toContain('live-source-missing');
    expect(codes(liveProject({ kpis: [fixtureLiveKpi({ selector: defaultLabelAdjacent('') })] }))).toContain('live-selector-label-empty');
    expect(codes(liveProject({ kpis: [fixtureLiveKpi({ worksheet: ' ' })] }))).toContain('live-worksheet');
    expect(codes(liveProject({ sources: [fixtureSource({ spItemUrl: 'javascript:alert(1)' })] }))).toContain('live-source-item-url-scheme');
    expect(codes(liveProject({ sources: [fixtureSource({ acknowledgedExperimental: false })] }))).toContain('live-source-not-acknowledged');
    expect(codes(liveProject({ kpis: [fixtureLiveKpi({ warnAt: 10, criticalAt: 5 })] }))).toContain('live-thresholds');
  });
});

describe('tenant test export report for LiveData', () => {
  it('records experimental facts without any identifier, URL or sharing link', async () => {
    const p = liveProject({ sources: [fixtureSource({ cslViewLink: 'https://h.example/:x:/s/p' })], kpis: [fixtureLiveKpi({ fallback: { value: '12' } })] });
    const t = await createTenantTestExport(p, CTX, { liveEnabled: true });
    expect(ValidationReportSchema.safeParse(t.report).success).toBe(true);
    expect(t.report.validation.errorCount).toBe(0);
    expect(t.report.exportProfile).toBe('interactive-safe');
    expect(t.report.html.csp).toBe(INTERACTIVE_CSP);
    expect(t.report.liveData).toMatchObject({
      experimentalFeatureUsed: true,
      contractRevision: LIVEDATA_CONTRACT_REVISION,
      evidenceLevel: 'tenant-observed-reproduced',
      manifestSourceCount: 1,
      refreshSupported: true,
      identifiersInExport: true,
      cslViewLinkInExport: false,
      explicitSharingDecisionRequired: true,
      fallbackAvailable: true,
    });
    expect(t.report.liveData.permissionWarning).toContain('LD-07');
    expect(t.reportJson).not.toMatch(/tenant-a\.example|FIXTUREDRIVE|FIXTUREITEM|h\.example/);
    expect(t.report.checks.scriptCount).toBe(2);
  });
  it('reports a static export as not using the experimental feature', async () => {
    const t = await createTenantTestExport(buildBaselineProject(), CTX);
    expect(t.report.exportProfile).toBe('static-safe');
    expect(t.report.html.csp).toBe(STATIC_CSP);
    expect(t.report.liveData).toMatchObject({ experimentalFeatureUsed: false, contractRevision: null, manifestSourceCount: 0, identifiersInExport: false, explicitSharingDecisionRequired: false });
    expect(t.report.checks.scriptCount).toBe(0);
  });
  it('blocks the export (validation error) when the feature flag is off', async () => {
    const t = await createTenantTestExport(liveProject(), CTX, { liveEnabled: false });
    expect(t.report.validation.issues.map((i) => i.code)).toContain('live-disabled');
    expect(t.report.validation.errorCount).toBeGreaterThan(0);
    expect(BASELINE_TEMPLATE_NAME).toBeTruthy();
  });
});

describe('SharePointExcelLive provider', () => {
  const config = { source: fixtureSource(), selection: { worksheet: 'Summary', selection: defaultLabelAdjacent('Open issues') } };
  it('is classified experimental with the observed contract revision and reproduced evidence', () => {
    expect(sharePointExcelLiveProvider.capability).toBe('experimental');
    expect(sharePointExcelLiveProvider.contractRevision).toBe('observed-2026-11-r1');
    expect(sharePointExcelLiveProvider.evidenceLevel).toBe('tenant-observed-reproduced');
    expect(sharePointExcelLiveProvider.warning).toContain('undocumented behavior observed in a specific SharePoint Online tenant');
  });
  it('validates transport and selection separately', () => {
    // Transport and selection are valid.
    expect(sharePointExcelLiveProvider.validate(config).filter((i) => i.severity === 'error')).toEqual([]);
    expect(sharePointExcelLiveProvider.validate({ ...config, selection: { worksheet: ' ', selection: defaultLabelAdjacent('x') } }).map((i) => i.code)).toContain('worksheet-missing');
    expect(sharePointExcelLiveProvider.validate({ ...config, selection: { worksheet: 'S', selection: { ...defaultLabelAdjacent('x'), valueOffset: 0 } } }).map((i) => i.code)).toContain('value-offset-invalid');
    expect(sharePointExcelLiveProvider.validate({ ...config, source: fixtureSource({ spItemUrl: '' }) }).map((i) => i.code)).toContain('item-url-missing');
  });
  it('compiles only the evidenced manifest fields', () => {
    const c = sharePointExcelLiveProvider.compile(config);
    expect(c.manifestEntry).toEqual({ spItemUrl: FIXTURE_ITEM_URL, fileName: 'status.xlsx' });
    expect(c.evidenceLevel).toBe('tenant-observed-reproduced');
  });
  it('previews with mock data only, labelled as such, and never connects to SharePoint', async () => {
    const prev = await sharePointExcelLiveProvider.preview(config, { scenario: 'ok' });
    expect(prev.label).toBe('Mock LiveData preview');
    expect(prev.connectedToSharePoint).toBe(false);
    expect(Object.keys(prev.results)).toEqual([FIXTURE_ITEM_URL]);
    expect(await sharePointExcelLiveProvider.preview(config, { scenario: 'missing' })).toMatchObject({ results: {} });
  });
  it('makes no network request during validate, compile or preview', async () => {
    const g = globalThis as unknown as { fetch: unknown };
    const original = g.fetch;
    let called = 0;
    g.fetch = () => {
      called += 1;
      throw new Error('network');
    };
    try {
      sharePointExcelLiveProvider.validate(config);
      sharePointExcelLiveProvider.compile(config);
      await sharePointExcelLiveProvider.preview(config, { scenario: 'ok' });
    } finally {
      g.fetch = original;
    }
    expect(called).toBe(0);
  });
});

describe('LD-09 probe page', () => {
  const html = renderProbePage(compileManifest([fixtureSource()]));
  it('uses the interactive CSP, carries the manifest, and never prints the item URL', () => {
    expect(html).toContain(`content="${INTERACTIVE_CSP}"`);
    expect(html).toContain('ka-livedata-manifest');
    expect(PROBE_SOURCE).not.toContain(FIXTURE_ITEM_URL);
    expect(PROBE_SOURCE).toContain('textContent');
  });
  it('contains no network, storage, dynamic-code or HTML-injection APIs', () => {
    const forbidden = validateHtml(html).filter((i) => i.code === 'forbidden-api' || i.code === 'external-script' || i.code === 'external-resource');
    expect(forbidden).toEqual([]);
    expect(PROBE_SOURCE).not.toMatch(/innerHTML|fetch|XMLHttpRequest|localStorage|eval|postMessage/);
  });
});
