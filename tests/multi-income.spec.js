const { test, expect } = require('@playwright/test');

/**
 * Multiple income sources (v4 → v5)
 *
 * config.ingresoUSD was a single scalar, so a second earner, freelance work,
 * or the Dominican regalía pascual (the legally-mandated 13th-month salary)
 * could not be represented. Logged `ingreso` transactions did not help:
 * isExpenseTx deliberately excludes them and no KPI summed them, so that money
 * moved the wallet and nothing else — savings rate, DTI, budget and the health
 * score were all computed against an income figure that was simply wrong.
 *
 * config.ingresos[] is now the source of truth. ingresoUSD/ingresoRD survive as
 * derived mirrors so any read site missed during the migration degrades to a
 * sane number rather than undefined.
 *
 * Sub-suites:
 *   1. v4 → v5 migration
 *   2. Aggregation across sources and cadences
 *   3. perPayIncomeRD — only the primary cadence lands on a pay day
 *   4. Mirrors stay in step
 *   5. Legacy tolerance (un-migrated configs)
 *   6. Edit modal Ingresos tab
 *   7. Demo data
 *   8. i18n
 */

function baseData() {
  return {
    config: { tasa: 60, mes: 'Marzo', anio: 2026, ingresoUSD: 2000, payFrequency: 'mensual', monedaPrincipal: 'RD' },
    gastos: [],
    forNow: { cuentas: [{ nombre: 'Banco', moneda: 'RD', saldo: 10000, tipo: 'banco' }], fecha: '2026-03-01', total: 10000 },
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

// ───────────────────────────────────────────────────────────────────
// 1. Migration
// ───────────────────────────────────────────────────────────────────
test.describe('Income — v4 to v5 migration', () => {
  test('the legacy scalar becomes source #1', async ({ page }) => {
    await loadWith(page);
    const src = await page.evaluate(() => _editData.config.ingresos);
    expect(src).toHaveLength(1);
    expect(src[0].monto).toBe(2000);
    expect(src[0].moneda).toBe('USD');
    expect(src[0].frecuencia).toBe('mensual');
    expect(src[0].id).toMatch(/^inc_/);
  });

  test('the seeded source carries the old payFrequency', async ({ page }) => {
    await loadWith(page, "d.config.payFrequency='quincenal'");
    const f = await page.evaluate(() => _editData.config.ingresos[0].frecuencia);
    expect(f).toBe('quincenal');
  });

  test('zero income seeds an empty list, not a zero-value source', async ({ page }) => {
    await loadWith(page, "d.config.ingresoUSD=0");
    const src = await page.evaluate(() => _editData.config.ingresos);
    expect(src).toEqual([]);
  });

  test('migration is idempotent — no duplicate sources on a second pass', async ({ page }) => {
    await loadWith(page);
    const n = await page.evaluate(() => {
      window.migrateData(_editData);
      window.migrateData(_editData);
      return _editData.config.ingresos.length;
    });
    expect(n).toBe(1);
  });

  test('an existing list is never re-seeded from the scalar', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{id:'inc_x',nombre:'Only',monto:99,moneda:'USD',frecuencia:'mensual',tipo:'fijo'}]");
    const src = await page.evaluate(() => _editData.config.ingresos);
    expect(src).toHaveLength(1);
    expect(src[0].monto).toBe(99);
  });

  test('bad enum values are normalized', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{nombre:'X',monto:10,moneda:'EUR',frecuencia:'daily',tipo:'mystery'}]");
    const s = await page.evaluate(() => _editData.config.ingresos[0]);
    expect(s.moneda).toBe('USD');
    expect(s.frecuencia).toBe('mensual');
    expect(s.tipo).toBe('fijo');
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Aggregation
// ───────────────────────────────────────────────────────────────────
test.describe('Income — aggregation', () => {
  test('two monthly sources add up', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{nombre:'A',monto:1000,moneda:'USD',frecuencia:'mensual',tipo:'fijo'},{nombre:'B',monto:500,moneda:'USD',frecuencia:'mensual',tipo:'variable'}]");
    const m = await page.evaluate(() => window.monthlyIncomeUSD(_editData.config));
    expect(m).toBe(1500);
  });

  test('an annual source is amortised across twelve months', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{nombre:'Bonus',monto:12000,moneda:'USD',frecuencia:'anual',tipo:'variable'}]");
    const m = await page.evaluate(() => window.monthlyIncomeUSD(_editData.config));
    expect(m).toBe(1000);
  });

  test('mixed cadences aggregate correctly', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{nombre:'Salary',monto:1000,moneda:'USD',frecuencia:'quincenal',tipo:'fijo'},{nombre:'Bonus',monto:6000,moneda:'USD',frecuencia:'anual',tipo:'variable'}]");
    const m = await page.evaluate(() => window.monthlyIncomeUSD(_editData.config));
    expect(m).toBeCloseTo(1000 * (26 / 12) + 500, 6);
  });

  test('an RD-denominated source converts at tasa', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{nombre:'Sueldo',monto:60000,moneda:'RD',frecuencia:'mensual',tipo:'fijo'}]");
    const res = await page.evaluate(() => ({
      usd: window.monthlyIncomeUSD(_editData.config),
      rd: window.monthlyIncomeRD(_editData.config),
    }));
    expect(res.usd).toBe(1000);
    expect(res.rd).toBe(60000);
  });

  test('a second earner moves the savings-rate denominator', async ({ page }) => {
    await loadWith(page);
    const before = await page.evaluate(() => window.calcDerivedMetrics({ config: _editData.config, gastos: _editData.gastos, forNow: _editData.forNow, emerg: _editData.emerg }).ingreso);
    await page.evaluate(() => {
      _editData.config.ingresos.push({ id: 'inc_2', nombre: 'Spouse', monto: 1000, moneda: 'USD', frecuencia: 'mensual', tipo: 'fijo' });
      window.syncIncomeMirrors(_editData);
    });
    const after = await page.evaluate(() => window.calcDerivedMetrics({ config: _editData.config, gastos: _editData.gastos, forNow: _editData.forNow, emerg: _editData.emerg }).ingreso);
    expect(after - before).toBe(60000); // 1000 USD x tasa 60
  });

  test('hasIncome is false only when nothing is configured', async ({ page }) => {
    await loadWith(page, "d.config.ingresoUSD=0");
    expect(await page.evaluate(() => window.hasIncome(_editData.config))).toBe(false);
    await page.evaluate(() => {
      _editData.config.ingresos = [{ id: 'i', nombre: 'X', monto: 1, moneda: 'USD', frecuencia: 'mensual', tipo: 'fijo' }];
    });
    expect(await page.evaluate(() => window.hasIncome(_editData.config))).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. perPayIncomeRD
// ───────────────────────────────────────────────────────────────────
test.describe('Income — per-pay amount', () => {
  test('only sources on the primary cadence count toward a paycheck', async ({ page }) => {
    await loadWith(page, "d.config.payFrequency='quincenal';d.config.ingresos=[{nombre:'Salary',monto:1000,moneda:'USD',frecuencia:'quincenal',tipo:'fijo'},{nombre:'Bonus',monto:12000,moneda:'USD',frecuencia:'anual',tipo:'variable'}]");
    const perPay = await page.evaluate(() => window.perPayIncomeRD(_editData.config));
    // The yearly bonus must NOT be credited on every pay day.
    expect(perPay).toBe(60000); // 1000 USD x 60
  });

  test('two sources on the same cadence both land on pay day', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{nombre:'A',monto:1000,moneda:'USD',frecuencia:'mensual',tipo:'fijo'},{nombre:'B',monto:200,moneda:'USD',frecuencia:'mensual',tipo:'fijo'}]");
    const perPay = await page.evaluate(() => window.perPayIncomeRD(_editData.config));
    expect(perPay).toBe(72000); // 1200 USD x 60
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Mirrors
// ───────────────────────────────────────────────────────────────────
test.describe('Income — legacy mirrors', () => {
  test('ingresoRD tracks the list total', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{nombre:'A',monto:1000,moneda:'USD',frecuencia:'mensual',tipo:'fijo'},{nombre:'B',monto:500,moneda:'USD',frecuencia:'mensual',tipo:'fijo'}]");
    const rd = await page.evaluate(() => _editData.config.ingresoRD);
    expect(rd).toBe(1500 * 60);
  });

  test('cashflow.ingreso mirrors it too', async ({ page }) => {
    await loadWith(page);
    const res = await page.evaluate(() => ({ cf: _editData.emerg.cashflow.ingreso, rd: _editData.config.ingresoRD }));
    expect(res.cf).toBe(res.rd);
  });

  test('editing a source through the config field updates the primary only', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{id:'a',nombre:'Salary',monto:2000,moneda:'USD',frecuencia:'mensual',tipo:'fijo'},{id:'b',nombre:'Side',monto:500,moneda:'USD',frecuencia:'mensual',tipo:'variable'}]");
    await page.evaluate(() => window.setPrimaryIncomeUSD(_editData.config, 2500));
    const amounts = await page.evaluate(() => _editData.config.ingresos.map(s => s.monto));
    expect(amounts).toEqual([2500, 500]);
  });

  test('changing payFrequency moves the paycheck sources with it', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window.syncConfigField('payFrequency', { value: 'quincenal' }));
    const f = await page.evaluate(() => _editData.config.ingresos.map(s => s.frecuencia));
    expect(f).toEqual(['quincenal']);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Legacy tolerance
// ───────────────────────────────────────────────────────────────────
test.describe('Income — un-migrated configs', () => {
  test('a bare legacy config still yields income', async ({ page }) => {
    await openApp(page);
    const m = await page.evaluate(() => window.monthlyIncomeUSD({ ingresoUSD: 400, payFrequency: 'semanal' }));
    expect(m).toBeCloseTo(400 * 52 / 12, 6);
  });

  test('an empty list plus a legacy amount does not report zero', async ({ page }) => {
    await openApp(page);
    const m = await page.evaluate(() => window.monthlyIncomeRD({ ingresos: [], ingresoUSD: 1000, payFrequency: 'mensual', tasa: 60 }));
    expect(m).toBe(60000);
  });

  test('a genuinely empty config is zero, not NaN', async ({ page }) => {
    await openApp(page);
    const res = await page.evaluate(() => [
      window.monthlyIncomeUSD({}), window.monthlyIncomeRD({}), window.perPayIncomeRD({}),
    ]);
    expect(res).toEqual([0, 0, 0]);
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. Edit modal
// ───────────────────────────────────────────────────────────────────
test.describe('Income — edit modal tab', () => {
  test('the Ingresos tab lists every source', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{nombre:'A',monto:1,moneda:'USD',frecuencia:'mensual',tipo:'fijo'},{nombre:'B',monto:2,moneda:'USD',frecuencia:'anual',tipo:'variable'}]");
    await page.evaluate(() => window.openEditModal());
    await page.click('.edit-tab:has-text("Ingresos")');
    await expect(page.locator('#esection-ingresos')).toHaveClass(/active/);
    await expect(page.locator('#ingresosEditBody tr')).toHaveCount(2);
  });

  test('addIngresoRow appends a source with an id', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => { window.openEditModal(); window.addIngresoRow(); });
    const src = await page.evaluate(() => _editData.config.ingresos);
    expect(src).toHaveLength(2);
    expect(src[1].id).toMatch(/^inc_/);
    expect(src[1].tipo).toBe('variable');
  });

  test('deleting a source updates the total', async ({ page }) => {
    await loadWith(page, "d.config.ingresos=[{id:'a',nombre:'A',monto:1000,moneda:'USD',frecuencia:'mensual',tipo:'fijo'},{id:'b',nombre:'B',monto:500,moneda:'USD',frecuencia:'mensual',tipo:'fijo'}]");
    await page.evaluate(() => { window.openEditModal(); window.deleteIngresoRow(1); });
    const rd = await page.evaluate(() => _editData.config.ingresoRD);
    expect(rd).toBe(1000 * 60);
  });

  test('empty state is shown when all sources are removed', async ({ page }) => {
    await loadWith(page, "d.config.ingresoUSD=0");
    await page.evaluate(() => window.openEditModal());
    await page.click('.edit-tab:has-text("Ingresos")');
    await expect(page.locator('#ingresosEditBody')).toContainText('Sin fuentes de ingreso');
  });
});

// ───────────────────────────────────────────────────────────────────
// 7. Demos
// ───────────────────────────────────────────────────────────────────
test.describe('Income — demo data', () => {
  test('RD demo carries three sources including the regalía', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.loadDemo('RD'));
    await page.waitForSelector('#dashApp', { state: 'visible' });
    const src = await page.evaluate(() => _editData.config.ingresos);
    expect(src).toHaveLength(3);
    expect(src.map(s => s.frecuencia)).toContain('anual');
  });

  test('splitting the demo income preserved the monthly total', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.loadDemo('RD'));
    await page.waitForSelector('#dashApp', { state: 'visible' });
    const rd = await page.evaluate(() => window.monthlyIncomeRD(_editData.config));
    expect(rd).toBeCloseTo(40000, 0);
  });

  test('USD demo totals $6,500/month across three sources', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.loadDemo('USD'));
    await page.waitForSelector('#dashApp', { state: 'visible' });
    const res = await page.evaluate(() => ({ n: _editData.config.ingresos.length, usd: window.monthlyIncomeUSD(_editData.config) }));
    expect(res.n).toBe(3);
    expect(res.usd).toBeCloseTo(6500, 6);
  });
});

// ───────────────────────────────────────────────────────────────────
// 8. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Income — i18n', () => {
  test('every new key resolves in both languages', async ({ page }) => {
    await loadWith(page);
    const keys = ['income_primary', 'income_title', 'income_sub', 'income_nombre', 'income_monto',
      'income_moneda', 'income_frecuencia', 'income_tipo', 'income_tipo_fijo', 'income_tipo_variable',
      'income_freq_mensual', 'income_freq_quincenal', 'income_freq_semanal', 'income_freq_anual',
      'income_total_monthly', 'income_empty', 'edit_add_income', 'edit_tab_ingresos'];
    for (const lang of ['es', 'en']) {
      await page.evaluate(l => window._testSetLang(l), lang);
      const vals = await page.evaluate(ks => ks.map(k => t(k)), keys);
      vals.forEach((v, i) => expect(v, `${keys[i]} missing in ${lang}`).not.toBe(keys[i]));
    }
  });
});
