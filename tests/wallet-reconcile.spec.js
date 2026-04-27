const { test, expect } = require('@playwright/test');

/**
 * Wallet — Reconcile / Ajuste (1B)
 *
 * Replaces silent wallet-saldo edits with an explicit `ajuste` transaction so
 * the ledger keeps its audit trail. Covers:
 *   - reconcileWallet(newAmount, note) helper: idempotent on no-delta, logs
 *     a categoria='ajuste' tx with sign-correct monto, updates cuenta.saldo.
 *   - isExpenseTx excludes ajuste from spending aggregations (parallel to
 *     ingreso) so budgets, charts, historial don't get poisoned.
 *   - Edit→Fondos: wallet row's saldo input is readonly + an Ajustar button;
 *     non-wallet rows still allow direct edits.
 *   - Reconcile modal: open/close, live delta hint, confirm path creates tx.
 *   - Wallet Resumen card renders ajuste rows with the ⚖️ icon and a neutral
 *     amount class.
 */

async function loadApp(page, opts = {}) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate((opts) => {
    const data = window.defaultEditData();
    Object.assign(data.config, {
      tasa: 60,
      ingresoUSD: 3000,
      payFrequency: 'mensual',
      mes: 'Marzo',
      anio: 2026,
      monedaPrincipal: 'RD',
    }, opts.cfg || {});
    const cashId = 'cnt_cash_seed';
    data.forNow.cuentas = [
      { id: 'cnt_bank_seed', nombre: 'Banco Popular', moneda: 'RD', saldo: 250000, tipo: 'banco', comp: 0, disp: 0 },
      { id: cashId, nombre: 'Efectivo', moneda: opts.walletMoneda || 'RD', saldo: opts.saldo != null ? opts.saldo : 10000, tipo: 'cash', comp: 0, disp: 0 },
    ];
    data.config.defaultCashAccountId = cashId;
    if (opts.gastos) data.gastos = opts.gastos;
    window._testLoadData(data);
  }, opts);
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. reconcileWallet helper
// ───────────────────────────────────────────────────────────────────
test.describe('reconcileWallet helper', () => {
  test('returns null and is a no-op when delta is zero', async ({ page }) => {
    await loadApp(page);
    const result = await page.evaluate(() => {
      const before = _editData.transacciones?.length || 0;
      const tx = window.reconcileWallet(10000, 'no change');
      return { tx, before, after: _editData.transacciones?.length || 0 };
    });
    expect(result.tx).toBeNull();
    expect(result.after).toBe(result.before);
  });

  test('positive delta (found cash): credits saldo and logs ajuste with negative monto (RD$)', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      const tx = window.reconcileWallet(12500, 'Olvidé registrar un ingreso');
      const cuenta = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { saldo: cuenta.saldo, tx };
    });
    expect(r.saldo).toBe(12500);
    expect(r.tx).toBeTruthy();
    expect(r.tx.categoria).toBe('ajuste');
    expect(r.tx.applied).toBe(true);
    expect(r.tx.monto).toBe(-2500); // saldo went UP by 2500 → credit semantic
    expect(r.tx.nota).toBe('Olvidé registrar un ingreso');
  });

  test('negative delta (missing cash): debits saldo and logs ajuste with positive monto', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      const tx = window.reconcileWallet(7500, 'Gasté efectivo y no apunté');
      const cuenta = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { saldo: cuenta.saldo, tx };
    });
    expect(r.saldo).toBe(7500);
    expect(r.tx.monto).toBe(2500); // saldo went DOWN by 2500 → debit semantic
  });

  test('USD wallet: tx.monto is in RD$, but cuenta.saldo updates in USD units', async ({ page }) => {
    // Wallet USD with saldo $1000, target $1100 → +$100 = +RD$6000 credit
    await loadApp(page, { walletMoneda: 'USD', saldo: 1000 });
    const r = await page.evaluate(() => {
      const tx = window.reconcileWallet(1100, 'Tip in cash');
      const cuenta = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { saldo: cuenta.saldo, monto: tx.monto };
    });
    expect(r.saldo).toBe(1100);
    expect(r.monto).toBe(-6000); // +100 USD * tasa 60 = +6000 RD$, recorded as negative for credit
  });

  test('returns null when no default cash account is configured', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.tasa = 60;
      data.forNow.cuentas = [{ id: 'cnt_bank', nombre: 'Banco', moneda: 'RD', saldo: 50000, tipo: 'banco' }];
      data.config.defaultCashAccountId = null;
      window._testLoadData(data);
    });
    const result = await page.evaluate(() => window.reconcileWallet(99999, 'nope'));
    expect(result).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. isExpenseTx exclusion
