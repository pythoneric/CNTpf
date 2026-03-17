const { test, expect } = require('@playwright/test');

/**
 * Helper: load the app with test data.
 */
async function loadApp(page) {
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
    data.forNow.cuentas = [{ nombre: 'Test', moneda: 'RD', saldo: 50000, comp: 0, disp: 50000 }];
    data.forNow.total = 50000;
    data.emerg.fondos = [{ fondo: 'Emergency', moneda: 'RD', balance: 10000, meta: 50000 }];
    window._testLoadData(data);
  });
}

/** Switch the app language to English */
async function switchToEnglish(page) {
  await page.evaluate(() => window._testSetLang('en'));
}

/** Switch the app language to Spanish */
async function switchToSpanish(page) {
  await page.evaluate(() => window._testSetLang('es'));
}

/** Open the edit modal */
async function openEdit(page) {
  await page.evaluate(() => window.openEditModal());
  await expect(page.locator('#editModal')).toHaveClass(/open/);
}

test.describe('Edit Modal - i18n', () => {
  test('edit modal shows English when language is set to English', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');

    // Title should be in English
    await expect(modal.locator('.edit-title')).toHaveText('Edit Data');

    // Subtitle
    await expect(modal.locator('.edit-subtitle')).toContainText('Changes apply to the dashboard');

    // Tabs should be in English
    await expect(modal.locator('.edit-tab', { hasText: /Settings/ })).toBeVisible();
    await expect(modal.locator('.edit-tab', { hasText: /Expenses/ })).toBeVisible();
    await expect(modal.locator('.edit-tab', { hasText: /Funds/ })).toBeVisible();
    await expect(modal.locator('.edit-tab', { hasText: /Emergency/ })).toBeVisible();
    await expect(modal.locator('.edit-tab', { hasText: /History/ })).toBeVisible();

    // Buttons should be in English
    await expect(modal.locator('button', { hasText: /Save & export/ })).toBeVisible();
    await expect(modal.locator('button', { hasText: /Save/ }).first()).toBeVisible();
    await expect(modal.locator('button', { hasText: /Close/ })).toBeVisible();

    // Card title should be in English
    await expect(modal.locator('.edit-card-title', { hasText: /Global Settings/ })).toBeVisible();
  });

  test('edit modal shows Spanish when language is set to Spanish', async ({ page }) => {
    await loadApp(page);
    await switchToSpanish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');

    await expect(modal.locator('.edit-title')).toHaveText('Editar Datos');
    await expect(modal.locator('.edit-tab', { hasText: /Configuración/ })).toBeVisible();
    await expect(modal.locator('.edit-tab', { hasText: /Gastos/ })).toBeVisible();
    await expect(modal.locator('.edit-card-title', { hasText: /Parámetros Globales/ })).toBeVisible();
  });

  test('edit modal card titles translate to English for all sections', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');

    // Navigate to each tab and verify card titles are English
    // Expenses tab
    await modal.locator('.edit-tab', { hasText: /Expenses/ }).click();
    await expect(modal.locator('.edit-card-title', { hasText: /Monthly Expenses/ })).toBeVisible();
    await expect(modal.locator('.row-add-btn', { hasText: /Add row/ })).toBeVisible();

    // Funds tab
    await modal.locator('.edit-tab', { hasText: /Funds/ }).click();
    await expect(modal.locator('.edit-card-title', { hasText: /Fund Availability/ })).toBeVisible();
    await expect(modal.locator('.row-add-btn', { hasText: /Add account/ })).toBeVisible();

    // Emergency tab
    await modal.locator('.edit-tab', { hasText: /Emergency/ }).click();
    await expect(modal.locator('.edit-card-title', { hasText: /Emergency Funds/ })).toBeVisible();
    await expect(modal.locator('.row-add-btn', { hasText: /Add fund/ })).toBeVisible();
    await expect(modal.locator('.edit-card-title', { hasText: /Monthly Cashflow/ })).toBeVisible();

    // History tab
    await modal.locator('.edit-tab', { hasText: /History/ }).click();
    await expect(modal.locator('.edit-card-title', { hasText: /Monthly History/ })).toBeVisible();
    await expect(modal.locator('.row-add-btn', { hasText: /Add month/ })).toBeVisible();
  });

  test('edit modal table headers translate to English', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');

    // Funds tab - check table headers
    await modal.locator('.edit-tab', { hasText: /Funds/ }).click();
    const fornowTable = modal.locator('#esection-fornow thead');
    await expect(fornowTable).toContainText('Account');
    await expect(fornowTable).toContainText('Currency');
    await expect(fornowTable).toContainText('Balance');
    await expect(fornowTable).toContainText('Committed');

    // Emergency tab
    await modal.locator('.edit-tab', { hasText: /Emergency/ }).click();
    const emergTable = modal.locator('#esection-emergency thead');
    await expect(emergTable).toContainText('Fund');
    await expect(emergTable).toContainText('Currency');
    await expect(emergTable).toContainText('Current Balance');
    await expect(emergTable).toContainText('Minimum Goal');
  });

  test('switching language and reopening edit modal updates correctly', async ({ page }) => {
    await loadApp(page);

    // Open in Spanish first
    await switchToSpanish(page);
    await openEdit(page);
    await expect(page.locator('#editModal .edit-title')).toHaveText('Editar Datos');

    // Close modal
    await page.evaluate(() => window.closeEditModal());

    // Switch to English
    await switchToEnglish(page);

    // Reopen - should now be in English
    await openEdit(page);
    await expect(page.locator('#editModal .edit-title')).toHaveText('Edit Data');
    await expect(page.locator('#editModal .edit-tab', { hasText: /Settings/ })).toBeVisible();
  });
});
