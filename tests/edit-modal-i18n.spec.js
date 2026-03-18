const { test, expect } = require('@playwright/test');

/**
 * Helper: load the app with test data.
 */
async function loadApp(page) {
  // Auto-accept confirm dialogs (unsaved changes warning, delete confirmations)
  page.on('dialog', dialog => dialog.accept());
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

async function switchToEnglish(page) {
  await page.evaluate(() => window._testSetLang('en'));
}

async function switchToSpanish(page) {
  await page.evaluate(() => window._testSetLang('es'));
}

async function openEdit(page) {
  await page.evaluate(() => window.openEditModal());
  await expect(page.locator('#editModal')).toHaveClass(/open/);
}

test.describe('Edit Modal - i18n', () => {
  test('edit modal header translates to English', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');
    await expect(modal.locator('.edit-title')).toHaveText('Edit Data');
    await expect(modal.locator('.edit-subtitle')).toContainText('Changes apply to the dashboard');
  });

  test('edit modal header stays Spanish when language is Spanish', async ({ page }) => {
    await loadApp(page);
    await switchToSpanish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');
    await expect(modal.locator('.edit-title')).toHaveText('Editar Datos');
    await expect(modal.locator('.edit-subtitle')).toContainText('Los cambios se aplican');
  });

  test('edit modal tabs translate to English', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');
    await expect(modal.locator('.edit-tab', { hasText: /Settings/ })).toBeVisible();
    await expect(modal.locator('.edit-tab', { hasText: /Expenses/ })).toBeVisible();
    await expect(modal.locator('.edit-tab', { hasText: /Funds/ })).toBeVisible();
    await expect(modal.locator('.edit-tab', { hasText: /Emergency/ })).toBeVisible();
    await expect(modal.locator('.edit-tab', { hasText: /History/ })).toBeVisible();
  });

  test('edit modal action buttons translate to English', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');

    // Header buttons
    await expect(modal.locator('.edit-actions button', { hasText: /Save & export/ })).toBeVisible();
    await expect(modal.locator('.edit-actions button', { hasText: /Save/ }).first()).toBeVisible();
    await expect(modal.locator('.edit-actions button', { hasText: /Close/ })).toBeVisible();

    // Save bar buttons at the bottom
    await expect(modal.locator('.save-bar button', { hasText: /Save & export/ })).toBeVisible();
    await expect(modal.locator('.save-bar button', { hasText: /Save/ }).first()).toBeVisible();
  });

  test('config section field labels translate to English', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const config = page.locator('#esection-config');
    await expect(config).toBeVisible();

    // Config field labels should be English
    await expect(config).toContainText('Exchange Rate (RD$/USD)');
    await expect(config).toContainText('Current Month');
    await expect(config).toContainText('Current Year');
    await expect(config).toContainText('Monthly Income (USD)');
    await expect(config).toContainText('Payment alert days');

    // Notes should be English
    await expect(config).toContainText('Update monthly');
    await expect(config).toContainText('In dollars');
  });

  test('config section field labels show Spanish when language is Spanish', async ({ page }) => {
    await loadApp(page);
    await switchToSpanish(page);
    await openEdit(page);

    const config = page.locator('#esection-config');
    await expect(config).toContainText('Tasa Dólar (RD$/USD)');
    await expect(config).toContainText('Mes Actual');
    await expect(config).toContainText('Año Actual');
    await expect(config).toContainText('Ingreso Mensual (USD)');
    await expect(config).toContainText('Días alerta vencimiento');
  });

  test('all card titles translate to English across sections', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');

    // Config section (already visible)
    await expect(modal.locator('.edit-card-title', { hasText: /Global Settings/ })).toBeVisible();

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

  test('table headers translate to English', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');

    // Expenses table headers
    await modal.locator('.edit-tab', { hasText: /Expenses/ }).click();
    const expTable = modal.locator('#esection-esenciales thead');
    await expect(expTable).toContainText('Description');
    await expect(expTable).toContainText('Type');
    await expect(expTable).toContainText('Deadline');

    // Funds table headers
    await modal.locator('.edit-tab', { hasText: /Funds/ }).click();
    const fornowTable = modal.locator('#esection-fornow thead');
    await expect(fornowTable).toContainText('Account');
    await expect(fornowTable).toContainText('Currency');
    await expect(fornowTable).toContainText('Balance');

    // Funds date label
    await expect(modal.locator('#esection-fornow')).toContainText('Date Updated');

    // Emergency table headers
    await modal.locator('.edit-tab', { hasText: /Emergency/ }).click();
    const emergTable = modal.locator('#esection-emergency thead');
    await expect(emergTable).toContainText('Fund');
    await expect(emergTable).toContainText('Current Balance');
    await expect(emergTable).toContainText('Minimum Goal');

    // History table headers
    await modal.locator('.edit-tab', { hasText: /History/ }).click();
    const histTable = modal.locator('#esection-historial thead');
    await expect(histTable).toContainText('Month');
    await expect(histTable).toContainText('Year');
    await expect(histTable).toContainText('Income (RD$)');
  });

  test('cashflow field labels translate to English', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');

    // Navigate to emergency tab (cashflow is there)
    await modal.locator('.edit-tab', { hasText: /Emergency/ }).click();
    const cashflow = modal.locator('#cashflowFields');
    await expect(cashflow).toBeVisible();

    await expect(cashflow).toContainText('Monthly Income (RD$)');
    await expect(cashflow).toContainText('Total Monthly Expenses');
    await expect(cashflow).toContainText('Exchange Rate');
    await expect(cashflow).toContainText('Withdraw in USD');
    await expect(cashflow).toContainText('Savings this month');
    await expect(cashflow).toContainText('Savings Balance');
  });

  test('cashflow field labels show Spanish when language is Spanish', async ({ page }) => {
    await loadApp(page);
    await switchToSpanish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');
    await modal.locator('.edit-tab', { hasText: /Emergencia/ }).click();
    const cashflow = modal.locator('#cashflowFields');

    await expect(cashflow).toContainText('Ingreso Mensual (RD$)');
    await expect(cashflow).toContainText('Gasto Mensual Total');
    await expect(cashflow).toContainText('Tasa Dólar');
    await expect(cashflow).toContainText('Retirar en USD');
    await expect(cashflow).toContainText('Ahorros este mes');
    await expect(cashflow).toContainText('Balance Ahorros');
  });

  test('switching language and reopening edit modal updates all fields', async ({ page }) => {
    await loadApp(page);

    // Open in Spanish
    await switchToSpanish(page);
    await openEdit(page);
    await expect(page.locator('#editModal .edit-title')).toHaveText('Editar Datos');
    await expect(page.locator('#esection-config')).toContainText('Tasa Dólar (RD$/USD)');

    // Close
    await page.evaluate(() => window.closeEditModal(true));

    // Switch to English and reopen
    await switchToEnglish(page);
    await openEdit(page);
    await expect(page.locator('#editModal .edit-title')).toHaveText('Edit Data');
    await expect(page.locator('#esection-config')).toContainText('Exchange Rate (RD$/USD)');
    await expect(page.locator('#editModal .edit-tab', { hasText: /Settings/ })).toBeVisible();
  });

  test('no Spanish text remains in edit modal when set to English', async ({ page }) => {
    await loadApp(page);
    await switchToEnglish(page);
    await openEdit(page);

    const modal = page.locator('#editModal');

    // Check config section (visible by default)
    const configText = await modal.locator('#esection-config').innerText();
    expect(configText).not.toContain('Tasa Dólar');
    expect(configText).not.toContain('Mes Actual');
    expect(configText).not.toContain('Año Actual');
    expect(configText).not.toContain('Actualizar mensualmente');
    expect(configText).not.toContain('En dólares');

    // Check header area
    const headerText = await modal.locator('.edit-header').innerText();
    expect(headerText).not.toContain('Editar Datos');
    expect(headerText).not.toContain('Guardar');
    expect(headerText).not.toContain('Cerrar');

    // Check tabs
    const tabsText = await modal.locator('.edit-tabs').innerText();
    expect(tabsText).not.toContain('Configuración');
    expect(tabsText).not.toContain('Gastos');
    expect(tabsText).not.toContain('Fondos');
    expect(tabsText).not.toContain('Emergencia');
    expect(tabsText).not.toContain('Historial');
  });
});
