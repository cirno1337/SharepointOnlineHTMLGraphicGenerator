import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderPage } from '../src/core/export/render';
import { fixtureLiveKpi, fixtureSource, liveProject, OBSERVED_LD09_RESULT } from '../tests/livedataFixtures';

// Synthetic values only: reserved .example host and fake identifiers.
const ITEM_URL = 'https://tenant-a.example/_api/v2.0/drives/b!FIXTUREDRIVE0001/items/01FIXTUREITEM0001';
const FLAGGED = 'http://localhost:4174';
const DEFAULT = 'http://localhost:4173';

/**
 * LD-09 (2026-11-27): the host's CSV does not keep leading blank rows, so Studio blocks Live Excel exports that
 * select a cell by its A1 address. These tests cover (a) the editor, which must show the block, and (b) the exported
 * runtime in a real browser, using pages rendered directly from the core (the UI export is correctly disabled).
 */
const okResults = () => ({ [ITEM_URL]: OBSERVED_LD09_RESULT });

async function enableLiveAndAddSource(page: Page) {
  await page.goto(FLAGGED);
  await page.getByRole('radio', { name: /SharePoint Live Excel, experimental/ }).check();
  await page.getByLabel('Display name').fill('Synthetic status');
  await page.getByLabel('Workbook file name (with extension)').fill('status.xlsx');
  await page.getByLabel(/^spItemUrl/).fill(ITEM_URL);
  await page.getByRole('checkbox', { name: /I understand this uses an undocumented/ }).check();
  await page.getByRole('button', { name: 'Add source' }).click();
  await expect(page.getByText('Synthetic status').first()).toBeVisible();
}

async function addLiveKpi(page: Page) {
  await page.getByRole('button', { name: 'Add Live KPI (experimental)' }).click();
  await page.getByRole('button', { name: /^Live KPI: Live metric/ }).click();
  await page.getByLabel('Label', { exact: true }).fill('Open issues');
  await page.getByLabel('Source', { exact: true }).selectOption({ label: 'Synthetic status' });
  await page.getByLabel('Worksheet', { exact: true }).fill('Summary');
  await page.getByLabel('Cell (single cell, e.g. B7)').fill('B7');
}

/** Writes an Interactive Safe page rendered from the core (not through the UI) to a temp file. */
function renderLivePage(kpis = [fixtureLiveKpi({ fallback: { value: '12', importedAt: '2026-11-01' } })]): string {
  const html = renderPage(liveProject({ sources: [fixtureSource()], kpis }), { exportedAt: '2026-01-02T03:04:05.000Z', studioBuild: 'e2e' });
  const path = join(mkdtempSync(join(tmpdir(), 'sphs-')), 'live.html');
  writeFileSync(path, html, 'utf8');
  return path;
}

/** Simulates the SharePoint host: results injected before the page runs; traps network, storage and messages. */
async function openAsHost(page: Page, path: string, results: unknown | undefined) {
  await page.addInitScript(
    ([res]) => {
      const w = window as unknown as Record<string, unknown>;
      if (res !== undefined) w.__LD_RESULTS__ = res;
      w.__posts = [];
      window.addEventListener('message', (e) => (w.__posts as unknown[]).push(e.data));
      w.__storageTouched = false;
      for (const name of ['localStorage', 'sessionStorage']) {
        try {
          Object.defineProperty(window, name, {
            get() {
              w.__storageTouched = true;
              throw new Error('storage blocked');
            },
          });
        } catch {
          /* ignore */
        }
      }
    },
    [results],
  );
  await page.goto(pathToFileURL(path).href);
}

