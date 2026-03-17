const { test, expect } = require('@playwright/test');

/**
 * Helper: load the app and inject data by simulating what processWorkbook does.
 * Sets _editData globally, calls buildDashboard, hides loader, shows dashboard.
 */
async function loadApp(page, overrides = {}) {
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');

  await page.evaluate((ov) => {
    // Build base data using the app's own defaultEditData()
    const data = window.defaultEditData();

    // Set sensible defaults so the dashboard renders without errors
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.ingresoRD = 180000;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.emerg.cashflow.ingreso = 180000;
    data.emerg.cashflow.gasto = 120000;
    data.emerg.cashflow.tasa = 60;

    // Apply overrides
    if (ov.cuentas) data.forNow.cuentas = ov.cuentas;
    if (ov.fondos) data.emerg.fondos = ov.fondos;
    if (ov.config) Object.assign(data.config, ov.config);
    if (ov.gastos) data.gastos = ov.gastos;

    // Recalculate forNow totals with currency conversion
    const tasa = data.config.tasa || 60;
    data.forNow.total = data.forNow.cuentas.reduce((a, c) => {
      const m = c.moneda === 'USD' ? tasa : 1;
      return a + (c.saldo || 0) * m;
    }, 0);
    data.forNow.comprometido = data.forNow.cuentas.reduce((a, c) => {
      const m = c.moneda === 'USD' ? tasa : 1;
      return a + (c.comp || 0) * m;
    }, 0);
    data.forNow.disponible = data.forNow.total - data.forNow.comprometido;

    // Use the test helper that properly sets the let-scoped _editData
    window._testLoadData(data);
  }, overrides);
}

/** Navigate to the ForNow (Disponibilidad) tab */
async function goToForNowTab(page) {
  const tabBtn = page.locator('.tab-btn', { hasText: /disponibilidad|fondos|availability/i });
  if (await tabBtn.count() > 0) {
    await tabBtn.first().click();
  } else {
    // Try mobile nav
    const mobileBtn = page.locator('.mnav-btn', { hasText: /fondos|disponib/i });
    if (await mobileBtn.count() > 0) await mobileBtn.first().click();
  }
  await expect(page.locator('#tab-fornow')).toBeVisible();
}

/** Open the edit modal */
async function openEdit(page) {
  await page.evaluate(() => window.openEditModal());
  await expect(page.locator('#editModal')).toHaveClass(/open/);
}

/** Navigate to the fornow edit section inside the modal */
async function goToForNowEditSection(page) {
  const tab = page.locator('.edit-tab', { hasText: /fondos|funds/i }).first();
  await tab.click();
  await expect(page.locator('#esection-fornow')).toHaveClass(/active/);
}

// ─────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────

test.describe('Account Currency - Dashboard Display', () => {
  test('RD$ account shows value in RD$ without USD badge or conversion hint', async ({ page }) => {
    await loadApp(page, {
      cuentas: [
        { nombre: 'Cuenta Corriente', moneda: 'RD', saldo: 50000, comp: 10000, disp: 40000 },
      ],
    });
    await goToForNowTab(page);

    const kpis = page.locator('#forNowKpis');
    await expect(kpis).toBeVisible();

    // Should show RD$ value
    await expect(kpis).toContainText('RD$50,000');

    // Should NOT have USD badge
    const html = await kpis.innerHTML();
    expect(html).not.toContain('>USD</span>');

    // Should NOT show conversion hint
    expect(html).not.toContain('≈RD$');
  });

  test('USD account shows value in USD with badge and RD$ conversion hint', async ({ page }) => {
    await loadApp(page, {
      cuentas: [
        { nombre: 'Savings USD', moneda: 'USD', saldo: 2000, comp: 500, disp: 1500 },
      ],
    });
    await goToForNowTab(page);

    const kpis = page.locator('#forNowKpis');
    await expect(kpis).toBeVisible();

    // Should show USD badge
    await expect(kpis.locator('span', { hasText: 'USD' }).first()).toBeVisible();

    // Should show value in USD
    await expect(kpis).toContainText('USD$2,000');

    // Should show RD$ conversion hint: 2000 * 60 = 120,000
    await expect(kpis).toContainText('≈RD$120,000');
  });

  test('mixed RD$ and USD accounts display correctly', async ({ page }) => {
    await loadApp(page, {
      cuentas: [
        { nombre: 'Corriente', moneda: 'RD', saldo: 80000, comp: 20000, disp: 60000 },
        { nombre: 'US Savings', moneda: 'USD', saldo: 1000, comp: 0, disp: 1000 },
      ],
    });
    await goToForNowTab(page);

    const kpis = page.locator('#forNowKpis');

    // First card: RD$ account
    const rdCard = kpis.locator('.card', { hasText: 'Corriente' });
    await expect(rdCard).toContainText('RD$80,000');

    // Second card: USD account
    const usdCard = kpis.locator('.card', { hasText: 'US Savings' });
    await expect(usdCard).toContainText('USD$1,000');
    await expect(usdCard).toContainText('≈RD$60,000');
  });

  test('detail view totals are calculated with currency conversion', async ({ page }) => {
    await loadApp(page, {
      cuentas: [
        { nombre: 'Corriente', moneda: 'RD', saldo: 100000, comp: 20000, disp: 80000 },
        { nombre: 'USD Account', moneda: 'USD', saldo: 1000, comp: 200, disp: 800 },
      ],
    });
    await goToForNowTab(page);

    const detail = page.locator('#forNowDetail');
    await expect(detail).toBeVisible();

    // Total: 100000 + (1000 * 60) = 160,000
    await expect(detail).toContainText('RD$160,000');

    // Committed: 20000 + (200 * 60) = 32,000
    await expect(detail).toContainText('RD$32,000');

    // Available: 160000 - 32000 = 128,000
    await expect(detail).toContainText('RD$128,000');
  });
});

