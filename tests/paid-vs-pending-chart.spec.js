const { test, expect } = require('@playwright/test');

/**
 * "Paid vs Pending" stacked bar — the original bug report.
 *
 * The green segment used `g.pagado` raw. That field is an ACCUMULATOR, not
 * "paid toward this month's cuota": _detectPaymentsFromBalanceChanges does
 * `g.pagado = (g.pagado||0) + diff`, and the edit form lets any value be typed.
 * So paying RD$5,000 toward a card with an RD$1,800 minimum drew a bar nearly
 * 3x taller than its own cuota, with no red left — and "what is still owed",
 * the entire point of the chart, became unreadable.
 *
 * Three further defects on the same lines:
 *   - The datasets were not marked `stack:'s'`, so nothing guaranteed they
 *     shared a stack.
 *   - Raw RD$ was fed to a tooltip using fmtC, which formats but does not
 *     convert — in USD mode the chart showed RD$ figures labelled '$'.
 *   - The y-axis tick was `(v/1000).toFixed(0)+'k'`, which renders every tick
 *     as "0k" once values are in USD.
 *
 * Sub-suites:
 *   1. gastoPagadoMes / gastoPendienteMes — the clamp
 *   2. The invariant: paid + pending always equals the cuota
 *   3. Chart wiring (stacking, currency, labels)
 *   4. axisTick
 *   5. i18n of the chart titles and series
 */

function baseData() {
  return {
    config: { tasa: 60, mes: 'Marzo', anio: 2026, ingresoUSD: 3000, payFrequency: 'mensual', monedaPrincipal: 'RD' },
    gastos: [
      { nombre: 'Luz', tipo: 'Servicio', pagado: 0, adeudado: 2400, dia: 12, tasa: 0, balance: 0, pagadoMes: false },
      { nombre: 'Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 1800, dia: 22, tasa: 60, balance: 22500, pagadoMes: false },
    ],
    forNow: { cuentas: [{ id: 'c1', nombre: 'Banco', moneda: 'RD', saldo: 500000, tipo: 'banco' }], fecha: '2026-03-01', total: 500000 },
    emerg: { fondos: [], cashflow: { ingreso: 0, gasto: 0, tasa: 60, retirarUSD: 0, ahorros: 0, balanceAhorros: 0 } },
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

// Chart.js builds on a timer inside buildDashboard.
async function waitForBarChart(page) {
  await page.waitForFunction(() => window.charts && window.charts.barChart, null, { timeout: 5000 });
}

// ───────────────────────────────────────────────────────────────────
// 1. The clamp
// ───────────────────────────────────────────────────────────────────
test.describe('gastoPagadoMes / gastoPendienteMes', () => {
  test('nothing paid: the whole cuota is pending', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => {
      const g = { adeudado: 3200, pagado: 0, pagadoMes: false };
      return [window.gastoPagadoMes(g), window.gastoPendienteMes(g)];
    });
    expect(r).toEqual([0, 3200]);
  });

  test('checked off in the checklist: fully paid', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => {
      const g = { adeudado: 3200, pagado: 3200, pagadoMes: true };
      return [window.gastoPagadoMes(g), window.gastoPendienteMes(g)];
    });
    expect(r).toEqual([3200, 0]);
  });

  test('flagged paid with no amount still reads as paid', async ({ page }) => {
    // Reachable by clearing `pagado` in the edit form while pagadoMes stays
    // true. The old code drew a full red bar for something already paid.
    await openApp(page);
    const r = await page.evaluate(() => {
      const g = { adeudado: 3200, pagado: 0, pagadoMes: true };
      return [window.gastoPagadoMes(g), window.gastoPendienteMes(g)];
    });
    expect(r).toEqual([3200, 0]);
  });

  test('a partial abono splits the bar', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => {
      const g = { adeudado: 3200, pagado: 1200, pagadoMes: false };
      return [window.gastoPagadoMes(g), window.gastoPendienteMes(g)];
    });
    expect(r).toEqual([1200, 2000]);
  });

  test('an overpayment is clamped to the cuota — the original bug', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => {
      // RD$5,000 accumulated against an RD$1,800 minimum.
      const g = { adeudado: 1800, pagado: 5000, pagadoMes: false };
      return [window.gastoPagadoMes(g), window.gastoPendienteMes(g)];
    });
    expect(r).toEqual([1800, 0]);
  });

  test('a negative pagado does not produce a negative segment', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => {
      const g = { adeudado: 1800, pagado: -500, pagadoMes: false };
      return [window.gastoPagadoMes(g), window.gastoPendienteMes(g)];
    });
    expect(r).toEqual([0, 1800]);
  });

  test('a gasto with no cuota contributes nothing', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => [
      window.gastoPagadoMes({ adeudado: 0, pagado: 900 }),
      window.gastoPendienteMes({ adeudado: 0, pagado: 900 }),
      window.gastoPagadoMes(null),
      window.gastoPendienteMes(undefined),
    ]);
    expect(r).toEqual([0, 0, 0, 0]);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. The invariant
