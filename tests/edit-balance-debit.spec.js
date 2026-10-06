const { test, expect } = require('@playwright/test');

/**
 * Edit → Gastos y deudas: balance decrease asks which funds to debit.
 *
 * When a debt's balance is lowered in the Edit modal, saving opens a prompt
 * "¿De dónde salió el pago?" listing every cuenta plus two extra options:
 *   - a cuenta        → credits pagado, debits that cuenta, logs a pago_deuda tx
 *   - No descontar    → credits pagado only
 *   - No fue un pago  → nothing (balance correction)
 * Decisions apply only after every prompt is answered; "Volver a editar"
 * aborts the save with no saldo touched.
 *
 * Sub-suites:
 *   1. applyBalanceDebit helper
 *   2. Prompt flow through applyChanges
 *   3. Cancel / multi-debt queue
 *   4. Ledger integration (pago_deuda excluded from spending, reversible)
 *   5. i18n
 */

async function loadApp(page) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(() => {
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
    data.config.defaultCashAccountId = 'cnt_cash';
    data.gastos = [
      { nombre: 'Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 3000, dia: 20, tasa: 28, balance: 30000, originalRD: 50000, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false },
      { nombre: 'Préstamo', tipo: 'Préstamo', pagado: 0, adeudado: 4000, dia: 15, tasa: 18, balance: 48000, originalRD: 80000, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false, metodo: 'efectivo' },
    ];
    window._testLoadData(data);
  });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

async function openEdit(page) {
  await page.evaluate(() => window.openEditModal());
  await expect(page.locator('#editModal')).toHaveClass(/open/);
}

const saldo = (page, id) => page.evaluate(id => _editData.forNow.cuentas.find(c => c.id === id).saldo, id);

// ───────────────────────────────────────────────────────────────────
// 1. Helper
// ───────────────────────────────────────────────────────────────────
test.describe('applyBalanceDebit', () => {
  test('cuenta choice debits saldo, credits pagado, logs pago_deuda tx', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      const tx = window.applyBalanceDebit(0, 3000, 'cnt_bank');
      return { tx, g: _editData.gastos[0] };
    });
    expect(await saldo(page, 'cnt_bank')).toBe(47000);
    expect(r.g.pagado).toBe(3000);
    expect(r.g.pagadoMes).toBe(true);
    expect(r.tx).toMatchObject({ monto: 3000, categoria: 'pago_deuda', cuentaId: 'cnt_bank', applied: true, nota: 'Visa' });
  });

  test('USD cuenta is debited in its own currency', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.applyBalanceDebit(0, 6000, 'cnt_usd'));
    expect(await saldo(page, 'cnt_usd')).toBe(900); // 6000 / 60
  });

  test('"ninguna" credits pagado without touching any saldo', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => ({ tx: window.applyBalanceDebit(0, 3000, 'ninguna'), g: _editData.gastos[0], n: (_editData.transacciones || []).length }));
    expect(r.tx).toBeNull();
    expect(r.g.pagado).toBe(3000);
    expect(r.n).toBe(0);
    expect(await saldo(page, 'cnt_bank')).toBe(50000);
  });

  test('"correccion" changes nothing', async ({ page }) => {
    await loadApp(page);
    const g = await page.evaluate(() => { window.applyBalanceDebit(0, 3000, 'correccion'); return _editData.gastos[0]; });
    expect(g.pagado).toBe(0);
    expect(await saldo(page, 'cnt_bank')).toBe(50000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Prompt flow
// ───────────────────────────────────────────────────────────────────
test.describe('Prompt on save', () => {
  test('no balance decrease → saves without prompting', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.evaluate(() => { _editData.gastos[0].balance = 35000; applyChanges(); });
    await expect(page.locator('#balanceDebitModal')).not.toHaveClass(/open/);
    await expect(page.locator('#editModal')).not.toHaveClass(/open/);
  });

  test('lists every cuenta plus the two extra options, with amount', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.evaluate(() => { _editData.gastos[0].balance = 27000; applyChanges(); });
    await expect(page.locator('#balanceDebitModal')).toHaveClass(/open/);
    await expect(page.locator('#balanceDebitSub')).toContainText('Visa');
    await expect(page.locator('#balanceDebitSub')).toContainText('3,000');
    const values = await page.locator('#balanceDebitOptions input').evaluateAll(els => els.map(e => e.value));
    expect(values).toEqual(['cnt_bank', 'cnt_usd', 'cnt_cash', 'ninguna', 'correccion']);
  });

  test('picking a cuenta and continuing debits it and closes the editor', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.evaluate(() => { _editData.gastos[0].balance = 27000; applyChanges(); });
    await page.locator('#balanceDebitOptions input[value="cnt_bank"]').check();
    await page.locator('#balanceDebitModal .btn-primary').click();
    await expect(page.locator('#balanceDebitModal')).not.toHaveClass(/open/);
    await expect(page.locator('#editModal')).not.toHaveClass(/open/);
    expect(await saldo(page, 'cnt_bank')).toBe(47000);
  });

  test('cash-paid debt preselects the wallet', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.evaluate(() => { _editData.gastos[1].balance = 47000; applyChanges(); });
    await expect(page.locator('#balanceDebitOptions input[value="cnt_cash"]')).toBeChecked();
  });

  test('warns when the chosen cuenta cannot cover the payment', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.evaluate(() => { _editData.gastos[0].balance = 25000; applyChanges(); });
    await expect(page.locator('#balanceDebitWarn')).toBeHidden();
    await page.locator('#balanceDebitOptions input[value="cnt_cash"]').check();
    await expect(page.locator('#balanceDebitWarn')).toBeVisible();
    await expect(page.locator('#balanceDebitWarn')).toContainText('Efectivo');
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Cancel / queue
// ───────────────────────────────────────────────────────────────────
test.describe('Cancel and multiple debts', () => {
  test('"Volver a editar" aborts the save and touches nothing', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.evaluate(() => { _editData.gastos[0].balance = 27000; _editData.gastos[1].balance = 44000; applyChanges(); });
    await page.locator('#balanceDebitModal .btn-primary').click(); // answer the first
    await page.locator('#balanceDebitModal .btn-ghost').click();   // cancel on the second
    await expect(page.locator('#balanceDebitModal')).not.toHaveClass(/open/);
    await expect(page.locator('#editModal')).toHaveClass(/open/);
    expect(await saldo(page, 'cnt_bank')).toBe(50000);
    expect(await page.evaluate(() => _editData.gastos[0].pagado)).toBe(0);
  });

  test('re-saving after cancel prompts again', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.evaluate(() => { _editData.gastos[0].balance = 27000; applyChanges(); });
    await page.locator('#balanceDebitModal .btn-ghost').click();
    await page.evaluate(() => applyChanges());
    await expect(page.locator('#balanceDebitModal')).toHaveClass(/open/);
  });

  test('asks once per debt and applies each choice', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.evaluate(() => { _editData.gastos[0].balance = 27000; _editData.gastos[1].balance = 44000; applyChanges(); });
    await expect(page.locator('#balanceDebitSub')).toContainText('Visa');
    await page.locator('#balanceDebitOptions input[value="cnt_bank"]').check();
    await page.locator('#balanceDebitModal .btn-primary').click();
    await expect(page.locator('#balanceDebitSub')).toContainText('Préstamo');
    await page.locator('#balanceDebitOptions input[value="cnt_usd"]').check();
    await page.locator('#balanceDebitModal .btn-primary').click();
    expect(await saldo(page, 'cnt_bank')).toBe(47000);
    expect(await saldo(page, 'cnt_usd')).toBeCloseTo(1000 - 4000 / 60, 5);
  });

  test('Escape on the prompt cancels it but keeps the editor open', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.evaluate(() => { _editData.gastos[0].balance = 27000; applyChanges(); });
    await page.keyboard.press('Escape');
    await expect(page.locator('#balanceDebitModal')).not.toHaveClass(/open/);
    await expect(page.locator('#editModal')).toHaveClass(/open/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Ledger
// ───────────────────────────────────────────────────────────────────
test.describe('pago_deuda ledger entry', () => {
  test('is not counted as spending', async ({ page }) => {
    await loadApp(page);
    const isExp = await page.evaluate(() => window.isExpenseTx(window.applyBalanceDebit(0, 3000, 'cnt_bank')));
    expect(isExp).toBe(false);
  });

  test('reversing the tx restores the cuenta saldo', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.reverseCashDebit(window.applyBalanceDebit(0, 3000, 'cnt_bank')));
    expect(await saldo(page, 'cnt_bank')).toBe(50000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('i18n', () => {
  test('English labels', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window._testSetLang('en'));
    await openEdit(page);
    await page.evaluate(() => { _editData.gastos[0].balance = 27000; applyChanges(); });
    await expect(page.locator('#balanceDebitTitle')).toHaveText('Where did the payment come from?');
    await expect(page.locator('#balanceDebitSub')).toContainText('decreased by');
    await expect(page.locator('#balanceDebitOptions')).toContainText('It wasn’t a payment');
  });
});
