const { test, expect } = require('@playwright/test');

/**
 * Alertas y Pagos: pending → paid always asks which account paid it.
 *
 * Every unpaid → paid tick (whatever the gasto's `metodo`) opens the
 * "¿Cómo pagaste?" prompt with a "Pagar desde" list of every cuenta, the
 * default cuenta always preselected, plus "Tarjeta de crédito" (when cards
 * exist) and "Solo marcar como pagado".
 *
 * Sub-suites:
 *   1. Prompt always opens, default cuenta preselected
 *   2. Paying from each kind of cuenta (RD, USD, default, non-default)
 *   3. Uncheck refunds the cuenta that paid
 *   4. Insufficient-funds warning
 *   5. Real checkbox click in the Alertas y Pagos checklist
 *   6. i18n
 */

async function loadApp(page, opts = {}) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(({ withDefault }) => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.payFrequency = 'mensual';
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.config.monedaPrincipal = 'RD';
    data.forNow.cuentas = [
      { id: 'cnt_bank', nombre: 'Banco', moneda: 'RD', saldo: 50000, tipo: 'banco', comp: 0, disp: 50000 },
      { id: 'cnt_usd', nombre: 'Ahorro USD', moneda: 'USD', saldo: 1000, tipo: 'banco', comp: 0, disp: 1000 },
      { id: 'cnt_cash', nombre: 'Efectivo', moneda: 'RD', saldo: 2000, tipo: 'cash', comp: 0, disp: 2000 },
    ];
    if (withDefault) data.config.defaultCashAccountId = 'cnt_cash';
    data.gastos = [
      { nombre: 'Internet', tipo: 'Servicio', pagado: 0, adeudado: 1500, dia: 5, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false, metodo: 'transferencia' },
      { nombre: 'Renta', tipo: 'Fijo', pagado: 0, adeudado: 6000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false, metodo: 'efectivo' },
      { nombre: 'Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 1200, dia: 20, tasa: 28, balance: 30000, originalRD: 50000, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false, metodo: 'tarjeta' },
    ];
    window._testLoadData(data);
  }, { withDefault: opts.withDefault !== false });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

const saldo = (page, id) => page.evaluate(id => _editData.forNow.cuentas.find(c => c.id === id).saldo, id);
const radios = page => page.locator('#paymentMethodOptions input[name="paymethod"]');

async function payFrom(page, idx, value) {
  await page.evaluate(i => toggleCheck(i), idx);
  await expect(page.locator('#paymentMethodModal')).toHaveClass(/open/);
  if (value) await page.locator(`#paymentMethodOptions input[value="${value}"]`).check();
  await page.locator('#paymentMethodModal .btn-primary').click();
  await expect(page.locator('#paymentMethodModal')).not.toHaveClass(/open/);
}

