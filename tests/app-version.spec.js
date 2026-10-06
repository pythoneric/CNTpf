const { test, expect } = require('@playwright/test');
const pkg = require('../package.json');

/**
 * App version footer — "V 1.0.0" shows in the login (loader) screen footer
 * and in the Edit modal's save bar, both driven by APP_VERSION, which must
 * match package.json.
 */

test.describe('App version footer', () => {
  test('APP_VERSION matches package.json', async ({ page }) => {
    await page.goto('/cnt.html');
    expect(await page.evaluate(() => window.APP_VERSION)).toBe(pkg.version);
  });

  test('login screen footer shows the version', async ({ page }) => {
    await page.goto('/cnt.html');
    await expect(page.locator('#loaderVersion')).toBeVisible();
    await expect(page.locator('#loaderVersion')).toHaveText('V 1.0.0');
  });

  test('edit modal footer shows the version', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    await page.evaluate(() => window._testLoadData(window.defaultEditData()));
    await page.evaluate(() => window.openEditModal());
    await expect(page.locator('#editModal')).toHaveClass(/open/);
    await expect(page.locator('#editVersion')).toBeVisible();
    await expect(page.locator('#editVersion')).toHaveText('V 1.0.0');
  });
});
