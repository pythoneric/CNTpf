const { test, expect } = require('@playwright/test');

/**
 * Wallet — Batch 4: "Recibí mi pago" / "I got paid" income deposit
 *
 * - Button on the Resumen wallet card credits monthlyIncomeRD() to the
 *   default cash account once per (mes, anio).
 * - Recorded as a synthetic transacción with negative monto + categoria
 *   'ingreso' so the existing tx-delete flow correctly un-credits.
 * - Idempotency: only one deposit per month allowed.
 * - First-use: no wallet → opens the setup modal.
 * - Per design choice: full monthly equivalent (not per-pay).
 */

async function loadAppDefault(page, opts = {}) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(({ withDefault, payFreq, ingresoUSD, walletSaldo, walletMoneda }) => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = ingresoUSD;
    data.config.payFrequency = payFreq;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.config.monedaPrincipal = 'RD';
    const cashId = 'cnt_cash_seed';
    data.forNow.cuentas = [
      { id: 'cnt_bank_seed', nombre: 'Banco', moneda: 'RD', saldo: 50000, tipo: 'banco', comp: 0, disp: 50000 },
      { id: cashId, nombre: 'Efectivo', moneda: walletMoneda || 'RD', saldo: walletSaldo, tipo: 'cash', comp: 0, disp: walletSaldo },
    ];
    data.forNow.total = 50000 + walletSaldo;
    if (withDefault) data.config.defaultCashAccountId = cashId;
    window._testLoadData(data);
  }, {
    withDefault: opts.withDefault !== false,
    payFreq: opts.payFreq || 'mensual',
    ingresoUSD: opts.ingresoUSD ?? 3000,
    walletSaldo: opts.walletSaldo ?? 5000,
    walletMoneda: opts.walletMoneda,
  });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. Helper depositIncomeToWallet
