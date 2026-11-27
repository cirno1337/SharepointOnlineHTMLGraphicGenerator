import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderPage } from '../src/core/export/render';
import { defaultLabelAdjacent } from '../src/core/livedata/selector';
import { fixtureLiveKpi, fixtureSource, liveProject, OBSERVED_LD09_RESULT } from '../tests/livedataFixtures';

// Synthetic values only: reserved .example host and fake identifiers.
const ITEM_URL = 'https://tenant-a.example/_api/v2.0/drives/b!FIXTUREDRIVE0001/items/01FIXTUREITEM0001';
const FLAGGED = 'http://localhost:4174';
const DEFAULT = 'http://localhost:4173';

/**
 * LD-09 (2026-11-27) showed the host CSV is a trimmed grid, so Live Excel selects by visible row content
 * (label-adjacent), never by Excel address. The editor flow runs through the real UI; hostile and edge payloads use
 * pages rendered directly from the core and opened as the SharePoint host would.
 */
const observed = () => ({ [ITEM_URL]: OBSERVED_LD09_RESULT });
const withContent = (content: string) => ({ [ITEM_URL]: { format: 'xlsx-sheets', content, metadata: null } });

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

async function addLiveKpi(page: Page, rowLabel = 'Open issues') {
  await page.getByRole('button', { name: 'Add Live KPI (experimental)' }).click();
  await page.getByRole('button', { name: /^Live KPI: Live metric/ }).click();
  await page.getByLabel('Label', { exact: true }).fill('Open issues');
  await page.getByLabel('Source', { exact: true }).selectOption({ label: 'Synthetic status' });
  await page.getByLabel('Worksheet', { exact: true }).fill('Summary');
  await page.getByLabel('Row label', { exact: true }).fill(rowLabel);
}

/** Export through the real UI and return the saved file path and text. */
async function exportHtml(page: Page): Promise<{ path: string; html: string }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export HTML' }).click()]);
  const path = join(mkdtempSync(join(tmpdir(), 'sphs-')), 'live.html');
  await download.saveAs(path);
  return { path, html: readFileSync(path, 'utf8') };
}

/** Writes an Interactive Safe page rendered from the core (not through the UI) to a temp file. */
function renderLivePage(kpis = [fixtureLiveKpi({ fallback: { value: '12', importedAt: '2026-11-01' } })]): string {
  const html = renderPage(liveProject({ sources: [fixtureSource()], kpis }), { exportedAt: '2026-01-02T03:04:05.000Z', studioBuild: 'e2e' });
  const path = join(mkdtempSync(join(tmpdir(), 'sphs-')), 'live.html');
  writeFileSync(path, html, 'utf8');
  return path;
}

/** Simulates the SharePoint host: results injected before the page runs; traps storage and records messages. */
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

