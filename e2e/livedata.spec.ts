import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Synthetic values only: reserved .example host and fake identifiers.
const ITEM_URL = 'https://tenant-a.example/_api/v2.0/drives/b!FIXTUREDRIVE0001/items/01FIXTUREITEM0001';
const FLAGGED = 'http://localhost:4174';
const DEFAULT = 'http://localhost:4173';

const SUMMARY_CSV = ',\n,\n,\n,\n,\n,\nOpen issues,17\nDoubled,34\n';
const okResults = (csv = SUMMARY_CSV) => ({ [ITEM_URL]: { content: `<sheet name="Summary">\n${csv}</sheet>`, format: 'xlsx-sheets', metadata: null, error: null, errorCode: null } });

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

/** Export through the real UI and return the saved file path and text. */
async function exportHtml(page: Page): Promise<{ path: string; html: string }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export HTML' }).click()]);
  const path = join(mkdtempSync(join(tmpdir(), 'sphs-')), 'live.html');
  await download.saveAs(path);
  return { path, html: readFileSync(path, 'utf8') };
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

test('Mock LiveData preview: labelled, shows the value, covers each state, makes no external request', async ({ page }) => {
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
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('17');
  await expect(frame.locator('.sphs-live__meta')).toContainText('Loaded from SharePoint at');

  const scenario = page.getByLabel('Mock LiveData preview scenario');
  await scenario.selectOption('missing');
  await expect(frame.locator('.sphs-live__message')).toContainText('Live data is unavailable in the SharePoint editor. Publish or preview the page to load current data.');
  await scenario.selectOption('missing-worksheet');
  await expect(frame.locator('.sphs-live__message')).toHaveText('Worksheet not found.');
  await scenario.selectOption('missing-cell');
  await expect(frame.locator('.sphs-live__message')).toHaveText('Cell not found.');
  await scenario.selectOption('malformed');
  await expect(frame.locator('.sphs-live__message')).toHaveText('The workbook data could not be read.');
  await scenario.selectOption('host-error');
  await expect(frame.locator('.sphs-live__message')).toHaveText('Workbook data could not be loaded from SharePoint.');
  await expect(frame.locator('.sphs-live__diag')).toContainText('host-error (mock-error); source 1 ref-');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('—'); // no fake value

  // snapshot fallback: only when live data is unavailable, always labelled
  await page.getByLabel('Fallback value').fill('12');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('12');
  await expect(frame.locator('.sphs-live__badge')).toHaveText('Snapshot fallback');
  await expect(frame.locator('.sphs-live__meta')).toContainText('Snapshot taken');
  await expect(frame.locator('.sphs-live__meta')).not.toContainText('Loaded from SharePoint');
  await scenario.selectOption('ok');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('17');
  await expect(frame.locator('.sphs-live__badge')).toBeHidden();
  expect(external).toEqual([]);
});

test('an imported local workbook can populate the mock preview, separately from SharePoint', async ({ page }) => {
  await enableLiveAndAddSource(page);
  await addLiveKpi(page);
  await page.getByTestId('import-workbook').setInputFiles('fixtures/project-status.xlsx');
  await expect(page.getByText('project-status.xlsx', { exact: false }).first()).toBeVisible();
  const frame = page.frameLocator('iframe[title="Exported page preview"]');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('17');
  await expect(page.getByTestId('mock-banner')).toBeVisible();
});

test('exported Interactive Safe page: values, freshness wording, refresh message, accessibility, no requests or storage', async ({ page, context }) => {
  await enableLiveAndAddSource(page);
  await addLiveKpi(page);
  await page.getByLabel('Fallback value').fill('12');
  const { path, html } = await exportHtml(page);

  expect(html).toContain('script-src \'unsafe-inline\'');
  expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|eval\(|sendBeacon/);
  expect(html).not.toContain('ms-sp-authoring-source');

  const host = await context.newPage();
  const requests: string[] = [];
  host.on('request', (r) => requests.push(r.url()));
  const errors: string[] = [];
  host.on('pageerror', (e) => errors.push(e.message));
  host.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openAsHost(host, path, okResults());

  const kpi = host.locator('[data-sphs-live="kpi"]');
  await expect(kpi.locator('.sphs-kpi__value')).toHaveText('17');
  await expect(kpi.locator('.sphs-live__meta')).toContainText('Loaded from SharePoint at');
  await expect(kpi.locator('.sphs-live__meta')).not.toContainText(/last updated|real-time/i);
  await expect(kpi.locator('.sphs-live__hint')).toHaveText('Recent workbook changes may take time to appear.');
  await expect(kpi.locator('.sphs-live__badge')).toBeHidden();
  await expect(kpi).toHaveAttribute('data-sphs-state', 'live');

  // accessibility: named region, named button, polite status, visible focus
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

test('exported page: updated host data, missing data, errors and fallback are shown honestly', async ({ page, context }) => {
  await enableLiveAndAddSource(page);
  await addLiveKpi(page);
  await page.getByLabel('Fallback value').fill('12');
  const { path } = await exportHtml(page);

  const open = async (results: unknown | undefined) => {
    const p = await context.newPage();
    await openAsHost(p, path, results);
    return p;
  };

  const updated = await open(okResults(SUMMARY_CSV.replace('17', '23')));
  await expect(updated.locator('.sphs-kpi__value')).toHaveText('23');
  await updated.close();

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

test('exported page: hostile workbook values stay inert text and one broken cell does not break another KPI', async ({ page, context }) => {
  await enableLiveAndAddSource(page);
  await addLiveKpi(page);
  await page.getByRole('button', { name: 'Add Live KPI (experimental)' }).click();
  await page.getByRole('button', { name: /^Live KPI: Live metric/ }).click();
  await page.getByLabel('Label', { exact: true }).fill('Second');
  await page.getByLabel('Source', { exact: true }).selectOption({ label: 'Synthetic status' });
  await page.getByLabel('Cell (single cell, e.g. B7)').fill('A1');
  const { path } = await exportHtml(page);

  // A1 (row 1) and B7 (row 7) both hold hostile text; formula-looking and markup-looking values must stay inert.
  const hostile = '"<img src=x onerror=window.__pwned=1>",=HYPERLINK("javascript:alert(1)")\n';
  const rows = SUMMARY_CSV.split('\n');
  rows[6] = 'Open issues,"<img src=x onerror=window.__pwned=1><script>window.__pwned=1</script>"';
  const p = await context.newPage();
  await openAsHost(p, path, okResults(`${hostile}${rows.slice(1).join('\n')}`));
  const values = p.locator('.sphs-kpi__value');
  await expect(values.nth(0)).toHaveText('<img src=x onerror=window.__pwned=1><script>window.__pwned=1</script>');
  await expect(values.nth(1)).toHaveText('<img src=x onerror=window.__pwned=1>');
  expect(await p.locator('img').count()).toBe(0);
  expect(await p.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await p.close();

  // One KPI points at a cell beyond the data; the other (A1, empty) still renders its own state.
  const p2 = await context.newPage();
  await openAsHost(p2, path, okResults(',\n,\n,\n'));
  await expect(p2.locator('.sphs-live__message').nth(0)).toHaveText('Cell not found.');
  await expect(p2.locator('.sphs-kpi__value').nth(1)).toHaveText('No value');
  await expect(p2.locator('[data-sphs-live="kpi"]').nth(0)).toHaveAttribute('data-sphs-state', 'error');
  await expect(p2.locator('[data-sphs-live="kpi"]').nth(1)).toHaveAttribute('data-sphs-state', 'live');
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
