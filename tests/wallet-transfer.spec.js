const { test, expect } = require('@playwright/test');

/**
 * Wallet — Transferir entre cuentas (1C)
 *
 * - transferBetweenAccounts(from, to, amount, note) creates two paired txs
 *   sharing a transferGroupId, snapshots tasa, and updates both saldos.
 * - Cross-currency: amount is in source moneda; destination saldo gets the
 *   converted value; both legs store monto in RD$ (sign-mirrored).
 * - reverseTransferGroup undoes both legs atomically.
 * - deleteTransaccion + deleteTxEditRow detect transferGroupId and remove
 *   both legs in one user gesture.
 * - isExpenseTx excludes transferencia_interna so transfers don't pollute
 *   budget totals or category charts.
 * - Resumen card surfaces the Transferir button when ≥2 cuentas exist, and
 *   transfer rows render with a 🔁 icon plus direction arrow.
 */

async function loadApp(page, opts = {}) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
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
    }, opts.cfg || {});
    const cashId = 'cnt_cash_seed';
    data.forNow.cuentas = [
      { id: 'cnt_bank_seed', nombre: 'Banco Popular', moneda: 'RD', saldo: 250000, tipo: 'banco', comp: 0, disp: 0 },
      { id: 'cnt_savings_seed', nombre: 'Ahorros USD', moneda: 'USD', saldo: 1000, tipo: 'ahorro', comp: 0, disp: 0 },
      { id: cashId, nombre: 'Efectivo', moneda: 'RD', saldo: 10000, tipo: 'cash', comp: 0, disp: 0 },
    ];
    data.config.defaultCashAccountId = opts.skipDefault ? null : cashId;
    if (opts.singleCuenta) data.forNow.cuentas = [data.forNow.cuentas[2]]; // wallet only
    window._testLoadData(data);
  }, opts);
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. transferBetweenAccounts helper
// ───────────────────────────────────────────────────────────────────
test.describe('transferBetweenAccounts', () => {
  test('rejects same-account, missing-account, and ≤0 amount', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => ({
      same: window.transferBetweenAccounts('cnt_cash_seed', 'cnt_cash_seed', 100, ''),
      missing: window.transferBetweenAccounts('cnt_cash_seed', 'nope', 100, ''),
      zero: window.transferBetweenAccounts('cnt_cash_seed', 'cnt_bank_seed', 0, ''),
      negative: window.transferBetweenAccounts('cnt_cash_seed', 'cnt_bank_seed', -50, ''),
    }));
    expect(r.same).toBeNull();
    expect(r.missing).toBeNull();
    expect(r.zero).toBeNull();
    expect(r.negative).toBeNull();
  });

  test('same-currency transfer creates two paired txs and updates both saldos', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      const result = window.transferBetweenAccounts('cnt_cash_seed', 'cnt_bank_seed', 3000, 'depósito');
      const cuentas = _editData.forNow.cuentas;
      return {
        result,
        wallet: cuentas.find(c => c.id === 'cnt_cash_seed').saldo,
        bank: cuentas.find(c => c.id === 'cnt_bank_seed').saldo,
        txs: _editData.transacciones.filter(t => t.transferGroupId === result.out.transferGroupId),
      };
    });
    expect(r.wallet).toBe(7000);
    expect(r.bank).toBe(253000);
    expect(r.txs).toHaveLength(2);
    const out = r.txs.find(t => t.transferDirection === 'out');
    const into = r.txs.find(t => t.transferDirection === 'in');
    expect(out.monto).toBe(3000);   // positive RD$ debit
    expect(into.monto).toBe(-3000); // negative RD$ credit
    expect(out.peerCuentaId).toBe('cnt_bank_seed');
    expect(into.peerCuentaId).toBe('cnt_cash_seed');
    expect(out.transferGroupId).toBe(into.transferGroupId);
    expect(out.tasaSnapshot).toBe(60);
    expect(into.tasaSnapshot).toBe(60);
    expect(out.applied).toBe(true);
    expect(into.applied).toBe(true);
  });

  test('cross-currency RD$ → USD transfer converts via tasa snapshot', async ({ page }) => {
    // RD$6000 from wallet to USD savings → +$100 to savings, both legs store RD$6000
    await loadApp(page);
    const r = await page.evaluate(() => {
      window.transferBetweenAccounts('cnt_cash_seed', 'cnt_savings_seed', 6000, 'sweep');
      const cuentas = _editData.forNow.cuentas;
      return {
        wallet: cuentas.find(c => c.id === 'cnt_cash_seed').saldo,
        savings: cuentas.find(c => c.id === 'cnt_savings_seed').saldo,
        txs: _editData.transacciones.filter(t => t.transferGroupId),
      };
    });
    expect(r.wallet).toBe(4000);
    expect(r.savings).toBe(1100); // 1000 + 100 USD
    const out = r.txs.find(t => t.transferDirection === 'out');
    const into = r.txs.find(t => t.transferDirection === 'in');
    expect(out.monto).toBe(6000);
    expect(into.monto).toBe(-6000);
    expect(out.peerAmt).toBe(100); // dest amount in dest moneda (USD)
    expect(into.peerAmt).toBe(6000); // source amount in source moneda (RD$)
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Reversal — both legs atomic
// ───────────────────────────────────────────────────────────────────
test.describe('reverseTransferGroup', () => {
  test('un-applying both legs restores both saldos', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      const { out } = window.transferBetweenAccounts('cnt_cash_seed', 'cnt_bank_seed', 3000, '');
      window.reverseTransferGroup(out, false);
      const cuentas = _editData.forNow.cuentas;
      const txs = _editData.transacciones;
      return {
        wallet: cuentas.find(c => c.id === 'cnt_cash_seed').saldo,
        bank: cuentas.find(c => c.id === 'cnt_bank_seed').saldo,
        anyApplied: txs.some(t => t.transferGroupId && t.applied),
        txCount: txs.filter(t => t.transferGroupId).length,
      };
    });
    expect(r.wallet).toBe(10000);
    expect(r.bank).toBe(250000);
    expect(r.anyApplied).toBe(false);
    expect(r.txCount).toBe(2); // tombstones remain (no removePeer)
  });

  test('removePeer=true also splices the peer from transacciones[]', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      const { out } = window.transferBetweenAccounts('cnt_cash_seed', 'cnt_bank_seed', 1500, '');
      window.reverseTransferGroup(out, true);
      const txs = _editData.transacciones;
      return {
        wallet: _editData.forNow.cuentas.find(c => c.id === 'cnt_cash_seed').saldo,
        bank: _editData.forNow.cuentas.find(c => c.id === 'cnt_bank_seed').saldo,
        // out tx is still in array (caller manages its own splice); peer removed
        outStillThere: txs.includes(out),
        peerLeft: txs.filter(t => t.transferGroupId).length,
      };
    });
    expect(r.wallet).toBe(10000);
    expect(r.bank).toBe(250000);
    expect(r.outStillThere).toBe(true);
    expect(r.peerLeft).toBe(1);
  });

  test('cross-currency reverse uses snapshot tasa even after config.tasa drifts', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      const { out } = window.transferBetweenAccounts('cnt_cash_seed', 'cnt_savings_seed', 6000, '');
      // Drift the live tasa AFTER the transfer — reversal must still use snapshot.
      _editData.config.tasa = 70;
      window.reverseTransferGroup(out, true);
      const cuentas = _editData.forNow.cuentas;
      return {
        wallet: cuentas.find(c => c.id === 'cnt_cash_seed').saldo,
        savings: cuentas.find(c => c.id === 'cnt_savings_seed').saldo,
      };
    });
    expect(r.wallet).toBe(10000);
    expect(r.savings).toBe(1000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Delete-tx integration — atomic across paired legs
// ───────────────────────────────────────────────────────────────────
test.describe('deleteTransaccion / deleteTxEditRow — transfer-aware', () => {
  test('deleting one leg via deleteTransaccion removes both and restores both saldos', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      window.transferBetweenAccounts('cnt_cash_seed', 'cnt_bank_seed', 2500, '');
      // confirm() is auto-accepted by page.on('dialog', ...) above
      const idx = _editData.transacciones.findIndex(t => t.transferGroupId && t.transferDirection === 'out');
      window.deleteTransaccion(idx);
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
// 4. isExpenseTx exclusion
// ───────────────────────────────────────────────────────────────────
test.describe('isExpenseTx — excludes transferencia_interna', () => {
  test('transfer legs do not count toward gasto totals', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      _editData.transacciones = [
        { fecha: '2026-03-10', monto: 4000, categoria: 'comida', metodo: 'efectivo', mes: 'Marzo', anio: 2026, applied: true, cuentaId: _editData.config.defaultCashAccountId },
      ];
      window.transferBetweenAccounts('cnt_cash_seed', 'cnt_bank_seed', 3000, '');
      return _editData.transacciones.filter(t => window.isExpenseTx(t)).reduce((a, t) => a + t.monto, 0);
    });
    expect(r).toBe(4000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. UI — Transferir button + modal flow
// ───────────────────────────────────────────────────────────────────
test.describe('Transferir UI', () => {
  test('Transferir button shown when there are other cuentas', async ({ page }) => {
    await loadApp(page);
    const btn = page.locator('#walletCard .wallet-transfer-btn');
    await expect(btn).toBeVisible();
  });

  test('Transferir button hidden when wallet is the only cuenta', async ({ page }) => {
    await loadApp(page, { singleCuenta: true });
    const count = await page.locator('#walletCard .wallet-transfer-btn').count();
    expect(count).toBe(0);
  });

  test('confirming the modal records a transfer and shows the toast', async ({ page }) => {
    await loadApp(page);
    await page.click('#walletCard .wallet-transfer-btn');
    await expect(page.locator('#walletTransferModal')).toHaveClass(/open/);
    // Pick savings as destination, enter 2000
    await page.selectOption('#walletTransferTo', 'cnt_bank_seed');
    await page.fill('#walletTransferAmount', '2000');
    await page.click('#walletTransferModal button:has-text("Transferir"):not(.btn-ghost)');
    await expect(page.locator('#walletTransferModal')).not.toHaveClass(/open/);
    const r = await page.evaluate(() => ({
      wallet: _editData.forNow.cuentas.find(c => c.id === 'cnt_cash_seed').saldo,
      bank: _editData.forNow.cuentas.find(c => c.id === 'cnt_bank_seed').saldo,
      pairs: _editData.transacciones.filter(t => t.transferGroupId).length,
    }));
    expect(r.wallet).toBe(8000);
    expect(r.bank).toBe(252000);
    expect(r.pairs).toBe(2);
  });

  test('insufficient-balance attempt is blocked with toast', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openWalletTransfer());
    await page.selectOption('#walletTransferTo', 'cnt_bank_seed');
    await page.fill('#walletTransferAmount', '999999');
    await page.click('#walletTransferModal button:has-text("Transferir"):not(.btn-ghost)');
    // Modal stays open, no transfer recorded
    await expect(page.locator('#walletTransferModal')).toHaveClass(/open/);
    const pairs = await page.evaluate(() => _editData.transacciones.filter(t => t.transferGroupId).length);
    expect(pairs).toBe(0);
  });

  test('cross-currency FX preview updates as the user types', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openWalletTransfer());
    await page.selectOption('#walletTransferTo', 'cnt_savings_seed'); // USD
    await page.fill('#walletTransferAmount', '6000');
    const fxText = await page.locator('#walletTransferFx').textContent();
    expect(fxText).toMatch(/\$/);
    expect(fxText).toMatch(/100/);
  });

  test('wallet movement renders transfer with 🔁 icon and direction arrow', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      window.transferBetweenAccounts('cnt_cash_seed', 'cnt_bank_seed', 1500, 'al banco');
      window.buildDashboard({ ..._editData });
    });
    const item = page.locator('#walletCard .wallet-mov-item').first();
    await expect(item).toContainText('🔁');
    await expect(item).toContainText('→');
    await expect(item).toContainText('Banco Popular');
  });
});