test('configure a Live KPI through the UI: row label, adjacent value, mock preview 17, export enabled, exported page shows 23 from the observed payload', async ({ page, context }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(FLAGGED) && !u.startsWith('about:') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  await enableLiveAndAddSource(page);
  await addLiveKpi(page);

  // the editor explains the selection method and does not offer a cell address
  await expect(page.getByLabel('Selection method')).toHaveValue('label-adjacent');
  await expect(page.getByText('LiveData may omit leading blank worksheet rows. Selection therefore uses visible row content instead of Excel cell coordinates.').first()).toBeVisible();
  await expect(page.getByText('Open issues | 23')).toBeVisible();
  await expect(page.getByLabel('Label column')).toHaveValue('1');
  await expect(page.getByLabel('Value offset')).toHaveValue('1');
  await expect(page.getByLabel(/Cell \(single cell/)).toHaveCount(0);

  // mock preview, labelled as based on an observed payload
  await expect(page.getByTestId('mock-banner')).toContainText('Mock LiveData preview based on an observed SharePoint payload.');
  await expect(page.getByTestId('mock-banner')).toContainText('Not connected to SharePoint');
  const frame = page.frameLocator('iframe[title="Exported page preview"]');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('17');
  await expect(frame.locator('.sphs-live__meta')).toContainText('Loaded from SharePoint at');

  // valid export is available
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeEnabled();
  const { path, html } = await exportHtml(page);
  expect(html).toContain("script-src 'unsafe-inline'");
  expect(html).toContain('data-sphs-selector="label-adjacent"');
  expect(html).not.toContain('data-sphs-cell');
  expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|eval\(|sendBeacon/);

  // run the exported file as the host would, with the exact payload observed in LD-09
  const host = await context.newPage();
  const requests: string[] = [];
  host.on('request', (r) => requests.push(r.url()));
  const errors: string[] = [];
  host.on('pageerror', (e) => errors.push(e.message));
  host.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openAsHost(host, path, observed());
  const kpi = host.locator('[data-sphs-live="kpi"]');
  await expect(kpi.locator('.sphs-kpi__value')).toHaveText('23');
  await expect(kpi).toHaveAttribute('data-sphs-state', 'live');
  await expect(kpi.locator('.sphs-live__meta')).toContainText('Loaded from SharePoint at');
  await expect(kpi.locator('.sphs-live__hint')).toHaveText('Recent workbook changes may take time to appear.');
  await expect(kpi.locator('.sphs-live__badge')).toBeHidden();

  // refresh: keyboard operable, posts only the fixed message
  await kpi.getByRole('button', { name: 'Refresh data' }).focus();
  await host.keyboard.press('Enter');
  await expect(kpi.getByRole('button', { name: 'Refresh data' })).toBeDisabled();
  await expect(kpi.locator('.sphs-live__refresh-status')).toHaveText('Refresh requested. Recent workbook changes may take time to appear.');
  expect(await host.evaluate(() => (window as unknown as { __posts: unknown[] }).__posts)).toEqual([{ type: 'ka-html-viewer-refresh' }]);

  expect(requests.filter((u) => !u.startsWith('file:'))).toEqual([]); // zero network requests
  expect(await host.evaluate(() => (window as unknown as { __storageTouched: boolean }).__storageTouched)).toBe(false);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await host.close();
});

test('Mock preview scenarios: duplicate label, missing label, missing value, editor state and a labelled fallback', async ({ page }) => {
  await enableLiveAndAddSource(page);
  await addLiveKpi(page);
  const frame = page.frameLocator('iframe[title="Exported page preview"]');
  const scenario = page.getByLabel('Mock LiveData preview scenario');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('17');

  await scenario.selectOption('duplicate-label');
  await expect(frame.locator('.sphs-live__message')).toHaveText('More than one row matched ‘Open issues’. Use a more specific label.');
  await scenario.selectOption('label-not-found');
  await expect(frame.locator('.sphs-live__message')).toHaveText('No row matched the label ‘Open issues’.');
  await scenario.selectOption('missing-value');
  await expect(frame.locator('.sphs-live__message')).toHaveText('The matching row does not contain a value in the configured adjacent column.');
  await scenario.selectOption('missing');
  await expect(frame.locator('.sphs-live__message')).toContainText('Live data is unavailable in the SharePoint editor. Publish or preview the page to load current data.');
  await scenario.selectOption('host-error');
  await expect(frame.locator('.sphs-live__diag')).toContainText('host-error (mock-error); source 1 ref-');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('—'); // no fake value

  await page.getByLabel('Fallback value').fill('12');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('12');
  await expect(frame.locator('.sphs-live__badge')).toHaveText('Snapshot fallback');
  await expect(frame.locator('.sphs-live__meta')).not.toContainText('Loaded from SharePoint');
  await scenario.selectOption('ok');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('17');
  await expect(frame.locator('.sphs-live__badge')).toBeHidden();

  // changing the label in the editor changes the preview
  await page.getByLabel('Row label', { exact: true }).fill('Doubled');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('34');
  await page.getByLabel('Row label', { exact: true }).fill('No such row');
  await expect(frame.locator('.sphs-live__message')).toHaveText('No row matched the label ‘No such row’.');
});

test('invalid selector settings block the export with a clear message', async ({ page }) => {
  await enableLiveAndAddSource(page);
  await addLiveKpi(page, '');
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeDisabled();
  await expect(page.getByText('Enter the row label to look for.').first()).toBeVisible();
  await page.getByLabel('Row label', { exact: true }).fill('Open issues');
  await page.getByLabel('Value offset').fill('0');
  await expect(page.getByText(/non-zero whole number/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeDisabled();
  await page.getByLabel('Value offset').fill('1');
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeEnabled();

  // negative offsets can be typed character by character; column 1 minus 1 leaves the worksheet, column 2 does not
  await page.getByLabel('Value offset').fill('');
  await page.getByLabel('Value offset').pressSequentially('-1');
  await expect(page.getByLabel('Value offset')).toHaveValue('-1');
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeDisabled();
  await page.getByLabel('Label column').fill('2');
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeEnabled();
});

test('a deprecated A1 selector loads with a warning, stays blocked, is not converted, and can be replaced manually', async ({ page }) => {
  const legacy = JSON.parse(JSON.stringify(liveProject({ kpis: [fixtureLiveKpi({ id: 'old', label: 'Old KPI' })] })));
  const kpi = legacy.page.components.find((c: { id: string }) => c.id === 'old');
  delete kpi.selector;
  kpi.cell = 'B7';
  await page.goto(FLAGGED);
  await page.getByTestId('open-project').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await expect(page.getByText(/used a removed cell-address selection/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeDisabled();
  await page.getByRole('button', { name: /^Live KPI: Old KPI/ }).click();
  await expect(page.getByTestId('legacy-selector')).toContainText('Old address: B7');
  await expect(page.getByTestId('legacy-selector')).toContainText('not converted automatically');
  await expect(page.getByLabel('Row label', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeDisabled(); // still blocked

  await page.getByLabel('Selection method').selectOption('label-adjacent');
  await expect(page.getByLabel('Row label', { exact: true })).toHaveValue(''); // nothing was carried over from B7
  await page.getByLabel('Row label', { exact: true }).fill('Open issues');
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeEnabled();
});

test('exported runtime: duplicate labels, missing data, host errors and fallback are shown honestly', async ({ context }) => {
  const path = renderLivePage();
  const open = async (results: unknown | undefined) => {
    const p = await context.newPage();
    await openAsHost(p, path, results);
    return p;
  };

  const dup = await open(withContent('<sheet name="Summary">\nOpen issues,23\nDoubled,46\nOpen issues,99\n</sheet>'));
  await expect(dup.locator('.sphs-live__message')).toHaveText('More than one row matched ‘Open issues’. Use a more specific label.');
  await expect(dup.locator('[data-sphs-live="kpi"]')).toHaveAttribute('data-sphs-state', 'fallback'); // labelled fallback, never "first match"
  await expect(dup.locator('.sphs-live__badge')).toHaveText('Snapshot fallback');
  expect(await dup.locator('body').innerText()).not.toMatch(/\b(23|99)\b/);
  await dup.close();

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

  const missingValue = await open(withContent('<sheet name="Summary">\nOpen issues\n</sheet>'));
  await expect(missingValue.locator('.sphs-live__message')).toHaveText('The matching row does not contain a value in the configured adjacent column.');
  await missingValue.close();

  const missingKey = await open({});
  await expect(missingKey.locator('.sphs-live__message')).toContainText('SharePoint editor');
  await missingKey.close();
});

test('exported runtime: hostile labels and values stay inert text, and one failing KPI does not affect another', async ({ context }) => {
  const evilLabel = '"><img src=x onerror=window.__pwned=1> </script><script>window.__pwned=1</script>';
  const path = renderLivePage([
    fixtureLiveKpi({ id: 'a', label: 'First' }),
    fixtureLiveKpi({ id: 'b', label: 'Second', selector: defaultLabelAdjacent('Missing row') }),
    fixtureLiveKpi({ id: 'c', label: 'Third', selector: defaultLabelAdjacent(evilLabel) }),
  ]);
  const hostileValue = '<img src=x onerror=window.__pwned=1><script>window.__pwned=1</script> javascript:alert(1) =HYPERLINK("x") $& $\' $`';
  const p = await context.newPage();
  await openAsHost(p, path, withContent(`<sheet name="Summary">\nOpen issues,"${hostileValue.replace(/"/g, '""')}"\n"${evilLabel.replace(/"/g, '""')}",42\n</sheet>`));
  const kpis = p.locator('[data-sphs-live="kpi"]');
  await expect(kpis.nth(0).locator('.sphs-kpi__value')).toHaveText(hostileValue);
  await expect(kpis.nth(0)).toHaveAttribute('data-sphs-state', 'live');
  await expect(kpis.nth(1).locator('.sphs-live__message')).toHaveText('No row matched the label ‘Missing row’.');
  await expect(kpis.nth(1)).toHaveAttribute('data-sphs-state', 'error');
  await expect(kpis.nth(2).locator('.sphs-kpi__value')).toHaveText('42');
  await expect(kpis.nth(2)).toHaveAttribute('data-sphs-state', 'live');
  expect(await p.locator('img').count()).toBe(0);
  expect(await p.locator('a').count()).toBe(0);
  expect(await p.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await p.close();
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
  await page.getByRole('button', { name: 'Copy sanitized diagnostic' }).click();
  const diag = await page.getByTestId('live-diagnostic').innerText();
  expect(diag).not.toMatch(/tenant-a\.example|FIXTURE/);
  expect(diag).toContain('itemUrlRef');
});
