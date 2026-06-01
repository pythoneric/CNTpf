const { test, expect } = require('@playwright/test');

// Exchange rate inputs in the edit modal — #cfg-tasa (Settings/Config) and
// #cf-tasa (Emergency · Monthly Cashflow) — must stay in lockstep because they
// describe the same monthly RD$/USD rate. Editing either one must update both
// underlying stores (_editData.config.tasa, _editData.emerg.cashflow.tasa) and
// the sibling input. A divergent state at load must be normalized.

let _dialogAction = 'accept';

async function loadApp(page, opts = {}) {
  page.on('dialog', dialog => {
    if (_dialogAction === 'dismiss') dialog.dismiss();
    else dialog.accept();
  });
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate((o) => {
    const data = window.defaultEditData();
    data.config.tasa = o.configTasa;
    data.config.ingresoUSD = 1000;
    data.config.ingresoRD = data.config.tasa * 1000;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.emerg.cashflow.ingreso = data.config.ingresoRD;
    data.emerg.cashflow.gasto = 30000;
    data.emerg.cashflow.tasa = o.cashflowTasa;
    window._testLoadData(data);
  }, { configTasa: opts.configTasa ?? 58, cashflowTasa: opts.cashflowTasa ?? 58 });
}

async function openEdit(page) {
  await page.evaluate(() => window.openEditModal());
  await expect(page.locator('#editModal')).toHaveClass(/open/);
}

async function typeRate(page, selector, value) {
  // Switch to the section that owns the input so it's visible for click/fill.
  const tab = selector === '#cf-tasa' ? 'emergency' : 'config';
  await page.evaluate((t) => window.showEditTab(t), tab);
  const input = page.locator(selector);
  await input.click();
  await input.fill(String(value));
  await input.dispatchEvent('input');
}

test.describe('Exchange rate sync — edit modal', () => {
  test('both inputs render the same value on open', async ({ page }) => {
    await loadApp(page, { configTasa: 62.5, cashflowTasa: 62.5 });
    await openEdit(page);
    const cfg = await page.locator('#cfg-tasa').inputValue();
    const cf = await page.locator('#cf-tasa').inputValue();
    expect(cfg).toBe(cf);
    expect(cfg).toBe('62.5');
  });

  test('pre-existing divergence is healed on open (cashflow.tasa snaps to config.tasa)', async ({ page }) => {
    await loadApp(page, { configTasa: 61.5, cashflowTasa: 58 });
    await openEdit(page);
    const cfg = await page.locator('#cfg-tasa').inputValue();
    const cf = await page.locator('#cf-tasa').inputValue();
    expect(cfg).toBe('61.5');
    expect(cf).toBe('61.5');
    expect(await page.evaluate(() => _editData.config.tasa)).toBe(61.5);
    expect(await page.evaluate(() => _editData.emerg.cashflow.tasa)).toBe(61.5);
  });

  test('editing Settings tasa updates Cashflow tasa input and store', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await typeRate(page, '#cfg-tasa', '63.25');
    await expect(page.locator('#cf-tasa')).toHaveValue('63.25');
    expect(await page.evaluate(() => _editData.config.tasa)).toBe(63.25);
    expect(await page.evaluate(() => _editData.emerg.cashflow.tasa)).toBe(63.25);
  });

  test('editing Cashflow tasa updates Settings tasa input and store', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await typeRate(page, '#cf-tasa', '59.75');
    await expect(page.locator('#cfg-tasa')).toHaveValue('59.75');
    expect(await page.evaluate(() => _editData.config.tasa)).toBe(59.75);
    expect(await page.evaluate(() => _editData.emerg.cashflow.tasa)).toBe(59.75);
  });

  test('round-trip across both inputs keeps every exchange rate setting equal', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);

    await typeRate(page, '#cfg-tasa', '60.5');
    await typeRate(page, '#cf-tasa', '64');
    await typeRate(page, '#cfg-tasa', '61');

    const cfg = await page.locator('#cfg-tasa').inputValue();
    const cf = await page.locator('#cf-tasa').inputValue();
    const configTasa = await page.evaluate(() => _editData.config.tasa);
    const cashflowTasa = await page.evaluate(() => _editData.emerg.cashflow.tasa);

    // All four observations of "the exchange rate" in edit must agree
    expect(new Set([cfg, cf, String(configTasa), String(cashflowTasa)]).size).toBe(1);
    expect(configTasa).toBe(61);
  });

  test('blank / sub-1 input clamps to default 60 on both inputs', async ({ page }) => {
    await loadApp(page, { configTasa: 58, cashflowTasa: 58 });
    await openEdit(page);
    await typeRate(page, '#cf-tasa', '');
    await expect(page.locator('#cfg-tasa')).toHaveValue('60');
    expect(await page.evaluate(() => _editData.config.tasa)).toBe(60);
    expect(await page.evaluate(() => _editData.emerg.cashflow.tasa)).toBe(60);
  });
});
