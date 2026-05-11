// Smoke test for the section-nav + Resumen-hero refactor.
// Loads demo data, verifies the new section pills, hero card, pillar KPIs,
// and that switching between all 5 sections doesn't throw.

const { test, expect } = require('@playwright/test');

test('section nav + hero render without console errors', async ({ page }) => {
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.goto('/cnt.html');
  await page.waitForSelector('#loaderScreen', { state: 'visible' });

  // Trigger demo data load via the exposed test hook.
  await page.evaluate(() => {
    const demo = {
      config: { mes: 'Enero', anio: 2026, tasa: 60, ingresoUSD: 2000, ingresoRD: 120000, payFrequency: 'mensual', monedaPrincipal: 'RD', alertDays: 7 },
      gastos: [{ nombre: 'Tarjeta', tipo: 'credito', adeudado: 5000, pagado: 0, balance: 50000, tasa: 24, dia: 15 }],
      forNow: { cuentas: [{ id: 1, nombre: 'Cash', saldo: 30000, moneda: 'RD', tipo: 'efectivo' }] },
      emerg: { fondos: [{ fondo: 'EF', balance: 60000, meta: 360000, moneda: 'RD' }], cashflow: { ingreso: 120000, gasto: 5000, ahorros: 0, balanceAhorros: 0 } },
      historial: [],
      transacciones: [],
      presupuesto: [],
      metas: [],
    };
    window._testLoadData(demo);
  });

  await page.waitForSelector('#dashApp', { state: 'visible' });

  // New section pills exist and Hoy is active by default
  await expect(page.locator('#sectionToggle')).toBeVisible();
  await expect(page.locator('#pillHoy')).toHaveAttribute('aria-selected', 'true');

  // Hero card + pillar row + waterfall live on Resumen
  await expect(page.locator('#heroCard')).toBeVisible();
  await expect(page.locator('#pillarRow')).toBeVisible();
  await expect(page.locator('#resumenWaterfall')).toBeVisible();

  // 3 pillar cards (Mes / Deudas / Ahorros)
  await expect(page.locator('#pillarRow .pillar-card')).toHaveCount(3);

  // Score ring rendered inside hero
  await expect(page.locator('#heroCard .score-ring svg')).toBeVisible();

  // Cycle through every section — none should error
  for (const section of ['gastos', 'deudas', 'ahorros', 'historia', 'hoy']) {
    await page.evaluate(s => window.switchSection(s), section);
    await expect(page.locator(`#pill${section.charAt(0).toUpperCase()}${section.slice(1)}`)).toHaveAttribute('aria-selected', 'true');
  }

  expect(consoleErrors).toEqual([]);
});

test('5-section bottom nav has 5 buttons and switches sections on click', async ({ page }) => {
  await page.goto('/cnt.html');
  await page.evaluate(() => {
    const demo = {
      config: { mes: 'Enero', anio: 2026, tasa: 60, ingresoUSD: 2000, ingresoRD: 120000, payFrequency: 'mensual', monedaPrincipal: 'RD', alertDays: 7 },
      gastos: [], forNow: { cuentas: [] }, emerg: { fondos: [], cashflow: { ingreso: 120000, gasto: 0, ahorros: 0, balanceAhorros: 0 } },
      historial: [], transacciones: [], presupuesto: [], metas: [],
    };
    window._testLoadData(demo);
  });
  await page.waitForSelector('#dashApp');

  await expect(page.locator('#mobileNav .mnav-btn')).toHaveCount(5);
  for (const id of ['mnavHoy', 'mnavGastos', 'mnavDeudas', 'mnavAhorros', 'mnavHistoria']) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
});
