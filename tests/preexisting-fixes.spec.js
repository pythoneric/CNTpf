const { test, expect } = require('@playwright/test');

/**
 * Pre-existing bugs found during the v5 work, fixed here.
 *
 * 1. `new Date('YYYY-MM-DD')` is spec'd as UTC midnight, so west of Greenwich
 *    (the Dominican Republic is UTC-4) every stored calendar date landed on the
 *    previous day. Due dates rendered one day early and the 60-day deadline
 *    window was off by one at its boundary. parseLocalDate() now parses the
 *    plain-date form component-wise.
 * 2. `_cierreSteps` was a module-level const evaluated once at load, with
 *    hardcoded Spanish labels and frozen currencySymbol() calls. The
 *    close-month wizard never translated and kept a stale currency symbol.
 * 3. fondoToRD read the global _editData for its exchange rate, so converting
 *    another object's funds silently used the wrong rate.
 *
 * Sub-suites:
 *   1. parseLocalDate
 *   2. Dates through the UI
 *   3. Close-month wizard i18n + currency
 *   4. fondoToRD rate injection
 */

function baseData() {
  return {
    config: { tasa: 60, mes: 'Marzo', anio: 2026, ingresoUSD: 3000, payFrequency: 'mensual', monedaPrincipal: 'RD' },
    gastos: [
      { nombre: 'Tarjeta', tipo: 'Tarjeta', pagado: 0, adeudado: 3000, dia: 15, tasa: 24,
        balance: 50000, originalRD: 60000, fechaLimite: '2026-12-15', notas: '', pagadoMes: false },
    ],
    forNow: { cuentas: [{ id: 'cnt_a', nombre: 'Banco', moneda: 'RD', saldo: 100000, tipo: 'banco' }], fecha: '2026-03-01', total: 100000 },
    emerg: { fondos: [{ fondo: 'EF', moneda: 'USD', balance: 1000, meta: 2000 }], cashflow: { ingreso: 0, gasto: 0, tasa: 60, retirarUSD: 0, ahorros: 0, balanceAhorros: 0 } },
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
// 1. parseLocalDate
// ───────────────────────────────────────────────────────────────────
test.describe('parseLocalDate', () => {
  test('a plain date keeps its calendar day regardless of timezone offset', async ({ page }) => {
    await openApp(page);
    const res = await page.evaluate(() => {
      const d = window.parseLocalDate('2026-12-15');
      return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() };
    });
    expect(res).toEqual({ y: 2026, m: 12, day: 15 });
  });

  test('the native parser would have shifted it — this is the bug being locked down', async ({ page }) => {
    await openApp(page);
    const res = await page.evaluate(() => ({
      native: new Date('2026-12-15').getDate(),
      fixed: window.parseLocalDate('2026-12-15').getDate(),
      offsetMinutes: new Date().getTimezoneOffset(),
    }));
    expect(res.fixed).toBe(15);
    // Only assert the native shift where the runner actually sits west of UTC;
    // in UTC or east of it the two agree and there is nothing to demonstrate.
    if (res.offsetMinutes > 0) expect(res.native).toBe(14);
  });

  test('January 1st does not read as the previous December', async ({ page }) => {
    await openApp(page);
    const res = await page.evaluate(() => {
      const d = window.parseLocalDate('2027-01-01');
      return { y: d.getFullYear(), m: d.getMonth() };
    });
    expect(res).toEqual({ y: 2027, m: 0 });
  });

  test('a Date instance passes through untouched', async ({ page }) => {
    await openApp(page);
    const same = await page.evaluate(() => {
      const d = new Date(2026, 5, 10);
      return window.parseLocalDate(d).getTime() === d.getTime();
    });
    expect(same).toBe(true);
  });

  test('datetime strings still parse as local time', async ({ page }) => {
    await openApp(page);
    const day = await page.evaluate(() => window.parseLocalDate('2026-12-15T10:30:00').getDate());
    expect(day).toBe(15);
  });

  test('empty and junk values yield an invalid date, not a crash', async ({ page }) => {
    await openApp(page);
    const res = await page.evaluate(() => ['', null, undefined, 'nope'].map(v => isNaN(window.parseLocalDate(v).getTime())));
    expect(res).toEqual([true, true, true, true]);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Dates through the UI
// ───────────────────────────────────────────────────────────────────
test.describe('Dates — rendered values', () => {
  test('a debt deadline renders on its stored day, not the day before', async ({ page }) => {
    await loadWith(page);
    const txt = await page.evaluate(() => window.fmtFecha('2026-12-15'));
    expect(txt).toMatch(/15/);
    expect(txt).not.toMatch(/14/);
  });

  test('a month-boundary date does not fall into the previous month', async ({ page }) => {
    await loadWith(page);
    const txt = await page.evaluate(() => window.fmtFecha('2026-12-01', { day: 'numeric', month: 'numeric', year: 'numeric' }));
    expect(txt).toMatch(/12/);
    expect(txt).not.toMatch(/^30|^11\/30/);
  });

  test('the debt card shows the stored deadline day', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window.switchSection('deudas'));
    await expect(page.locator('#deudaCards')).toContainText('2026');
  });

  test('sinking-fund horizon is a full year for a date twelve months out', async ({ page }) => {
    await loadWith(page);
    const months = await page.evaluate(() =>
      window.sinkingMonthsLeft({ cadencia: 'anual', proximaFecha: '2027-01-01' }, new Date(2026, 0, 15)));
    expect(months).toBe(12);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Close-month wizard
// ───────────────────────────────────────────────────────────────────
test.describe('Close-month wizard — labels follow language and currency', () => {
  test('step 1 label translates to English', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window._testSetLang('en'));
    const label = await page.evaluate(() => window.cierreSteps()[0].fields[0].label);
    expect(label).toMatch(/USD rate/);
  });

  test('step 1 label is Spanish when the language is Spanish', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window._testSetLang('es'));
    const label = await page.evaluate(() => window.cierreSteps()[0].fields[0].label);
    expect(label).toMatch(/Tasa/);
  });

  test('amount labels follow the primary currency symbol', async ({ page }) => {
    await loadWith(page);
    const rd = await page.evaluate(() => window.cierreSteps()[3].fields[0].label);
    expect(rd).toContain('RD$');
    await page.evaluate(() => { _editData.config.monedaPrincipal = 'USD'; });
    const usd = await page.evaluate(() => window.cierreSteps()[3].fields[0].label);
    expect(usd).toContain('$');
    expect(usd).not.toContain('RD$');
  });

  test('the rendered wizard shows English labels after a language switch', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window._testSetLang('en'));
    await page.evaluate(() => { openCierre(); _cierreStep = 0; renderCierre(); });
    await expect(page.locator('#cierreSteps')).toContainText('USD rate');
  });

  test('savings labels translate too', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window._testSetLang('en'));
    const labels = await page.evaluate(() => window.cierreSteps()[5].fields.map(f => f.label));
    expect(labels[0]).toMatch(/Savings this month/);
    expect(labels[1]).toMatch(/Total savings balance/);
  });

  test('all wizard field labels resolve — none fall through to their key', async ({ page }) => {
    await loadWith(page);
    for (const lang of ['es', 'en']) {
      await page.evaluate(l => window._testSetLang(l), lang);
      const labels = await page.evaluate(() => window.cierreSteps().flatMap(s => s.fields.map(f => f.label)));
      labels.forEach(l => expect(l, `unresolved label in ${lang}: ${l}`).not.toMatch(/^cw_|^ecfg_/));
    }
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. fondoToRD
// ───────────────────────────────────────────────────────────────────
test.describe('fondoToRD — explicit rate', () => {
  test('an injected rate is used instead of the global', async ({ page }) => {
    await loadWith(page);
    const res = await page.evaluate(() => ({
      global: window.fondoToRD({ moneda: 'USD', balance: 100, meta: 0 }).balance,
      injected: window.fondoToRD({ moneda: 'USD', balance: 100, meta: 0 }, 55).balance,
    }));
    expect(res.global).toBe(6000);  // global tasa 60
    expect(res.injected).toBe(5500); // injected 55
  });

  test('omitting the rate keeps the previous behaviour', async ({ page }) => {
    await loadWith(page);
    const v = await page.evaluate(() => window.fondoToRD({ moneda: 'RD', balance: 1234, meta: 0 }).balance);
    expect(v).toBe(1234);
  });

  test('a standalone object is converted at ITS rate, not the global one', async ({ page }) => {
    await loadWith(page);
    const res = await page.evaluate(() => {
      const d = {
        config: { tasa: 10 },
        forNow: { cuentas: [{ id: 'x', nombre: 'A', moneda: 'USD', saldo: 100, tipo: 'banco' }] },
        emerg: { fondos: [{ moneda: 'USD', balance: 100 }], cashflow: { balanceAhorros: 0 } },
        gastos: [],
      };
      return { nw: window.netWorthRD(d), earmarked: window.earmarkedTotalRD(d) };
    });
    // 100 USD at the object's own rate of 10 — not the loaded app's 60. Both
    // the holdings term and the earmark term must honour the passed-in rate.
    expect(res.nw).toBe(1000);
    expect(res.earmarked).toBe(1000);
  });
});
