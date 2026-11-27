import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generatedRuntimeModule } from '../scripts/make-runtime';
import { MANIFEST_FIELD_EVIDENCE } from '../src/core/livedata/constants';
import { defaultLabelAdjacent } from '../src/core/livedata/selector';
import { compileManifest, safeJsonForScript } from '../src/core/livedata/manifest';
import { buildMockResults, mockFixtureWorkbook, sheetToCsv, workbookToEnvelope } from '../src/core/livedata/mock';
import { RUNTIME_SOURCE } from '../src/core/livedata/runtime';
import { maskIdentifier, parseSpItemUrl, sanitizedDiagnostic, validateLiveSourceShape } from '../src/core/livedata/source';
import { FIXTURE_ITEM_URL, FIXTURE_ITEM_URL_2, OBSERVED_LD09_RESULT, SUMMARY_CSV, baseCfg, envelope, fixtureSource, loadRuntimeCore, plain } from './livedataFixtures';

const { core, touched } = loadRuntimeCore();

describe('source configuration validation', () => {
  const errs = (over = {}) => validateLiveSourceShape(fixtureSource(over)).filter((p) => p.severity === 'error').map((p) => p.code);
  it('accepts the observed shape and warns that it is sensitive and unverified', () => {
    const p = validateLiveSourceShape(fixtureSource());
    expect(p.filter((x) => x.severity === 'error')).toEqual([]);
    expect(p.map((x) => x.code)).toContain('item-url-sensitive');
    expect(parseSpItemUrl(FIXTURE_ITEM_URL)).toMatchObject({ host: 'tenant-a.example' });
  });
  it('rejects javascript:, data:, credentials, queries, signatures, tokens and fragments', () => {
    expect(errs({ spItemUrl: 'javascript:alert(1)' })).toContain('item-url-scheme');
    expect(errs({ spItemUrl: 'data:text/html,hi' })).toContain('item-url-scheme');
    expect(errs({ spItemUrl: 'https://user:pw@tenant-a.example/_api/v2.0/drives/b!FIXTUREDRIVE0001/items/01FIXTUREITEM0001' })).toContain('item-url-credentials');
    expect(errs({ spItemUrl: `${FIXTURE_ITEM_URL}?sig=abc` })).toContain('item-url-query');
    expect(errs({ spItemUrl: `${FIXTURE_ITEM_URL}?access_token=abc` })).toContain('item-url-query');
    expect(errs({ spItemUrl: `${FIXTURE_ITEM_URL}#frag` })).toContain('item-url-query');
    expect(errs({ spItemUrl: 'http://tenant-a.example/_api/v2.0/drives/b!FIXTUREDRIVE0001/items/01FIXTUREITEM0001' })).toContain('item-url-shape');
    expect(errs({ spItemUrl: 'https://tenant-a.example/other/path' })).toContain('item-url-shape');
    expect(errs({ spItemUrl: '' })).toContain('item-url-missing');
  });
  it('requires a plausible file name and the experimental acknowledgement', () => {
    expect(errs({ fileName: '' })).toContain('file-name-missing');
    expect(errs({ fileName: '../x.xlsx' })).toContain('file-name-shape');
    expect(errs({ fileName: 'noext' })).toContain('file-name-shape');
    expect(errs({ acknowledgedExperimental: false })).toContain('not-acknowledged');
  });
  it('rejects unsafe sharing links and warns that safe ones are not exported', () => {
    expect(errs({ cslViewLink: 'javascript:alert(1)' })).toContain('csl-link-unsafe');
    expect(errs({ cslViewLink: 'https://h.example/x?sig=1' })).toContain('csl-link-unsafe');
    const ok = validateLiveSourceShape(fixtureSource({ cslViewLink: 'https://h.example/:x:/s/path' }));
    expect(ok.filter((p) => p.severity === 'error')).toEqual([]);
    expect(ok.map((p) => p.code)).toContain('csl-link-not-emitted');
  });
  it('masks identifiers and the sanitized diagnostic contains no host or identifier', () => {
    const ref = maskIdentifier(FIXTURE_ITEM_URL);
    expect(ref).toMatch(/^ref-[0-9a-f]{8}$/);
    expect(ref).toBe(maskIdentifier(FIXTURE_ITEM_URL));
    expect(ref).not.toBe(maskIdentifier(FIXTURE_ITEM_URL_2));
    const diag = JSON.stringify(sanitizedDiagnostic(fixtureSource({ cslViewLink: 'https://h.example/:x:/s/path', filePath: '/sites/x/y.xlsx' })));
    for (const secret of ['tenant-a.example', 'FIXTUREDRIVE', 'FIXTUREITEM', 'h.example', '/sites/x']) expect(diag).not.toContain(secret);
    expect(JSON.parse(diag)).toMatchObject({ itemUrlShapeValid: true, hasSharingLink: true });
  });
});

