const { test, expect } = require('@playwright/test');

/**
 * Tests that the Edit modal's Gastos table is horizontally scrollable
 * on mobile so that all columns (including Original RD$ and Original USD)
 * are reachable and editable — even on narrow screens (<=640px).
 *
 * Bug: overflow:hidden was set on .edit-table-wrap at <=640px, clipping
 * the rightmost columns and making them invisible/uneditable.
 * Fix: changed to overflow-x:auto with touch scrolling.
 */

async function loadApp(page, width = 375) {
  await page.setViewportSize({ width, height: 812 });
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(() => {
    const data = window.defaultEditData();
    data.config.tasa = 61.5;
    data.config.ingresoUSD = 3800;
    data.config.ingresoRD = 233700;
    data.gastos = [
      { nombre: 'Hipoteca', tipo: 'Vivienda', pagado: 0, adeudado: 52000, dia: 15, tasa: 11.5, balance: 4200000, originalRD: 5500000, originalUSD: 89430, fechaLimite: '2041-06-15', notas: '', pagadoMes: false },
    ];
    data.forNow.cuentas = [{ nombre: 'Cuenta', moneda: 'RD', saldo: 10000 }];
    data.emerg.fondos = [{ fondo: 'EF', balance: 1000, meta: 5000, moneda: 'RD' }];
    data.emerg.cashflow = { ingreso: 233700, gasto: 52000, tasa: 61.5, retirarUSD: 845, resta: 181700, ahorros: 0, balanceAhorros: 0 };
    window._testLoadData(data);
  });
}

async function openEditGastos(page) {
  await page.evaluate(() => window.openEditModal());
  await expect(page.locator('#editModal')).toHaveClass(/open/);
  // Click the Gastos/Expenses edit tab
  const tabs = page.locator('.edit-tab');
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    const text = await tabs.nth(i).textContent();
    if (text && (text.includes('Gastos') || text.includes('Expenses'))) {
      await tabs.nth(i).click();
      break;
    }
  }
  await expect(page.locator('#esencialesEditBody')).toBeVisible();
}

test.describe('Edit table scroll on mobile', () => {

  test('edit-table-wrap has overflow-x:auto at 375px', async ({ page }) => {
    await loadApp(page, 375);
    await openEditGastos(page);
    const overflow = await page.locator('.edit-table-wrap').first().evaluate(
      el => getComputedStyle(el).overflowX
    );
    expect(overflow).toBe('auto');
  });

  test('Original(RD$) column is visible after scrolling at 375px', async ({ page }) => {
    await loadApp(page, 375);
    await openEditGastos(page);
    const origInput = page.locator('#origRD-0');
    await origInput.scrollIntoViewIfNeeded();
    await expect(origInput).toBeVisible();
  });

  test('Original(USD) column is visible after scrolling at 375px', async ({ page }) => {
    await loadApp(page, 375);
    await openEditGastos(page);
    const origInput = page.locator('#origUSD-0');
    await origInput.scrollIntoViewIfNeeded();
    await expect(origInput).toBeVisible();
  });

  test('Original(RD$) field is editable on mobile', async ({ page }) => {
    await loadApp(page, 375);
    await openEditGastos(page);
    const input = page.locator('#origRD-0');
    await input.scrollIntoViewIfNeeded();
    await input.fill('6000000');
    await expect(input).toHaveValue('6000000');
  });

  test('Original(USD) field is editable on mobile', async ({ page }) => {
    await loadApp(page, 375);
    await openEditGastos(page);
    const input = page.locator('#origUSD-0');
    await input.scrollIntoViewIfNeeded();
    await input.fill('95000');
    await expect(input).toHaveValue('95000');
  });

  test('syncOriginal updates USD when RD$ is edited on mobile', async ({ page }) => {
    await loadApp(page, 375);
    await openEditGastos(page);
    const rdInput = page.locator('#origRD-0');
    await rdInput.scrollIntoViewIfNeeded();
    await rdInput.fill('615000');
    await rdInput.dispatchEvent('input');
    const usdInput = page.locator('#origUSD-0');
    await usdInput.scrollIntoViewIfNeeded();
    const usdVal = parseFloat(await usdInput.inputValue());
    // 615000 / 61.5 = 10000
    expect(usdVal).toBe(10000);
  });

  test('new row Original fields are editable on mobile', async ({ page }) => {
    await loadApp(page, 375);
    await openEditGastos(page);
    // Add a new row
    const addBtn = page.locator('#esection-esenciales button.row-add-btn');
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click();
    // The new row is index 1
    const rdInput = page.locator('#origRD-1');
    await rdInput.scrollIntoViewIfNeeded();
    await expect(rdInput).toBeVisible();
    await rdInput.fill('100000');
    await expect(rdInput).toHaveValue('100000');
    const usdInput = page.locator('#origUSD-1');
    await usdInput.scrollIntoViewIfNeeded();
    await expect(usdInput).toBeVisible();
    await usdInput.fill('1625');
    await expect(usdInput).toHaveValue('1625');
  });

  test('at desktop width (1024px) Original columns are visible without scrolling', async ({ page }) => {
    await loadApp(page, 1024);
    await openEditGastos(page);
    const rdInput = page.locator('#origRD-0');
    await expect(rdInput).toBeVisible();
    const usdInput = page.locator('#origUSD-0');
    await expect(usdInput).toBeVisible();
  });

});