test('the default build has no LiveData UI (feature disabled by default)', async ({ page }) => {
  await page.goto(DEFAULT);
  await expect(page.getByRole('heading', { name: 'SharePoint HTML Studio' })).toBeVisible();
  await expect(page.getByTestId('live-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Live KPI/ })).toHaveCount(0);
  await expect(page.getByText('SharePoint Live Excel')).toHaveCount(0);
});

test('flagged build: experimental panel, warning, Snapshot is the default mode', async ({ page }) => {
  await page.goto(FLAGGED);
  const panel = page.getByTestId('live-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Experimental', { exact: true })).toBeVisible();
  await expect(page.getByTestId('live-warning')).toContainText('undocumented SharePoint HTML Pages behavior observed in a test tenant');
  await expect(page.getByTestId('live-warning')).toContainText('Use Excel Snapshot for predictable production output');
  await expect(panel).toContainText('LD-07');
  await expect(page.getByRole('radio', { name: /Snapshot, recommended/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /SharePoint Live Excel, experimental/ })).not.toBeChecked();
  await expect(page.getByLabel(/^spItemUrl/)).toHaveCount(0); // source form only appears in live mode
});

test('invalid and unsafe sources are rejected, and no source is added', async ({ page }) => {
  await page.goto(FLAGGED);
  await page.getByRole('radio', { name: /SharePoint Live Excel, experimental/ }).check();
  await page.getByLabel('Workbook file name (with extension)').fill('status.xlsx');
  await page.getByRole('checkbox', { name: /I understand this uses an undocumented/ }).check();
  for (const [url, expected] of [
    ['javascript:alert(1)', 'must start with https://'],
    [`${ITEM_URL}?sig=abc`, 'must not contain a query string'],
    ['https://u:p@tenant-a.example/_api/v2.0/drives/b!FIXTUREDRIVE0001/items/01FIXTUREITEM0001', 'must not contain credentials'],
    ['https://tenant-a.example/not-the-observed-shape', 'Unexpected item URL shape'],
  ] as const) {
    await page.getByLabel(/^spItemUrl/).fill(url);
    await page.getByRole('button', { name: 'Add source' }).click();
    await expect(page.getByRole('alert').filter({ hasText: expected })).toBeVisible();
  }
  await expect(page.getByText('No sources yet. Add one below.')).toBeVisible();
});

test('LD-09: the editor blocks export of a Live KPI that selects a cell by A1 address, and says why', async ({ page }) => {
  await enableLiveAndAddSource(page);
  await addLiveKpi(page);
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeDisabled();
  await expect(page.getByText(/does not keep leading blank rows/).first()).toBeVisible();
  await expect(page.getByTestId('validation-summary')).toContainText('error');
  // the panel explains the observed behavior instead of the old "unverified assumption" text
  await expect(page.getByTestId('live-panel')).toContainText('does not keep leading blank rows');
});

test('Mock LiveData preview: labelled, never shows a value for an A1 selection, makes no external request', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(FLAGGED) && !u.startsWith('about:') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  await enableLiveAndAddSource(page);
  await addLiveKpi(page);
  await expect(page.getByTestId('mock-banner')).toContainText('Mock LiveData preview');
  await expect(page.getByTestId('mock-banner')).toContainText('Not connected to SharePoint');

  const frame = page.frameLocator('iframe[title="Exported page preview"]');
  await expect(frame.locator('.sphs-live__message')).toHaveText('Selecting a cell from live data is not supported.');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('—'); // no fake value, ever

  const scenario = page.getByLabel('Mock LiveData preview scenario');
  await scenario.selectOption('missing');
  await expect(frame.locator('.sphs-live__message')).toContainText('Live data is unavailable in the SharePoint editor. Publish or preview the page to load current data.');
  await scenario.selectOption('missing-worksheet');
  await expect(frame.locator('.sphs-live__message')).toHaveText('Worksheet not found.');
  await scenario.selectOption('malformed');
  await expect(frame.locator('.sphs-live__message')).toHaveText('The workbook data could not be read.');
  await scenario.selectOption('host-error');
  await expect(frame.locator('.sphs-live__message')).toHaveText('Workbook data could not be loaded from SharePoint.');
  await expect(frame.locator('.sphs-live__diag')).toContainText('host-error (mock-error); source 1 ref-');

  // snapshot fallback: only when live data is unavailable, always labelled
  await page.getByLabel('Fallback value').fill('12');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('12');
  await expect(frame.locator('.sphs-live__badge')).toHaveText('Snapshot fallback');
  await expect(frame.locator('.sphs-live__meta')).toContainText('Snapshot taken');
  await expect(frame.locator('.sphs-live__meta')).not.toContainText('Loaded from SharePoint');
  expect(external).toEqual([]);
});