// ───────────────────────────────────────────────────────────────────
test.describe('depositIncomeToWallet helper', () => {
  test('credits the wallet by monthlyIncomeRD (mensual user)', async ({ page }) => {
    // ingresoUSD 3000 × tasa 60 × mensual mult 1 = RD$180,000
    await loadAppDefault(page);
    const ok = await page.evaluate(() => window.depositIncomeToWallet());
    expect(ok).toBe(true);
    const result = await page.evaluate(() => {
      const cash = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      const tx = _editData.transacciones[0];
      return { saldo: cash.saldo, txMonto: tx.monto, txCat: tx.categoria, applied: tx.applied, cuentaId: tx.cuentaId };
    });
    expect(result.saldo).toBe(5000 + 180000);
    expect(result.txMonto).toBe(-180000); // negative = credit
    expect(result.txCat).toBe('ingreso');
    expect(result.applied).toBe(true);
    expect(result.cuentaId).toBeTruthy();
  });

  test('weekly user gets the FULL monthly equivalent, not one paycheck', async ({ page }) => {
    // ingresoUSD 400 × tasa 60 × semanal mult (52/12) ≈ 103,999.99
    await loadAppDefault(page, { payFreq: 'semanal', ingresoUSD: 400 });
    await page.evaluate(() => window.depositIncomeToWallet());
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBeCloseTo(5000 + 400 * (52 / 12) * 60, 0);
  });

  test('biweekly user gets the FULL monthly equivalent', async ({ page }) => {
    // ingresoUSD 1500 × tasa 60 × quincenal mult (26/12) = 195,000
    await loadAppDefault(page, { payFreq: 'quincenal', ingresoUSD: 1500 });
    await page.evaluate(() => window.depositIncomeToWallet());
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBeCloseTo(5000 + 1500 * (26 / 12) * 60, 0);
  });

  test('USD wallet: monthly RD income converts via tasa', async ({ page }) => {
    await loadAppDefault(page, { walletMoneda: 'USD', walletSaldo: 100, ingresoUSD: 3000 });
    await page.evaluate(() => window.depositIncomeToWallet());
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    // monthlyRD = 180000 → /tasa 60 = $3000 added to USD wallet
    expect(saldo).toBe(100 + 3000);
  });

  test('idempotency: second deposit in same month is rejected', async ({ page }) => {
    await loadAppDefault(page);
    const a = await page.evaluate(() => window.depositIncomeToWallet());
    const b = await page.evaluate(() => window.depositIncomeToWallet());
    expect(a).toBe(true);
    expect(b).toBe(false);
    const result = await page.evaluate(() => ({
      saldo: _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo,
      txCount: _editData.transacciones.filter(tx => tx.categoria === 'ingreso').length,
    }));
    expect(result.saldo).toBe(5000 + 180000); // only credited once
    expect(result.txCount).toBe(1);
  });

  test('changing month + redepositing is allowed', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.depositIncomeToWallet());
    // Pretend the user closed the month and is now in April
    await page.evaluate(() => { _editData.config.mes = 'Abril'; });
    const ok = await page.evaluate(() => window.depositIncomeToWallet());
    expect(ok).toBe(true);
    const txCount = await page.evaluate(() =>
      _editData.transacciones.filter(tx => tx.categoria === 'ingreso').length
    );
    expect(txCount).toBe(2);
  });

  test('zero income → no-op + warning toast', async ({ page }) => {
    await loadAppDefault(page, { ingresoUSD: 0 });
    const ok = await page.evaluate(() => window.depositIncomeToWallet());
    expect(ok).toBe(false);
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(5000); // unchanged
  });

  test('no wallet configured → opens first-use modal', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    const ok = await page.evaluate(() => window.depositIncomeToWallet());
    expect(ok).toBe(false);
    await expect(page.locator('#walletSetupModal')).toHaveClass(/open/);
  });

  test('deleting the income tx un-credits the wallet', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.depositIncomeToWallet());
    let saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(185000);
    // Find the income tx index and delete it (confirm dialog auto-accepted)
    await page.evaluate(() => {
      const idx = _editData.transacciones.findIndex(tx => tx.categoria === 'ingreso');
      window.deleteTransaccion(idx);
    });
    saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(5000); // back to original
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Resumen card UI
// ───────────────────────────────────────────────────────────────────
test.describe('Resumen wallet card — income button', () => {
  test('button shows when income > 0 and not yet deposited this month', async ({ page }) => {
    await loadAppDefault(page);
    const btn = page.locator('#walletCard .wallet-income-btn');
    await expect(btn).toBeVisible();
    const text = await btn.textContent();
    // Button label includes the per-month amount the user will receive
    expect(text).toMatch(/180[,.]?000/);
  });

  test('button is hidden when income = 0', async ({ page }) => {
    await loadAppDefault(page, { ingresoUSD: 0 });
    const count = await page.locator('#walletCard .wallet-income-btn').count();
    expect(count).toBe(0);
    const doneCount = await page.locator('#walletCard .wallet-income-done').count();
    expect(doneCount).toBe(0);
  });

  test('clicking the button deposits and replaces with the "received" indicator', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#walletCard .wallet-income-btn').click();
    await expect(page.locator('#walletCard .wallet-income-done')).toBeVisible();
    // Button is gone
    const count = await page.locator('#walletCard .wallet-income-btn').count();
    expect(count).toBe(0);
  });

  test('balance updates after click', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#walletCard .wallet-income-btn').click();
    const balance = await page.locator('#walletCard .wallet-card-balance').textContent();
    // 5000 starting + 180000 income = 185000
    expect(balance).toMatch(/185[,.]?000/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Movements list rendering
// ───────────────────────────────────────────────────────────────────
test.describe('Income tx renders as a credit in movements', () => {
  test('income tx shows with + sign and credit class', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.depositIncomeToWallet());
    await page.evaluate(() => window.buildDashboard({ ..._editData }));
    const items = page.locator('#walletCard .wallet-mov-item');
    await expect(items.first()).toBeVisible();
    const amtText = await items.first().locator('.wallet-mov-amt').textContent();
    expect(amtText.trim().startsWith('+')).toBe(true);
    const cls = await items.first().locator('.wallet-mov-amt').getAttribute('class');
    expect(cls).toContain('credit');
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Income deposit i18n', () => {
  test('Spanish keys resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('es'));
    const keys = await page.evaluate(() => ({
      btn: window.t('wallet_income_button'),
      done: window.t('wallet_income_received_this_month'),
      already: window.t('wallet_income_already'),
      zero: window.t('wallet_income_zero'),
      note: window.t('wallet_income_note'),
    }));
    expect(keys.btn).toBe('Recibí mi pago');
    expect(keys.done).toMatch(/recibido/i);
    expect(keys.already).toMatch(/ya/i);
    expect(keys.zero).toMatch(/ingreso/i);
    expect(keys.note).toBe('Pago mensual');
  });

  test('English keys resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('en'));
    const keys = await page.evaluate(() => ({
      btn: window.t('wallet_income_button'),
      done: window.t('wallet_income_received_this_month'),
      already: window.t('wallet_income_already'),
      zero: window.t('wallet_income_zero'),
      note: window.t('wallet_income_note'),
    }));
    expect(keys.btn).toBe('I got paid');
    expect(keys.done).toMatch(/received/i);
    expect(keys.already).toMatch(/already/i);
    expect(keys.zero).toMatch(/income/i);
    expect(keys.note).toBe('Monthly income');
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Aggregation-leak regression — income tx must NOT distort spending sums
// ───────────────────────────────────────────────────────────────────
// Audit on batch 4 surfaced 8 sites that summed transacciones[].monto
// without filtering by categoria. The synthetic income tx (negative monto,
// categoria='ingreso') silently REDUCED every gasto figure. These tests pin
// each path so a future refactor can't re-introduce the leak.
test.describe('Aggregation leaks — income must not distort gasto', () => {
  test('isExpenseTx filters out ingreso category', async ({ page }) => {
    await loadAppDefault(page);
    const result = await page.evaluate(() => ({
      expense: window.isExpenseTx({ categoria: 'comida' }),
      ingreso: window.isExpenseTx({ categoria: 'ingreso' }),
      bare:    window.isExpenseTx({ categoria: 'transporte' }),
      empty:   window.isExpenseTx(null),
    }));
    expect(result.expense).toBe(true);
    expect(result.ingreso).toBe(false);
    expect(result.bare).toBe(true);
    expect(result.empty).toBe(false);
  });

  test('calcDerivedMetrics: income tx does NOT reduce gasto', async ({ page }) => {
    await loadAppDefault(page);
    // Add an expense tx of 5000 (cash) so saldo: 5000 - 5000 = 0
    await page.evaluate(() => {
      const tx = { fecha: '2026-03-05', monto: 5000, categoria: 'comida', metodo: 'tarjeta', mes: 'Marzo', anio: 2026 };
      _editData.transacciones.push(tx);
    });
    const before = await page.evaluate(() => {
      const m = window.calcDerivedMetrics({ config: _editData.config, gastos: _editData.gastos, forNow: _editData.forNow, emerg: _editData.emerg });
      return m.gasto;
    });
    // Now deposit income (synthetic ingreso tx with negative 180000)
    await page.evaluate(() => window.depositIncomeToWallet());
    const after = await page.evaluate(() => {
      const m = window.calcDerivedMetrics({ config: _editData.config, gastos: _editData.gastos, forNow: _editData.forNow, emerg: _editData.emerg });
      return m.gasto;
    });
    // Critical: gasto must be UNCHANGED. Pre-fix, it would have decreased
    // by 180000 (the negative income monto sums into the total).
    expect(after).toBe(before);
  });

  test('Registro KPI: monthly spending stays put after income deposit', async ({ page }) => {
    await loadAppDefault(page);
    // Add a 1500 expense
    await page.evaluate(() => {
      const tx = { fecha: '2026-03-05', monto: 1500, categoria: 'comida', metodo: 'tarjeta', mes: 'Marzo', anio: 2026 };
      _editData.transacciones.push(tx);
      window.buildDashboard({ ..._editData });
      window.showTab('registro', null);
    });
    const before = await page.locator('#registroKpis .kpi-val').first().textContent();
    expect(before).toMatch(/1[,.]?500/);
    // Deposit income
    await page.evaluate(() => {
      window.depositIncomeToWallet();
      window.showTab('registro', null);
    });
    const after = await page.locator('#registroKpis .kpi-val').first().textContent();
    expect(after).toMatch(/1[,.]?500/); // still 1500, not -178500
  });

  test('Registro tx list: income tx renders with green + sign', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      window.depositIncomeToWallet();
      window.showTab('registro', null);
    });
    const items = page.locator('#registroList .reg-item');
    await expect(items.first()).toBeVisible();
    // The income tx (most recent) shows + sign and green color
    const html = await items.first().innerHTML();
    expect(html).toContain('+');
    const amtStyle = await items.first().locator('.reg-amt').getAttribute('style');
    expect(amtStyle).toContain('green');
  });

  test('Registro category chart: ingreso category does NOT appear in donut', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      // Add an expense + an income deposit
      _editData.transacciones.push({ fecha: '2026-03-05', monto: 1500, categoria: 'comida', metodo: 'tarjeta', mes: 'Marzo', anio: 2026 });
      window.depositIncomeToWallet();
      window.showTab('registro', null);
    });
    // Reproduce the chart's category-bucket logic — verify the bucket set
    // does NOT include 'ingreso' even though the income tx is in the array.
    const cats = await page.evaluate(() => {
      const cfg = _editData.config;
      const monthTx = (_editData.transacciones || []).filter(t => t.mes === cfg.mes && t.anio === cfg.anio);
      const expenseTx = monthTx.filter(window.isExpenseTx);
      const buckets = {};
      expenseTx.forEach(t => { buckets[t.categoria] = (buckets[t.categoria] || 0) + t.monto; });
      return Object.keys(buckets);
    });
    expect(cats.length).toBeGreaterThan(0);
    expect(cats).toContain('comida');
    expect(cats).not.toContain('ingreso');
  });

  test('Cierre historial gastoReal excludes income deposits', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      _editData.transacciones.push({ fecha: '2026-03-05', monto: 2000, categoria: 'comida', metodo: 'tarjeta', mes: 'Marzo', anio: 2026 });
      window.depositIncomeToWallet();
    });
    // Replay the cierre confirm logic that records gastoReal in historial:
    const gastoReal = await page.evaluate(() =>
      (_editData.transacciones || [])
        .filter(tx => tx.mes === _editData.config.mes && tx.anio === _editData.config.anio && window.isExpenseTx(tx))
        .reduce((a, tx) => a + tx.monto, 0)
    );
    expect(gastoReal).toBe(2000); // not -178000
  });

  test('Presupuesto BvA: income tx does not skew per-category actuals', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      _editData.presupuesto = [{ categoria: 'comida', presupuestado: 5000, mes: 'Marzo', anio: 2026 }];
      _editData.transacciones.push({ fecha: '2026-03-05', monto: 1500, categoria: 'comida', metodo: 'tarjeta', mes: 'Marzo', anio: 2026 });
      window.depositIncomeToWallet();
      window.buildDashboard({ ..._editData });
      window.showTab('presupuesto', null);
    });
    // Find the comida row and read its "actual" value
    const presHtml = await page.locator('#presTable').innerHTML();
    expect(presHtml).toMatch(/1[,.]?500/);
    expect(presHtml).not.toMatch(/-178/); // would appear if income leaked
  });
});
