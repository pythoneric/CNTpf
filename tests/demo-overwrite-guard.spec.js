const { test, expect } = require('@playwright/test');

/**
 * Demo overwrite-guard
 *
 * Loading a demo from the loader screen used to silently overwrite the user's
 * autosaved IndexedDB record with no warning — so a user showing the demo to
 * a friend would lose their real data unless they had downloaded a JSON
 * backup first. `loadDemoSafe(currency)` is a thin wrapper that:
 *
 *   1. If IndexedDB has no saved record → call loadDemo directly (zero
 *      friction for first-run users).
 *   2. If a record exists → open #demoConfirmModal with three actions:
 *        - Descargar respaldo y continuar  (backs up + loads demo)
 *        - Continuar sin respaldo           (loads demo straight away)
 *        - Cancelar                         (does nothing, keeps real data)
 *
 * This spec locks each branch.
 */

const STORE = 'dashboard_data';

async function gotoFresh(page) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window.loadDemoSafe === 'function');
}

async function seedSavedData(page) {
  // Drop a minimal valid record into IndexedDB so loadDemoSafe sees "real
  // data" and triggers the modal. Mirrors the fields autoSave writes.
  await page.evaluate(async () => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = 1234;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.filename = 'real_user_data.json';
    await window.dbSet('dashboard_data', 'editData', data);
    await window.dbSet('dashboard_data', 'meta', {
      mes: data.config.mes, anio: data.config.anio,
      filename: data.filename, savedAt: new Date().toISOString(),
    });
  });
}

async function clearSavedData(page) {
  await page.evaluate(async () => {
    try { await window.dbDelete('dashboard_data', 'editData'); } catch (e) {}
    try { await window.dbDelete('dashboard_data', 'meta'); } catch (e) {}
  });
}

// ───────────────────────────────────────────────────────────────────
// 1. No saved data → bypass the modal entirely
// ───────────────────────────────────────────────────────────────────
test.describe('loadDemoSafe — no saved data path', () => {
  test('first-run user: clicking Demo loads it directly, no modal', async ({ page }) => {
    await gotoFresh(page);
    await clearSavedData(page);
    await page.locator('button[onclick="loadDemoSafe(\'RD\')"]').click();
    // Modal must NOT open
    const modalOpen = await page.evaluate(() =>
      document.getElementById('demoConfirmModal').classList.contains('open')
    );
    expect(modalOpen).toBe(false);
    // Demo did load → dashboard becomes visible
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 10000 });
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Saved data exists → modal gates the action
// ───────────────────────────────────────────────────────────────────
test.describe('loadDemoSafe — saved data triggers the confirmation modal', () => {
  test('clicking Demo opens the modal instead of loading right away', async ({ page }) => {
    await gotoFresh(page);
    await seedSavedData(page);
    await page.evaluate(() => window.loadDemoSafe('RD'));
    await expect(page.locator('#demoConfirmModal')).toHaveClass(/open/);
    // Dashboard NOT visible yet
    const dashShown = await page.evaluate(() =>
      getComputedStyle(document.getElementById('dashApp')).display !== 'none'
    );
    expect(dashShown).toBe(false);
  });

  test('Cancelar closes the modal and leaves the saved record untouched', async ({ page }) => {
    await gotoFresh(page);
    await seedSavedData(page);
    await page.evaluate(() => window.loadDemoSafe('RD'));
    await page.click('#demoConfirmModal button:has-text("Cancelar")');
    await expect(page.locator('#demoConfirmModal')).not.toHaveClass(/open/);
    const stored = await page.evaluate(() => window.dbGet('dashboard_data', 'editData'));
    expect(stored).toBeTruthy();
    expect(stored.filename).toBe('real_user_data.json');
    expect(stored.config.ingresoUSD).toBe(1234);
  });

  test('"Continuar sin respaldo" loads the demo (overwrites the IndexedDB record)', async ({ page }) => {
    await gotoFresh(page);
    await seedSavedData(page);
    await page.evaluate(() => window.loadDemoSafe('RD'));
    await page.click('#demoConfirmModal button:has-text("Continuar sin respaldo")');
    await expect(page.locator('#demoConfirmModal')).not.toHaveClass(/open/);
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 10000 });
    // After autosave fires, the stored record should now reflect the demo
    await page.waitForFunction(async () => {
      const d = await window.dbGet('dashboard_data', 'editData');
      return d && d.filename && /demo/i.test(d.filename);
    }, null, { timeout: 5000 });
  });

  test('"Descargar respaldo y continuar" triggers a JSON download AND loads the demo', async ({ page }) => {
    await gotoFresh(page);
    await seedSavedData(page);
    await page.evaluate(() => window.loadDemoSafe('RD'));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#demoConfirmModal button:has-text("Descargar")'),
    ]);
    // File matches the cnt_backup_<YYYYMMDD>.json pattern
    expect(download.suggestedFilename()).toMatch(/^cnt_backup_\d{8}\.json$/);
    // Backup contents reflect the SAVED user data, not the demo
    const buf = await (await download.createReadStream()).toArray();
    const json = JSON.parse(Buffer.concat(buf).toString());
    expect(json.filename).toBe('real_user_data.json');
    expect(json.config.ingresoUSD).toBe(1234);
    expect(json._meta).toBeDefined();
    expect(json._meta.version).toBe(4);
    // Modal closes and demo loads
    await expect(page.locator('#demoConfirmModal')).not.toHaveClass(/open/);
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 10000 });
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. downloadFromDB helper — independent
// ───────────────────────────────────────────────────────────────────
test.describe('downloadFromDB helper', () => {
  test('returns false when no saved record exists', async ({ page }) => {
    await gotoFresh(page);
    await clearSavedData(page);
    const result = await page.evaluate(() => window.downloadFromDB());
    expect(result).toBe(false);
  });

  test('triggers a download with cnt_backup_<date>.json filename when data exists', async ({ page }) => {
    await gotoFresh(page);
    await seedSavedData(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => window.downloadFromDB()),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cnt_backup_\d{8}\.json$/);
  });
});
