const { test, expect } = require('@playwright/test');

/**
 * Retirement & long-horizon investing
 *
 * 'inversion' existed as a cuenta label with no behaviour: no contributions, no
 * return assumption, no target. The app modelled the next 30 days well and the
 * next 30 years not at all.
 *
 * Everything is computed in REAL terms. Projecting a 7% nominal return against
 * a target priced in present-day money would overstate the outcome by roughly
 * inflation compounded over the whole horizon — at 3% over 35 years that is a
 * ~180% overstatement of purchasing power.
 *
 * Sub-suites:
 *   1. Rate maths (Fisher, not subtraction)
 *   2. Future value / required contribution
 *   3. Balance sourcing (no double entry)
 *   4. Target — the 25x rule
 *   5. Verdict
 *   6. Schema + migration
 *   7. Tab rendering
 *   8. i18n
 */

function baseData() {
  return {
    config: { tasa: 60, mes: 'Marzo', anio: 2026, ingresoUSD: 3000, payFrequency: 'mensual', monedaPrincipal: 'RD' },
    gastos: [
      { nombre: 'Gastos', tipo: 'Fijo', pagado: 0, adeudado: 100000, dia: 1, tasa: 0, balance: 0, pagadoMes: false },
    ],
    forNow: {
      cuentas: [
        { id: 'cnt_bank', nombre: 'Banco', moneda: 'RD', saldo: 50000, tipo: 'banco' },
        { id: 'cnt_inv', nombre: 'Brokerage', moneda: 'RD', saldo: 600000, tipo: 'inversion' },
      ], fecha: '2026-03-01', total: 650000,
    },
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
// 1. Rate maths
// ───────────────────────────────────────────────────────────────────
test.describe('Retirement — real rate', () => {
  test('uses the Fisher relation, not nominal minus inflation', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => window.realRate(7, 3));
    expect(r).toBeCloseTo(1.07 / 1.03 - 1, 12);
    // The naive form would give exactly 0.04; Fisher is slightly lower.
    expect(r).toBeLessThan(0.04);
  });

  test('zero inflation leaves the nominal rate untouched', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => window.realRate(7, 0))).toBeCloseTo(0.07, 12);
  });

  test('inflation above the return gives a negative real rate', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => window.realRate(2, 8))).toBeLessThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Future value / required contribution