// ───────────────────────────────────────────────────────────────────
test.describe('Paid + pending always equals the cuota', () => {
  test('holds across every payment state', async ({ page }) => {
    await openApp(page);
    const rows = await page.evaluate(() => {
      const cases = [
        { adeudado: 3200, pagado: 0, pagadoMes: false },
        { adeudado: 3200, pagado: 3200, pagadoMes: true },
        { adeudado: 3200, pagado: 0, pagadoMes: true },
        { adeudado: 3200, pagado: 1200, pagadoMes: false },
        { adeudado: 1800, pagado: 12000, pagadoMes: false },
        { adeudado: 1800, pagado: -500, pagadoMes: false },
        { adeudado: 650, pagado: 650.5, pagadoMes: false },
      ];
      return cases.map(g => ({
        cuota: g.adeudado,
        sum: window.gastoPagadoMes(g) + window.gastoPendienteMes(g),
      }));
    });
    rows.forEach(r => expect(r.sum, `paid+pending should equal ${r.cuota}`).toBeCloseTo(r.cuota, 9));
  });

  test('every bar in the chart sums to its own cuota', async ({ page }) => {
    await loadWith(page, "d.gastos[1].pagado=12000");
    await waitForBarChart(page);
    const rows = await page.evaluate(() => {
      const c = window.charts.barChart;
      return c.data.datasets[0].data.map((paid, i) => ({
        paid, pending: c.data.datasets[1].data[i],
      }));
    });
    const cuotas = [2400, 1800];
    rows.forEach((r, i) => expect(r.paid + r.pending).toBeCloseTo(cuotas[i], 6));
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Chart wiring
// ───────────────────────────────────────────────────────────────────
test.describe('barChart wiring', () => {
  test('both datasets share one stack', async ({ page }) => {
    await loadWith(page);
    await waitForBarChart(page);
    const stacks = await page.evaluate(() => window.charts.barChart.data.datasets.map(d => d.stack));
    expect(stacks[0]).toBeDefined();
    expect(stacks[0]).toBe(stacks[1]);
  });

  test('the axes are stacked', async ({ page }) => {
    await loadWith(page);
    await waitForBarChart(page);
    const sc = await page.evaluate(() => {
      const s = window.charts.barChart.options.scales;
      return { x: s.x.stacked, y: s.y.stacked };
    });
    expect(sc).toEqual({ x: true, y: true });
  });

  test('values are converted to the display currency', async ({ page }) => {
    // RD$2,400 at tasa 60 is $40. The old code passed raw RD$ to a tooltip
    // using fmtC, which formats but does not convert.
    await loadWith(page, "d.config.monedaPrincipal='USD';d.gastos[0].pagadoMes=true;d.gastos[0].pagado=2400");
    await waitForBarChart(page);
    const paid = await page.evaluate(() => window.charts.barChart.data.datasets[0].data[0]);
    expect(paid).toBeCloseTo(40, 6);
  });

  test('RD$ mode passes values through unconverted', async ({ page }) => {
    await loadWith(page, "d.gastos[0].pagadoMes=true;d.gastos[0].pagado=2400");
    await waitForBarChart(page);
    const paid = await page.evaluate(() => window.charts.barChart.data.datasets[0].data[0]);
    expect(paid).toBeCloseTo(2400, 6);
  });

  test('only commitments with a cuota are plotted', async ({ page }) => {
    await loadWith(page, "d.gastos.push({nombre:'Liquidada',tipo:'Fijo',pagado:0,adeudado:0,dia:1,tasa:0,balance:0,pagadoMes:false})");
    await waitForBarChart(page);
    const labels = await page.evaluate(() => window.charts.barChart.data.labels);
    expect(labels).toHaveLength(2);
    expect(labels.join(' ')).not.toMatch(/Liquidada/);
  });

  test('checking a payment moves it from red to green', async ({ page }) => {
    await loadWith(page);
    await waitForBarChart(page);
    const before = await page.evaluate(() => ({
      paid: window.charts.barChart.data.datasets[0].data[0],
      pending: window.charts.barChart.data.datasets[1].data[0],
    }));
    await page.evaluate(() => window._testToggleWithMethod(0, 'transferencia'));
    await waitForBarChart(page);
    const after = await page.evaluate(() => ({
      paid: window.charts.barChart.data.datasets[0].data[0],
      pending: window.charts.barChart.data.datasets[1].data[0],
    }));
    expect(before).toEqual({ paid: 0, pending: 2400 });
    expect(after).toEqual({ paid: 2400, pending: 0 });
  });

  test('the Gastos-tab chart uses the same clamped figures', async ({ page }) => {
    await loadWith(page, "d.gastos[1].pagado=12000");
    await page.waitForFunction(() => window.charts && window.charts.gastosBar, null, { timeout: 5000 });
    const rows = await page.evaluate(() => {
      const c = window.charts.gastosBar;
      return c.data.datasets[0].data.map((paid, i) => paid + c.data.datasets[1].data[i]);
    });
    expect(rows[1]).toBeCloseTo(1800, 6);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. axisTick
// ───────────────────────────────────────────────────────────────────
test.describe('axisTick', () => {
  test('picks a unit from the magnitude instead of collapsing to 0k', async ({ page }) => {
    await openApp(page);
    const out = await page.evaluate(() => [0, 50, 200, 1200, 12000, 250000, 2500000].map(v => window.axisTick(v)));
    expect(out).toEqual(['0', '50', '200', '1.2k', '12k', '250k', '2.5M']);
  });

  test('small USD-scale values stay readable', async ({ page }) => {
    await openApp(page);
    // The old callback rendered every one of these as "0k".
    const out = await page.evaluate(() => [40, 100, 300].map(v => window.axisTick(v)));
    expect(out.every(s => s !== '0k')).toBe(true);
  });

  test('negative values keep their sign', async ({ page }) => {
    await openApp(page);
    const out = await page.evaluate(() => [-1500, -2000000].map(v => window.axisTick(v)));
    expect(out[0]).toMatch(/^-1\.5k$/);
    expect(out[1]).toMatch(/^-2\.0M$/);
  });

  test('both stacked charts use it', async ({ page }) => {
    await loadWith(page);
    await waitForBarChart(page);
    const same = await page.evaluate(() =>
      window.charts.barChart.options.scales.y.ticks.callback === window.axisTick);
    expect(same).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Chart i18n', () => {
  test('the two Resumen card titles translate', async ({ page }) => {
    await loadWith(page);
    const es = await page.evaluate(() => [t('panel_resumen_pie'), t('panel_resumen_bar')]);
    expect(es).toEqual(['Gastos por Tipo', 'Pagado vs Pendiente']);
    await page.evaluate(() => window._testSetLang('en'));
    const en = await page.evaluate(() => [t('panel_resumen_pie'), t('panel_resumen_bar')]);
    expect(en).toEqual(['Expenses by Type', 'Paid vs Pending']);
  });

  test('the card titles carry data-i18n so applyI18n reaches them', async ({ page }) => {
    await loadWith(page);
    const keys = await page.evaluate(() =>
      [...document.querySelectorAll('#tab-resumen .card-title[data-i18n]')].map(e => e.getAttribute('data-i18n')));
    expect(keys).toContain('panel_resumen_pie');
    expect(keys).toContain('panel_resumen_bar');
  });

  test('the rendered titles follow a language switch', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window._testSetLang('en'));
    await expect(page.locator('#tab-resumen')).toContainText('Paid vs Pending');
    await expect(page.locator('#tab-resumen')).not.toContainText('Pagado vs Pendiente');
  });

  test('the series labels translate', async ({ page }) => {
    await loadWith(page);
    await waitForBarChart(page);
    const es = await page.evaluate(() => window.charts.barChart.data.datasets.map(d => d.label));
    expect(es).toEqual(['Pagado', 'Pendiente']);
    await page.evaluate(() => window._testSetLang('en'));
    await waitForBarChart(page);
    const en = await page.evaluate(() => window.charts.barChart.data.datasets.map(d => d.label));
    expect(en).toEqual(['Paid', 'Pending']);
  });

  test('every chart key resolves in both languages', async ({ page }) => {
    await loadWith(page);
    const keys = ['panel_resumen_pie', 'panel_resumen_bar', 'chart_paid', 'chart_pending', 'nw_year', 'nw_peryear'];
    for (const lang of ['es', 'en']) {
      await page.evaluate(l => window._testSetLang(l), lang);
      const vals = await page.evaluate(ks => ks.map(k => t(k)), keys);
      vals.forEach((v, i) => expect(v, `${keys[i]} missing in ${lang}`).not.toBe(keys[i]));
    }
  });

  test('the net-worth alert no longer hardcodes /año', async ({ page }) => {
    await loadWith(page, "d.gastos[1].balance=500000;d.gastos[1].tasa=60");
    await page.evaluate(() => window._testSetLang('en'));
    await expect(page.locator('#netWorthAlert')).not.toContainText('/año');
    const yr = await page.evaluate(() => t('nw_year'));
    expect(yr).toBe('yr');
  });
});