test('an imported local workbook can populate the mock preview, separately from SharePoint', async ({ page }) => {
  await enableLiveAndAddSource(page);
  await addLiveKpi(page);
  await page.getByTestId('import-workbook').setInputFiles('fixtures/project-status.xlsx');
  await expect(page.getByText('project-status.xlsx', { exact: false }).first()).toBeVisible();
  const frame = page.frameLocator('iframe[title="Exported page preview"]');
  await expect(frame.locator('.sphs-live__message')).toHaveText('Selecting a cell from live data is not supported.');
  await expect(page.getByTestId('mock-banner')).toBeVisible();
});

test('exported runtime in a real browser: observed host data never produces a value from an A1 address; refresh, fallback and accessibility hold', async ({ context }) => {
  const path = renderLivePage();
  const host = await context.newPage();
  const requests: string[] = [];
  host.on('request', (r) => requests.push(r.url()));
  const errors: string[] = [];
  host.on('pageerror', (e) => errors.push(e.message));
  host.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openAsHost(host, path, okResults());

  const kpi = host.locator('[data-sphs-live="kpi"]');
  await expect(kpi.locator('.sphs-live__message')).toHaveText('Selecting a cell from live data is not supported.');
  await expect(kpi).toHaveAttribute('data-sphs-state', 'fallback');
  // The observed payload contains 23 and 46, but Studio must not pick either by position.
  await expect(kpi.locator('.sphs-kpi__value')).toHaveText('12');
  await expect(kpi.locator('.sphs-live__badge')).toHaveText('Snapshot fallback');
  await expect(kpi.locator('.sphs-live__meta')).not.toContainText('Loaded from SharePoint');
  expect(await host.locator('body').innerText()).not.toMatch(/\b(23|46)\b/);

  // accessibility: named group, named button, polite status
  const label = await kpi.getAttribute('aria-labelledby');
  await expect(host.locator(`#${label}`)).toHaveText('Open issues');
  await expect(kpi.getByRole('button', { name: 'Refresh data' })).toBeVisible();
  await expect(kpi.locator('.sphs-live__refresh-status')).toHaveAttribute('aria-live', 'polite');

  // refresh: keyboard operable, posts only the fixed message, disables, announces, never promises fresh data
  await kpi.getByRole('button', { name: 'Refresh data' }).focus();
  await expect(kpi.getByRole('button', { name: 'Refresh data' })).toBeFocused();
  await host.keyboard.press('Enter');
  await expect(kpi.getByRole('button', { name: 'Refresh data' })).toBeDisabled();
  await expect(kpi.locator('.sphs-live__refresh-status')).toHaveText('Refresh requested. Recent workbook changes may take time to appear.');
  expect(await host.evaluate(() => (window as unknown as { __posts: unknown[] }).__posts)).toEqual([{ type: 'ka-html-viewer-refresh' }]);
  await host.keyboard.press('Enter');
  expect(await host.evaluate(() => (window as unknown as { __posts: unknown[] }).__posts)).toHaveLength(1); // disabled: no repeat

  expect(requests.filter((u) => !u.startsWith('file:'))).toEqual([]);
  expect(await host.evaluate(() => (window as unknown as { __storageTouched: boolean }).__storageTouched)).toBe(false);
  expect(errors).toEqual([]);
  await host.close();
});

