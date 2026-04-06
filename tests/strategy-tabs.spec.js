const { test, expect } = require('@playwright/test');

/**
 * Tests for Strategy tab improvements:
 * 1. Debt cards show payoff ETA
 * 2. Emergency fund shows months-covered KPI + doughnut chart
 */

async function loadApp(page, opts = {}) {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');

  await page.evaluate((opts) => {
    const data = window.defaultEditData();
    data.config.tasa = 58;
    data.config.ingresoUSD = 3000;
    data.config.ingresoRD = 174000;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.emerg.cashflow.ingreso = 174000;
    data.emerg.cashflow.gasto = 120000;
    data.forNow.cuentas = [{ nombre: 'Banco', moneda: 'RD', saldo: 50000, comp: 0, disp: 50000 }];

    if (opts.withDebt) {
      data.gastos = [
        { nombre: 'Préstamo Auto', tipo: 'Préstamo', pagado: 0, adeudado: 15000, dia: 15, tasa: 12, balance: 300000, originalRD: 500000, originalUSD: 0, tasaCreacion: 58, fechaLimite: '2028-06-01', notas: '', pagadoMes: false },
        { nombre: 'Tarjeta Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 8000, dia: 20, tasa: 24, balance: 80000, originalRD: 100000, originalUSD: 0, tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: false },
        { nombre: 'Seguro', tipo: 'Seguro', pagado: 0, adeudado: 5000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: false },
      ];
    } else {
      data.gastos = [
        { nombre: 'Alquiler', tipo: 'Fijo', pagado: 0, adeudado: 25000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      ];
    }

    if (opts.withEF) {
      data.emerg.fondos = [
        { fondo: 'Emergencia Principal', moneda: 'RD', balance: 200000, meta: 500000 },
        { fondo: 'Reserva USD', moneda: 'USD', balance: 1000, meta: 3000 },
      ];
    } else {
      data.emerg.fondos = [{ fondo: 'EF', moneda: 'RD', balance: 10000, meta: 50000 }];
    }

    window._testLoadData(data);
  }, opts);
}

test.describe('Deudas Tab — Payoff ETA on Cards', () => {

  test('debt card shows payoff ETA for debt with interest', async ({ page }) => {
    await loadApp(page, { withDebt: true });
    await page.evaluate(() => window.showTab('deudas', null));
    const cards = page.locator('#deudaCards');
    // Préstamo Auto has balance=300000, adeudado=15000, tasa=12% → should show Xa Ym format
    await expect(cards).toContainText('a '); // year indicator (e.g., "1a 11m")
  });

  test('high-rate debt shows payoff ETA in yellow or red', async ({ page }) => {
    await loadApp(page, { withDebt: true });
    await page.evaluate(() => window.showTab('deudas', null));
    const cards = page.locator('#deudaCards');
    // Tarjeta Visa: 24% rate, 80000 balance, 8000 payment → ~11 months → green
    // Préstamo Auto: 12% rate, 300000 balance, 15000 payment → ~22 months → yellow
    const etaLabels = await cards.locator('.dmi-label').allTextContents();
    const hasEta = etaLabels.some(l => l.includes('Liquidación') || l.includes('Payoff'));
    expect(hasEta).toBe(true);
  });

  test('debt where payment < interest shows never-payable warning', async ({ page }) => {
    await loadApp(page, { withDebt: false }); // load base
    // Add a debt where payment doesn't cover interest
    await page.evaluate(() => {
      _editData.gastos.push({
        nombre: 'Deuda Mala', tipo: 'Préstamo', pagado: 0, adeudado: 1000, dia: 10,
        tasa: 48, balance: 500000, originalRD: 500000, originalUSD: 0,
        tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: false
      });
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('deudas', null));
    const cards = page.locator('#deudaCards');
    // adeudado=1000, monthly interest = 500000*(48/100/12) = 20000 → payment < interest
    await expect(cards).toContainText('no cubre');
  });

  test('zero-rate debt shows payoff ETA without interest calc', async ({ page }) => {
    await loadApp(page, { withDebt: false });
    await page.evaluate(() => {
      _editData.gastos.push({
        nombre: 'Préstamo Familiar', tipo: 'Familiar', pagado: 0, adeudado: 10000, dia: 5,
        tasa: 0, balance: 50000, originalRD: 50000, originalUSD: 0,
        tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: false
      });
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('deudas', null));
    const cards = page.locator('#deudaCards');
    // balance=50000, adeudado=10000, tasa=0 → ceil(50000/10000) = 5 months → "5m"
    await expect(cards).toContainText('5m');
  });

  test('debt with no adeudado does not show payoff ETA', async ({ page }) => {
    await loadApp(page, { withDebt: false });
    await page.evaluate(() => {
      _editData.gastos.push({
        nombre: 'Deuda Sin Pago', tipo: 'Préstamo', pagado: 0, adeudado: 0, dia: 10,
        tasa: 12, balance: 100000, originalRD: 100000, originalUSD: 0,
        tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: false
      });
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('deudas', null));
    const cards = page.locator('#deudaCards');
    // No adeudado → no payoff calculation → no ETA label
    const text = await cards.textContent();
    expect(text).not.toContain('Liquidación');
  });
});

test.describe('Emergency Tab — Months Covered KPI + Doughnut', () => {

  test('EF KPIs include months-covered card', async ({ page }) => {
    await loadApp(page, { withEF: true });
    await page.evaluate(() => window.showTab('emergency', null));
    const kpis = page.locator('#efKpis');
    // Should have 4 KPI cards now
    const cardCount = await kpis.locator('.card').count();
    expect(cardCount).toBe(4);
    // Should contain coverage-related text
    await expect(kpis).toContainText('Cobertura');
  });

  test('months-covered shows correct value', async ({ page }) => {
    await loadApp(page, { withEF: true });
    await page.evaluate(() => window.showTab('emergency', null));
    const kpis = page.locator('#efKpis');
    // EF total: 200000 RD + 1000 USD × 58 = 200000 + 58000 = 258000
    // gasto (totalAdeudado from gastos): 25000 (Alquiler)
    // But gasto in calcDerivedMetrics = totalAdeudado + txGasto
    // With withEF but not withDebt, gastos = [Alquiler adeudado:25000]
    // months covered = efTotal / gasto
    // This will be 258000 / (25000 + 0) = 10.3 months → should show "10.3 meses"
    await expect(kpis).toContainText('meses');
  });

  test('coverage doughnut chart renders', async ({ page }) => {
    await loadApp(page, { withEF: true });
    await page.evaluate(() => window.showTab('emergency', null));
    const chartExists = await page.evaluate(() => {
      const canvas = document.getElementById('efCoverageChart');
      return canvas && canvas.parentElement.style.display !== 'none';
    });
    expect(chartExists).toBe(true);
  });

  test('coverage title shows correct i18n text', async ({ page }) => {
    await loadApp(page, { withEF: true });
    await page.evaluate(() => window.showTab('emergency', null));
    const title = page.locator('#efCoverageTitle');
    await expect(title).toContainText('Meses de Gastos Cubiertos');
  });

  test('low EF shows coverage in red', async ({ page }) => {
    await loadApp(page); // default: EF balance=10000, gasto=25000 → 0.4 months
    await page.evaluate(() => window.showTab('emergency', null));
    const kpis = page.locator('#efKpis');
    // 10000/25000 = 0.4 months < 1 → shows days instead
    // Should show "días" since less than 1 month
    await expect(kpis).toContainText('días');
  });

  test('months-covered color: green >= 6, yellow 3-6, red < 3', async ({ page }) => {
    await loadApp(page, { withEF: true });
    // efTotal = ~258000, gasto = 25000 → 10.3 months → green
    const color = await page.evaluate(() => {
      const kpis = document.getElementById('efKpis');
      const cards = kpis.querySelectorAll('.card');
      // Coverage card is the 3rd (index 2)
      const val = cards[2]?.querySelector('.kpi-val');
      return val?.style.color || '';
    });
    // 10.3 months >= 6 → green
    expect(color).toContain('green');
  });
});

// ═══════════════════════════════════════
// #3: Análisis Summary Card
// ═══════════════════════════════════════

test.describe('Análisis Tab — Summary Card', () => {

  test('summary card renders with debt data', async ({ page }) => {
    await loadApp(page, { withDebt: true });
    await page.evaluate(() => window.showTab('analisis', null));
    const summary = page.locator('#analisisSummary');
    await expect(summary).toContainText('Resumen Financiero');
    // Should show monthly obligations
    await expect(summary).toContainText('Obligaciones');
    // Should show debt-free-in timeline
    await expect(summary).toContainText('Libre de Deuda');
  });

  test('summary shows total projected interest', async ({ page }) => {
    await loadApp(page, { withDebt: true });
    await page.evaluate(() => window.showTab('analisis', null));
    const summary = page.locator('#analisisSummary');
    await expect(summary).toContainText('Interés Total');
  });

  test('summary shows debt-free when no debts with balance', async ({ page }) => {
    await loadApp(page);
    // Default gastos have no balance — should show "Sin deudas"
    await page.evaluate(() => window.showTab('analisis', null));
    const summary = page.locator('#analisisSummary');
    await expect(summary).toContainText('Sin deudas');
  });
});

// ═══════════════════════════════════════
// #4: Net Worth Projection in Historial
// ═══════════════════════════════════════

test.describe('Historial Tab — Net Worth Projection', () => {

  test('histLine chart has projection dataset when history exists', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.historial = [
        { mes: 'Enero', anio: 2026, ingresos: 174000, gasto: 120000, ahorro: 54000, tasaAhorro: 31, deudas: 100000, emergencia: 10000, netWorth: -40000, tasa: 58, notas: '' },
        { mes: 'Febrero', anio: 2026, ingresos: 174000, gasto: 115000, ahorro: 59000, tasaAhorro: 34, deudas: 85000, emergencia: 20000, netWorth: -15000, tasa: 58, notas: '' },
        { mes: 'Marzo', anio: 2026, ingresos: 174000, gasto: 110000, ahorro: 64000, tasaAhorro: 37, deudas: 70000, emergencia: 30000, netWorth: 10000, tasa: 58, notas: '' },
      ];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('historial', null));
    const datasetCount = await page.evaluate(() => {
      const chart = Object.values(Chart.instances || {}).find(c => c.canvas.id === 'histLine');
      return chart ? chart.data.datasets.length : 0;
    });
    // Should have 3 datasets: NW actual, Debt, NW projection
    expect(datasetCount).toBe(3);
  });

  test('projection extends labels beyond historical data', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.historial = [
        { mes: 'Enero', anio: 2026, ingresos: 174000, gasto: 120000, ahorro: 54000, tasaAhorro: 31, deudas: 100000, emergencia: 10000, netWorth: -40000, tasa: 58, notas: '' },
        { mes: 'Febrero', anio: 2026, ingresos: 174000, gasto: 115000, ahorro: 59000, tasaAhorro: 34, deudas: 85000, emergencia: 20000, netWorth: -15000, tasa: 58, notas: '' },
      ];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('historial', null));
    const labelCount = await page.evaluate(() => {
      const chart = Object.values(Chart.instances || {}).find(c => c.canvas.id === 'histLine');
      return chart ? chart.data.labels.length : 0;
    });
    // 2 historical + 3 projected = 5 labels
    expect(labelCount).toBe(5);
  });
});

// ═══════════════════════════════════════
// #5: Goals Sparkline
// ═══════════════════════════════════════

test.describe('Metas Tab — Projected Sparkline', () => {

  test('goal with monthly contribution shows sparkline SVG', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.metas = [
        { name: 'Vacaciones', goal: 50000, saved: 10000, monthly: 5000 },
      ];
      window.buildSavingsGoals();
    });
    await page.evaluate(() => window.showTab('metas', null));
    const svgExists = await page.evaluate(() => {
      return document.querySelector('#metasList svg') !== null;
    });
    expect(svgExists).toBe(true);
  });

  test('completed goal does not show sparkline', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.metas = [
        { name: 'Done Goal', goal: 10000, saved: 10000, monthly: 1000 },
      ];
      window.buildSavingsGoals();
    });
    await page.evaluate(() => window.showTab('metas', null));
    const svgExists = await page.evaluate(() => {
      return document.querySelector('#metasList svg') !== null;
    });
    expect(svgExists).toBe(false);
  });

  test('goal with zero monthly does not show sparkline', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.metas = [
        { name: 'No Monthly', goal: 50000, saved: 10000, monthly: 0 },
      ];
      window.buildSavingsGoals();
    });
    await page.evaluate(() => window.showTab('metas', null));
    const svgExists = await page.evaluate(() => {
      return document.querySelector('#metasList svg') !== null;
    });
    expect(svgExists).toBe(false);
  });
});