// ───────────────────────────────────────────────────────────────────
// 1. Always asks, default preselected
// ───────────────────────────────────────────────────────────────────
test.describe('Prompt always opens with the default cuenta preselected', () => {
  for (const [idx, metodo] of [[0, 'transferencia'], [1, 'efectivo'], [2, 'tarjeta']]) {
    test(`metodo=${metodo} still asks`, async ({ page }) => {
      await loadApp(page);
      await page.evaluate(i => toggleCheck(i), idx);
      await expect(page.locator('#paymentMethodModal')).toHaveClass(/open/);
      await expect(page.locator('#paymentMethodOptions input[value="cnt_cash"]')).toBeChecked();
      expect(await page.evaluate(i => _editData.gastos[i].pagadoMes, idx)).toBe(false);
    });
  }

  test('lists every cuenta, then credit card, then "just mark as paid"', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => toggleCheck(0));
    expect(await radios(page).evaluateAll(rs => rs.map(r => r.value)))
      .toEqual(['cnt_bank', 'cnt_usd', 'cnt_cash', 'tarjeta', 'transferencia']);
    await expect(page.locator('#paymentMethodOptions')).toContainText('Predeterminada');
    await expect(page.locator('#paymentMethodOptions')).toContainText('RD$50,000');
    await expect(page.locator('#paymentMethodOptions')).toContainText('US$1,000');
  });

  test('changing the default cuenta changes the preselection', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => { _editData.config.defaultCashAccountId = 'cnt_bank'; toggleCheck(0); });
    await expect(page.locator('#paymentMethodOptions input[value="cnt_bank"]')).toBeChecked();
  });

  test('no default cuenta → "just mark as paid" is preselected', async ({ page }) => {
    await loadApp(page, { withDefault: false });
    await page.evaluate(() => toggleCheck(0));
    await expect(page.locator('#paymentMethodOptions input[value="transferencia"]')).toBeChecked();
    await expect(page.locator('#paymentMethodOptions')).not.toContainText('Predeterminada');
  });

  test('re-opening after picking another cuenta goes back to the default', async ({ page }) => {
    await loadApp(page);
    await payFrom(page, 0, 'cnt_bank');
    await page.evaluate(() => toggleCheck(1));
    await expect(page.locator('#paymentMethodOptions input[value="cnt_cash"]')).toBeChecked();
  });

  test('cancel leaves the gasto unpaid and every saldo untouched', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => toggleCheck(0));
    await page.locator('#paymentMethodModal .btn-ghost').click();
    expect(await page.evaluate(() => _editData.gastos[0].pagadoMes)).toBe(false);
    expect(await saldo(page, 'cnt_cash')).toBe(2000);
    expect(await saldo(page, 'cnt_bank')).toBe(50000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Paying from a cuenta
// ───────────────────────────────────────────────────────────────────
test.describe('Paying from a cuenta', () => {
  test('confirming the preselection debits the default cuenta', async ({ page }) => {
    await loadApp(page);
    await payFrom(page, 0);
    expect(await saldo(page, 'cnt_cash')).toBe(500);
    const g = await page.evaluate(() => _editData.gastos[0]);
    expect(g).toMatchObject({ pagadoMes: true, pagado: 1500, pagadoApplied: true, pagadoMethod: 'cuenta', pagadoCuentaId: 'cnt_cash', pagadoAppliedAmt: 1500 });
  });

  test('a non-default RD cuenta is debited instead of the wallet', async ({ page }) => {
    await loadApp(page);
    await payFrom(page, 1, 'cnt_bank');
    expect(await saldo(page, 'cnt_bank')).toBe(44000);
    expect(await saldo(page, 'cnt_cash')).toBe(2000);
  });

  test('a USD cuenta is debited in USD', async ({ page }) => {
    await loadApp(page);
    await payFrom(page, 1, 'cnt_usd');
    expect(await saldo(page, 'cnt_usd')).toBe(900); // 6000 / 60
  });

  test('"just mark as paid" touches no saldo', async ({ page }) => {
    await loadApp(page);
    await payFrom(page, 0, 'transferencia');
    expect(await saldo(page, 'cnt_cash')).toBe(2000);
    expect(await page.evaluate(() => _editData.gastos[0].pagadoMes)).toBe(true);
  });

  test('credit card still charges the chosen card', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => toggleCheck(0));
    await page.locator('#paymentMethodOptions input[value="tarjeta"]').check();
    await expect(page.locator('#paymentMethodCardWrap')).toBeVisible();
    await page.locator('#paymentMethodModal .btn-primary').click();
    expect(await page.evaluate(() => _editData.gastos[2].balance)).toBe(31500);
    expect(await saldo(page, 'cnt_cash')).toBe(2000);
  });

  test('the payment is persisted to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await payFrom(page, 1, 'cnt_bank');
    await page.waitForFunction(async () => {
      const d = await window.dbGet('dashboard_data', 'editData');
      return d && d.forNow.cuentas.find(c => c.id === 'cnt_bank').saldo === 44000;
    }, null, { timeout: 5000 });
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Uncheck
// ───────────────────────────────────────────────────────────────────
test.describe('Unchecking refunds the cuenta that paid', () => {
  test('non-default cuenta gets its money back, no prompt', async ({ page }) => {
    await loadApp(page);
    await payFrom(page, 1, 'cnt_bank');
    await page.evaluate(() => toggleCheck(1));
    await expect(page.locator('#paymentMethodModal')).not.toHaveClass(/open/);
    expect(await saldo(page, 'cnt_bank')).toBe(50000);
    const g = await page.evaluate(() => _editData.gastos[1]);
    expect(g.pagadoMes).toBe(false);
    expect(g.pagadoApplied).toBe(false);
    expect(g.pagadoCuentaId).toBeUndefined();
  });

  test('USD cuenta refund uses the amount actually debited', async ({ page }) => {
    await loadApp(page);
    await payFrom(page, 1, 'cnt_usd');
    await page.evaluate(() => { _editData.config.tasa = 65; toggleCheck(1); });
    expect(await saldo(page, 'cnt_usd')).toBe(1000);
  });

  test('resetChecklist refunds every cuenta', async ({ page }) => {
    await loadApp(page);
    await payFrom(page, 0);
    await payFrom(page, 1, 'cnt_bank');
    await page.evaluate(() => resetChecklist());
    expect(await saldo(page, 'cnt_cash')).toBe(2000);
    expect(await saldo(page, 'cnt_bank')).toBe(50000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Insufficient funds
// ───────────────────────────────────────────────────────────────────
test.describe('Insufficient-funds warning', () => {
  test('warns for a cuenta that cannot cover it, but still allows paying', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => toggleCheck(1)); // Renta 6000, default Efectivo has 2000
    await expect(page.locator('#paymentMethodWarn')).toBeVisible();
    await expect(page.locator('#paymentMethodWarn')).toContainText('Efectivo');
    await page.locator('#paymentMethodOptions input[value="cnt_bank"]').check();
    await expect(page.locator('#paymentMethodWarn')).toBeHidden();
    await page.locator('#paymentMethodOptions input[value="cnt_cash"]').check();
    await page.locator('#paymentMethodModal .btn-primary').click();
    expect(await saldo(page, 'cnt_cash')).toBe(-4000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Real UI click in the checklist
// ───────────────────────────────────────────────────────────────────
test.describe('Alertas y Pagos checklist click', () => {
  test('ticking a pending row opens the prompt with the default preselected', async ({ page }) => {
    await loadApp(page);
    const row = page.locator('[onclick*="toggleCheck(0)"]').first();
    await expect(row).toHaveCount(1);
    await row.evaluate(el => el.click());
    await expect(page.locator('#paymentMethodModal')).toHaveClass(/open/);
    await expect(page.locator('#paymentMethodOptions input[value="cnt_cash"]')).toBeChecked();
    await expect(page.locator('#paymentMethodSub')).toContainText('Internet');
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('i18n', () => {
  test('English labels', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window._testSetLang('en'));
    await page.evaluate(() => toggleCheck(1));
    await expect(page.locator('#paymentMethodModal [data-i18n="paymethod_label"]')).toHaveText('Pay from');
    await expect(page.locator('#paymentMethodOptions')).toContainText('Default');
    await expect(page.locator('#paymentMethodOptions')).toContainText('Just mark as paid');
    await expect(page.locator('#paymentMethodWarn')).toContainText('it will go negative');
  });
});
