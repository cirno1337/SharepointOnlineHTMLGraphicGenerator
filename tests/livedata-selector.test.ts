import { describe, expect, it } from 'vitest';
import { renderPage } from '../src/core/export/render';
import { SELECTOR_LIMITS, defaultLabelAdjacent, validateSelector, type LabelAdjacentSelector } from '../src/core/livedata/selector';
import { emptyProject, parseProject } from '../src/core/project';
import { createTenantTestExport } from '../src/core/tenant/report';
import { validateHtml, validateProject } from '../src/core/validate';
import { FIXTURE_ITEM_URL, OBSERVED_LD09_CONTENT, OBSERVED_LD09_RESULT, baseCfg, envelope, fixtureLiveKpi, fixtureSource, liveProject, loadRuntimeCore, plain } from './livedataFixtures';

const { core, touched } = loadRuntimeCore();
const CTX = { exportedAt: '2026-01-02T03:04:05.000Z', studioBuild: '0.3.0+test' };

const sel = (label: string, over: Partial<LabelAdjacentSelector> = {}): LabelAdjacentSelector => ({ ...defaultLabelAdjacent(label), ...over });
const pick = (rows: string[][], s: LabelAdjacentSelector) => plain(core.selectLabelAdjacent(rows, s));
const summaryRows = () => plain(core.parseCsv('Open issues,23\nDoubled,46\n')).rows!;

describe('label-adjacent: successful selection', () => {
  it('returns 23 for Open issues and 46 for Doubled from the observed LD-09 payload', () => {
    const sheets = plain(core.parseEnvelope(OBSERVED_LD09_CONTENT)).sheets!;
    const rows = plain(core.parseCsv(sheets[0]!.csv)).rows!;
    expect(pick(rows, sel('Open issues'))).toEqual({ ok: true, value: '23', empty: false });
    expect(pick(rows, sel('Doubled'))).toEqual({ ok: true, value: '46', empty: false });
  });
  it('supports a match column other than the first and positive offsets', () => {
    const rows = [['x', 'Open issues', 'a', 'b'], ['y', 'Other', 'c', 'd']];
    expect(pick(rows, sel('Open issues', { matchColumn: 1 })).value).toBe('a');
    expect(pick(rows, sel('Open issues', { matchColumn: 1, valueOffset: 2 })).value).toBe('b');
  });
  it('supports a negative offset while the value column stays valid', () => {
    const rows = [['23', 'Open issues'], ['46', 'Doubled']];
    expect(pick(rows, sel('Open issues', { matchColumn: 1, valueOffset: -1 })).value).toBe('23');
    expect(pick(rows, sel('Open issues', { matchColumn: 1, valueOffset: -2 })).code).toBe('value-offset-invalid');
  });
  it('honours case sensitivity', () => {
    const rows = [['Open issues', '23']];
    expect(pick(rows, sel('open ISSUES', { caseSensitive: false })).value).toBe('23');
    expect(pick(rows, sel('open ISSUES', { caseSensitive: true })).code).toBe('label-not-found');
    expect(pick(rows, sel('Open issues', { caseSensitive: true })).value).toBe('23');
  });
  it('honours trim on and off, on both the configured label and the candidate', () => {
    const rows = [['  Open issues \t', '23']];
    expect(pick(rows, sel('Open issues', { trim: true })).value).toBe('23');
    expect(pick(rows, sel('  open issues  ', { trim: true })).value).toBe('23');
    expect(pick(rows, sel('Open issues', { trim: false })).code).toBe('label-not-found');
    expect(pick(rows, sel('  Open issues \t', { trim: false, caseSensitive: true })).value).toBe('23');
  });
  it('does not mutate the returned value (display text is preserved)', () => {
    expect(pick([['L', '  17  ']], sel('L')).value).toBe('  17  ');
    expect(pick([['L', ' x ']], sel('L')).value).toBe(' x ');
  });
  it('treats a whitespace-only adjacent value as empty without altering real values (audit finding)', () => {
    expect(pick([['L', '   ']], sel('L')).code).toBe('adjacent-value-empty');
    expect(pick([['L', ' ']], sel('L')).code).toBe('adjacent-value-empty');
    expect(pick([['L', ' ']], sel('L', { allowEmptyValue: true }))).toEqual({ ok: true, value: '', empty: true });
    expect(pick([['L', ' 0 ']], sel('L')).value).toBe(' 0 ');
  });
  it('allows an empty value only when explicitly configured', () => {
    expect(pick([['L', '']], sel('L')).code).toBe('adjacent-value-empty');
    expect(pick([['L', '']], sel('L', { allowEmptyValue: true }))).toEqual({ ok: true, value: '', empty: true });
  });
});