describe('manifest compiler', () => {
  it('emits only fields with tenant evidence and never the authoring marker', () => {
    const m = compileManifest([fixtureSource({ filePath: '/sites/s/x.xlsx', label: 'L', cslViewLink: 'https://h.example/:x:/s/p' })]);
    expect(m.entries).toEqual([{ spItemUrl: FIXTURE_ITEM_URL, fileName: 'status.xlsx' }]);
    expect(m.scriptTag).toBe(`<script type="application/json" class="ka-livedata-manifest">[{"spItemUrl":"${FIXTURE_ITEM_URL}","fileName":"status.xlsx"}]</script>`);
    for (const forbidden of ['filePath', 'label', 'cslViewLink', 'h.example', 'ms-sp-authoring-source', '/sites/s/x.xlsx']) expect(m.scriptTag).not.toContain(forbidden);
    expect(Object.entries(MANIFEST_FIELD_EVIDENCE).filter(([, v]) => v.emitted).map(([k]) => k)).toEqual(['spItemUrl', 'fileName']);
  });
  it('is deterministic with a stable key order', () => {
    const a = compileManifest([fixtureSource()]);
    const b = compileManifest([fixtureSource()]);
    expect(a.json).toBe(b.json);
    expect(Object.keys(JSON.parse(a.json)[0])).toEqual(['spItemUrl', 'fileName']);
  });
  it('deduplicates identical sources and preserves distinct ones', () => {
    const m = compileManifest([fixtureSource({ id: 'a' }), fixtureSource({ id: 'b', displayName: 'same target' }), fixtureSource({ id: 'c', spItemUrl: FIXTURE_ITEM_URL_2 }), fixtureSource({ id: 'd', fileName: 'other.xlsx' })]);
    expect(m.entries).toHaveLength(3);
    expect(m.indexBySourceId.get('a')).toBe(m.indexBySourceId.get('b'));
    expect(new Set([m.indexBySourceId.get('a'), m.indexBySourceId.get('c'), m.indexBySourceId.get('d')]).size).toBe(3);
  });
  it('skips invalid sources instead of emitting them', () => {
    const m = compileManifest([fixtureSource({ id: 'bad1', spItemUrl: '' }), fixtureSource({ id: 'bad2', spItemUrl: 'javascript:alert(1)' }), fixtureSource({ id: 'bad3', fileName: '' }), fixtureSource({ id: 'bad4', spItemUrl: `${FIXTURE_ITEM_URL}?sig=x` }), fixtureSource({ id: 'ok' })]);
    expect(m.skipped).toEqual(['bad1', 'bad2', 'bad3', 'bad4']);
    expect(m.entries).toHaveLength(1);
  });
  it('emits nothing for no sources and only the sources in use', () => {
    expect(compileManifest([]).scriptTag).toBe('');
    const m = compileManifest([fixtureSource({ id: 'a' }), fixtureSource({ id: 'b', spItemUrl: FIXTURE_ITEM_URL_2 })], new Set(['b']));
    expect(m.entries).toEqual([{ spItemUrl: FIXTURE_ITEM_URL_2, fileName: 'status.xlsx' }]);
  });
  it('embeds JSON safely: no raw <, >, & or line separators, so </script> cannot break out', () => {
    const evil = { a: '</script><script>alert(1)</script>', b: '<!-- & -->', c: '\u2028\u2029', d: 'Unicode \u00e9\u4e2d\ud83d\ude00' };
    const out = safeJsonForScript(evil);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(evil);
  });
  it('handles Unicode file names', () => {
    const m = compileManifest([fixtureSource({ fileName: 'Statut \u2014 \u00e9t\u00e9 \u4e2d\u6587.xlsx' })]);
    expect(JSON.parse(m.json)[0].fileName).toBe('Statut \u2014 \u00e9t\u00e9 \u4e2d\u6587.xlsx');
  });
});