test('exported runtime: missing data, host errors and fallback are shown honestly', async ({ context }) => {
  const path = renderLivePage();
  const open = async (results: unknown | undefined) => {
    const p = await context.newPage();
    await openAsHost(p, path, results);
    return p;
  };

  const editor = await open(undefined); // no prefetch (SharePoint editor)
  await expect(editor.locator('.sphs-live__message')).toHaveText('Live data is unavailable in the SharePoint editor. Publish or preview the page to load current data.');
  await expect(editor.locator('.sphs-live__badge')).toHaveText('Snapshot fallback');
  await expect(editor.locator('.sphs-kpi__value')).toHaveText('12');
  await expect(editor.locator('.sphs-live__meta')).not.toContainText('Loaded from SharePoint');
  await expect(editor.locator('.sphs-live__message')).toHaveAttribute('role', 'alert');
  await editor.close();

  const hostError = await open({ [ITEM_URL]: { content: null, format: null, metadata: null, error: 'Leaky tenant text', errorCode: 'access_denied' } });
  await expect(hostError.locator('.sphs-live__diag')).toContainText('access_denied');
  expect(await hostError.locator('body').innerText()).not.toMatch(/Leaky tenant text|tenant-a\.example|FIXTURE/);
  await hostError.close();

  const missingKey = await open({});
  await expect(missingKey.locator('.sphs-live__message')).toContainText('SharePoint editor');
  await missingKey.close();
});

test('exported runtime: hostile workbook values stay inert and one broken source does not break another KPI', async ({ context }) => {
  const path = renderLivePage([fixtureLiveKpi({ id: 'a' }), fixtureLiveKpi({ id: 'b', label: 'Second', cell: 'A1' })]);
  const hostile = '"<img src=x onerror=window.__pwned=1><script>window.__pwned=1</script>",=HYPERLINK("javascript:alert(1)")\n';
  const p = await context.newPage();
  await openAsHost(p, path, { [ITEM_URL]: { format: 'xlsx-sheets', content: `<sheet name="Summary">\n${hostile}</sheet>`, metadata: null } });
  // Values are never selected from the data, so hostile cell text is never displayed or interpreted.
  await expect(p.locator('.sphs-live__message').nth(0)).toHaveText('Selecting a cell from live data is not supported.');
  await expect(p.locator('.sphs-live__message').nth(1)).toHaveText('Selecting a cell from live data is not supported.');
  expect(await p.locator('img').count()).toBe(0);
  expect(await p.locator('body').innerText()).not.toContain('onerror');
  expect(await p.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await p.close();

  // A malformed worksheet fails the KPI with its own state; the page keeps running.
  const p2 = await context.newPage();
  await openAsHost(p2, path, { [ITEM_URL]: { format: 'xlsx-sheets', content: '<sheet name="Summary">unterminated', metadata: null } });
  await expect(p2.locator('.sphs-live__message').nth(0)).toHaveText('The workbook data could not be read.');
  await expect(p2.locator('[data-sphs-live="kpi"]').nth(1)).toHaveAttribute('data-sphs-state', 'error');
  await p2.close();
});

test('validation blocks export when a Live KPI has no valid source; saving a project with sources warns', async ({ page }) => {
  await page.goto(FLAGGED);
  await page.getByRole('radio', { name: /SharePoint Live Excel, experimental/ }).check();
  await page.getByRole('button', { name: 'Add Live KPI (experimental)' }).click();
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeDisabled();
  await expect(page.getByText('Live KPI refers to a source that does not exist.')).toBeVisible();
  await expect(page.getByTestId('validation-summary')).toContainText('error');

  await page.getByLabel('Workbook file name (with extension)').fill('status.xlsx');
  await page.getByLabel(/^spItemUrl/).fill(ITEM_URL);
  await page.getByRole('checkbox', { name: /I understand this uses an undocumented/ }).check();
  await page.getByRole('button', { name: 'Add source' }).click();
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await page.getByRole('button', { name: 'Save project' }).click();
  expect(message).toContain('tenant host and workbook identifiers');
  // the sanitized diagnostic never includes the host or identifiers
  await page.getByRole('button', { name: 'Copy sanitized diagnostic' }).click();
  const diag = await page.getByTestId('live-diagnostic').innerText();
  expect(diag).not.toMatch(/tenant-a\.example|FIXTURE/);
  expect(diag).toContain('itemUrlRef');
});
