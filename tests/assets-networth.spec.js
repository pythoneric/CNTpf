const { test, expect } = require('@playwright/test');

/**
 * Assets (activos) — the missing half of net worth
 *
 * Net worth was accounts + savings + emergency − debts. A mortgage subtracted
 * but the house never added, so the bundled USD demo reported −$268,850 for a
 * household near break-even, the "positive net worth" milestone was
 * unreachable for any homeowner, and calcScore's net-worth-trend band read off
 * a number that described only the liability side.
 *
 * The formula itself had NO direct test before this file — dual-currency.spec
 * only checked that the two currency modes agreed with each other, which they
 * did while both were wrong.
 *
 * Sub-suites:
 *   1. netWorthRD formula — direct, including the assets term
 *   2. Currency conversion of assets
 *   3. Live dashboard vs month-close parity (the duplicated-formula bug)
 *   4. Schema: defaults, migration, ids, tipo normalization
 *   5. Edit modal Activos tab
 *   6. i18n
 */

function baseData() {
  return {
    config: { tasa: 60, mes: 'Marzo', anio: 2026, ingresoUSD: 3000, payFrequency: 'mensual', monedaPrincipal: 'RD' },
    gastos: [
      { nombre: 'Hipoteca', tipo: 'Vivienda', pagado: 0, adeudado: 30000, dia: 1, tasa: 6.5, balance: 3000000, originalRD: 3000000, pagadoMes: false },
    ],
    forNow: { cuentas: [{ nombre: 'Banco', moneda: 'RD', saldo: 100000, tipo: 'banco' }], fecha: '2026-03-01', total: 100000 },
    emerg: { fondos: [{ fondo: 'EF', moneda: 'RD', balance: 50000, meta: 200000 }], cashflow: { ingreso: 0, gasto: 0, tasa: 60, retirarUSD: 0, ahorros: 0, balanceAhorros: 20000 } },
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
    // eslint-disable-next-line no-new-func
    if (fnStr) new Function('d', fnStr)(d);
    window._testLoadData(d);
  }, { base: baseData(), fnStr: mutate || '' });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. The formula