describe('xlsx-sheets envelope parser', () => {
  it('parses multiple sheets in order, including Unicode names', () => {
    const r = plain(core.parseEnvelope(envelope({ Summary: 'a,b\n', Zażółć: 'x\n', '\u4e2d\u6587': 'y\n' })));
    expect(r.ok).toBe(true);
    expect(r.sheets?.map((s) => s.name)).toEqual(['Summary', 'Zażółć', '\u4e2d\u6587']);
  });
  it('accepts single-quoted attributes and decodes entities in names only', () => {
    const r = plain(core.parseEnvelope(`<sheet name='A &amp; B &quot;q&quot;'>\nx,&amp;\n</sheet>`));
    expect(r.sheets?.[0]?.name).toBe('A & B "q"');
    expect(r.sheets?.[0]?.csv).toBe('x,&amp;\n');
  });
  it('treats one line break after the opening tag as formatting, not a blank row', () => {
    expect(plain(core.parseEnvelope('<sheet name="S">\nA\n</sheet>')).sheets?.[0]?.csv).toBe('A\n');
    expect(plain(core.parseEnvelope('<sheet name="S">\r\nA\r\n</sheet>')).sheets?.[0]?.csv).toBe('A\r\n');
    expect(plain(core.parseEnvelope('<sheet name="S">\n\nA\n</sheet>')).sheets?.[0]?.csv).toBe('\nA\n');
  });
  it('rejects malformed envelopes', () => {
    for (const bad of ['', 'no sheets here', '<sheet name="S">unterminated', '<sheet name=S>x</sheet>', '<sheet>x</sheet>', '<sheet name="S"><sheet name="T">x</sheet></sheet>']) {
      const r = plain(core.parseEnvelope(bad));
      expect(r.ok, bad).toBe(false);
      expect(r.code).toBe('malformed');
    }
    expect(plain(core.parseEnvelope(42)).code).toBe('format');
    expect(plain(core.parseEnvelope(null)).code).toBe('format');
  });
  it('ignores text outside sheet elements', () => {
    expect(plain(core.parseEnvelope('junk <sheet name="S">\nA\n</sheet> trailing')).sheets).toHaveLength(1);
  });
  it('enforces size and sheet-count limits', () => {
    const many = Array.from({ length: 51 }, (_, i) => `<sheet name="s${i}">\nx\n</sheet>`).join('');
    expect(plain(core.parseEnvelope(many)).code).toBe('too-many-sheets');
    const ok = Array.from({ length: 50 }, (_, i) => `<sheet name="s${i}">\nx\n</sheet>`).join('');
    expect(plain(core.parseEnvelope(ok)).ok).toBe(true);
    expect(plain(core.parseEnvelope('x'.repeat(2_000_001))).code).toBe('too-large');
    expect(plain(core.parseEnvelope(`<sheet name="${'n'.repeat(256)}">\nx\n</sheet>`)).code).toBe('malformed');
  });
});

