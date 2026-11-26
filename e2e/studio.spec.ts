import { expect, test } from '@playwright/test';
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
