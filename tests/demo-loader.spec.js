const { test, expect } = require('@playwright/test');

/**
 * Tests for the demo data loader button on the loader screen.
 */

test.describe('Demo Data Loader', () => {
  test('demo button is visible on loader screen', async ({ page }) => {
    await page.goto('/cnt.html');
    const demoBtn = page.locator('button[onclick="loadDemo()"]');
    await expect(demoBtn).toBeVisible();
    await expect(demoBtn).toContainText(/demo|Demo/);
  });

  test('demo button has i18n attributes', async ({ page }) => {
    await page.goto('/cnt.html');
    const title = page.locator('[data-i18n="loader_demo"]');
    await expect(title).toBeVisible();
    const sub = page.locator('[data-i18n="loader_demo_sub"]');
    await expect(sub).toBeVisible();
  });

  test('demo button translates to English', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testSetLang === 'function');
    await page.evaluate(() => window._testSetLang('en'));
    const title = page.locator('[data-i18n="loader_demo"]');
    await expect(title).toHaveText(/View demo|sample data/);
  });

  test('clicking demo loads dashboard with data', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');

    // Click the demo button
    await page.locator('button[onclick="loadDemo()"]').click();

    // Wait for dashboard to appear (loader hides, dashboard shows)
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#loaderScreen')).toBeHidden();

    // Verify data loaded — header should show month and KPIs should have values
    const headerTitle = await page.locator('#headerTitle').textContent();
    expect(headerTitle).toContain('Mayo');
    expect(headerTitle).toContain('2026');

    // KPI row should have cards with real values
    const kpiRow = page.locator('#kpiRow');
    await expect(kpiRow.locator('.card')).toHaveCount(5);
    await expect(kpiRow).toContainText('RD$');
  });

  test('demo loads correct number of gastos', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemo()"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const gastoCount = await page.evaluate(() => _editData.gastos.length);
    expect(gastoCount).toBe(15);
  });

  test('demo loads 18 months of history', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemo()"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const histCount = await page.evaluate(() => _editData.historial.length);
    expect(histCount).toBe(18);
  });

  test('demo loads 5 savings goals', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemo()"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const metasCount = await page.evaluate(() => _editData.metas.length);
    expect(metasCount).toBe(5);
  });

  test('demo loads 5 accounts in ForNow', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemo()"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const accountCount = await page.evaluate(() => _editData.forNow.cuentas.length);
    expect(accountCount).toBe(5);
  });

  test('demo loads 5 emergency funds', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.locator('button[onclick="loadDemo()"]').click();
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 15000 });

    const efCount = await page.evaluate(() => _editData.emerg.fondos.length);
    expect(efCount).toBe(5);
  });
});