describe('RFC 4180 CSV parser', () => {
  const rows = (t: string) => plain(core.parseCsv(t)).rows;
  it('handles quoted commas, doubled quotes, multiline fields, CRLF, LF and CR', () => {
    expect(rows('a,"b,c","say ""hi"""\n')).toEqual([['a', 'b,c', 'say "hi"']]);
    expect(rows('a,"line1\nline2"\r\nz,y\r\n')).toEqual([['a', 'line1\nline2'], ['z', 'y']]);
    expect(rows('a\rb\nc\r\nd')).toEqual([['a'], ['b'], ['c'], ['d']]);
  });
  it('strips a BOM, keeps blank cells and blank interior rows, drops only the blank final row', () => {
    expect(rows('\ufeffa,b\n')).toEqual([['a', 'b']]);
    expect(rows(',,\n,x\n')).toEqual([['', '', ''], ['', 'x']]);
    expect(rows('a\n\nb\n')).toEqual([['a'], [''], ['b']]);
    expect(rows('a\n\n')).toEqual([['a'], ['']]);
    expect(rows('')).toEqual([]);
  });
  it('keeps Unicode, formula-looking and markup-looking values as plain text', () => {
    expect(rows('=HYPERLINK("x"),+1,-2,@SUM(1),<b>x</b>,\u00e9\u4e2d\ud83d\ude00\n')).toEqual([['=HYPERLINK("x")', '+1', '-2', '@SUM(1)', '<b>x</b>', '\u00e9\u4e2d\ud83d\ude00']].map((r) => r));
    expect(rows('"=HYPERLINK(""x"")",ok\n')).toEqual([['=HYPERLINK("x")', 'ok']]);
  });
  it('treats a quote in the middle of an unquoted field literally', () => {
    expect(rows('ab"c,d\n')).toEqual([['ab"c', 'd']]);
  });
  it('rejects unterminated quotes and non-strings', () => {
    expect(plain(core.parseCsv('a,"b\n')).code).toBe('malformed');
    expect(plain(core.parseCsv(undefined)).code).toBe('format');
  });
  it('enforces row, column and cell limits', () => {
    expect(plain(core.parseCsv('a\n'.repeat(10_001))).code).toBe('too-many-rows');
    expect(plain(core.parseCsv('a\n'.repeat(10_000))).ok).toBe(true);
    expect(plain(core.parseCsv(','.repeat(500))).code).toBe('too-many-columns');
    expect(plain(core.parseCsv('x'.repeat(5001))).code).toBe('cell-too-long');
    expect(plain(core.parseCsv(`"${'x'.repeat(5001)}"`)).code).toBe('cell-too-long');
    expect(plain(core.parseCsv('x'.repeat(5000))).ok).toBe(true);
  });
  it('never uses naive splitting: a quoted comma stays one cell', () => {
    expect(rows('"1,234",5\n')).toEqual([['1,234', '5']]);
  });
});

