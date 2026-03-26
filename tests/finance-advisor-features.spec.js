const { test, expect } = require('@playwright/test');

/**
 * Tests for personal finance advisor review features:
 * 1.2 DTI threshold alerts
 * 1.3 Negative amortization alerts
 * 1.4 Savings rate KPI + 50/30/20 guidance
 * 1.5 EF target pre-filled from expenses
 * 2.5 Payment calendar
 * 3.2 Expense trend anomaly detection
 * 3.3 Net worth milestones
 * 3.4 Savings rate trend chart
 * 3.5 Post-close summary
 */

async function loadApp(page, overrides = {}) {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');

  await page.evaluate((opts) => {
    const data = window.defaultEditData();
    data.config.tasa = opts.tasa || 58;
    data.config.ingresoUSD = opts.ingresoUSD || 3000;
    data.config.ingresoRD = (opts.ingresoUSD || 3000) * (opts.tasa || 58);
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.config.diasAlerta = 5;
    data.emerg.cashflow.ingreso = data.config.ingresoRD;
    data.emerg.cashflow.gasto = opts.gasto || 120000;
    data.emerg.cashflow.tasa = data.config.tasa;
    data.forNow.cuentas = opts.cuentas || [{ nombre: 'Banco', moneda: 'RD', saldo: 50000, comp: 0, disp: 50000 }];
    data.gastos = opts.gastos || [
      { nombre: 'Tarjeta Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 8000, dia: 15, tasa: 24, balance: 100000, originalRD: 120000, originalUSD: 0, fechaLimite: '2028-06-15', notas: '', pagadoMes: false },
      { nombre: 'Alquiler', tipo: 'Fijo', pagado: 0, adeudado: 25000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
    ];
    data.emerg.fondos = opts.fondos || [{ fondo: 'EF General', moneda: 'RD', balance: 30000, meta: 100000 }];
    data.historial = opts.historial || [];
    data.metas = opts.metas || [];
    window._testLoadData(data);
  }, overrides);
}

// ────────────────────────────────────────────────────
// 1.2 — DTI Threshold Alerts
// ────────────────────────────────────────────────────
test.describe('1.2 — DTI threshold alerts (payment-based)', () => {
  test('DTI > 43% shows urgent alert', async ({ page }) => {
    // Income = 3000 * 58 = 174,000 RD$/month
    // DTI = cuotaDeudas / ingreso = 80000 / 174000 ≈ 46% > 43%
    await loadApp(page, {
      gastos: [
        { nombre: 'Mega Deuda', tipo: 'Préstamo', pagado: 0, adeudado: 80000, dia: 10, tasa: 18, balance: 950000, originalRD: 1000000, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      ],
    });

    await page.evaluate(() => showTab('alertas'));
    const alerts = page.locator('#alertasGen');
    await expect(alerts).toContainText(/DTI.*>43%|DTI.*crítico/i);
  });

  test('DTI > 36% but < 43% shows warning alert', async ({ page }) => {
    // DTI = cuotaDeudas / ingreso = 68000 / 174000 ≈ 39% — between 36% and 43%
    await loadApp(page, {
      gastos: [
        { nombre: 'Deuda Media', tipo: 'Préstamo', pagado: 0, adeudado: 68000, dia: 10, tasa: 12, balance: 800000, originalRD: 900000, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      ],
    });

    await page.evaluate(() => showTab('alertas'));
    const alerts = page.locator('#alertasGen');
    await expect(alerts).toContainText(/DTI.*>36%|DTI.*elevado/i);
  });

  test('DTI < 36% shows no DTI alert', async ({ page }) => {
    // DTI = 5000 / 174000 ≈ 2.9% — well below 36%
    await loadApp(page, {
      gastos: [
        { nombre: 'Deuda Baja', tipo: 'Cuota', pagado: 0, adeudado: 5000, dia: 10, tasa: 8, balance: 100000, originalRD: 150000, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      ],
    });

    await page.evaluate(() => showTab('alertas'));
    const alertsText = await page.locator('#alertasGen').textContent();
    expect(alertsText).not.toMatch(/DTI/i);
  });
});

// ────────────────────────────────────────────────────
// 1.3 — Negative Amortization Alerts
// ────────────────────────────────────────────────────
test.describe('1.3 — Negative amortization alerts', () => {
  test('debt where payment < interest shows neg-amort alert', async ({ page }) => {
    // balance=500000, tasa=24%, monthly interest = 500000 * 0.24/12 = 10000
    // adeudado=8000 < 10000 → negative amortization
    await loadApp(page, {
      gastos: [
        { nombre: 'Tarjeta Cara', tipo: 'Tarjeta', pagado: 0, adeudado: 8000, dia: 15, tasa: 24, balance: 500000, originalRD: 500000, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      ],
    });

    await page.evaluate(() => showTab('alertas'));
    const alerts = page.locator('#alertasGen');
    await expect(alerts).toContainText(/Tarjeta Cara/);
    await expect(alerts).toContainText(/creciendo|growing/i);
  });

  test('debt where payment > interest shows no neg-amort alert', async ({ page }) => {
    // balance=100000, tasa=12%, monthly interest = 100000 * 0.12/12 = 1000
    // adeudado=5000 > 1000 → OK
    await loadApp(page, {
      gastos: [
        { nombre: 'Cuota OK', tipo: 'Cuota', pagado: 0, adeudado: 5000, dia: 10, tasa: 12, balance: 100000, originalRD: 150000, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      ],
    });

    await page.evaluate(() => showTab('alertas'));
    const alertsText = await page.locator('#alertasGen').textContent();
    expect(alertsText).not.toMatch(/creciendo|growing/i);
  });
});

// ────────────────────────────────────────────────────
// 1.4 — Savings Rate KPI
// ────────────────────────────────────────────────────
test.describe('1.4 — Savings rate KPI', () => {
  test('savings rate KPI shows on summary dashboard', async ({ page }) => {
    await loadApp(page);

    const kpiRow = page.locator('#kpiRow');
    await expect(kpiRow).toContainText(/Tasa de Ahorro|Savings Rate/);
  });

  test('KPI row has 5 cards (including savings rate)', async ({ page }) => {
    await loadApp(page);

    const cards = page.locator('#kpiRow .card');
    await expect(cards).toHaveCount(5);
  });

  test('savings rate shows 50/30/20 guidance text', async ({ page }) => {
    await loadApp(page);

    const kpiRow = page.locator('#kpiRow');
    await expect(kpiRow).toContainText(/50.*30.*20/);
  });
});

// ────────────────────────────────────────────────────
// 1.5 — EF Target Pre-filled from Expenses
// ────────────────────────────────────────────────────
test.describe('1.5 — EF target tied to expenses', () => {
  test('new emergency fund row gets meta = 3× monthly expenses', async ({ page }) => {
    await loadApp(page);

    // Total adeudado = 8000 + 25000 = 33000; meta should be ~99000
    await page.evaluate(() => addEmergFundRow());

    const fondos = await page.evaluate(() => _editData.emerg.fondos);
    const newFondo = fondos[fondos.length - 1];
    expect(newFondo.meta).toBe(99000); // 33000 * 3
  });
});

// ────────────────────────────────────────────────────
// 2.5 — Payment Calendar
// ────────────────────────────────────────────────────
test.describe('2.5 — Payment calendar', () => {
  test('calendar shows in checklist tab', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => showTab('checklist'));

    const cal = page.locator('#paymentCalendar');
    await expect(cal).toBeVisible();
    await expect(cal).toContainText(/Calendario|Calendar/);
  });

  test('calendar groups payments by day', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => showTab('checklist'));

    const cal = page.locator('#paymentCalendar');
    // Day 1 (Alquiler) and Day 15 (Tarjeta Visa)
    await expect(cal).toContainText('1');
    await expect(cal).toContainText('15');
    await expect(cal).toContainText('Alquiler');
    await expect(cal).toContainText('Tarjeta Visa');
  });

  test('calendar shows empty state when all paid', async ({ page }) => {
    await loadApp(page, {
      gastos: [
        { nombre: 'Pagado', tipo: 'Fijo', pagado: 5000, adeudado: 5000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: true },
      ],
    });
    await page.evaluate(() => showTab('checklist'));

    const cal = page.locator('#paymentCalendar');
    await expect(cal).toContainText(/Sin pagos|No pending/);
  });
});

// ────────────────────────────────────────────────────
// 3.2 — Expense Trend Anomaly Detection
// ────────────────────────────────────────────────────
test.describe('3.2 — Expense anomaly detection', () => {
  test('expense spike > 120% of average triggers alert', async ({ page }) => {
    // History average gasto = 100000; current gasto = 33000 (adeudado sum)
    // This won't spike. Need current gasto > 120000.
    // Set gastos with high adeudado to spike above average.
    await loadApp(page, {
      gastos: [
        { nombre: 'Big Expense', tipo: 'Variable', pagado: 0, adeudado: 150000, dia: 5, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      ],
      historial: [
        { mes: 'Feb', anio: 2026, ingresos: 174000, gasto: 80000, ahorro: 94000, tasaAhorro: 0.54, deudas: 100000, emergencia: 30000, netWorth: 50000, tasa: 58, notas: '' },
        { mes: 'Jan', anio: 2026, ingresos: 174000, gasto: 85000, ahorro: 89000, tasaAhorro: 0.51, deudas: 110000, emergencia: 25000, netWorth: 40000, tasa: 58, notas: '' },
      ],
    });

    await page.evaluate(() => showTab('alertas'));
    const alerts = page.locator('#alertasGen');
    await expect(alerts).toContainText(/inusualmente|Unusually/i);
  });
});

// ────────────────────────────────────────────────────
// 3.3 — Net Worth Milestones (via data setup)
// ────────────────────────────────────────────────────
test.describe('3.3 — Net worth milestones', () => {
  test('milestone data structure check — positive NW from negative in history', async ({ page }) => {
    await loadApp(page, {
      gastos: [
        { nombre: 'Small', tipo: 'Fijo', pagado: 0, adeudado: 5000, dia: 1, tasa: 0, balance: 10000, originalRD: 10000, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      ],
      cuentas: [{ nombre: 'Banco', moneda: 'RD', saldo: 80000, comp: 0, disp: 80000 }],
      historial: [
        { mes: 'Feb', anio: 2026, ingresos: 174000, gasto: 120000, ahorro: 54000, tasaAhorro: 0.31, deudas: 200000, emergencia: 30000, netWorth: -50000, tasa: 58, notas: '' },
      ],
    });

    // Net worth = 80000 + 0 + 30000 - 10000 = 100000 (positive)
    // Previous was -50000 → milestone should trigger
    // We can't easily assert toast, but we can check the logic runs without error
    const nw = await page.evaluate(() => {
      const m = calcDerivedMetrics(_editData);
      return m.netWorth;
    });
    expect(nw).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────
// 3.4 — Savings Rate Trend Chart
// ────────────────────────────────────────────────────
test.describe('3.4 — Savings rate trend chart', () => {
  test('savings rate chart canvas exists in history tab', async ({ page }) => {
    await loadApp(page, {
      historial: [
        { mes: 'Feb', anio: 2026, ingresos: 174000, gasto: 130000, ahorro: 44000, tasaAhorro: 0.25, deudas: 100000, emergencia: 30000, netWorth: 50000, tasa: 58, notas: '' },
        { mes: 'Jan', anio: 2026, ingresos: 174000, gasto: 140000, ahorro: 34000, tasaAhorro: 0.20, deudas: 110000, emergencia: 25000, netWorth: 40000, tasa: 58, notas: '' },
      ],
    });

    await page.evaluate(() => showTab('historial'));
    const canvas = page.locator('#histSavingsRate');
    await expect(canvas).toBeVisible();
  });

  test('savings rate chart rendered with data', async ({ page }) => {
    await loadApp(page, {
      historial: [
        { mes: 'Feb', anio: 2026, ingresos: 174000, gasto: 130000, ahorro: 44000, tasaAhorro: 0.25, deudas: 100000, emergencia: 30000, netWorth: 50000, tasa: 58, notas: '' },
        { mes: 'Jan', anio: 2026, ingresos: 174000, gasto: 140000, ahorro: 34000, tasaAhorro: 0.20, deudas: 110000, emergencia: 25000, netWorth: 40000, tasa: 58, notas: '' },
      ],
    });

    await page.evaluate(() => showTab('historial'));
    // Chart should be initialized
    const hasChart = await page.evaluate(() => !!charts.histSavingsRate);
    expect(hasChart).toBe(true);
  });
});

// ────────────────────────────────────────────────────
// 3.5 — Post-Close Summary
// ────────────────────────────────────────────────────
test.describe('3.5 — Post-close summary', () => {
  test('cierre summary i18n keys exist', async ({ page }) => {
    await loadApp(page);

    const keys = await page.evaluate(() => ({
      title: t('cierre_summary_title'),
      saved: t('cierre_summary_saved'),
      saverate: t('cierre_summary_saverate'),
    }));

    expect(keys.title).toContain('Resumen');
    expect(keys.saverate).toContain('Tasa');
  });
});
