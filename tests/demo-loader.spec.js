const { test, expect } = require('@playwright/test');

/**
 * Tests for the demo data loader buttons on the loader screen.
 */

test.describe('Demo Data Loader', () => {
  test('RD demo button is visible on loader screen', async ({ page }) => {
    await page.goto('/cnt.html');
    const demoBtn = page.locator('button[onclick="loadDemoSafe(\'RD\')"]');
    await expect(demoBtn).toBeVisible();
    await expect(demoBtn).toContainText(/Demo RD\$/);
  });

  test('USD demo button is visible on loader screen', async ({ page }) => {
    await page.goto('/cnt.html');
    const demoBtn = page.locator('button[onclick="loadDemoSafe(\'USD\')"]');
    await expect(demoBtn).toBeVisible();
    await expect(demoBtn).toContainText(/Demo USD/);
  });

  test('demo buttons have i18n attributes', async ({ page }) => {
    await page.goto('/cnt.html');
    const titleRD = page.locator('[data-i18n="loader_demo_rd"]');
    await expect(titleRD).toBeVisible();
    const subRD = page.locator('[data-i18n="loader_demo_rd_sub"]');
    await expect(subRD).toBeVisible();
    const titleUSD = page.locator('[data-i18n="loader_demo_usd"]');
    await expect(titleUSD).toBeVisible();
    const subUSD = page.locator('[data-i18n="loader_demo_usd_sub"]');
    await expect(subUSD).toBeVisible();
  });

  test('demo buttons translate to English', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testSetLang === 'function');
    await page.evaluate(() => window._testSetLang('en'));
    const titleRD = page.locator('[data-i18n="loader_demo_rd"]');
    await expect(titleRD).toHaveText('Demo RD$');
    const titleUSD = page.locator('[data-i18n="loader_demo_usd"]');
    await expect(titleUSD).toHaveText('Demo USD');
  });

  test('clicking RD demo loads dashboard with RD$ data', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');

    await page.locator('button[onclick="loadDemoSafe(\'RD\')"]').click();

    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#loaderScreen')).toBeHidden();

    const headerTitle = await page.locator('#headerTitle').textContent();
    expect(headerTitle).toContain('Mayo');
    expect(headerTitle).toContain('2026');

    const kpiRow = page.locator('#kpiRow');
    await expect(kpiRow.locator('.card')).toHaveCount(6);
    await expect(kpiRow).toContainText('RD$');
  });

  test('clicking USD demo loads dashboard with $ data', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');

    await page.locator('button[onclick="loadDemoSafe(\'USD\')"]').click();

    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#loaderScreen')).toBeHidden();

    const kpiRow = page.locator('#kpiRow');
    await expect(kpiRow.locator('.card')).toHaveCount(6);
    // USD demo should show $ prefix, NOT RD$
    const kpiText = await kpiRow.textContent();
    expect(kpiText).toContain('$');
  });

  test('RD demo loads correct number of gastos', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemoSafe(\'RD\')"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const gastoCount = await page.evaluate(() => _editData.gastos.length);
    expect(gastoCount).toBe(12);
  });

  test('USD demo loads correct number of gastos', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemoSafe(\'USD\')"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const gastoCount = await page.evaluate(() => _editData.gastos.length);
    expect(gastoCount).toBe(15);
  });

  test('RD demo loads 30 months of history', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemoSafe(\'RD\')"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const histCount = await page.evaluate(() => _editData.historial.length);
    expect(histCount).toBe(30);
  });

  test('USD demo loads 30 months of history', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemoSafe(\'USD\')"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const histCount = await page.evaluate(() => _editData.historial.length);
    expect(histCount).toBe(30);
  });

  test('RD demo loads savings goals', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemoSafe(\'RD\')"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const metasCount = await page.evaluate(() => _editData.metas.length);
    expect(metasCount).toBe(3);
  });

  test('RD demo loads ForNow accounts', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemoSafe(\'RD\')"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const accountCount = await page.evaluate(() => _editData.forNow.cuentas.length);
    expect(accountCount).toBe(4);
  });

  test('RD demo loads emergency funds', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemoSafe(\'RD\')"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const efCount = await page.evaluate(() => _editData.emerg.fondos.length);
    expect(efCount).toBe(3);
  });
});