describe('KPI resolution and presentation states', () => {
  const manifest = [{ spItemUrl: FIXTURE_ITEM_URL, fileName: 'status.xlsx' }];
  const okResults = { [FIXTURE_ITEM_URL]: { content: envelope({ Summary: SUMMARY_CSV }), format: 'xlsx-sheets', metadata: null, error: null, errorCode: null } };
  // Pass results explicitly (even undefined); only a call with no second argument uses the OK data.
  const run = (cfg = baseCfg, ...rest: [unknown?]) => plain(core.present(cfg, core.resolveKpi(cfg, manifest, rest.length === 0 ? okResults : rest[0]), '10:00:00'));
  const live = (cfg = baseCfg, value = '17', empty = false) => plain(core.present(cfg, { ok: true, value, empty, ref: 'ref-00000000' }, '10:00:00'));
  const withLabel = (label: string, extra: Record<string, unknown> = {}) => ({ ...baseCfg, selector: { ...defaultLabelAdjacent(label), ...extra } as typeof baseCfg.selector });

  it('LIVE: the observed payload resolves Open issues to 23 and Doubled to 46, with a "Loaded from SharePoint at" time', () => {
    const observed = { [FIXTURE_ITEM_URL]: OBSERVED_LD09_RESULT };
    expect(run(baseCfg, observed)).toMatchObject({ mode: 'live', value: '23', meta: 'Loaded from SharePoint at 10:00:00', badge: '' });
    expect(run(withLabel('Doubled'), observed)).toMatchObject({ mode: 'live', value: '46' });
    expect(run({ ...baseCfg, fallbackValue: '99', fallbackAt: '2026-01-01' }, observed)).toMatchObject({ mode: 'live', value: '23', badge: '' });
    expect(run().value).toBe('17'); // the synthetic fixture
  });
  it('LIVE presentation: never a fallback, never "real-time"', () => {
    const vm = live({ ...baseCfg, fallbackValue: '99', fallbackAt: '2026-01-01' });
    expect(vm).toMatchObject({ mode: 'live', value: '17', meta: 'Loaded from SharePoint at 10:00:00', badge: '' });
    expect(vm.meta).not.toMatch(/last updated|real-time/i);
  });
  it('applies prefix, suffix, number formats and the empty-state text only after selection', () => {
    expect(live({ ...baseCfg, prefix: '€', suffix: ' items' }).value).toBe('€17 items');
    expect(live({ ...baseCfg, format: 'decimal2' }).value).toBe('17.00');
    expect(core.formatValue('17.5', 'integer')).toBe('18');
    expect(core.formatValue('text', 'integer')).toBe('text');
    expect(live({ ...baseCfg, emptyText: 'Nothing' }, '', true).value).toBe('Nothing');
    expect(live({ ...baseCfg, showLoadedAt: false }).meta).toBe('');
    // end to end: selection first, then formatting
    const observed = { [FIXTURE_ITEM_URL]: OBSERVED_LD09_RESULT };
    expect(run({ ...baseCfg, prefix: '#', format: 'decimal1' }, observed).value).toBe('#23.0');
  });
  it('flags thresholds with text, not only colour', () => {
    expect(live({ ...baseCfg, warnAt: 10 }).status).toBe('warning');
    expect(live({ ...baseCfg, warnAt: 10, criticalAt: 15 }).status).toBe('critical');
    expect(live({ ...baseCfg, warnAt: 20 }).status).toBe('');
  });
  it('EDITOR / NO PREFETCH: the editor message, with an explicitly labelled fallback if one exists', () => {
    const editor = 'Live data is unavailable in the SharePoint editor. Publish or preview the page to load current data.';
    for (const results of [undefined, null, {}, 'x', 42]) {
      const vm = run(baseCfg, results);
      expect(vm).toMatchObject({ mode: 'error', code: 'no-prefetch', message: editor, value: '' });
    }
    const fb = run({ ...baseCfg, fallbackValue: '12', fallbackAt: '2026-11-01' }, undefined);
    expect(fb).toMatchObject({ mode: 'fallback', value: '12', badge: 'Snapshot fallback', message: editor, meta: 'Snapshot taken 2026-11-01' });
    expect(fb.meta).not.toContain('Loaded from SharePoint');
    expect(run({ ...baseCfg, fallbackValue: '12' }, undefined).meta).toBe('Snapshot time unknown');
  });
  it('ERROR WITHOUT FALLBACK: no fake value, a friendly message and masked diagnostics', () => {
    const results = { [FIXTURE_ITEM_URL]: { content: null, format: null, metadata: null, error: 'Secret tenant text https://tenant-a.example/x', errorCode: 'access_denied!<b>' } };
    const vm = run(baseCfg, results);
    expect(vm).toMatchObject({ mode: 'error', code: 'host-error', value: '', badge: '', message: 'Workbook data could not be loaded from SharePoint.' });
    expect(vm.diag).toContain('access_denied');
    for (const leak of ['Secret tenant', 'tenant-a.example', 'FIXTURE', '<b>', '!']) expect(vm.diag + vm.message).not.toContain(leak);
    expect(vm.diag).toMatch(/source 1 ref-[0-9a-f]{8}/);
  });
  it('shows a labelled snapshot fallback for host errors, bad data and selection failures', () => {
    const cfg = { ...baseCfg, fallbackValue: '12', fallbackAt: 'T' };
    const err = { [FIXTURE_ITEM_URL]: { content: null, format: null, error: 'x', errorCode: 'e' } };
    expect(run(cfg, err)).toMatchObject({ mode: 'fallback', badge: 'Snapshot fallback' });
    expect(run({ ...cfg, selector: defaultLabelAdjacent('Nope') })).toMatchObject({ mode: 'fallback', code: 'label-not-found', badge: 'Snapshot fallback' });
    expect(run({ ...cfg, sheet: 'Nope' })).toMatchObject({ mode: 'fallback', code: 'worksheet-not-found' });
  });
  it('maps every failure to a distinct, friendly state', () => {
    const r = (result: unknown) => run(baseCfg, { [FIXTURE_ITEM_URL]: result });
    expect(r({ content: '', format: 'xlsx-sheets' }).code).toBe('empty-result');
    expect(r({ content: null, format: 'xlsx-sheets' }).code).toBe('empty-result');
    expect(r(null).code).toBe('empty-result');
    expect(r({ content: '<sheet name="S">x', format: 'xlsx-sheets' }).code).toBe('malformed');
    expect(r({ content: envelope({ Summary: SUMMARY_CSV }), format: 'rows' })).toMatchObject({ code: 'unsupported-format', diag: expect.stringContaining('format rows') });
    expect(r({ content: envelope({ Summary: SUMMARY_CSV }), format: undefined }).code).toBe('unsupported-format');
    expect(run({ ...baseCfg, source: 5 }).code).toBe('source-config');
    expect(plain(core.present(baseCfg, core.resolveKpi(baseCfg, null, okResults), 'x')).code).toBe('source-config');
  });
  it('lets a component override the generic error text but never the editor message', () => {
    expect(run({ ...baseCfg, errorText: 'Custom error', selector: defaultLabelAdjacent('Nope') }).message).toBe('Custom error');
    expect(run({ ...baseCfg, errorText: 'Custom error' }, undefined).message).toContain('SharePoint editor');
  });
  it('isolates components: one broken source or selector does not affect another', () => {
    const results = { ...okResults, [FIXTURE_ITEM_URL_2]: { content: '<sheet name="S">x', format: 'xlsx-sheets' } };
    const m2 = [...manifest, { spItemUrl: FIXTURE_ITEM_URL_2, fileName: 'b.xlsx' }];
    const good = plain(core.present(baseCfg, core.resolveKpi(baseCfg, m2, results), 't'));
    const bad = plain(core.present({ ...baseCfg, source: 1 }, core.resolveKpi({ ...baseCfg, source: 1 }, m2, results), 't'));
    const wrongLabel = plain(core.present(withLabel('Nope'), core.resolveKpi(withLabel('Nope'), m2, results), 't'));
    expect(good).toMatchObject({ mode: 'live', value: '17' });
    expect(bad).toMatchObject({ mode: 'error', code: 'malformed' });
    expect(wrongLabel).toMatchObject({ mode: 'error', code: 'label-not-found' });
  });
  it('treats prototype-pollution style keys and inherited properties as absent', () => {
    const cfg = baseCfg;
    expect(plain(core.resolveKpi(cfg, [{ spItemUrl: 'constructor' }], {}))).toMatchObject({ code: 'no-prefetch' });
    expect(plain(core.resolveKpi(cfg, [{ spItemUrl: '__proto__' }], {}))).toMatchObject({ code: 'no-prefetch' });
  });
  it('never touches network or storage APIs while resolving', () => {
    run();
    run(baseCfg, undefined);
    expect(touched).toEqual([]);
  });
  it('masks references deterministically without exposing the input', () => {
    const ref = core.maskRef(FIXTURE_ITEM_URL);
    expect(ref).toBe(maskIdentifier(FIXTURE_ITEM_URL));
    expect(ref).not.toContain('tenant');
  });
});