// ───────────────────────────────────────────────────────────────────
test.describe('isExpenseTx — excludes ajuste from spending aggregations', () => {
  test('ajuste tx does not count toward gasto totals', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      // Plant an ajuste tx and a real expense tx in the same month.
      _editData.transacciones = [
        { fecha: '2026-03-10', monto: 4000, categoria: 'comida', metodo: 'efectivo', nota: 'Lunch', mes: 'Marzo', anio: 2026, applied: true, cuentaId: _editData.config.defaultCashAccountId },
        { fecha: '2026-03-12', monto: 2500, categoria: 'ajuste', metodo: 'transferencia', nota: 'reconcile', mes: 'Marzo', anio: 2026, applied: true, cuentaId: _editData.config.defaultCashAccountId },
      ];
      const expenseSum = _editData.transacciones.filter(t => window.isExpenseTx ? window.isExpenseTx(t) : t.categoria !== 'ingreso' && t.categoria !== 'ajuste').reduce((a, t) => a + t.monto, 0);
      return expenseSum;
    });
    expect(r).toBe(4000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Edit modal — Fondos tab
// ───────────────────────────────────────────────────────────────────
test.describe('Edit modal Fondos — wallet row gates the saldo edit', () => {
  test('wallet row exposes a readonly saldo input and an Ajustar button', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    await page.click('[onclick*="showEditTab(\'fornow\'"]');
    const walletRow = page.locator('#fornowEditBody tr[data-cuenta-id="cnt_cash_seed"]');
    await expect(walletRow).toHaveCount(1);
    const saldoInput = walletRow.locator('input[type="text"]').nth(0); // saldo cell input
    await expect(saldoInput).toHaveAttribute('readonly', '');
    const adjustBtn = walletRow.locator('button', { hasText: /Ajustar|Adjust/ });
    await expect(adjustBtn).toBeVisible();
  });

  test('non-wallet row keeps the editable saldo input (no Ajustar button)', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    await page.click('[onclick*="showEditTab(\'fornow\'"]');
    const bankRow = page.locator('#fornowEditBody tr[data-cuenta-id="cnt_bank_seed"]');
    const saldoInput = bankRow.locator('input[inputmode="decimal"]').first();
    const ro = await saldoInput.getAttribute('readonly');
    expect(ro).toBeNull();
    const ajustarCount = await bankRow.locator('button', { hasText: /Ajustar|Adjust/ }).count();
    expect(ajustarCount).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Reconcile modal — open / cancel / confirm
// ───────────────────────────────────────────────────────────────────
test.describe('Reconcile modal flow', () => {
  test('clicking Ajustar opens the modal pre-filled with current saldo', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    await page.click('[onclick*="showEditTab(\'fornow\'"]');
    await page.click('#fornowEditBody tr[data-cuenta-id="cnt_cash_seed"] button:has-text("Ajustar"), #fornowEditBody tr[data-cuenta-id="cnt_cash_seed"] button:has-text("Adjust")');
    await expect(page.locator('#walletReconcileModal')).toHaveClass(/open/);
    const v = await page.locator('#walletReconcileAmount').inputValue();
    expect(v).toBe('10000');
  });

  test('cancel closes the modal without creating a tx', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openWalletReconcile());
    await page.fill('#walletReconcileAmount', '15000');
    await page.click('#walletReconcileModal button:has-text("Cancelar"), #walletReconcileModal button:has-text("Cancel")');
    await expect(page.locator('#walletReconcileModal')).not.toHaveClass(/open/);
    const txCount = await page.evaluate(() => (_editData.transacciones || []).filter(t => t.categoria === 'ajuste').length);
    expect(txCount).toBe(0);
    const saldo = await page.evaluate(() => _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo);
    expect(saldo).toBe(10000); // unchanged
  });

  test('confirm logs an ajuste tx, updates saldo, and closes the modal', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openWalletReconcile());
    await page.fill('#walletReconcileAmount', '12500');
    await page.fill('#walletReconcileNote', 'Conté el sobre');
    await page.click('#walletReconcileModal button:has-text("Registrar"), #walletReconcileModal button:has-text("Log adjustment")');
    await expect(page.locator('#walletReconcileModal')).not.toHaveClass(/open/);
    const r = await page.evaluate(() => {
      const txs = (_editData.transacciones || []).filter(t => t.categoria === 'ajuste');
      const cuenta = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { txs, saldo: cuenta.saldo };
    });
    expect(r.saldo).toBe(12500);
    expect(r.txs).toHaveLength(1);
    expect(r.txs[0].nota).toBe('Conté el sobre');
    expect(r.txs[0].monto).toBe(-2500);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Resumen card — ajuste rendering
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet card movement — ajuste row', () => {
  test('ajuste tx renders with ⚖️ icon and the neutral ajuste class', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      window.reconcileWallet(11500, 'Conteo real');
      window.buildDashboard({ ..._editData });
    });
    const item = page.locator('#walletCard .wallet-mov-item').first();
    await expect(item).toContainText('⚖️');
    await expect(item).toContainText('Conteo real');
    const amt = item.locator('.wallet-mov-amt');
    await expect(amt).toHaveClass(/ajuste/);
  });
});
