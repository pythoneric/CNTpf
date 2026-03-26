const { test, expect } = require('@playwright/test');

/**
 * Helper: load the app with test data and save to IndexedDB.
 */
async function loadAndSaveApp(page) {
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');

  await page.evaluate(() => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.ingresoRD = 180000;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.emerg.cashflow.ingreso = 180000;
    data.emerg.cashflow.gasto = 120000;
    data.emerg.cashflow.tasa = 60;
    data.forNow.cuentas = [{ nombre: 'Corriente', moneda: 'RD', saldo: 50000, comp: 0, disp: 50000 }];
    data.forNow.total = 50000;
    window._testLoadData(data);
  });

  // Call saveToDB directly (autoSave is debounced and creates race conditions)
  await page.evaluate(() => window.saveToDB());
}

test.describe('Cache Clear - Preserves User Data', () => {
  test('hardResetCache does not delete IndexedDB data', async ({ page }) => {
    await loadAndSaveApp(page);

    // Verify data is saved in IndexedDB
    const hasBefore = await page.evaluate(async () => {
      const meta = await window.dbGet('dashboard_data', 'meta');
      return !!meta;
    });
    expect(hasBefore).toBe(true);

    // Override setTimeout to prevent the reload, then call hardResetCache
    await page.evaluate(async () => {
      const origSetTimeout = window.setTimeout;
      window.setTimeout = (fn, ms) => {
        // Capture the reload callback but don't run it
        window._cacheCleared = true;
        return 0;
      };
      await window.hardResetCache();
      window.setTimeout = origSetTimeout;
    });

    const cleared = await page.evaluate(() => window._cacheCleared);
    expect(cleared).toBe(true);

    // Verify IndexedDB data is STILL there
    const hasAfter = await page.evaluate(async () => {
      const meta = await window.dbGet('dashboard_data', 'meta');
      return !!meta;
    });
    expect(hasAfter).toBe(true);
  });

  test('hardResetCache does not throw on http origins', async ({ page }) => {
    await loadAndSaveApp(page);

    // Intercept reload
    await page.evaluate(() => {
      location.reload = () => { window._reloadCalled = true; };
    });

    const result = await page.evaluate(async () => {
      try {
        await window.hardResetCache();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });

    expect(result.ok).toBe(true);
  });

  test('saved data banner appears after page reload', async ({ page }) => {
    await loadAndSaveApp(page);

    // Reload the page (simulating what happens after cache clear)
    await page.reload();
    await page.waitForFunction(() => typeof window.buildDashboard === 'function');

    // Wait for checkSavedData to run and show the banner
    await page.waitForTimeout(500);

    // The saved data banner should be visible
    const banner = page.locator('#savedDataBanner');
    await expect(banner).toBeVisible();

    // The "Continuar" button should be available
    await expect(page.locator('button', { hasText: /Continuar|Continue/ })).toBeVisible();
  });
});