describe('mock LiveData preview adapter round-trips through the real parser', () => {
  const wb = mockFixtureWorkbook();
  const entries = compileManifest([fixtureSource()]).entries;
  const resolve = (scenario: Parameters<typeof buildMockResults>[2], cfg = baseCfg) => {
    const results = buildMockResults(entries, wb, scenario);
    return plain(core.present(cfg, core.resolveKpi(cfg, entries, results), 't'));
  };
  it('serialises sheets in the observed shape (leading blank rows dropped) with quoting', () => {
    expect(sheetToCsv(wb.sheets[1]!)).toContain('"Example, with comma"');
    expect(sheetToCsv(wb.sheets[0]!)).toBe('Open issues,17\nDoubled,34\n');
    expect(workbookToEnvelope(wb)).toContain('<sheet name="Summary">\nOpen issues,17\nDoubled,34\n</sheet>\n\n<sheet name="Issues">');
    expect(sheetToCsv({ name: 'E', cells: {}, maxRow: 0, maxCol: 0 })).toBe('');
  });
  it('the mock proves the label-adjacent selector: Open issues -> 17, Doubled -> 34', () => {
    expect(resolve('ok')).toMatchObject({ mode: 'live', value: '17' });
    expect(resolve('ok', { ...baseCfg, selector: defaultLabelAdjacent('Doubled') }).value).toBe('34');
    expect(resolve('ok', { ...baseCfg, sheet: 'Issues', selector: defaultLabelAdjacent('Example, with comma') }).value).toBe('Open');
  });
  it('produces each failure scenario with the expected state', () => {
    expect(resolve('missing').code).toBe('no-prefetch');
    expect(resolve('host-error').code).toBe('host-error');
    expect(resolve('missing-worksheet').code).toBe('worksheet-not-found');
    expect(resolve('label-not-found')).toMatchObject({ code: 'label-not-found', message: 'No row matched the label ‘Open issues’.' });
    expect(resolve('duplicate-label')).toMatchObject({ code: 'ambiguous-label', message: 'More than one row matched ‘Open issues’. Use a more specific label.' });
    expect(resolve('missing-value')).toMatchObject({ code: 'adjacent-value-missing', message: 'The matching row does not contain a value in the configured adjacent column.' });
    expect(resolve('malformed').code).toBe('malformed');
    expect(resolve('unsupported-format').code).toBe('unsupported-format');
    expect(resolve('empty').code).toBe('empty-result');
  });
  it('the mock result has the observed shape and is keyed by the item URL', () => {
    const r = buildMockResults(entries, wb, 'ok')[FIXTURE_ITEM_URL]!;
    expect(Object.keys(r).sort()).toEqual(['content', 'error', 'errorCode', 'format', 'metadata']);
    expect(r.format).toBe('xlsx-sheets');
  });
});

