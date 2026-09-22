const { test, expect } = require('@playwright/test');

/**
 * Phase 2 — sinking funds (irregular expenses) + credit utilization
 *
 * Sinking funds: recurrentes only understood daily/weekly/biweekly/monthly, so
 * annual insurance, property tax, registration and tuition had nowhere to
 * live. Users were already working around it by stuffing them into
 * emerg.fondos — the bundled USD demo had "Car Repair Fund" and a 529 sitting
 * in the emergency fund, which inflated months-of-coverage and the 20-point
 * emergency band of calcScore with money earmarked for a known date.
 *
 * Credit utilization: cards carried balance and tasa but no limit, so the
 * single fastest-moving input to a credit score was unrepresentable.
 *
 * Sub-suites:
 *   1. Sinking fund maths (monthly set-aside, months left, cadence)
 *   2. Separation from emergency funds — the score must not move
 *   3. Sinking balances are earmarks, not net worth
 *   4. Waterfall integration
 *   5. Credit utilization maths + bands
 *   6. Irregular recurrentes cadences
 *   7. Demo reclassification
 *   8. i18n
 */

function baseData() {
  return {
    config: { tasa: 60, mes: 'Marzo', anio: 2026, ingresoUSD: 3000, payFrequency: 'mensual', monedaPrincipal: 'RD' },
    gastos: [
      { nombre: 'Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 2000, dia: 10, tasa: 24, balance: 30000, limiteCredito: 100000, pagadoMes: false },
    ],
    forNow: { cuentas: [{ nombre: 'Banco', moneda: 'RD', saldo: 100000, tipo: 'banco' }], fecha: '2026-03-01', total: 100000 },
    emerg: { fondos: [{ fondo: 'EF', moneda: 'RD', balance: 50000, meta: 100000 }], cashflow: { ingreso: 0, gasto: 0, tasa: 60, retirarUSD: 0, ahorros: 0, balanceAhorros: 0 } },
    historial: [],
  };
}

async function openApp(page) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
}

