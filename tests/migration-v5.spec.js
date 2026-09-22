const { test, expect } = require('@playwright/test');

/**
 * Schema migration — the unified migrateData() choke point (v5)
 *
 * Before this, normalization lived inline in importJSON() only. A file opened
 * once and then restored from IndexedDB came back a DIFFERENT SHAPE from the
 * one that was imported: metas/transacciones/presupuesto/recurrentes were
 * back-filled on import but not on restore, and loadDemo() re-implemented a
 * third partial subset. Consumers papered over it with `||[]` at every read
 * site. migrateData() is now the single normalizer and every entry path calls
 * it.
 *
 * Sub-suites:
 *   1. Idempotence — the hard requirement, since buildDashboard re-runs it
 *   2. Shape parity across all four entry paths
 *   3. Individual back-fills (collections, payFrequency, monedaPrincipal)
 *   4. Wallet pointer validation survives the move
 *   5. Export version tracks SCHEMA_VERSION
 */

// A deliberately old payload: v3-era, no _meta, no wallet ids, no collections.
const V4_FIXTURE = {
  config: {
    tasa: 58, mes: 'Marzo', anio: 2026, ingresoUSD: 1500,
    // no payFrequency, no monedaPrincipal, no defaultCashAccountId
  },
  gastos: [
    { nombre: 'Luz', tipo: 'Servicio', pagado: 0, adeudado: 2400, dia: 12, tasa: 0, balance: 0, pagadoMes: false },
  ],
  forNow: { cuentas: [{ nombre: 'Banco', moneda: 'RD', saldo: 50000 }], fecha: '2026-03-01', total: 50000 },
  emerg: { fondos: [], cashflow: { ingreso: 0, gasto: 0, tasa: 58, retirarUSD: 0, ahorros: 0, balanceAhorros: 0 } },
  historial: [],
  // metas / transacciones / presupuesto / recurrentes all absent
};

async function openApp(page) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window.migrateData === 'function');
}