test.describe('Account Currency - Edit Form', () => {
  test('edit table has Moneda column with currency selector', async ({ page }) => {
    await loadApp(page, {
      cuentas: [
        { nombre: 'Test Account', moneda: 'RD', saldo: 5000, comp: 0, disp: 5000 },
      ],
    });

    await openEdit(page);
    await goToForNowEditSection(page);

    // Table header should have Moneda column
    const header = page.locator('#esection-fornow thead');
    await expect(header).toContainText(/Moneda|Currency/);

    // Row should have a select with RD$ selected
    const select = page.locator('#fornowEditBody select').first();
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('RD');
  });

  test('can change account currency to USD in edit form', async ({ page }) => {
    await loadApp(page, {
      cuentas: [
        { nombre: 'My Account', moneda: 'RD', saldo: 5000, comp: 0, disp: 5000 },
      ],
    });

    await openEdit(page);
    await goToForNowEditSection(page);

    // Change currency to USD
    const select = page.locator('#fornowEditBody select').first();
    await select.selectOption('USD');
    await expect(select).toHaveValue('USD');
  });

  test('adding a new account row defaults to RD$ currency', async ({ page }) => {
    await loadApp(page, { cuentas: [] });

    await openEdit(page);
    await goToForNowEditSection(page);

    // Click add account button
    await page.locator('#esection-fornow .row-add-btn').click();

    // New row should have a currency selector defaulting to RD
    const select = page.locator('#fornowEditBody select').first();
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('RD');
  });

  test('USD account retains currency after edit form reload', async ({ page }) => {
    await loadApp(page, {
      cuentas: [
        { nombre: 'USD Acc', moneda: 'USD', saldo: 3000, comp: 0, disp: 3000 },
      ],
    });

    await openEdit(page);
    await goToForNowEditSection(page);

    // Verify currency is USD
    const select = page.locator('#fornowEditBody select').first();
    await expect(select).toHaveValue('USD');
  });
});

test.describe('Account Currency - Exchange Rate', () => {
  test('USD account conversion uses configured exchange rate', async ({ page }) => {
    await loadApp(page, {
      config: { tasa: 50 },
      cuentas: [
        { nombre: 'USD Acc', moneda: 'USD', saldo: 2000, comp: 0, disp: 2000 },
      ],
    });
    await goToForNowTab(page);

    const kpis = page.locator('#forNowKpis');
    // 2000 * 50 = 100,000
    await expect(kpis).toContainText('≈RD$100,000');

    const detail = page.locator('#forNowDetail');
    await expect(detail).toContainText('RD$100,000');
  });

  test('totals with custom exchange rate are correct', async ({ page }) => {
    await loadApp(page, {
      config: { tasa: 55 },
      cuentas: [
        { nombre: 'RD Acc', moneda: 'RD', saldo: 50000, comp: 0, disp: 50000 },
        { nombre: 'USD Acc', moneda: 'USD', saldo: 1000, comp: 0, disp: 1000 },
      ],
    });
    await goToForNowTab(page);

    const detail = page.locator('#forNowDetail');
    // Total: 50000 + (1000 * 55) = 105,000
    await expect(detail).toContainText('RD$105,000');
  });
});

test.describe('Account Currency - Edge Cases', () => {
  test('account with zero balance shows correctly', async ({ page }) => {
    await loadApp(page, {
      cuentas: [
        { nombre: 'Empty USD', moneda: 'USD', saldo: 0, comp: 0, disp: 0 },
      ],
    });
    await goToForNowTab(page);

    const kpis = page.locator('#forNowKpis');
    await expect(kpis).toContainText('USD$0');
  });

  test('account without moneda field defaults to RD$', async ({ page }) => {
    await loadApp(page, {
      cuentas: [
        { nombre: 'Old Account', saldo: 30000, comp: 5000, disp: 25000 },
      ],
    });
    await goToForNowTab(page);

    const kpis = page.locator('#forNowKpis');
    // Should display as RD$ (default)
    await expect(kpis).toContainText('RD$30,000');

    const html = await kpis.innerHTML();
    expect(html).not.toContain('>USD</span>');
  });

  test('no accounts shows no KPI cards', async ({ page }) => {
    await loadApp(page, { cuentas: [] });
    await goToForNowTab(page);

    const kpis = page.locator('#forNowKpis');
    await expect(kpis.locator('.card')).toHaveCount(0);
  });
});