describe('exported runtime source', () => {
  it('is generated from runtime.src.js (no drift)', () => {
    const src = readFileSync('src/core/livedata/runtime.src.js', 'utf8').replace(/\r\n/g, '\n');
    const generated = readFileSync('src/core/livedata/runtime.generated.ts', 'utf8').replace(/\r\n/g, '\n');
    expect(generated).toBe(generatedRuntimeModule(src));
    expect(RUNTIME_SOURCE).toBe(src.trim());
  });
  it('cannot terminate its own script element and stays small', () => {
    expect(RUNTIME_SOURCE.toLowerCase()).not.toContain('</script');
    expect(RUNTIME_SOURCE.length).toBeLessThan(30_000);
  });
  it('contains no network, storage, dynamic-code or HTML-injection APIs', () => {
    const banned = [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /\beval\b/, /\bFunction\b/, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /importScripts/, /\bimport\b/, /\bWorker\b/, /_api\//, /graph\.microsoft/i, /https?:\/\//i, /Authorization|Bearer|access_token|refresh_token|client_secret|cookie/i];
    for (const re of banned) expect(RUNTIME_SOURCE, String(re)).not.toMatch(re);
  });
  it('posts only the one fixed refresh message', () => {
    const posts = RUNTIME_SOURCE.match(/postMessage\([^)]*\)/g) ?? [];
    expect(posts).toEqual(["postMessage({ type: REFRESH_TYPE }, '*')"]);
    expect(RUNTIME_SOURCE).toContain("var REFRESH_TYPE = 'ka-html-viewer-refresh';");
  });
  it('does not poll or retry automatically', () => {
    expect(RUNTIME_SOURCE).not.toMatch(/setInterval/);
    expect((RUNTIME_SOURCE.match(/setTimeout\(/g) ?? []).length).toBe(1);
  });
});

describe('audit regression: mock script injection and CSV bounds', () => {
  it('injects the mock script literally even when workbook text contains $-replacement patterns', async () => {
    const { injectMockScript, mockInjectionScript } = await import('../src/core/livedata/mock');
    const wb = mockFixtureWorkbook();
    wb.sheets[0]!.cells.A1 = "$& $' $` $1 $$ </script><script>window.__x=1</script>";
    const entries = compileManifest([fixtureSource()]).entries;
    const script = mockInjectionScript(buildMockResults(entries, wb, 'ok'));
    const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><main>MARKER</main></body></html>';
    const out = injectMockScript(html, script);
    expect(out).toBe(`<!doctype html><html><head>\n${script}<meta charset="utf-8"></head><body><main>MARKER</main></body></html>`);
    expect(out.split('MARKER').length).toBe(2); // "$'" must not have duplicated the rest of the page
    expect([...out.matchAll(/<script\b/g)]).toHaveLength(1);
  });
  it('generates CSV in time proportional to populated cells and within the runtime limits (no editor freeze)', () => {
    const sheet = { name: 'Big', cells: { A1: 'x', AA9000: 'far', C20000: 'beyond-row-limit', 'XFD3': 'beyond-col-limit' }, maxRow: 1_000_000, maxCol: 16_000 };
    const t0 = Date.now();
    const csv = sheetToCsv(sheet);
    expect(Date.now() - t0).toBeLessThan(500);
    const lines = csv.split('\n');
    lines.pop(); // trailing newline
    expect(lines).toHaveLength(9000); // rows beyond maxRows are dropped
    expect(lines[0]).toBe('x');
    expect(lines[1]).toBe(''); // blank interior rows are kept so positions hold
    expect(lines[8999]!.split(',')).toHaveLength(27); // AA is column 27
    expect(csv).not.toContain('beyond');
  });
});