describe('label normalisation (NFC, optional trim, optional toLowerCase; no fuzzy matching)', () => {
  const m = (a: string, b: string, o: Partial<LabelAdjacentSelector> = {}) => pick([[a, 'v']], sel(b, o)).code === undefined;
  it('matches composed and decomposed Unicode (NFC)', () => {
    expect(m('café', 'café')).toBe(true);
    expect(m('café', 'café', { caseSensitive: true })).toBe(true);
    expect(core.normLabel('é', false, true)).toBe('é');
  });
  it('handles Polish diacritics, including case-insensitive matching', () => {
    expect(m('Zażółć gęślą jaźń', 'ZAŻÓŁĆ GĘŚLĄ JAŹŃ')).toBe(true);
    expect(m('Łódź', 'łódź')).toBe(true);
    expect(m('Łódź', 'łódź', { caseSensitive: true })).toBe(false);
  });
  it('never removes diacritics, punctuation or interior whitespace, and never folds beyond toLowerCase', () => {
    expect(m('Zazolc', 'Zażółć')).toBe(false);
    expect(m('Open issues.', 'Open issues')).toBe(false);
    expect(m('Open  issues', 'Open issues')).toBe(false); // multiple internal spaces stay distinct
    expect(m('Open issues', 'Open  issues')).toBe(false);
    expect(m('straße', 'STRASSE')).toBe(false); // documented: not full Unicode case folding
    expect(core.normLabel('ß', false, false)).toBe('ß');
  });
  it('treats CJK, Hebrew and emoji labels as plain text', () => {
    expect(m('未解決の問題', '未解決の問題', { caseSensitive: true })).toBe(true);
    expect(m('בעיות פתוחות', 'בעיות פתוחות')).toBe(true);
    expect(m('🔥 Critical', '🔥 critical')).toBe(true);
    expect(m('🔥 Critical', '🔥 critical', { caseSensitive: true })).toBe(false);
  });
  it('does not coerce numeric strings', () => {
    expect(m('1', '1.0')).toBe(false);
    expect(m('007', '7')).toBe(false);
  });
});