// ───────────────────────────────────────────────────────────────────
// 1. Idempotence
// ───────────────────────────────────────────────────────────────────
test.describe('migrateData — idempotence', () => {
  test('running it twice produces a deep-equal result', async ({ page }) => {
    await openApp(page);
    const { once, twice } = await page.evaluate((fx) => {
      const a = window.migrateData(JSON.parse(JSON.stringify(fx)));
      const once = JSON.stringify(a);
      const b = window.migrateData(JSON.parse(JSON.stringify(a)));
      return { once, twice: JSON.stringify(b) };
    }, V4_FIXTURE);
    expect(twice).toBe(once);
  });

  test('does not regenerate cuenta ids on a second pass', async ({ page }) => {
    await openApp(page);
    const [first, second] = await page.evaluate((fx) => {
      const d = window.migrateData(JSON.parse(JSON.stringify(fx)));
      const first = d.forNow.cuentas[0].id;
      window.migrateData(d);
      return [first, d.forNow.cuentas[0].id];
    }, V4_FIXTURE);
    expect(first).toMatch(/^cnt_/);
    expect(second).toBe(first);
  });

  test('tolerates null / non-object input without throwing', async ({ page }) => {
    await openApp(page);
    // Checked as a description-of-result rather than by identity: `undefined`
    // does not survive the evaluate boundary intact, so comparing the raw
    // return values would be asserting on Playwright's serializer, not on
    // migrateData.
    const res = await page.evaluate(() => {
      const probe = (v) => {
        try { const r = window.migrateData(v); return r === v ? 'passthrough' : 'changed'; }
        catch (e) { return 'threw: ' + e.message; }
      };
      return [probe(null), probe(undefined), probe(42), probe('nope')];
    });
    expect(res).toEqual(['passthrough', 'passthrough', 'passthrough', 'passthrough']);
  });

  test('tolerates a payload with no emerg.cashflow', async ({ page }) => {
    await openApp(page);
    const ok = await page.evaluate(() => {
      try { window.migrateData({ config: {}, forNow: { cuentas: [] } }); return true; }
      catch (e) { return String(e); }
    });
    expect(ok).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Shape parity across entry paths
// ───────────────────────────────────────────────────────────────────
test.describe('migrateData — entry path parity', () => {
  const COLLECTIONS = ['metas', 'transacciones', 'presupuesto', 'recurrentes'];

  test('_testLoadData normalizes a v4 payload', async ({ page }) => {
    await openApp(page);
    const shape = await page.evaluate((fx) => {
      window._testLoadData(JSON.parse(JSON.stringify(fx)));
      return {
        collections: ['metas', 'transacciones', 'presupuesto', 'recurrentes'].map(k => Array.isArray(_editData[k])),
        payFrequency: _editData.config.payFrequency,
        monedaPrincipal: _editData.config.monedaPrincipal,
        cuentaHasId: !!_editData.forNow.cuentas[0].id,
        cuentaTipo: _editData.forNow.cuentas[0].tipo,
      };
    }, V4_FIXTURE);
    expect(shape.collections).toEqual([true, true, true, true]);
    expect(shape.payFrequency).toBe('mensual');
    expect(shape.monedaPrincipal).toBe('RD');
    expect(shape.cuentaHasId).toBe(true);
    expect(shape.cuentaTipo).toBe('banco');
  });

  test('IndexedDB restore yields the same shape as import', async ({ page }) => {
    await openApp(page);
    // Seed IndexedDB with the raw, unmigrated fixture — exactly what an older
    // build of the app would have autosaved.
    await page.evaluate(async (fx) => {
      await window.dbSet('dashboard_data', 'editData', JSON.parse(JSON.stringify(fx)));
    }, V4_FIXTURE);
    await page.evaluate(() => window.loadFromDB());
    await page.waitForSelector('#dashApp', { state: 'visible' });
    const shape = await page.evaluate(() =>
      ['metas', 'transacciones', 'presupuesto', 'recurrentes'].map(k => Array.isArray(_editData[k])));
    expect(shape).toEqual([true, true, true, true]);
  });

  test('loadDemo output is fully normalized', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.loadDemo('USD'));
    await page.waitForSelector('#dashApp', { state: 'visible' });
    const shape = await page.evaluate(() => ({
      collections: ['metas', 'transacciones', 'presupuesto', 'recurrentes'].map(k => Array.isArray(_editData[k])),
      allCuentasHaveIds: _editData.forNow.cuentas.every(c => !!c.id && !!c.tipo),
    }));
    expect(shape.collections).toEqual([true, true, true, true]);
    expect(shape.allCuentasHaveIds).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Individual back-fills
// ───────────────────────────────────────────────────────────────────
test.describe('migrateData — back-fills', () => {
  test('preserves an explicit payFrequency instead of forcing mensual', async ({ page }) => {
    await openApp(page);
    const freq = await page.evaluate((fx) => {
      const d = JSON.parse(JSON.stringify(fx));
      d.config.payFrequency = 'quincenal';
      return window.migrateData(d).config.payFrequency;
    }, V4_FIXTURE);
    expect(freq).toBe('quincenal');
  });

  test('preserves an explicit monedaPrincipal', async ({ page }) => {
    await openApp(page);
    const cur = await page.evaluate((fx) => {
      const d = JSON.parse(JSON.stringify(fx));
      d.config.monedaPrincipal = 'USD';
      return window.migrateData(d).config.monedaPrincipal;
    }, V4_FIXTURE);
    expect(cur).toBe('USD');
  });

  test('does not clobber existing collection contents', async ({ page }) => {
    await openApp(page);
    const n = await page.evaluate((fx) => {
      const d = JSON.parse(JSON.stringify(fx));
      d.metas = [{ name: 'Viaje', goal: 100000, saved: 5000, monthly: 2000 }];
      return window.migrateData(d).metas.length;
    }, V4_FIXTURE);
    expect(n).toBe(1);
  });

  test('replaces a non-array collection with an array', async ({ page }) => {
    await openApp(page);
    const isArr = await page.evaluate((fx) => {
      const d = JSON.parse(JSON.stringify(fx));
      d.transacciones = null;
      return Array.isArray(window.migrateData(d).transacciones);
    }, V4_FIXTURE);
    expect(isArr).toBe(true);
  });

  test('recomputes the derived ingresoRD mirror from tasa x frequency', async ({ page }) => {
    await openApp(page);
    const res = await page.evaluate((fx) => {
      const d = JSON.parse(JSON.stringify(fx));
      d.config.payFrequency = 'mensual';
      d.config.ingresoRD = 999999; // stale value from an older export
      const m = window.migrateData(d);
      return { ingresoRD: m.config.ingresoRD, cashflow: m.emerg.cashflow.ingreso };
    }, V4_FIXTURE);
    expect(res.ingresoRD).toBe(1500 * 58);
    expect(res.cashflow).toBe(res.ingresoRD);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Wallet pointer validation
// ───────────────────────────────────────────────────────────────────
test.describe('migrateData — wallet pointer', () => {
  test('nulls a defaultCashAccountId that no longer resolves', async ({ page }) => {
    await openApp(page);
    const id = await page.evaluate((fx) => {
      const d = JSON.parse(JSON.stringify(fx));
      d.config.defaultCashAccountId = 'cnt_deleted_account';
      return window.migrateData(d).config.defaultCashAccountId;
    }, V4_FIXTURE);
    expect(id).toBeNull();
  });

  test('keeps a defaultCashAccountId that still resolves', async ({ page }) => {
    await openApp(page);
    const kept = await page.evaluate((fx) => {
      const d = JSON.parse(JSON.stringify(fx));
      d.forNow.cuentas[0].id = 'cnt_keepme';
      d.forNow.cuentas[0].tipo = 'cash';
      d.config.defaultCashAccountId = 'cnt_keepme';
      return window.migrateData(d).config.defaultCashAccountId;
    }, V4_FIXTURE);
    expect(kept).toBe('cnt_keepme');
  });

  test('de-duplicates colliding cuenta ids', async ({ page }) => {
    await openApp(page);
    const ids = await page.evaluate((fx) => {
      const d = JSON.parse(JSON.stringify(fx));
      d.forNow.cuentas = [
        { nombre: 'A', moneda: 'RD', saldo: 1, id: 'cnt_dup', tipo: 'banco' },
        { nombre: 'B', moneda: 'RD', saldo: 2, id: 'cnt_dup', tipo: 'banco' },
      ];
      return window.migrateData(d).forNow.cuentas.map(c => c.id);
    }, V4_FIXTURE);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Version marker
// ───────────────────────────────────────────────────────────────────
test.describe('migrateData — version marker', () => {
  test('SCHEMA_VERSION is 5 and stamped onto migrated data', async ({ page }) => {
    await openApp(page);
    const res = await page.evaluate((fx) => ({
      constant: window.SCHEMA_VERSION,
      stamped: window.migrateData(JSON.parse(JSON.stringify(fx)))._schemaVersion,
    }), V4_FIXTURE);
    expect(res.constant).toBe(5);
    expect(res.stamped).toBe(5);
  });
});