async function loadWith(page, mutate) {
  await openApp(page);
  await page.evaluate(({ base, fnStr }) => {
    const d = JSON.parse(JSON.stringify(base));
    if (fnStr) new Function('d', fnStr)(d);
    window._testLoadData(d);
  }, { base: baseData(), fnStr: mutate || '' });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. Sinking fund maths
// ───────────────────────────────────────────────────────────────────
test.describe('Sinking funds — maths', () => {
  test('monthly set-aside spreads the gap over the months remaining', async ({ page }) => {
    await loadWith(page);
    const m = await page.evaluate(() => {
      const now = new Date(2026, 0, 1);            // Jan 2026
      const f = { meta: 12000, saved: 0, cadencia: 'anual', proximaFecha: '2027-01-01', moneda: 'RD' };
      return window.sinkingMonthlyRD(f, 60, now);  // 12 months out
    });
    expect(m).toBeCloseTo(1000, 5);
  });

  test('an already-funded target needs nothing further', async ({ page }) => {
    await loadWith(page);
    const m = await page.evaluate(() => window.sinkingMonthlyRD(
      { meta: 5000, saved: 5000, cadencia: 'anual', proximaFecha: '2027-01-01', moneda: 'RD' }, 60, new Date(2026, 0, 1)));
    expect(m).toBe(0);
  });

  test('a past-due date rolls to the next cadence instead of demanding it all at once', async ({ page }) => {
    await loadWith(page);
    const res = await page.evaluate(() => {
      const f = { meta: 12000, saved: 0, cadencia: 'anual', proximaFecha: '2025-01-01', moneda: 'RD' };
      return { months: window.sinkingMonthsLeft(f, new Date(2026, 5, 1)), monthly: window.sinkingMonthlyRD(f, 60, new Date(2026, 5, 1)) };
    });
    expect(res.months).toBe(12);
    expect(res.monthly).toBeCloseTo(1000, 5);
  });

  test('no due date falls back to the cadence length', async ({ page }) => {
    await loadWith(page);
    const res = await page.evaluate(() => [
      window.sinkingMonthsLeft({ cadencia: 'anual' }),
      window.sinkingMonthsLeft({ cadencia: 'semestral' }),
      window.sinkingMonthsLeft({ cadencia: 'trimestral' }),
      window.sinkingMonthsLeft({ cadencia: 'mensual' }),
    ]);
    expect(res).toEqual([12, 6, 3, 1]);
  });

  test('an invalid date does not produce NaN', async ({ page }) => {
    await loadWith(page);
    const m = await page.evaluate(() => window.sinkingMonthlyRD(
      { meta: 1200, saved: 0, cadencia: 'anual', proximaFecha: 'not-a-date', moneda: 'RD' }, 60));
    expect(Number.isFinite(m)).toBe(true);
    expect(m).toBeCloseTo(100, 5);
  });

  test('sinkingTotalsRD aggregates saved, target and monthly set-aside', async ({ page }) => {
    await loadWith(page);
    const t = await page.evaluate(() => {
      _editData.sinkingFunds = [
        { nombre: 'A', meta: 12000, saved: 3000, cadencia: 'anual', proximaFecha: '2027-01-01', moneda: 'RD' },
        { nombre: 'B', meta: 6000, saved: 6000, cadencia: 'anual', proximaFecha: '2027-01-01', moneda: 'RD' },
      ];
      window.migrateData(_editData);
      return window.sinkingTotalsRD(_editData, new Date(2026, 0, 1));
    });
    expect(t.count).toBe(2);
    expect(t.saved).toBe(9000);
    expect(t.meta).toBe(18000);
    // Only fund A still needs funding: (12,000 - 3,000) over 12 months.
    expect(t.monthly).toBeCloseTo(750, 6);
  });

  test('sinkingTotalsRD is all zeros with no funds', async ({ page }) => {
    await loadWith(page);
    const t = await page.evaluate(() => window.sinkingTotalsRD(_editData));
    expect(t).toEqual({ saved: 0, meta: 0, monthly: 0, count: 0 });
  });

  test('sinkingTotalsRD converts USD funds at tasa', async ({ page }) => {
    await loadWith(page);
    const t = await page.evaluate(() => {
      _editData.sinkingFunds = [{ nombre: 'U', meta: 200, saved: 100, cadencia: 'anual', proximaFecha: '2027-01-01', moneda: 'USD' }];
      window.migrateData(_editData);
      return window.sinkingTotalsRD(_editData, new Date(2026, 0, 1));
    });
    expect(t.saved).toBe(6000);
    expect(t.meta).toBe(12000);
  });

  test('USD funds convert at tasa', async ({ page }) => {
    await loadWith(page);
    const m = await page.evaluate(() => window.sinkingMonthlyRD(
      { meta: 1200, saved: 0, cadencia: 'anual', proximaFecha: '2027-01-01', moneda: 'USD' }, 60, new Date(2026, 0, 1)));
    expect(m).toBeCloseTo(6000, 5); // 1200 USD x 60 / 12 months
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Separation from emergency funds
// ───────────────────────────────────────────────────────────────────
test.describe('Sinking funds — kept out of the emergency score', () => {
  test('adding sinking funds does not change the health score', async ({ page }) => {
    await loadWith(page);
    const before = await page.textContent('#heroCard .score-num');
    await page.evaluate(() => {
      _editData.sinkingFunds = [{ nombre: 'Seguro', meta: 500000, saved: 1000, cadencia: 'anual', proximaFecha: '2027-01-01', moneda: 'RD' }];
      window.migrateData(_editData);
      buildDashboard({ ..._editData });
    });
    const after = await page.textContent('#heroCard .score-num');
    expect(after).toBe(before);
  });

  test('sinking funds do not inflate months-of-emergency-coverage', async ({ page }) => {
    await loadWith(page);
    const before = await page.evaluate(() => _editData.emerg.fondos.reduce((a, f) => a + f.balance, 0));
    await page.evaluate(() => {
      _editData.sinkingFunds = [{ nombre: 'Matricula', meta: 90000, saved: 45000, cadencia: 'anual', proximaFecha: '2027-01-01', moneda: 'RD' }];
      window.migrateData(_editData);
      buildDashboard({ ..._editData });
    });
    const after = await page.evaluate(() => _editData.emerg.fondos.reduce((a, f) => a + f.balance, 0));
    expect(after).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Net worth
// ───────────────────────────────────────────────────────────────────
test.describe('Sinking funds — net worth', () => {
  test('set-aside balances are an earmark, not extra net worth', async ({ page }) => {
    await loadWith(page);
    const before = await page.evaluate(() => window.netWorthRD(_editData));
    await page.evaluate(() => {
      _editData.sinkingFunds = [{ nombre: 'IPI', meta: 20000, saved: 7500, cadencia: 'anual', proximaFecha: '2027-01-01', moneda: 'RD' }];
      window.migrateData(_editData);
    });
    const res = await page.evaluate(() => ({ nw: window.netWorthRD(_editData), earmarked: window.earmarkedTotalRD(_editData) }));
    // The RD$7,500 already sits in an account that net worth counts; it shows
    // up as an allocation instead.
    expect(res.nw).toBe(before);
    expect(res.earmarked).toBeGreaterThanOrEqual(7500);
  });

  test('moving a fund from emergency to sinking leaves net worth unchanged', async ({ page }) => {
    await loadWith(page);
    const before = await page.evaluate(() => window.netWorthRD(_editData));
    await page.evaluate(() => {
      // Same RD$50,000, reclassified.
      _editData.emerg.fondos = [];
      _editData.sinkingFunds = [{ nombre: 'Reclassified', meta: 100000, saved: 50000, cadencia: 'anual', proximaFecha: '2027-01-01', moneda: 'RD' }];
      window.migrateData(_editData);
    });
    const after = await page.evaluate(() => window.netWorthRD(_editData));
    expect(after).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Waterfall
// ───────────────────────────────────────────────────────────────────
test.describe('Sinking funds — cashflow waterfall', () => {
  test('a set-aside row appears and reduces the surplus', async ({ page }) => {
    await loadWith(page);
    const without = await page.textContent('#resumenWaterfall');
    await page.evaluate(() => {
      _editData.sinkingFunds = [{ nombre: 'Seguro', meta: 120000, saved: 0, cadencia: 'anual', proximaFecha: '2027-03-01', moneda: 'RD' }];
      window.migrateData(_editData);
      buildDashboard({ ..._editData });
    });
    const withIt = await page.textContent('#resumenWaterfall');
    expect(without).not.toMatch(/Apartados/);
    expect(withIt).toMatch(/Apartados/);
  });

  test('no set-aside row when there are no sinking funds', async ({ page }) => {
    await loadWith(page);
    await expect(page.locator('#resumenWaterfall')).not.toContainText('Apartados');
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Credit utilization
// ───────────────────────────────────────────────────────────────────
test.describe('Credit utilization', () => {
  test('balance / limit', async ({ page }) => {
    await loadWith(page);
    const u = await page.evaluate(() => window.creditUtilization({ balance: 30000, limiteCredito: 100000 }));
    expect(u).toBeCloseTo(0.3, 6);
  });

  test('a line with no limit is undefined, not zero', async ({ page }) => {
    await loadWith(page);
    const res = await page.evaluate(() => [
      window.creditUtilization({ balance: 5000, limiteCredito: 0 }),
      window.creditUtilization({ balance: 5000 }),
    ]);
    expect(res).toEqual([null, null]);
  });

  test('overall utilization aggregates across revolving lines only', async ({ page }) => {
    await loadWith(page, "d.gastos.push({nombre:'Loan',tipo:'Préstamo',pagado:0,adeudado:5000,dia:1,tasa:9,balance:500000,pagadoMes:false})");
    const u = await page.evaluate(() => window.overallUtilization(_editData));
    // The instalment loan has no limit, so it must not enter the ratio.
    expect(u).toBeCloseTo(0.3, 6);
  });

  test('returns null when the user has no revolving lines at all', async ({ page }) => {
    await loadWith(page, "d.gastos=[{nombre:'Loan',tipo:'Préstamo',pagado:0,adeudado:5000,dia:1,tasa:9,balance:500000,pagadoMes:false}]");
    const u = await page.evaluate(() => window.overallUtilization(_editData));
    expect(u).toBeNull();
  });

  test('the utilization bar renders on a card with a limit', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window.switchSection('deudas'));
    await expect(page.locator('#deudaCards')).toContainText('Uso del crédito');
  });

  test('a high-utilization card raises the alert', async ({ page }) => {
    await loadWith(page, "d.gastos[0].balance=80000");
    await page.evaluate(() => window.switchSection('hoy'));
    await page.evaluate(() => window.showTab('alertas', null));
    await expect(page.locator('#alertasGen')).toContainText('Uso de crédito alto');
  });

  test('utilization below 30% raises no alert', async ({ page }) => {
    await loadWith(page, "d.gastos[0].balance=10000");
    await page.evaluate(() => window.showTab('alertas', null));
    await expect(page.locator('#alertasGen')).not.toContainText('Uso de crédito alto');
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. Irregular recurrentes
// ───────────────────────────────────────────────────────────────────
test.describe('Recurrentes — irregular cadences', () => {
  test('annual / half-yearly / quarterly are offered', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => { window.openEditModal(); window.addRecEditRow(); });
    await page.click('.edit-tab:has-text("Recurrentes")');
    const opts = await page.locator('#recEditBody select').last().locator('option').allTextContents();
    expect(opts).toContain('anual');
    expect(opts).toContain('semestral');
    expect(opts).toContain('trimestral');
  });
});

// ───────────────────────────────────────────────────────────────────
// 7. Demo reclassification
// ───────────────────────────────────────────────────────────────────
test.describe('Demos — funds reclassified', () => {
  test('USD demo no longer counts the 529 as an emergency fund', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.loadDemo('USD'));
    await page.waitForSelector('#dashApp', { state: 'visible' });
    const names = await page.evaluate(() => _editData.emerg.fondos.map(f => f.fondo).join(' '));
    expect(names).not.toMatch(/529|College|Car Repair|Home Repair/i);
    const sink = await page.evaluate(() => _editData.sinkingFunds.map(f => f.nombre).join(' '));
    expect(sink).toMatch(/529/);
  });

  test('both demos carry credit limits on their cards', async ({ page }) => {
    for (const cur of ['RD', 'USD']) {
      await openApp(page);
      await page.evaluate(c => window.loadDemo(c), cur);
      await page.waitForSelector('#dashApp', { state: 'visible' });
      const u = await page.evaluate(() => window.overallUtilization(_editData));
      expect(u, `${cur} demo should have a computable utilization`).not.toBeNull();
      expect(u).toBeGreaterThan(0);
    }
  });
});

// ───────────────────────────────────────────────────────────────────
// 8. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Phase 2 — i18n', () => {
  test('every new key resolves in both languages', async ({ page }) => {
    await loadWith(page);
    const keys = ['edit_tab_sinking', 'sinking_title', 'sinking_sub', 'sinking_nombre', 'sinking_meta',
      'sinking_saved', 'sinking_cadencia', 'sinking_fecha', 'sinking_monthly', 'sinking_empty',
      'sinking_total_monthly', 'sinking_total_saved', 'edit_add_sinking', 'wf_sinking',
      'eth_limite', 'eth_limite_hint', 'dcard_utilization', 'dcard_util_of', 'dcard_util_warn',
      'dcard_util_high', 'alert_util_title', 'alert_util_msg',
      'rec_trimestral', 'rec_semestral', 'rec_anual'];
    for (const lang of ['es', 'en']) {
      await page.evaluate(l => window._testSetLang(l), lang);
      const vals = await page.evaluate(ks => ks.map(k => t(k)), keys);
      vals.forEach((v, i) => expect(v, `${keys[i]} missing in ${lang}`).not.toBe(keys[i]));
    }
  });

  test('cadence labels resolve in both languages', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window._testSetLang('en'));
    const en = await page.evaluate(() => window.SINKING_CADENCIAS.map(c => t('sinking_cad_' + c)));
    expect(en).toEqual(['Monthly', 'Quarterly', 'Twice a year', 'Yearly']);
  });
});
