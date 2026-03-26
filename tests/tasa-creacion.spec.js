const { test, expect } = require('@playwright/test');

/**
 * Tests for the tasaCreacion feature:
 * - New rows store the exchange rate at creation time
 * - The stored rate is shown in a read-only column
 * - syncOriginal uses the row's tasaCreacion (not the current config tasa)
 */

async function loadApp(page) {
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(() => {
    const data = window.defaultEditData();
    data.config.tasa = 61.5;
    data.config.ingresoUSD = 3800;
    data.config.ingresoRD = 233700;
    data.gastos = [
      { nombre: 'Hipoteca', tipo: 'Vivienda', pagado: 0, adeudado: 52000, dia: 15, tasa: 11.5, balance: 4200000, originalRD: 5500000, originalUSD: 89430, tasaCreacion: 55, fechaLimite: '2041-06-15', notas: '', pagadoMes: false },
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

test.describe('Tasa Creación column', () => {

  test('existing row shows its tasaCreacion value', async ({ page }) => {
    await loadApp(page);
    await openEditGastos(page);
    // Row 0 has tasaCreacion=55
    const row = page.locator('#esencialesEditBody tr').first();
    const tasaCell = row.locator('input[readonly]');
    await expect(tasaCell).toHaveValue('55');
  });

  test('tasaCreacion column is read-only', async ({ page }) => {
    await loadApp(page);
    await openEditGastos(page);
    const row = page.locator('#esencialesEditBody tr').first();
    const tasaCell = row.locator('input[readonly]');
    await expect(tasaCell).toHaveAttribute('readonly', '');
  });

  test('new row stores current config tasa as tasaCreacion', async ({ page }) => {
    await loadApp(page);
    await openEditGastos(page);
    // Config tasa is 61.5 — add a new row
    await page.click('#esection-esenciales button.row-add-btn');
    // New row is index 1
    const newRow = page.locator('#esencialesEditBody tr').nth(1);
    const tasaCell = newRow.locator('input[readonly]');
    await expect(tasaCell).toHaveValue('61.5');
  });

  test('syncOriginal uses row tasaCreacion, not current config tasa', async ({ page }) => {
    await loadApp(page);
    await openEditGastos(page);
    // Row 0 has tasaCreacion=55, config tasa=61.5
    const rdInput = page.locator('#origRD-0');
    await rdInput.fill('550000');
    await rdInput.dispatchEvent('input');
    const usdInput = page.locator('#origUSD-0');
    const usdVal = parseFloat(await usdInput.inputValue());
    // 550000 / 55 = 10000 (uses tasaCreacion=55, NOT config tasa=61.5)
    expect(usdVal).toBe(10000);
  });

  test('syncOriginal USD→RD uses row tasaCreacion', async ({ page }) => {
    await loadApp(page);
    await openEditGastos(page);
    // Row 0 has tasaCreacion=55
    const usdInput = page.locator('#origUSD-0');
    await usdInput.fill('1000');
    await usdInput.dispatchEvent('input');
    const rdInput = page.locator('#origRD-0');
    const rdVal = parseFloat(await rdInput.inputValue());
    // 1000 * 55 = 55000
    expect(rdVal).toBe(55000);
  });

  test('new row syncOriginal uses the newly stored tasa', async ({ page }) => {
    await loadApp(page);
    await openEditGastos(page);
    await page.click('#esection-esenciales button.row-add-btn');
    // New row index 1, tasaCreacion should be 61.5
    const rdInput = page.locator('#origRD-1');
    await rdInput.fill('61500');
    await rdInput.dispatchEvent('input');
    const usdInput = page.locator('#origUSD-1');
    const usdVal = parseFloat(await usdInput.inputValue());
    // 61500 / 61.5 = 1000
    expect(usdVal).toBe(1000);
  });

  test('table header includes Tasa Creación column', async ({ page }) => {
    await loadApp(page);
    await openEditGastos(page);
    const headers = page.locator('#esection-esenciales .edit-table thead th');
    const texts = await headers.allTextContents();
    const hasTasaCol = texts.some(t => t.includes('Tasa') && t.includes('Creación') || t.includes('Rate') && t.includes('Creation'));
    expect(hasTasaCol).toBe(true);
  });

  test('row without tasaCreacion shows empty (backward compat)', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.tasa = 61.5;
      // Old row without tasaCreacion field
      data.gastos = [
        { nombre: 'Old Debt', tipo: 'Préstamo', pagado: 0, adeudado: 10000, dia: 1, tasa: 5, balance: 50000, originalRD: 50000, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      ];
      data.forNow.cuentas = [{ nombre: 'C', moneda: 'RD', saldo: 100 }];
      data.emerg.fondos = [{ fondo: 'E', balance: 0, meta: 1000, moneda: 'RD' }];
      window._testLoadData(data);
    });
    await openEditGastos(page);
    const row = page.locator('#esencialesEditBody tr').first();
    const tasaCell = row.locator('input[readonly]');
    // No tasaCreacion → should show empty
    await expect(tasaCell).toHaveValue('');
  });

});