describe('label-adjacent: failures are distinct and never guess', () => {
  const rows = summaryRows();
  it('label-not-found', () => expect(pick(rows, sel('Nope')).code).toBe('label-not-found'));
  it('ambiguous-label: duplicates never return the first match', () => {
    const dup = [['Open issues', '23'], ['Doubled', '46'], ['Open issues', '99']];
    expect(pick(dup, sel('Open issues'))).toEqual({ ok: false, code: 'ambiguous-label' });
    expect(pick(dup, sel('Doubled')).value).toBe('46');
  });
  it('whitespace and case differences can make a label ambiguous; case-sensitive matching removes it', () => {
    const dup = [['Open issues', '1'], [' open ISSUES ', '2']];
    expect(pick(dup, sel('Open issues')).code).toBe('ambiguous-label');
    expect(pick(dup, sel('Open issues', { caseSensitive: true, trim: false })).value).toBe('1');
  });
  it('does not search another column automatically', () => {
    expect(pick([['x', 'Open issues', '23']], sel('Open issues')).code).toBe('label-not-found');
  });
  it('label-empty and label-too-long', () => {
    expect(pick(rows, sel('')).code).toBe('label-empty');
    expect(pick(rows, sel('   ')).code).toBe('label-empty');
    expect(pick(rows, sel('x'.repeat(SELECTOR_LIMITS.maxLabelChars + 1))).code).toBe('label-too-long');
    expect(pick([['x'.repeat(255), '1']], sel('x'.repeat(255))).value).toBe('1');
  });
  it('match-column-invalid', () => {
    for (const mc of [-1, 1.5, SELECTOR_LIMITS.maxMatchColumn + 1, Number.NaN, Infinity]) expect(pick(rows, sel('Open issues', { matchColumn: mc })).code, String(mc)).toBe('match-column-invalid');
    expect(pick(rows, sel('Open issues', { matchColumn: '0' as unknown as number })).code).toBe('match-column-invalid');
  });
  it('value-offset-invalid: zero, fractional, too large, or before column 1', () => {
    for (const vo of [0, 0.5, SELECTOR_LIMITS.maxValueOffset + 1, -(SELECTOR_LIMITS.maxValueOffset + 1), Number.NaN]) expect(pick(rows, sel('Open issues', { valueOffset: vo })).code, String(vo)).toBe('value-offset-invalid');
    expect(pick(rows, sel('Open issues', { matchColumn: 0, valueOffset: -1 })).code).toBe('value-offset-invalid');
  });
  it('adjacent-value-missing when the row ends before the value column', () => {
    expect(pick([['Open issues']], sel('Open issues')).code).toBe('adjacent-value-missing');
    expect(pick(rows, sel('Open issues', { valueOffset: 5 })).code).toBe('adjacent-value-missing');
  });
  it('adjacent-value-empty', () => expect(pick([['Open issues', '']], sel('Open issues')).code).toBe('adjacent-value-empty'));
  it('selector-unsupported for any other selector shape', () => {
    for (const s of [undefined, null, {}, { type: 'cell', address: 'B7' }, { type: 'deprecated-cell', address: 'B7' }, { type: 'unsupported' }]) {
      expect(plain(core.selectLabelAdjacent(rows, s)).code).toBe('selector-unsupported');
    }
  });
  it('there is no positional path: B7 style selection does not exist in the runtime', () => {
    expect((core as unknown as Record<string, unknown>).readCell).toBeUndefined();
    expect((core as unknown as Record<string, unknown>).parseCell).toBeUndefined();
  });
});

describe('worksheet, CSV and size handling through resolveKpi', () => {
  const manifest = [{ spItemUrl: FIXTURE_ITEM_URL, fileName: 'status.xlsx' }];
  const res = (content: string, cfg = baseCfg) => plain(core.resolveKpi(cfg, manifest, { [FIXTURE_ITEM_URL]: { format: 'xlsx-sheets', content } }));
  it('reports a missing worksheet and malformed CSV only for the affected KPI', () => {
    expect(res(envelope({ Other: 'Open issues,1\n' })).code).toBe('worksheet-not-found');
    expect(res(envelope({ Summary: 'Open issues,"unterminated\n' })).code).toBe('malformed');
    expect(res(envelope({ Summary: 'Open issues,5\n', Bad: 'x,"u\n' })).value).toBe('5'); // the broken sheet is never read
  });
  it('enforces content, row and width limits', () => {
    expect(res(`<sheet name="Summary">\n${'x'.repeat(2_000_001)}</sheet>`).code).toBe('too-large');
    expect(res(envelope({ Summary: `${'a,b\n'.repeat(10_001)}` })).code).toBe('too-many-rows');
    expect(res(envelope({ Summary: `${','.repeat(500)}\n` })).code).toBe('too-many-columns');
  });
  it('finds the row among 10,000 rows quickly', () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => [`Label ${i}`, String(i)]);
    const t0 = Date.now();
    expect(pick(rows, sel('label 9999')).value).toBe('9999');
    expect(pick(rows, sel('label 4999', { caseSensitive: true })).code).toBe('label-not-found');
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it('handles very wide rows without scanning other columns', () => {
    const row = Array.from({ length: 500 }, (_, i) => `c${i}`);
    row[499] = 'Open issues';
    expect(pick([row], sel('Open issues', { matchColumn: 499, valueOffset: -1 })).value).toBe('c498');
    expect(pick([row], sel('Open issues', { matchColumn: 499 })).code).toBe('adjacent-value-missing');
  });
});

