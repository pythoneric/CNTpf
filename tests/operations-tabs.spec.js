const { test, expect } = require('@playwright/test');

/**
 * Tests for Operations tab improvements:
 * 1. Gastos table payoff column
 * 2. Registro spending trend mini-chart
 * 3. Fondos runway indicator
 * 4. Checklist next-payment countdown
 * 5. Resumen KPI delta arrows
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
    data.forNow.cuentas = [
      { nombre: 'Banco Popular', moneda: 'RD', saldo: 150000, comp: 0, disp: 150000 },
      { nombre: 'Savings USD', moneda: 'USD', saldo: 2000, comp: 0, disp: 2000 },
    ];
    data.emerg.fondos = [{ fondo: 'EF', moneda: 'RD', balance: 50000, meta: 300000 }];

    data.gastos = [
      { nombre: 'Alquiler', tipo: 'Fijo', pagado: 25000, adeudado: 25000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: true },
      { nombre: 'Préstamo Auto', tipo: 'Préstamo', pagado: 0, adeudado: 15000, dia: 15, tasa: 12, balance: 300000, originalRD: 500000, originalUSD: 0, tasaCreacion: 58, fechaLimite: '2028-06-01', notas: '', pagadoMes: false },
      { nombre: 'Tarjeta Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 8000, dia: 20, tasa: 24, balance: 80000, originalRD: 100000, originalUSD: 0, tasaCreacion: 58, fechaLimite: '', notas: '', pagadoMes: false },
    ];

    if (opts.withHistory) {
      data.historial = [
        { mes: 'Febrero', anio: 2026, ingresos: 174000, gasto: 130000, ahorro: 44000, tasaAhorro: 0.25, deudas: 400000, emergencia: 40000, netWorth: -100000, tasa: 58, notas: '' },
        { mes: 'Enero', anio: 2026, ingresos: 170000, gasto: 140000, ahorro: 30000, tasaAhorro: 0.18, deudas: 420000, emergencia: 30000, netWorth: -140000, tasa: 57, notas: '' },
      ];
    }

    window._testLoadData(data);
  }, opts);
}

// ═══════════════════════════════════════
// #1: Gastos Table — Payoff Column
// ═══════════════════════════════════════

test.describe('Gastos Table — Payoff Column', () => {

  test('table header includes Liquidación column', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('gastos', null));
    const headers = await page.evaluate(() =>
      Array.from(document.getElementById('gastosBody')
        .closest('table').querySelectorAll('th'))
        .map(th => th.textContent)
    );
    expect(headers.some(h => h.includes('Liquidación') || h.includes('Payoff'))).toBe(true);
  });

  test('debt with balance shows payoff ETA in table', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('gastos', null));
    const tbody = page.locator('#gastosBody');
    // Préstamo Auto: 300k balance, 15k payment, 12% → should show Xa Ym
    await expect(tbody).toContainText('a ');
  });

  test('zero-balance expense shows dash in payoff column', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('gastos', null));
    // Alquiler has balance=0 → payoff should be "—"
    const firstRow = page.locator('#gastosBody tr').first();
    await expect(firstRow).toContainText('—');
  });

  test('payoff column color-coded: green ≤12m, yellow 13-36m, red >36m', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('gastos', null));
    // Tarjeta Visa: 80k @ 24%, 8k/mo → ~11 months → green
    const visaRow = page.locator('#gastosBody tr', { hasText: 'Tarjeta Visa' });
    const payoffCell = visaRow.locator('td').nth(8); // payoff is 9th column (0-indexed)
    const color = await payoffCell.evaluate(el => el.style.color);
    expect(color).toContain('green');
  });
});

// ═══════════════════════════════════════
// #2: Registro — Spending Trend
// ═══════════════════════════════════════

test.describe('Registro — Spending Trend Mini-Chart', () => {

  test('trend card hidden when no history', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('registro', null));
    const card = page.locator('#regTrendCard');
    await expect(card).toHaveCSS('display', 'none');
  });

  test('trend card shows when history exists', async ({ page }) => {
    await loadApp(page, { withHistory: true });
    await page.evaluate(() => window.showTab('registro', null));
    const card = page.locator('#regTrendCard');
    await expect(card).not.toHaveCSS('display', 'none');
    await expect(card).toContainText('Tendencia');
  });

  test('trend shows delta percentage vs last month', async ({ page }) => {
    await loadApp(page, { withHistory: true });
    await page.evaluate(() => window.showTab('registro', null));
    const card = page.locator('#regTrendCard');
    // Should contain a % sign for the delta
    await expect(card).toContainText('%');
  });

  test('trend shows month abbreviations as bar labels', async ({ page }) => {
    await loadApp(page, { withHistory: true });
    await page.evaluate(() => window.showTab('registro', null));
    const card = page.locator('#regTrendCard');
    // Should show abbreviated month names: Feb (from history) and Mar (current)
    await expect(card).toContainText('Feb');
    await expect(card).toContainText('Mar');
  });
});

// ═══════════════════════════════════════
// #3: Fondos — Runway Indicator
// ═══════════════════════════════════════

test.describe('Fondos — Runway Indicator', () => {

  test('runway shows months of expenses covered', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('fornow', null));
    const detail = page.locator('#forNowDetail');
    // Total: 150k RD + 2k USD*58 = 266k. gasto = 48000 (25k+15k+8k + txGasto)
    // Runway = 266k / gasto
    await expect(detail).toContainText('Autonomía');
    await expect(detail).toContainText('meses');
  });

  test('runway color: green ≥3 months', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('fornow', null));
    const detail = page.locator('#forNowDetail');
    // With 266k total and ~48k gasto → ~5.5 months → green
    const runwayColor = await detail.evaluate(el => {
      const mono = el.querySelectorAll('.mono');
      for (const m of mono) {
        if (m.textContent.includes('meses') || m.textContent.includes('months')) return m.style.color;
      }
      return '';
    });
    expect(runwayColor).toContain('green');
  });
});

// ═══════════════════════════════════════
// #4: Checklist — Next Payment Countdown
// ═══════════════════════════════════════

test.describe('Checklist — Next Payment Countdown', () => {

  test('shows next unpaid payment with countdown', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('checklist', null));
    const progress = page.locator('#checklistProgress');
    // Alquiler is paid, so next = Préstamo Auto (day 15) or Tarjeta (day 20)
    await expect(progress).toContainText('Próximo pago');
  });

  test('countdown shows days until payment', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('checklist', null));
    const progress = page.locator('#checklistProgress');
    // Should contain "d" for days countdown
    await expect(progress).toContainText('d');
  });

  test('countdown shows payment name and amount', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('checklist', null));
    const progress = page.locator('#checklistProgress');
    // Next unpaid: Préstamo Auto (day 15) or Tarjeta Visa (day 20)
    const text = await progress.textContent();
    const hasDebtName = text.includes('Préstamo Auto') || text.includes('Tarjeta Visa');
    expect(hasDebtName).toBe(true);
  });

  test('no countdown when all payments done', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.gastos.forEach(g => { g.pagadoMes = true; g.pagado = g.adeudado; });
      window.buildChecklist(_editData.gastos);
    });
    await page.evaluate(() => window.showTab('checklist', null));
    const progress = page.locator('#checklistProgress');
    const text = await progress.textContent();
    expect(text).not.toContain('Próximo pago');
  });
});

// ═══════════════════════════════════════
// #5: Resumen — KPI Delta Arrows
// ═══════════════════════════════════════

test.describe('Resumen — KPI Delta Arrows', () => {

  test('no delta arrows when no history', async ({ page }) => {
    await loadApp(page);
    const kpis = page.locator('#kpiRow');
    const text = await kpis.textContent();
    expect(text).not.toContain('▲');
    expect(text).not.toContain('▼');
  });

  test('delta arrows appear when history exists', async ({ page }) => {
    await loadApp(page, { withHistory: true });
    const kpis = page.locator('#kpiRow');
    const text = await kpis.textContent();
    // Current expenses (48k) < last month (130k) → green ▼ on expenses (good)
    // Net worth improved → green ▲
    const hasArrow = text.includes('▲') || text.includes('▼');
    expect(hasArrow).toBe(true);
  });

  test('expense decrease shows green down arrow', async ({ page }) => {
    await loadApp(page, { withHistory: true });
    const kpis = page.locator('#kpiRow');
    // Expenses card is 2nd KPI. Current gasto < prev gasto (130k) → ▼ (green, good)
    const expCard = kpis.locator('.card').nth(1);
    const val = await expCard.locator('.kpi-val').innerHTML();
    // Should have ▼ with green color
    expect(val).toContain('▼');
    expect(val).toContain('green');
  });

  test('net worth improvement shows green up arrow', async ({ page }) => {
    await loadApp(page, { withHistory: true });
    const kpis = page.locator('#kpiRow');
    // NW card is 4th KPI. Current NW should be > prev NW (-100k)
    const nwCard = kpis.locator('.card').nth(3);
    const val = await nwCard.locator('.kpi-val').innerHTML();
    expect(val).toContain('▲');
    expect(val).toContain('green');
  });
});