// ───────────────────────────────────────────────────────────────────
test.describe('Retirement — projection maths', () => {
  test('future value of a lump sum compounds', async ({ page }) => {
    await openApp(page);
    const v = await page.evaluate(() => window.futureValue(1000, 0, 0.01, 12));
    expect(v).toBeCloseTo(1000 * Math.pow(1.01, 12), 6);
  });

  test('a zero rate degrades to simple addition without dividing by zero', async ({ page }) => {
    await openApp(page);
    const v = await page.evaluate(() => window.futureValue(1000, 100, 0, 10));
    expect(v).toBe(2000);
  });

  test('contributions accumulate as an annuity', async ({ page }) => {
    await openApp(page);
    const v = await page.evaluate(() => window.futureValue(0, 100, 0.01, 12));
    expect(v).toBeCloseTo(100 * ((Math.pow(1.01, 12) - 1) / 0.01), 6);
  });

  test('zero months returns the present value unchanged', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => window.futureValue(1234, 500, 0.01, 0))).toBe(1234);
  });

  test('requiredContribution inverts futureValue', async ({ page }) => {
    await openApp(page);
    const res = await page.evaluate(() => {
      const need = window.requiredContribution(100000, 10000, 0.005, 120);
      return { need, check: window.futureValue(10000, need, 0.005, 120) };
    });
    expect(res.check).toBeCloseTo(100000, 4);
  });

  test('already-there needs no further contribution', async ({ page }) => {
    await openApp(page);
    const need = await page.evaluate(() => window.requiredContribution(1000, 5000, 0.005, 120));
    expect(need).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Balance sourcing
// ───────────────────────────────────────────────────────────────────
test.describe('Retirement — invested balance', () => {
  test('only flagged accounts count', async ({ page }) => {
    await loadWith(page, "d.retiro={cuentasIds:['cnt_inv']}");
    const b = await page.evaluate(() => window.retirementBalanceRD(_editData));
    expect(b).toBe(600000);
  });

  test('unflagged accounts are excluded', async ({ page }) => {
    await loadWith(page, "d.retiro={cuentasIds:[]}");
    const b = await page.evaluate(() => window.retirementBalanceRD(_editData));
    expect(b).toBe(0);
  });

  test('investment-type assets are included automatically', async ({ page }) => {
    await loadWith(page, "d.retiro={cuentasIds:[]};d.activos=[{nombre:'401k',tipo:'inversion',valor:250000,moneda:'RD'}]");
    const b = await page.evaluate(() => window.retirementBalanceRD(_editData));
    expect(b).toBe(250000);
  });

  test('non-investment assets are not counted as retirement savings', async ({ page }) => {
    await loadWith(page, "d.retiro={cuentasIds:[]};d.activos=[{nombre:'Casa',tipo:'inmueble',valor:5000000,moneda:'RD'}]");
    const b = await page.evaluate(() => window.retirementBalanceRD(_editData));
    expect(b).toBe(0);
  });

  test('a USD account converts at tasa', async ({ page }) => {
    await loadWith(page, "d.forNow.cuentas.push({id:'cnt_usd',nombre:'Fidelity',moneda:'USD',saldo:1000,tipo:'inversion'});d.retiro={cuentasIds:['cnt_usd']}");
    const b = await page.evaluate(() => window.retirementBalanceRD(_editData));
    expect(b).toBe(60000);
  });

  test('a stale account reference is dropped by migration', async ({ page }) => {
    await loadWith(page, "d.retiro={cuentasIds:['cnt_deleted']}");
    const ids = await page.evaluate(() => _editData.retiro.cuentasIds);
    expect(ids).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Target
// ───────────────────────────────────────────────────────────────────
test.describe('Retirement — target', () => {
  test('25x annual spending', async ({ page }) => {
    await loadWith(page);
    const t = await page.evaluate(() => window.retirementTargetRD(_editData));
    expect(t).toBe(100000 * 12 * 25);
  });

  test('no expenses means no computable target', async ({ page }) => {
    await loadWith(page, "d.gastos=[]");
    const res = await page.evaluate(() => ({ t: window.retirementTargetRD(_editData), r: window.calcRetirement(_editData).hasTarget }));
    expect(res.t).toBe(0);
    expect(res.r).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Verdict
// ───────────────────────────────────────────────────────────────────
test.describe('Retirement — verdict', () => {
  test('a large balance and short horizon reads on track', async ({ page }) => {
    await loadWith(page, "d.gastos=[{nombre:'G',tipo:'Fijo',pagado:0,adeudado:1000,dia:1,tasa:0,balance:0,pagadoMes:false}];d.retiro={edadActual:60,edadRetiro:65,aporteMensual:0,cuentasIds:['cnt_inv']}");
    const r = await page.evaluate(() => window.calcRetirement(_editData));
    expect(r.onTrack).toBe(true);
    expect(r.shortfallContrib).toBe(0);
  });

  test('an underfunded plan reports the gap and the contribution to close it', async ({ page }) => {
    await loadWith(page, "d.retiro={edadActual:30,edadRetiro:65,aporteMensual:1000,cuentasIds:['cnt_inv']}");
    const r = await page.evaluate(() => window.calcRetirement(_editData));
    expect(r.onTrack).toBe(false);
    expect(r.gap).toBeGreaterThan(0);
    expect(r.needed).toBeGreaterThan(r.contrib);
  });

  test('the suggested contribution actually reaches the target', async ({ page }) => {
    await loadWith(page, "d.retiro={edadActual:30,edadRetiro:65,aporteMensual:1000,cuentasIds:['cnt_inv']}");
    const ok = await page.evaluate(() => {
      const r = window.calcRetirement(_editData);
      const reached = window.futureValue(r.present, r.needed, r.monthlyRate, r.months);
      return reached >= r.target - 1;
    });
    expect(ok).toBe(true);
  });

  test('retiring at the current age gives zero months without dividing by zero', async ({ page }) => {
    await loadWith(page, "d.retiro={edadActual:65,edadRetiro:65,aporteMensual:1000,cuentasIds:['cnt_inv']}");
    const r = await page.evaluate(() => window.calcRetirement(_editData));
    expect(r.months).toBe(0);
    expect(Number.isFinite(r.projected)).toBe(true);
    expect(r.projected).toBe(600000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. Schema
// ───────────────────────────────────────────────────────────────────
test.describe('Retirement — schema', () => {
  test('defaults are seeded on a payload with no retiro block', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => window.migrateData({ config: {}, forNow: { cuentas: [] } }).retiro);
    expect(r.edadRetiro).toBe(65);
    expect(r.retornoEsperado).toBe(7);
    expect(r.cuentasIds).toEqual([]);
  });

  test('out-of-range assumptions are clamped', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => window.migrateData({
      config: {}, forNow: { cuentas: [] },
      retiro: { edadActual: -5, edadRetiro: 999, retornoEsperado: 900, inflacion: -3, aporteMensual: -100 },
    }).retiro);
    expect(r.edadActual).toBe(0);
    expect(r.edadRetiro).toBe(120);
    expect(r.retornoEsperado).toBe(30);
    expect(r.inflacion).toBe(0);
    expect(r.aporteMensual).toBe(0);
  });

  test('retirement age below current age is lifted, never negative horizon', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => window.migrateData({
      config: {}, forNow: { cuentas: [] }, retiro: { edadActual: 50, edadRetiro: 30 },
    }).retiro);
    expect(r.edadRetiro).toBeGreaterThanOrEqual(r.edadActual);
  });

  test('retiro survives a JSON round-trip', async ({ page }) => {
    await loadWith(page, "d.retiro={edadActual:41,edadRetiro:67,retornoEsperado:6,inflacion:2,aporteMensual:5000,cuentasIds:['cnt_inv']}");
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    const content = await (await download.createReadStream()).toArray();
    const data = JSON.parse(Buffer.concat(content).toString());
    expect(data.retiro.edadActual).toBe(41);
    expect(data.retiro.cuentasIds).toEqual(['cnt_inv']);
  });
});

// ───────────────────────────────────────────────────────────────────
// 7. Tab
// ───────────────────────────────────────────────────────────────────
test.describe('Retirement — tab', () => {
  test('the tab is reachable and renders a verdict', async ({ page }) => {
    await loadWith(page, "d.retiro={edadActual:30,edadRetiro:65,aporteMensual:1000,cuentasIds:['cnt_inv']}");
    await page.evaluate(() => window.showTab('retiro', null));
    await expect(page.locator('#tab-retiro')).toHaveClass(/active/);
    await expect(page.locator('#retiroVerdict')).toContainText('Te falta');
  });

  test('assumption inputs are present and editable', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window.showTab('retiro', null));
    await expect(page.locator('#ret-edadActual')).toBeVisible();
    await page.fill('#ret-edadRetiro', '70');
    await page.locator('#ret-edadRetiro').dispatchEvent('input');
    const age = await page.evaluate(() => _editData.retiro.edadRetiro);
    expect(age).toBe(70);
  });

  test('ticking an account moves the invested balance', async ({ page }) => {
    await loadWith(page, "d.retiro={cuentasIds:[]}");
    await page.evaluate(() => window.showTab('retiro', null));
    const before = await page.evaluate(() => window.retirementBalanceRD(_editData));
    await page.evaluate(() => window.toggleRetiroCuenta('cnt_inv', true));
    const after = await page.evaluate(() => window.retirementBalanceRD(_editData));
    expect(before).toBe(0);
    expect(after).toBe(600000);
  });

  test('the contribution field is entered in display currency', async ({ page }) => {
    await loadWith(page, "d.config.monedaPrincipal='USD'");
    await page.evaluate(() => window.showTab('retiro', null));
    await page.fill('#ret-aporte', '100');
    await page.locator('#ret-aporte').dispatchEvent('input');
    // $100 stored as RD$6,000 at tasa 60.
    const stored = await page.evaluate(() => _editData.retiro.aporteMensual);
    expect(stored).toBe(6000);
  });

  test('no target shows guidance instead of a bogus verdict', async ({ page }) => {
    await loadWith(page, "d.gastos=[]");
    await page.evaluate(() => window.showTab('retiro', null));
    await expect(page.locator('#retiroVerdict')).toContainText('gastos mensuales');
  });

  test('the projection chart is created', async ({ page }) => {
    await loadWith(page, "d.retiro={edadActual:30,edadRetiro:65,aporteMensual:1000,cuentasIds:['cnt_inv']}");
    await page.evaluate(() => window.showTab('retiro', null));
    const has = await page.evaluate(() => !!charts.retiroChart);
    expect(has).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────
// 8. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Retirement — i18n', () => {
  test('every key resolves in both languages', async ({ page }) => {
    await loadWith(page);
    const keys = ['tab_retiro', 'retiro_assumptions', 'retiro_assumptions_note', 'retiro_edad_actual',
      'retiro_edad_retiro', 'retiro_retorno', 'retiro_inflacion', 'retiro_aporte', 'retiro_balance',
      'retiro_projected', 'retiro_target', 'retiro_years', 'retiro_ontrack', 'retiro_behind',
      'retiro_ontrack_sub', 'retiro_behind_sub', 'retiro_no_target', 'retiro_no_balance',
      'retiro_accounts', 'retiro_accounts_note', 'retiro_chart_title', 'retiro_rule_note', 'retiro_real_return'];
    for (const lang of ['es', 'en']) {
      await page.evaluate(l => window._testSetLang(l), lang);
      const vals = await page.evaluate(ks => ks.map(k => t(k)), keys);
      vals.forEach((v, i) => expect(v, `${keys[i]} missing in ${lang}`).not.toBe(keys[i]));
    }
  });

  test('the tab re-renders in English after a language switch', async ({ page }) => {
    await loadWith(page, "d.retiro={edadActual:30,edadRetiro:65,aporteMensual:1000,cuentasIds:['cnt_inv']}");
    await page.evaluate(() => window.showTab('retiro', null));
    await page.evaluate(() => window._testSetLang('en'));
    await page.evaluate(() => window.showTab('retiro', null));
    await expect(page.locator('#retiroVerdict')).toContainText('Short by');
  });

  test('the assumptions are stated on screen, not hidden', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window.showTab('retiro', null));
    await expect(page.locator('#tab-retiro')).toContainText('supuestos');
    await expect(page.locator('#retiroBreakdown')).toContainText('regla del 4%');
  });
});
