const { test, expect } = require('@playwright/test');

/**
 * Wallet — Cash-runway projection + low-balance alert (1A)
 *
 * - projectWalletBalance(daysAhead) walks unpaid efectivo gastos within the
 *   window and returns { today, afterCommitments, lowestPoint, lowestDate,
 *   eventCount } — all amounts in the wallet's moneda.
 * - walletLowThresholdRD(cfg) returns the user-configured threshold in RD$,
 *   or auto-derives max(10% monthly income, 5000) when unset.
 * - Resumen wallet card surfaces the projection sub-line when events exist.
 * - buildAlerts emits `wallet_low` (warning) when projected lowest < threshold
 *   and `wallet_neg` (urgent) when projected lowest goes below zero.
 */

async function loadApp(page, cfgOverrides = {}, gastos = [], extra = {}) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(({ cfgOverrides, gastos, extra }) => {
    const data = window.defaultEditData();
    Object.assign(data.config, {
      tasa: 60,
      ingresoUSD: 3000,
      payFrequency: 'mensual',
      mes: 'Marzo',
      anio: 2026,
      monedaPrincipal: 'RD',
    }, cfgOverrides);
    const cashId = 'cnt_cash_seed';
    data.forNow.cuentas = [
      { id: cashId, nombre: 'Efectivo', moneda: extra.walletMoneda || 'RD', saldo: extra.saldo != null ? extra.saldo : 10000, tipo: 'cash', comp: 0, disp: 0 },
    ];
    if (extra.includeBank) {
      data.forNow.cuentas.unshift({ id: 'cnt_bank_seed', nombre: 'Banco', moneda: 'RD', saldo: 50000, tipo: 'banco', comp: 0, disp: 0 });
    }
    data.config.defaultCashAccountId = extra.skipDefault ? null : cashId;
    data.gastos = gastos;
    window._testLoadData(data);
  }, { cfgOverrides, gastos, extra });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. projectWalletBalance — pure helper