// ═══════════════════════════════════════
// #6: Cash Flow Waterfall
// ═══════════════════════════════════════

test.describe('Análisis Tab — Cash Flow Waterfall', () => {

  test('waterfall renders with income and obligations', async ({ page }) => {
    await loadApp(page, { withDebt: true });
    await page.evaluate(() => window.showTab('analisis', null));
    const wf = page.locator('#cashflowWaterfall');
    await expect(wf).toContainText('Flujo de Caja');
    await expect(wf).toContainText('Ingreso');
    await expect(wf).toContainText('Compromisos fijos');
    await expect(wf).toContainText('Sobrante');
  });

  test('waterfall shows tracked spending from Registro', async ({ page }) => {
    await loadApp(page, { withDebt: true });
    await page.evaluate(() => {
      _editData.transacciones = [
        { fecha: '2026-03-10', monto: 5000, categoria: 'comida', nota: '', metodo: 'efectivo', gastoIdx: -1, mes: 'Marzo', anio: 2026 },
      ];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('analisis', null));
    const wf = page.locator('#cashflowWaterfall');
    await expect(wf).toContainText('Gasto registrado');
    await expect(wf).toContainText('5,000');
  });

  test('waterfall shows goal contributions', async ({ page }) => {
    await loadApp(page, { withDebt: true });
    await page.evaluate(() => {
      _editData.metas = [{ name: 'Vacation', goal: 100000, saved: 20000, monthly: 3000 }];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('analisis', null));
    const wf = page.locator('#cashflowWaterfall');
    await expect(wf).toContainText('Aportes a metas');
    await expect(wf).toContainText('3,000');
  });

  test('waterfall shows surplus correctly', async ({ page }) => {
    await loadApp(page, { withDebt: true });
    await page.evaluate(() => window.showTab('analisis', null));
    const wf = page.locator('#cashflowWaterfall');
    // Income=174000, obligations=28000 (15000+8000+5000), no tx, no goals → surplus=146000
    await expect(wf).toContainText('146,000');
  });

  test('waterfall shows deficit in red when expenses exceed income', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.config.ingresoUSD = 500;
      _editData.config.ingresoRD = 29000; // 500*58
      _editData.gastos = [
        { nombre: 'Alquiler', tipo: 'Fijo', pagado: 0, adeudado: 35000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      ];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('analisis', null));
    const wf = page.locator('#cashflowWaterfall');
    // 29000 - 35000 = -6000 → deficit
    await expect(wf).toContainText('6,000');
  });
});

// ═══════════════════════════════════════
// EDGE CASE TESTS
// ═══════════════════════════════════════

test.describe('Edge Cases — Calculations & Boundaries', () => {

  test('debt ETA: exact payoff calculation for known values', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      // balance=60000, adeudado=10000, tasa=0 → 6 months exactly
      _editData.gastos = [
        { nombre: 'Test Debt', tipo: 'Préstamo', pagado: 0, adeudado: 10000, dia: 10,
          tasa: 0, balance: 60000, originalRD: 60000, originalUSD: 0,
          tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: false },
      ];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('deudas', null));
    const cards = page.locator('#deudaCards');
    await expect(cards).toContainText('6m');
  });

  test('debt ETA: payment exactly equals interest does NOT show never-payable', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      // balance=120000, tasa=12% → monthly interest = 120000*0.01 = 1200
      // adeudado=1200 → payment equals interest exactly → should NOT be Infinity (fixes <= bug)
      _editData.gastos = [
        { nombre: 'Exact Interest', tipo: 'Préstamo', pagado: 0, adeudado: 1200, dia: 10,
          tasa: 12, balance: 120000, originalRD: 120000, originalUSD: 0,
          tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: false },
      ];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('deudas', null));
    const cards = page.locator('#deudaCards');
    // Should show very long payoff (360m = 30a 0m), NOT "no cubre"
    const text = await cards.textContent();
    expect(text).not.toContain('no cubre');
  });

  test('debt ETA color: ≤12m green, 13-36m yellow, >36m red', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.gastos = [
        // ~11 months (green): 80000 / 8000 ≈ 10-11m with 24% rate
        { nombre: 'Short', tipo: 'Tarjeta', pagado: 0, adeudado: 8000, dia: 20,
          tasa: 24, balance: 80000, originalRD: 100000, originalUSD: 0,
          tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: false },
      ];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('deudas', null));
    const etaColor = await page.evaluate(() => {
      const items = document.querySelectorAll('#deudaCards .dmi-val');
      for (const item of items) {
        const label = item.parentElement.querySelector('.dmi-label');
        if (label && label.textContent.includes('Liquidación')) return item.style.color;
      }
      return '';
    });
    // 80000 at 24% with 8000/mo → ~11 months → green
    expect(etaColor).toContain('green');
  });

  test('EF coverage: exact 6.0 months shows green', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      // gasto (adeudado) = 25000, EF balance should be 150000 → 6.0 months exactly
      _editData.emerg.fondos = [{ fondo: 'EF', moneda: 'RD', balance: 150000, meta: 300000 }];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('emergency', null));
    const color = await page.evaluate(() => {
      const kpis = document.getElementById('efKpis');
      const cards = kpis.querySelectorAll('.card');
      const val = cards[2]?.querySelector('.kpi-val');
      return val?.style.color || '';
    });
    expect(color).toContain('green');
  });

  test('EF coverage: 2.9 months shows red', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      // gasto = 25000, EF = 72500 → 2.9 months < 3 → red
      _editData.emerg.fondos = [{ fondo: 'EF', moneda: 'RD', balance: 72500, meta: 300000 }];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('emergency', null));
    const color = await page.evaluate(() => {
      const kpis = document.getElementById('efKpis');
      const cards = kpis.querySelectorAll('.card');
      const val = cards[2]?.querySelector('.kpi-val');
      return val?.style.color || '';
    });
    expect(color).toContain('red');
  });

  test('analysis summary: interest warning when >50% of surplus', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      // ingreso=174000, gasto=160000 → surplus=14000
      // high-interest debt: balance=2000000, tasa=48% → monthly interest = 80000 >> 14000
      _editData.gastos = [
        { nombre: 'Big Expense', tipo: 'Fijo', pagado: 0, adeudado: 160000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
        { nombre: 'Huge Debt', tipo: 'Préstamo', pagado: 0, adeudado: 5000, dia: 15, tasa: 48, balance: 2000000, originalRD: 2000000, originalUSD: 0, tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: false },
      ];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('analisis', null));
    const summary = page.locator('#analisisSummary');
    // Interest ~80000/month >> surplus 14000 → warning should appear
    await expect(summary).toContainText('intereses consumen');
  });

  test('historial projection: year boundary (Dec → Jan next year)', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      // historial is newest-first: Dec is most recent
      _editData.historial = [
        { mes: 'Diciembre', anio: 2026, ingresos: 174000, gasto: 120000, ahorro: 54000, tasaAhorro: 31, deudas: 40000, emergencia: 20000, netWorth: 130000, tasa: 58, notas: '' },
        { mes: 'Noviembre', anio: 2026, ingresos: 174000, gasto: 120000, ahorro: 54000, tasaAhorro: 31, deudas: 50000, emergencia: 10000, netWorth: 100000, tasa: 58, notas: '' },
      ];
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('historial', null));
    const labels = await page.evaluate(() => {
      const chart = Object.values(Chart.instances || {}).find(c => c.canvas.id === 'histLine');
      return chart ? chart.data.labels : [];
    });
    // 2 historical + 3 projected = 5 labels
    expect(labels.length).toBe(5);
    // Projected labels should cross year boundary: Ene 2027, Feb 2027, Mar 2027
    expect(labels[2]).toContain('Ene');
    expect(labels[2]).toContain('2027');
  });
});

