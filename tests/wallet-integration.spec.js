const { test, expect } = require('@playwright/test');

/**
 * Wallet — cross-feature integration (1A + 1B + 1C)
 *
 * Belt-and-braces tests that don't fit cleanly into any one of the per-feature
 * spec files because they exercise interactions BETWEEN them or with code
 * outside the wallet module:
 *
 *   1. JSON round-trip preserves walletLowThreshold, ajuste tx, and the
 *      transferGroupId pair (so a backup/restore doesn't drop the new
 *      schema fields).
 *   2. Cierre de mes (gastoReal calculation) excludes ajuste and
 *      transferencia_interna alongside ingreso — historical spending must
 *      not be inflated by ledger-correction events.
 *   3. deleteTxEditRow (the Edit modal's transacciones table) reverses both
 *      legs of a transfer when the user deletes one leg from there — the
 *      same atomicity already proven for deleteTransaccion in
 *      wallet-transfer.spec.js, but for the alternate delete entry point.
 *   4. Demo data still loads cleanly under the new code (smoke).
 */

const APP = 'http://localhost:8080/cnt.html';

async function loadApp(page, opts = {}) {
  page.on('dialog', d => d.accept());
  await page.goto(APP);
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate((opts) => {
    const data = window.defaultEditData();
    Object.assign(data.config, {
      tasa: 60,
      ingresoUSD: 3000,
      payFrequency: 'mensual',
      mes: 'Marzo',
      anio: 2026,
      monedaPrincipal: 'RD',
      walletLowThreshold: opts.walletLowThreshold || 0,
    });
    const cashId = 'cnt_cash_seed';
    data.forNow.cuentas = [
      { id: 'cnt_bank_seed', nombre: 'Banco Popular', moneda: 'RD', saldo: 250000, tipo: 'banco', comp: 0, disp: 0 },
      { id: cashId, nombre: 'Efectivo', moneda: 'RD', saldo: 10000, tipo: 'cash', comp: 0, disp: 0 },
    ];
    data.config.defaultCashAccountId = cashId;
    window._testLoadData(data);
  }, opts);
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. JSON round-trip — every new schema field survives export → import
// ───────────────────────────────────────────────────────────────────
test.describe('JSON round-trip preserves wallet 1A/1B/1C fields', () => {
  test('walletLowThreshold survives downloadJSON → reload', async ({ page }) => {
    await loadApp(page, { walletLowThreshold: 17500 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    const content = await (await download.createReadStream()).toArray();
    const data = JSON.parse(Buffer.concat(content).toString());
    expect(data.config.walletLowThreshold).toBe(17500);
  });

  test('ajuste tx survives export → import with all fields intact', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.reconcileWallet(11500, 'Conté el sobre'));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    const content = await (await download.createReadStream()).toArray();
    const data = JSON.parse(Buffer.concat(content).toString());
    const ajuste = data.transacciones.find(t => t.categoria === 'ajuste');
    expect(ajuste).toBeTruthy();
    expect(ajuste.monto).toBe(-1500);
    expect(ajuste.applied).toBe(true);
    expect(ajuste.cuentaId).toBe('cnt_cash_seed');
    expect(ajuste.nota).toBe('Conté el sobre');
  });

  test('transfer pair survives export with both legs and shared transferGroupId', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.transferBetweenAccounts('cnt_cash_seed', 'cnt_bank_seed', 2500, 'al banco'));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    const content = await (await download.createReadStream()).toArray();
    const data = JSON.parse(Buffer.concat(content).toString());
    const legs = data.transacciones.filter(t => t.categoria === 'transferencia_interna');
    expect(legs).toHaveLength(2);
    expect(legs[0].transferGroupId).toBe(legs[1].transferGroupId);
    const out = legs.find(l => l.transferDirection === 'out');
    const into = legs.find(l => l.transferDirection === 'in');
    expect(out.monto).toBe(2500);
    expect(into.monto).toBe(-2500);
    expect(out.tasaSnapshot).toBe(60);
    expect(into.tasaSnapshot).toBe(60);
    expect(out.peerCuentaId).toBe('cnt_bank_seed');
    expect(into.peerCuentaId).toBe('cnt_cash_seed');
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Cierre de mes — historial.gastoReal excludes new categories
// ───────────────────────────────────────────────────────────────────
test.describe('Cierre — gastoReal excludes ajuste + transferencia_interna', () => {
  test('isExpenseTx-driven aggregations only count real spending', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      const cuentaId = _editData.config.defaultCashAccountId;
      // Plant: a real expense, an income deposit, a reconcile ajuste, and a transfer
      // pair. After all of them, gastoReal must equal only the real-expense leg.
      _editData.transacciones = [
        { fecha: '2026-03-08', monto: 4000, categoria: 'comida', metodo: 'efectivo', mes: 'Marzo', anio: 2026, applied: true, cuentaId, nota: 'lunch' },
        { fecha: '2026-03-09', monto: -180000, categoria: 'ingreso', metodo: 'transferencia', mes: 'Marzo', anio: 2026, applied: true, cuentaId, nota: 'paycheck' },
      ];
      window.reconcileWallet(11500, 'reconcile +1500');
      window.transferBetweenAccounts(cuentaId, 'cnt_bank_seed', 2000, 'al banco');
      // Mirror the cierre formula at cnt.html:6643
      const cfg = _editData.config;
      return _editData.transacciones
        .filter(t => t.mes === cfg.mes && t.anio === cfg.anio && window.isExpenseTx(t))
        .reduce((a, t) => a + t.monto, 0);
    });
    expect(r).toBe(4000); // only the comida tx; everything else is excluded
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. deleteTxEditRow — atomic across paired transfer legs
// ───────────────────────────────────────────────────────────────────
test.describe('deleteTxEditRow — transfer-aware', () => {
  test('deleting one leg from the Edit modal removes both and restores both saldos', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      window.transferBetweenAccounts('cnt_cash_seed', 'cnt_bank_seed', 1500, '');
      const idx = _editData.transacciones.findIndex(t => t.transferGroupId && t.transferDirection === 'in');
      // page.on('dialog') accepts the confirm() inside deleteTxEditRow
      window.deleteTxEditRow(idx);
      const cuentas = _editData.forNow.cuentas;
      return {
        wallet: cuentas.find(c => c.id === 'cnt_cash_seed').saldo,
        bank: cuentas.find(c => c.id === 'cnt_bank_seed').saldo,
        remaining: _editData.transacciones.filter(t => t.transferGroupId).length,
      };
    });
    expect(r.wallet).toBe(10000);
    expect(r.bank).toBe(250000);
    expect(r.remaining).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Demo data smoke — ensure the existing demo still boots cleanly
// ───────────────────────────────────────────────────────────────────
test.describe('Demo smoke — new wallet code does not regress demo loading', () => {
  test('demo RD$ loads and the wallet card renders without errors', async ({ page }) => {
    page.on('dialog', d => d.accept());
    const consoleErrors = [];
    page.on('pageerror', e => consoleErrors.push(String(e)));
    await page.goto(APP);
    await page.waitForSelector('#loaderScreen', { state: 'visible' });
    await page.evaluate(() => { if (typeof loadDemo === 'function') loadDemo(); });
    await page.waitForSelector('#dashApp', { state: 'visible', timeout: 10000 });
    await expect(page.locator('#walletCard')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