// ───────────────────────────────────────────────────────────────────
test.describe('projectWalletBalance', () => {
  test('returns null when no default cash account', async ({ page }) => {
    await loadApp(page, {}, [], { skipDefault: true });
    const proj = await page.evaluate(() => window.projectWalletBalance(31));
    expect(proj).toBeNull();
  });

  test('eventCount = 0 and afterCommitments = today when no pending efectivo gastos', async ({ page }) => {
    await loadApp(page, {}, [
      { nombre: 'Renta', tipo: 'Vivienda', adeudado: 5000, dia: 15, metodo: 'transferencia', balance: 0, pagado: 0 },
      { nombre: 'Gym', tipo: 'Variable', adeudado: 1500, dia: 1, metodo: 'efectivo', pagadoMes: true, balance: 0, pagado: 1500 },
    ]);
    const proj = await page.evaluate(() => window.projectWalletBalance(31));
    expect(proj.eventCount).toBe(0);
    expect(proj.today).toBe(10000);
    expect(proj.afterCommitments).toBe(10000);
    expect(proj.lowestPoint).toBe(10000);
  });

  test('walks one efectivo gasto and lowers afterCommitments + lowestPoint', async ({ page }) => {
    // dia=1 always lands within a 31-day window (next-month rollover or today)
    await loadApp(page, {}, [
      { nombre: 'Mercado', tipo: 'Variable', adeudado: 4000, dia: 1, metodo: 'efectivo', balance: 0, pagado: 0 },
    ]);
    const proj = await page.evaluate(() => window.projectWalletBalance(31));
    expect(proj.eventCount).toBe(1);
    expect(proj.today).toBe(10000);
    expect(proj.afterCommitments).toBe(6000);
    expect(proj.lowestPoint).toBe(6000);
    expect(proj.lowestDate).toBe(1);
  });

  test('walks multiple events; lowestPoint is minimum of running balance', async ({ page }) => {
    await loadApp(page, {}, [
      { nombre: 'Bill A', adeudado: 4000, dia: 5, metodo: 'efectivo', balance: 0, pagado: 0 },
      { nombre: 'Bill B', adeudado: 4000, dia: 15, metodo: 'efectivo', balance: 0, pagado: 0 },
      { nombre: 'Bill C', adeudado: 4000, dia: 25, metodo: 'efectivo', balance: 0, pagado: 0 },
    ]);
    const proj = await page.evaluate(() => window.projectWalletBalance(31));
    expect(proj.eventCount).toBe(3);
    expect(proj.afterCommitments).toBe(-2000);
    expect(proj.lowestPoint).toBe(-2000); // running hits its minimum at the last debit
  });

  test('ignores non-efectivo, dia=0, and already-paid gastos', async ({ page }) => {
    await loadApp(page, {}, [
      { nombre: 'Tarjeta', adeudado: 9999, dia: 10, metodo: 'tarjeta', balance: 0, pagado: 0 },
      { nombre: 'Variable sin fecha', adeudado: 9999, dia: 0, metodo: 'efectivo', balance: 0, pagado: 0 },
      { nombre: 'Ya pagado', adeudado: 9999, dia: 5, metodo: 'efectivo', pagadoMes: true, balance: 0, pagado: 9999 },
      { nombre: 'pagadoApplied (in-flight wallet debit)', adeudado: 9999, dia: 8, metodo: 'efectivo', pagadoApplied: true, balance: 0, pagado: 0 },
    ]);
    const proj = await page.evaluate(() => window.projectWalletBalance(31));
    expect(proj.eventCount).toBe(0);
    expect(proj.afterCommitments).toBe(10000);
  });

  test('USD wallet — debit converts gasto adeudado (RD$) into USD', async ({ page }) => {
    // tasa=60, adeudado=6000 RD$ -> 100 USD debit on a USD wallet of $1000
    await loadApp(page, { tasa: 60 }, [
      { nombre: 'Bill', adeudado: 6000, dia: 1, metodo: 'efectivo', balance: 0, pagado: 0 },
    ], { walletMoneda: 'USD', saldo: 1000 });
    const proj = await page.evaluate(() => window.projectWalletBalance(31));
    expect(proj.today).toBe(1000);
    expect(proj.afterCommitments).toBe(900);
    expect(proj.lowestPoint).toBe(900);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. walletLowThresholdRD
// ───────────────────────────────────────────────────────────────────
test.describe('walletLowThresholdRD', () => {
  test('returns explicit user-set threshold when > 0', async ({ page }) => {
    await loadApp(page, { walletLowThreshold: 12345 });
    const v = await page.evaluate(() => window.walletLowThresholdRD());
    expect(v).toBe(12345);
  });

  test('falls back to max(10% income, 5000) when unset', async ({ page }) => {
    // ingresoUSD=3000 * tasa=60 = 180000 RD$. 10% = 18000.
    await loadApp(page, { walletLowThreshold: 0 });
    const v = await page.evaluate(() => window.walletLowThresholdRD());
    expect(v).toBe(18000);
  });

  test('auto-derived floor is at least 5000 even with zero income', async ({ page }) => {
    await loadApp(page, { walletLowThreshold: 0, ingresoUSD: 0, ingresoRD: 0 });
    const v = await page.evaluate(() => window.walletLowThresholdRD());
    expect(v).toBe(5000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Resumen card projection sub-line
// ───────────────────────────────────────────────────────────────────
test.describe('Resumen wallet projection sub-line', () => {
  test('renders when there are pending efectivo gastos', async ({ page }) => {
    await loadApp(page, {}, [
      { nombre: 'Bill', adeudado: 4000, dia: 1, metodo: 'efectivo', balance: 0, pagado: 0 },
    ]);
    const projDiv = page.locator('#walletCard .wallet-projection');
    await expect(projDiv).toHaveCount(1);
    const txt = await projDiv.textContent();
    // Sub-line should show after-commitments and lowest-point amounts.
    expect(txt).toMatch(/6[,.]?000/);
  });

  test('hidden when there are no pending efectivo gastos', async ({ page }) => {
    await loadApp(page, {}, [
      { nombre: 'Tarjeta', adeudado: 4000, dia: 5, metodo: 'tarjeta', balance: 0, pagado: 0 },
    ]);
    await expect(page.locator('#walletCard .wallet-projection')).toHaveCount(0);
  });

  test('applies wallet-proj-neg class when projection goes negative', async ({ page }) => {
    await loadApp(page, {}, [
      { nombre: 'Big bill', adeudado: 50000, dia: 1, metodo: 'efectivo', balance: 0, pagado: 0 },
    ]);
    const negCount = await page.locator('#walletCard .wallet-proj-neg').count();
    expect(negCount).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Alerts engine — wallet_low + wallet_neg
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet low/negative alerts', () => {
  test('warning alert fires when projected lowest < threshold but ≥ 0', async ({ page }) => {
    await loadApp(page, { walletLowThreshold: 8000 }, [
      { nombre: 'Bill', adeudado: 4000, dia: 1, metodo: 'efectivo', balance: 0, pagado: 0 },
    ]);
    // Switch to alertas tab and read alertasGen
    await page.click('#tabAlertas');
    const html = await page.locator('#alertasGen').innerHTML();
    expect(html).toMatch(/💰/);
    expect(html).toContain('Saldo'); // "Tu Saldo se quedará bajo este mes"
  });

  test('urgent alert fires when projected lowest goes below zero', async ({ page }) => {
    await loadApp(page, { walletLowThreshold: 1000 }, [
      { nombre: 'Big bill', adeudado: 50000, dia: 1, metodo: 'efectivo', balance: 0, pagado: 0 },
    ]);
    await page.click('#tabAlertas');
    const html = await page.locator('#alertasGen').innerHTML();
    expect(html).toMatch(/💸/);
    expect(html).toMatch(/negativo|negative/);
    // Must NOT also emit the low alert (mutually exclusive)
    expect(html).not.toMatch(/💰[\s\S]*Saldo/);
  });

  test('no alert when projected lowest comfortably above threshold', async ({ page }) => {
    await loadApp(page, { walletLowThreshold: 1000 }, [
      { nombre: 'Bill', adeudado: 1000, dia: 1, metodo: 'efectivo', balance: 0, pagado: 0 },
    ]);
    await page.click('#tabAlertas');
    const html = await page.locator('#alertasGen').innerHTML();
    expect(html).not.toContain('💰');
    expect(html).not.toMatch(/Saldo[\s\S]*negativo/);
  });

  test('no alert when no wallet configured', async ({ page }) => {
    await loadApp(page, {}, [
      { nombre: 'Bill', adeudado: 50000, dia: 1, metodo: 'efectivo', balance: 0, pagado: 0 },
    ], { skipDefault: true });
    await page.click('#tabAlertas');
    const html = await page.locator('#alertasGen').innerHTML();
    expect(html).not.toContain('💰');
    expect(html).not.toMatch(/Saldo[\s\S]*negativo/);
  });

  test('no alert when there are no pending efectivo gastos in the window', async ({ page }) => {
    await loadApp(page, { walletLowThreshold: 999999 }, [
      { nombre: 'Tarjeta', adeudado: 50000, dia: 5, metodo: 'tarjeta', balance: 0, pagado: 0 },
    ]);
    await page.click('#tabAlertas');
    const html = await page.locator('#alertasGen').innerHTML();
    expect(html).not.toContain('💰');
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Settings field round-trip
// ───────────────────────────────────────────────────────────────────
test.describe('walletLowThreshold settings field', () => {
  test('user-entered threshold persists into _editData.config', async ({ page }) => {
    await loadApp(page);
    // Open Edit modal → Config tab is the default first edit-section
    await page.evaluate(() => openEditModal());
    await page.waitForSelector('#cfg-walletLow');
    await page.fill('#cfg-walletLow', '7500');
    // Trigger oninput sync
    await page.evaluate(() => {
      const el = document.getElementById('cfg-walletLow');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const stored = await page.evaluate(() => _editData.config.walletLowThreshold);
    expect(stored).toBe(7500);
  });
});
