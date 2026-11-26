import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURE = 'fixtures/project-status.xlsx';

test('import workbook, bind Summary!B7 to KPI, preview and export', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SharePoint HTML Studio' })).toBeVisible();
  await expect(page.getByText('No workbook loaded.')).toBeVisible();

  await page.getByRole('button', { name: 'Add KPI' }).click();
  await page.getByTestId('import-workbook').setInputFiles(FIXTURE);
  await expect(page.getByText('project-status.xlsx', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: /^KPI: Metric/ }).click();
  await page.getByRole('button', { name: 'B7: 17' }).click();
  await page.getByLabel('Label', { exact: true }).fill('Open issues');
  await page.getByRole('button', { name: 'Bind to cell' }).click();
  await expect(page.getByTestId('binding-info')).toContainText('Summary!B7');

  const frame = page.frameLocator('iframe[title="Exported page preview"]');
  await expect(frame.locator('.sphs-kpi__value')).toHaveText('17');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export HTML' }).click()]);
  const path = await download.path();
  const html = readFileSync(path, 'utf8');
  expect(html).toContain('<strong class="sphs-kpi__value">17</strong>');
  expect(html).not.toMatch(/<script|fetch\(|localStorage|grapes|vite/i);
});

test('refresh preview shows before/after and can be cancelled', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add KPI' }).click();
  await page.getByTestId('import-workbook').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /^KPI: Metric/ }).click();
  await page.getByRole('button', { name: 'B7: 17' }).click();
  await page.getByRole('button', { name: 'Bind to cell' }).click();
  await page.getByTestId('refresh-workbook').setInputFiles(FIXTURE);
  await expect(page.getByTestId('refresh-preview')).toContainText('(unchanged)');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('refresh-preview')).toHaveCount(0);
});

test('invalid workbook shows an error', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('import-workbook').setInputFiles({ name: 'bad.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('nope') });
  await expect(page.getByRole('alert')).toContainText('could not be read');
});

test('validation blocks export of an empty page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Delete:/ }).click();
  await expect(page.getByRole('button', { name: 'Export HTML' })).toBeDisabled();
  await expect(page.getByText('The page has no components.')).toBeVisible();
});

test.describe('tenant test export', () => {
  test('baseline template -> export -> hash matches the downloaded bytes; file is self-contained in a real browser', async ({ page, context }) => {
    page.once('dialog', (d) => void d.accept());
    await page.goto('/');
    await page.getByRole('button', { name: /Load .SharePoint Compatibility Baseline. template/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'SharePoint HTML Studio' })).toBeVisible();
    await expect(page.locator('.banner.ok')).toContainText('Loaded template');

    // The preview shows the placeholder, never a fake timestamp.
    const frame = page.frameLocator('iframe[title="Exported page preview"]');
    await expect(frame.locator('h1')).toHaveText('SharePoint Compatibility Baseline');
    await expect(frame.getByText('(set at export time)').first()).toBeVisible();
    await expect(frame.locator('.sphs-kpi__value').nth(1)).toHaveText('17');

    await page.getByRole('button', { name: 'Tenant Test Export' }).click();
    const sha = (await page.getByTestId('tenant-sha').innerText()).trim();
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    const shownBytes = Number((await page.getByTestId('tenant-bytes').innerText()).replace(/[^\d]/g, ''));
    await expect(page.getByTestId('tenant-percent')).toContainText('%');
    await expect(page.getByTestId('tenant-facts')).toContainText('0 / 0'); // scripts / resource references

    const [htmlDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download HTML' }).click()]);
    const [reportDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download validation report/ }).click()]);
    const htmlBuf = readFileSync((await htmlDl.path()) as string);
    const report = JSON.parse(readFileSync((await reportDl.path()) as string, 'utf8'));

    expect(createHash('sha256').update(htmlBuf).digest('hex')).toBe(sha);
    expect(htmlBuf.length).toBe(shownBytes);
    expect(report.html.sha256).toBe(sha);
    expect(report.html.utf8Bytes).toBe(htmlBuf.length);
    expect(report.validation.errorCount).toBe(0);
    expect(report.checks).toMatchObject({ scriptCount: 0, resourceReferenceCount: 0 });
    expect(htmlBuf.subarray(0, 3).toString('hex')).not.toBe('efbbbf'); // no BOM

    // Open the downloaded file in a fresh page: zero requests, zero CSP violations, styles still applied under the CSP.
    const p2 = await context.newPage();
    const requests: string[] = [];
    const consoleMessages: string[] = [];
    p2.on('request', (r) => requests.push(r.url()));
    p2.on('console', (m) => consoleMessages.push(m.text()));
    await p2.setContent(htmlBuf.toString('utf8'));
    await expect(p2.locator('h1')).toHaveText('SharePoint Compatibility Baseline');
    expect(await p2.locator('h1').evaluate((e) => getComputedStyle(e).borderBottomWidth)).toBe('4px');
    expect(await p2.locator('time').getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await p2.locator('script').count()).toBe(0);
    expect(await p2.locator('td', { hasText: '<img src=x onerror=alert(1)>' }).count()).toBe(1);
    expect(await p2.locator('img').count()).toBe(0);
    expect(requests.filter((u) => !u.startsWith('about:') && !u.startsWith('data:'))).toEqual([]);
    expect(consoleMessages.filter((t) => /Content Security Policy|Refused/i.test(t))).toEqual([]);
  });

  test('is disabled with validation errors and flags stale results after an edit', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Tenant Test Export' }).click();
    await expect(page.getByTestId('tenant-sha')).toBeVisible();
    await page.getByRole('button', { name: 'Add Text' }).click();
    await expect(page.getByText('The project changed after this export')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download HTML' })).toBeDisabled();
    await page.getByRole('button', { name: /^Delete:/ }).first().click();
    await page.getByRole('button', { name: /^Delete:/ }).first().click();
    await expect(page.getByRole('button', { name: 'Tenant Test Export' })).toBeDisabled();
  });

  test('link inspector rejects unsafe targets', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Link' }).click();
    await page.getByRole('button', { name: /^Link:/ }).click();
    await page.getByLabel(/^Target/).fill('javascript:alert(1)');
    await expect(page.getByRole('alert').filter({ hasText: 'Not a valid target' })).toBeVisible();
    const frame = page.frameLocator('iframe[title="Exported page preview"]');
    await expect(frame.locator('a')).toHaveCount(0);
    await page.getByLabel(/^Target/).fill('https://example.com/x');
    await expect(frame.locator('a')).toHaveAttribute('href', 'https://example.com/x');
  });
});