// ───────────────────────────────────────────────────────────────────
test.describe('netWorthRD — formula', () => {
  test('with no assets: accounts + savings + emergency - debts', async ({ page }) => {
    await loadWith(page);
    const nw = await page.evaluate(() => window.netWorthRD(_editData));
    // 100,000 + 20,000 + 50,000 − 3,000,000
    expect(nw).toBe(100000 + 20000 + 50000 - 3000000);
  });

  test('assets are added to net worth', async ({ page }) => {
    await loadWith(page, "d.activos=[{nombre:'Casa',tipo:'inmueble',valor:3200000,moneda:'RD'}]");
    const nw = await page.evaluate(() => window.netWorthRD(_editData));
    expect(nw).toBe(100000 + 20000 + 50000 + 3200000 - 3000000);
  });

  test('a mortgaged home flips net worth from deeply negative to positive', async ({ page }) => {
    await loadWith(page);
    const before = await page.evaluate(() => window.netWorthRD(_editData));
    expect(before).toBeLessThan(0);
    await page.evaluate(() => {
      _editData.activos = [{ nombre: 'Casa', tipo: 'inmueble', valor: 3200000, moneda: 'RD' }];
      window.migrateData(_editData);
    });
    const after = await page.evaluate(() => window.netWorthRD(_editData));
    expect(after).toBeGreaterThan(0);
  });

  test('activosTotalRD sums only assets, ignoring accounts and funds', async ({ page }) => {
    await loadWith(page, "d.activos=[{nombre:'A',tipo:'otro',valor:1000,moneda:'RD'},{nombre:'B',tipo:'vehiculo',valor:2500,moneda:'RD'}]");
    const total = await page.evaluate(() => window.activosTotalRD(_editData));
    expect(total).toBe(3500);
  });

  test('missing / empty activos contributes zero, does not throw', async ({ page }) => {
    await loadWith(page);
    const res = await page.evaluate(() => {
      const d = JSON.parse(JSON.stringify(_editData));
      delete d.activos;
      return window.activosTotalRD(d);
    });
    expect(res).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Currency
// ───────────────────────────────────────────────────────────────────
test.describe('Assets — currency conversion', () => {
  test('a USD asset converts at tasa into the RD$ total', async ({ page }) => {
    await loadWith(page, "d.activos=[{nombre:'Brokerage',tipo:'inversion',valor:1000,moneda:'USD'}]");
    const total = await page.evaluate(() => window.activosTotalRD(_editData));
    expect(total).toBe(60000); // 1000 USD x tasa 60
  });

  test('changing tasa re-values USD assets', async ({ page }) => {
    await loadWith(page, "d.activos=[{nombre:'Brokerage',tipo:'inversion',valor:1000,moneda:'USD'}]");
    const after = await page.evaluate(() => {
      _editData.config.tasa = 65;
      return window.activosTotalRD(_editData);
    });
    expect(after).toBe(65000);
  });

  test('RD$ and USD assets sum together correctly', async ({ page }) => {
    await loadWith(page, "d.activos=[{nombre:'Casa',tipo:'inmueble',valor:3000000,moneda:'RD'},{nombre:'Broker',tipo:'inversion',valor:1000,moneda:'USD'}]");
    const total = await page.evaluate(() => window.activosTotalRD(_editData));
    expect(total).toBe(3000000 + 60000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Live vs month-close parity
// ───────────────────────────────────────────────────────────────────
test.describe('Assets — live vs cierre parity', () => {
  test('the netWorth archived by cierre matches the live figure', async ({ page }) => {
    await loadWith(page, "d.activos=[{nombre:'Casa',tipo:'inmueble',valor:3200000,moneda:'RD'}]");
    const live = await page.evaluate(() => window.netWorthRD(_editData));
    // Drive the close-month wizard to its confirm step.
    await page.evaluate(() => { openCierre(); _cierreStep = 7; renderCierre(); });
    await page.evaluate(() => cierreNav(1));
    const archived = await page.evaluate(() => _editData.historial[0].netWorth);
    expect(archived).toBe(live);
  });

  test('cierre includes assets rather than archiving the liability-only figure', async ({ page }) => {
    await loadWith(page, "d.activos=[{nombre:'Casa',tipo:'inmueble',valor:3200000,moneda:'RD'}]");
    await page.evaluate(() => { openCierre(); _cierreStep = 7; renderCierre(); });
    await page.evaluate(() => cierreNav(1));
    const archived = await page.evaluate(() => _editData.historial[0].netWorth);
    expect(archived).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Schema
// ───────────────────────────────────────────────────────────────────
test.describe('Assets — schema', () => {
  test('defaultEditData seeds activos as an empty array', async ({ page }) => {
    await openApp(page);
    const v = await page.evaluate(() => window.defaultEditData().activos);
    expect(v).toEqual([]);
  });

  test('migration back-fills activos on a payload that lacks it', async ({ page }) => {
    await openApp(page);
    const v = await page.evaluate(() => window.migrateData({ config: {}, forNow: { cuentas: [] } }).activos);
    expect(v).toEqual([]);
  });

  test('migration assigns a stable act_ id to every asset', async ({ page }) => {
    await openApp(page);
    const ids = await page.evaluate(() =>
      window.migrateData({ config: {}, forNow: { cuentas: [] }, activos: [{ nombre: 'X', valor: 1 }, { nombre: 'Y', valor: 2 }] })
        .activos.map(a => a.id));
    expect(ids[0]).toMatch(/^act_/);
    expect(ids[1]).toMatch(/^act_/);
    expect(ids[0]).not.toBe(ids[1]);
  });

  test('an unknown tipo is normalized to otro', async ({ page }) => {
    await openApp(page);
    const tipo = await page.evaluate(() =>
      window.migrateData({ config: {}, forNow: { cuentas: [] }, activos: [{ nombre: 'X', valor: 1, tipo: 'spaceship' }] }).activos[0].tipo);
    expect(tipo).toBe('otro');
  });

  test('a bad moneda falls back to RD rather than silently x60', async ({ page }) => {
    await openApp(page);
    const m = await page.evaluate(() =>
      window.migrateData({ config: {}, forNow: { cuentas: [] }, activos: [{ nombre: 'X', valor: 1, moneda: 'EUR' }] }).activos[0].moneda);
    expect(m).toBe('RD');
  });

  test('activos survive a JSON export round-trip', async ({ page }) => {
    await loadWith(page, "d.activos=[{nombre:'Casa',tipo:'inmueble',valor:3200000,moneda:'RD'}]");
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    const content = await (await download.createReadStream()).toArray();
    const data = JSON.parse(Buffer.concat(content).toString());
    expect(data.activos).toHaveLength(1);
    expect(data.activos[0].nombre).toBe('Casa');
    expect(data.activos[0].valor).toBe(3200000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Edit modal
// ───────────────────────────────────────────────────────────────────
test.describe('Assets — edit modal tab', () => {
  test('the Activos tab and its table exist', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window.openEditModal());
    await expect(page.locator('#editModal')).toHaveClass(/open/);
    await page.click('.edit-tab:has-text("Activos")');
    await expect(page.locator('#esection-activos')).toHaveClass(/active/);
    await expect(page.locator('#activosEditBody')).toBeAttached();
  });

  test('empty state explains why assets matter', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window.openEditModal());
    await page.click('.edit-tab:has-text("Activos")');
    await expect(page.locator('#activosEditBody')).toContainText('patrimonio neto');
  });

  test('addActivoRow appends a row with a generated id', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => { window.openEditModal(); window.addActivoRow(); });
    const a = await page.evaluate(() => _editData.activos);
    expect(a).toHaveLength(1);
    expect(a[0].id).toMatch(/^act_/);
    expect(a[0].tipo).toBe('otro');
  });

  test('editing a value updates the running total', async ({ page }) => {
    await loadWith(page, "d.activos=[{nombre:'Casa',tipo:'inmueble',valor:1000000,moneda:'RD'}]");
    await page.evaluate(() => window.openEditModal());
    await page.click('.edit-tab:has-text("Activos")');
    await expect(page.locator('#activosEditTotal')).toContainText('1,000,000');
  });

  test('deleting a row removes it from the data', async ({ page }) => {
    await loadWith(page, "d.activos=[{nombre:'Casa',tipo:'inmueble',valor:1000,moneda:'RD'}]");
    await page.evaluate(() => { window.openEditModal(); window.deleteActivoRow(0); });
    const n = await page.evaluate(() => _editData.activos.length);
    expect(n).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Assets — i18n', () => {
  test('asset tipo labels resolve in both languages', async ({ page }) => {
    await loadWith(page);
    const es = await page.evaluate(() => window.ACTIVO_TIPOS.map(tp => t('activo_tipo_' + tp)));
    expect(es).toEqual(['Inmueble', 'Vehículo', 'Inversión', 'Otro']);
    await page.evaluate(() => window._testSetLang('en'));
    const en = await page.evaluate(() => window.ACTIVO_TIPOS.map(tp => t('activo_tipo_' + tp)));
    expect(en).toEqual(['Real estate', 'Vehicle', 'Investment', 'Other']);
  });

  test('no asset key falls through to its own name', async ({ page }) => {
    await loadWith(page);
    const keys = ['activos_title', 'activos_sub', 'activos_total', 'activos_empty', 'edit_tab_activos', 'pillar_activos'];
    for (const lang of ['es', 'en']) {
      await page.evaluate(l => window._testSetLang(l), lang);
      const vals = await page.evaluate(ks => ks.map(k => t(k)), keys);
      vals.forEach((v, i) => expect(v, `${keys[i]} missing in ${lang}`).not.toBe(keys[i]));
    }
  });

  test('the income label now says net / neto in both languages', async ({ page }) => {
    await loadWith(page);
    await page.evaluate(() => window._testSetLang('es'));
    expect(await page.evaluate(() => t('ecfg_ingreso'))).toContain('neto');
    await page.evaluate(() => window._testSetLang('en'));
    expect(await page.evaluate(() => t('ecfg_ingreso'))).toContain('Net');
  });
});