describe('security: labels and values are inert text', () => {
  const evil = ['<img src=x onerror=alert(1)>', '</script><script>alert(1)</script>', 'javascript:alert(1)', '=HYPERLINK("javascript:alert(1)")', "$& $' $` $$ $1", '   x', '"; alert(1); "'];
  it('returns hostile values verbatim as strings and creates nothing', () => {
    for (const v of evil) expect(pick([['L', v]], sel('L')).value).toBe(v);
    expect(touched).toEqual([]);
  });
  it('matches hostile labels as plain text', () => {
    for (const l of evil) expect(pick([[l, 'ok']], sel(l, { caseSensitive: true, trim: false })).value).toBe('ok');
  });
  it('renders hostile labels as escaped attributes in the export and the validator still passes', () => {
    const p = liveProject({ kpis: [fixtureLiveKpi({ selector: sel('"><script>alert(1)</script> \'x\' </script> &amp;  ') })] });
    const out = renderPage(p, CTX);
    expect([...out.matchAll(/<script\b/g)]).toHaveLength(2); // manifest + runtime only
    expect(out).not.toContain('<script>alert');
    expect(validateHtml(out, { profile: 'interactive-safe' }).filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('an HTML-looking label round-trips through the attribute unchanged', () => {
    const label = '"><b>x</b> & \'q\'';
    const out = renderPage(liveProject({ kpis: [fixtureLiveKpi({ selector: sel(label) })] }), CTX);
    const m = /data-sphs-label="([^"]*)"/.exec(out)![1]!;
    const decoded = m.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#96;/g, '`').replace(/&amp;/g, '&');
    expect(decoded).toBe(label);
  });
  it('diagnostics and messages never contain the item URL or other row content', () => {
    const results = { [FIXTURE_ITEM_URL]: OBSERVED_LD09_RESULT };
    const manifest = [{ spItemUrl: FIXTURE_ITEM_URL, fileName: 'status.xlsx' }];
    for (const label of ['Nope', 'Open issues']) {
      const cfg = { ...baseCfg, selector: sel(label, { valueOffset: 9 }) };
      const vm = plain(core.present(cfg, core.resolveKpi(cfg, manifest, results), 't'));
      const text = `${vm.message} ${vm.diag}`;
      for (const leak of ['tenant-a', 'FIXTURE', 'Doubled', '46', '23']) expect(text, label).not.toContain(leak);
      expect(vm.diag).toMatch(/source 1 ref-[0-9a-f]{8}/);
    }
    const nf = { ...baseCfg, selector: sel('Nope') };
    expect(plain(core.present(nf, core.resolveKpi(nf, manifest, results), 't')).message).toBe('No row matched the label ‘Nope’.');
  });
  it('shortens very long labels in messages', () => {
    const cfg = { ...baseCfg, selector: sel('x'.repeat(200)) };
    const vm = plain(core.present(cfg, { ok: false, code: 'label-not-found', ref: 'ref-1' } as never, 't'));
    expect(vm.message.length).toBeLessThan(120);
  });
});

describe('editor / runtime parity for selector validation', () => {
  const cases: [string, LabelAdjacentSelector][] = [
    ['valid', sel('Open issues')],
    ['empty', sel('')],
    ['blank with trim', sel('  ')],
    ['blank without trim', sel('  ', { trim: false })],
    ['too long', sel('x'.repeat(256))],
    ['column -1', sel('a', { matchColumn: -1 })],
    ['column 500', sel('a', { matchColumn: 500 })],
    ['column 499', sel('a', { matchColumn: 499, valueOffset: -499 })],
    ['offset 0', sel('a', { valueOffset: 0 })],
    ['offset 500', sel('a', { valueOffset: 500 })],
    ['offset -1 at col 0', sel('a', { valueOffset: -1 })],
    ['offset -1 at col 1', sel('a', { matchColumn: 1, valueOffset: -1 })],
    ['fractional', sel('a', { valueOffset: 1.5 })],
  ];
  it.each(cases)('%s', (_name, s) => {
    const ts = validateSelector(s).map((p) => p.code);
    const rt = plain(core.checkSelector(s));
    expect(rt === null ? [] : [rt.code]).toEqual(ts.slice(0, rt === null ? 0 : 1));
    expect(rt === null).toBe(ts.length === 0);
  });
});

describe('project model, legacy migration and validation', () => {
  const legacy = () => {
    const p = JSON.parse(JSON.stringify(liveProject({ kpis: [fixtureLiveKpi({ id: 'old' })] })));
    const kpi = p.page.components.find((c: { id: string }) => c.id === 'old');
    delete kpi.selector;
    kpi.cell = 'B7';
    return p;
  };
  it('loads an old positional project safely, keeps it as deprecated and reports it', () => {
    const r = parseProject(legacy());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.legacyComponentIds).toEqual(['old']);
    const k = r.project.page.components.find((c) => c.id === 'old');
    expect(k).toMatchObject({ type: 'liveKpi', selector: { type: 'deprecated-cell', address: 'B7' } });
  });
  it('NEVER converts B7 into another selector and keeps the export blocked', () => {
    const r = parseProject(legacy());
    if (!r.ok) throw new Error('load');
    const k = r.project.page.components.find((c) => c.id === 'old')!;
    expect(JSON.stringify(k)).not.toContain('label-adjacent');
    const issues = validateProject(r.project, { liveEnabled: true });
    expect(issues.filter((i) => i.severity === 'error').map((i) => i.code)).toContain('live-selector-deprecated');
    expect(issues.find((i) => i.code === 'live-selector-deprecated')?.componentId).toBe('old');
    // the runtime also refuses it, in case an export is forced
    const html = renderPage(r.project, CTX);
    expect(html).toContain('data-sphs-selector="unsupported"');
    expect(plain(core.resolveKpi({ ...baseCfg, selector: { type: 'unsupported' } }, [{ spItemUrl: FIXTURE_ITEM_URL }], { [FIXTURE_ITEM_URL]: OBSERVED_LD09_RESULT })).code).toBe('selector-unsupported');
  });
  it('lets the user replace it with label-adjacent, after which only normal checks apply', () => {
    const r = parseProject(legacy());
    if (!r.ok) throw new Error('load');
    const p = structuredClone(r.project);
    p.page.components = p.page.components.map((c) => (c.id === 'old' && c.type === 'liveKpi' ? { ...c, selector: defaultLabelAdjacent('Open issues') } : c));
    const errors = validateProject(p, { liveEnabled: true }).filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });
  it('a still-deprecated selector survives save and reload unchanged and stays blocked', () => {
    const r = parseProject(legacy());
    if (!r.ok) throw new Error('load');
    const again = parseProject(JSON.parse(JSON.stringify(r.project)));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.legacyComponentIds).toEqual([]); // already in the new shape
    expect(again.project).toEqual(r.project);
    expect(validateProject(again.project, { liveEnabled: true }).map((i) => i.code)).toContain('live-selector-deprecated');
  });
  it('save then reload preserves the new selector exactly', () => {
    const p = liveProject({ kpis: [fixtureLiveKpi({ selector: sel('Ärger über 未', { matchColumn: 2, valueOffset: -1, caseSensitive: true, trim: false, allowEmptyValue: true }) })] });
    const r = parseProject(JSON.parse(JSON.stringify(p)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project).toEqual(p);
      expect(r.legacyComponentIds).toEqual([]);
    }
  });
  it('rejects malformed selector data but accepts any text up to the schema bound so projects still load', () => {
    const base = JSON.parse(JSON.stringify(liveProject()));
    const k = base.page.components.find((c: { type: string }) => c.type === 'liveKpi');
    k.selector = { ...k.selector, matchColumn: 'x' };
    expect(parseProject(base).ok).toBe(false);
    k.selector = { ...defaultLabelAdjacent('x'.repeat(400)) };
    expect(parseProject(base).ok).toBe(true); // validation, not loading, reports label-too-long
    const loaded = parseProject(base);
    if (!loaded.ok) throw new Error('load');
    expect(validateProject(loaded.project, { liveEnabled: true }).map((i) => i.code)).toContain('live-selector-label-too-long');
  });
  it('reports each invalid configuration as an error and the semantic warnings', () => {
    const codes = (s: LabelAdjacentSelector, fallback = true) =>
      validateProject(liveProject({ kpis: [fixtureLiveKpi({ selector: s, fallback: fallback ? { value: '1' } : undefined })] }), { liveEnabled: true }).map((i) => `${i.severity}:${i.code}`);
    expect(codes(sel(''))).toContain('error:live-selector-label-empty');
    expect(codes(sel('a', { matchColumn: -1 }))).toContain('error:live-selector-match-column-invalid');
    expect(codes(sel('a', { valueOffset: 0 }))).toContain('error:live-selector-value-offset-invalid');
    const ok = codes(sel('Open issues', { caseSensitive: true }));
    expect(ok.filter((c) => c.startsWith('error:'))).toEqual([]);
    expect(ok).toContain('warning:live-selector-semantics');
    expect(ok).not.toContain('warning:live-case-insensitive');
    expect(ok).not.toContain('warning:live-no-fallback');
    expect(codes(sel('Open issues'))).toContain('warning:live-case-insensitive');
    expect(codes(sel('Open issues'), false)).toContain('warning:live-no-fallback');
  });
  it('the export is available for a valid selector and the exported page carries only the selector attributes', () => {
    const p = liveProject({ kpis: [fixtureLiveKpi({ selector: sel('Open issues', { matchColumn: 1, valueOffset: -1, caseSensitive: true, trim: false }) })] });
    expect(validateProject(p, { liveEnabled: true }).filter((i) => i.severity === 'error')).toEqual([]);
    const out = renderPage(p, CTX);
    expect(out).toContain('data-sphs-selector="label-adjacent" data-sphs-label="Open issues" data-sphs-match-col="1" data-sphs-value-offset="-1" data-sphs-case="1" data-sphs-trim="0" data-sphs-allow-empty="0"');
    expect(out).not.toContain('data-sphs-cell');
    expect(validateHtml(out, { profile: 'interactive-safe' }).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('validation report states selector facts without the label text', () => {
  it('records type, worksheet, label length, columns, fallback, revision, capability and the outstanding permission test', async () => {
    const secret = 'Confidential programme codename';
    const p = liveProject({ sources: [fixtureSource()], kpis: [fixtureLiveKpi({ selector: sel(secret, { matchColumn: 2, valueOffset: -2 }), fallback: { value: '5' } })] });
    const t = await createTenantTestExport(p, CTX, { liveEnabled: true });
    expect(t.reportJson).not.toContain(secret);
    expect(t.reportJson).not.toMatch(/Confidential|codename/);
    expect(t.report.liveData.selectors).toEqual([{ selectorType: 'label-adjacent', worksheet: 'Summary', labelLength: secret.length, matchColumn: 2, valueOffset: -2, caseSensitive: false, trim: true, snapshotFallbackPresent: true }]);
    expect(t.report.liveData).toMatchObject({ contractRevision: 'observed-2026-11-r1', capability: 'experimental', permissionTestOutstanding: true });
    expect(t.report.liveData.selectorEvidence).toContain('TENANT_OBSERVED_ONCE');
    expect(t.report.validation.errorCount).toBe(0);
  });
  it('a static export reports no selectors', async () => {
    const t = await createTenantTestExport(emptyProject(), CTX);
    expect(t.report.liveData).toMatchObject({ selectors: [], capability: null, permissionTestOutstanding: false, selectorEvidence: null });
  });
});
