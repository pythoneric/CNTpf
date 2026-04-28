const { test, expect } = require('@playwright/test');

/**
 * Wallet — "Otro ingreso" (custom-amount paycheck)
 *
 * The regular "I got paid" button always credits the configured per-pay
 * amount and is deduped per calendar day. That doesn't fit gig / freelance
 * / bonus payments — variable amounts, possibly multiple times per day.
 *
 * "Otro ingreso" is the alternate affordance: a small ghost link below the
 * income button opens a modal where the user types the amount + an optional
 * note. The deposit:
 *   - credits the wallet by the typed amount in the wallet's moneda,
 *   - stores tx.monto in RD$ (negative = credit) like every other ingreso,
 *   - has NO same-day dedup (gigs are explicit user intent),
 *   - and reverses cleanly when the user deletes the tx.
 */

async function loadApp(page, opts = {}) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(({ ingresoUSD, payFreq, walletMoneda, walletSaldo }) => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = ingresoUSD;
    data.config.payFrequency = payFreq;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.config.monedaPrincipal = 'RD';
    const cashId = 'cnt_cash_seed';
    data.forNow.cuentas = [
      { id: cashId, nombre: 'Efectivo', moneda: walletMoneda || 'RD', saldo: walletSaldo, tipo: 'cash', comp: 0, disp: 0 },
    ];
    data.config.defaultCashAccountId = cashId;
    window._testLoadData(data);
  }, {
    ingresoUSD: opts.ingresoUSD ?? 3000,
    payFreq: opts.payFreq || 'mensual',
    walletMoneda: opts.walletMoneda,
    walletSaldo: opts.walletSaldo ?? 5000,
  });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. addOtherIncome helper
// ───────────────────────────────────────────────────────────────────
test.describe('addOtherIncome helper', () => {
  test('credits the wallet by the typed amount and logs an ingreso tx', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      const tx = window.addOtherIncome(2500, 'Freelance · Pepe');
      const cuenta = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { saldo: cuenta.saldo, tx };
    });
    expect(r.saldo).toBe(5000 + 2500);
    expect(r.tx).toBeTruthy();
    expect(r.tx.categoria).toBe('ingreso');
    expect(r.tx.applied).toBe(true);
    expect(r.tx.monto).toBe(-2500); // negative = credit, RD$ scale
    expect(r.tx.nota).toBe('Freelance · Pepe');
  });

  test('uses default note when the user leaves the note empty', async ({ page }) => {
    await loadApp(page);
    const note = await page.evaluate(() => {
      const tx = window.addOtherIncome(1000, '');
      return tx.nota;
    });
    expect(note).toMatch(/Otro ingreso|Other income/);
  });

  test('USD wallet: typed amount is in USD; tx.monto stores RD$ via tasa', async ({ page }) => {
    await loadApp(page, { walletMoneda: 'USD', walletSaldo: 100 });
    const r = await page.evaluate(() => {
      const tx = window.addOtherIncome(50, 'Tip');
      const cuenta = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { saldo: cuenta.saldo, monto: tx.monto };
    });
    expect(r.saldo).toBe(150); // 100 + 50 USD
    expect(r.monto).toBe(-3000); // 50 USD * tasa 60 = 3000 RD$, negated for credit
  });

  test('returns null on missing wallet or non-positive amount', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    await page.evaluate(() => {
      const data = window.defaultEditData();
      data.forNow.cuentas = [{ id: 'cnt_bank', nombre: 'Banco', moneda: 'RD', saldo: 1000, tipo: 'banco' }];
      data.config.defaultCashAccountId = null;
      window._testLoadData(data);
    });
    const r = await page.evaluate(() => ({
      noWallet: window.addOtherIncome(500, 'x'),
      zero: 0, // computed below to avoid undefined-wallet path
    }));
    expect(r.noWallet).toBeNull();
    // Wallet exists, zero amount → null
    await loadApp(page);
    const zero = await page.evaluate(() => window.addOtherIncome(0, 'x'));
    expect(zero).toBeNull();
    const negative = await page.evaluate(() => window.addOtherIncome(-50, 'x'));
    expect(negative).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. No same-day dedup — multiple gigs land independently
// ───────────────────────────────────────────────────────────────────
test.describe('addOtherIncome — no same-day dedup', () => {
  test('two calls in a row both credit the wallet', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      window.addOtherIncome(800, 'Gig 1');
      window.addOtherIncome(1200, 'Gig 2');
      const cuenta = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return {
        saldo: cuenta.saldo,
        ingresoCount: _editData.transacciones.filter(t => t.categoria === 'ingreso').length,
      };
    });
    expect(r.saldo).toBe(5000 + 800 + 1200);
    expect(r.ingresoCount).toBe(2);
  });

  test('the regular "I got paid" button STILL deduplicates — the two paths are independent', async ({ page }) => {
    await loadApp(page);
    const r = await page.evaluate(() => {
      const a = window.depositIncomeToWallet();
      // Other income should still work today even after the regular deposit landed
      const tx = window.addOtherIncome(500, 'Tip');
      // A second click on the regular button rejects (same-day)
      const b = window.depositIncomeToWallet();
      return {
        regularA: a, regularB: b, otherTx: !!tx,
        ingresoCount: _editData.transacciones.filter(t => t.categoria === 'ingreso').length,
      };
    });
    expect(r.regularA).toBe(true);
    expect(r.regularB).toBe(false); // regular path still blocks
    expect(r.otherTx).toBe(true); // other-income path bypasses
    expect(r.ingresoCount).toBe(2); // 1 regular + 1 gig
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Reversal — deleting a gig tx un-credits the wallet
// ───────────────────────────────────────────────────────────────────
test.describe('addOtherIncome — reversal', () => {
  test('deleting the gig tx restores the wallet saldo', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.addOtherIncome(2500, 'Freelance'));
    const before = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(before).toBe(7500);
    // Find the index of the gig tx and delete it (confirm dialog auto-accepted)
    await page.evaluate(() => {
      const idx = _editData.transacciones.findIndex(t => t.categoria === 'ingreso' && t.nota === 'Freelance');
      window.deleteTransaccion(idx);
    });
    const after = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(after).toBe(5000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. UI — link visible, modal flow, validation
// ───────────────────────────────────────────────────────────────────
test.describe('Otro ingreso UI', () => {
  test('the wallet card shows a "+ Otro ingreso" link', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('#walletCard .wallet-other-income-btn')).toBeVisible();
  });

  test('clicking the link opens the modal with empty inputs and a moneda hint', async ({ page }) => {
    await loadApp(page);
    await page.locator('#walletCard .wallet-other-income-btn').click();
    await expect(page.locator('#walletOtherIncomeModal')).toHaveClass(/open/);
    expect(await page.locator('#walletOtherIncomeAmount').inputValue()).toBe('');
    expect(await page.locator('#walletOtherIncomeNote').inputValue()).toBe('');
    const hint = await page.locator('#walletOtherIncomeHint').textContent();
    expect(hint).toContain('RD$');
  });

  test('confirming with a valid amount logs the tx and updates Mi Saldo', async ({ page }) => {
    await loadApp(page);
    await page.locator('#walletCard .wallet-other-income-btn').click();
    await page.fill('#walletOtherIncomeAmount', '1500');
    await page.fill('#walletOtherIncomeNote', 'Curso freelance');
    await page.click('#walletOtherIncomeModal button:has-text("Registrar"), #walletOtherIncomeModal button:has-text("Log")');
    await expect(page.locator('#walletOtherIncomeModal')).not.toHaveClass(/open/);
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(5000 + 1500);
    const cardBalance = await page.locator('#walletCard .wallet-card-balance').textContent();
    expect(cardBalance).toMatch(/6[,.]?500/);
  });

  test('confirming with 0 / empty does NOT log + keeps the modal open', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openWalletOtherIncome());
    // No amount typed
    await page.click('#walletOtherIncomeModal button:has-text("Registrar"), #walletOtherIncomeModal button:has-text("Log")');
    // Modal should remain open since validation fails
    await expect(page.locator('#walletOtherIncomeModal')).toHaveClass(/open/);
    const ingresoCount = await page.evaluate(() =>
      _editData.transacciones.filter(t => t.categoria === 'ingreso').length
    );
    expect(ingresoCount).toBe(0);
  });

  test('Cancelar closes the modal without logging', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openWalletOtherIncome());
    await page.fill('#walletOtherIncomeAmount', '999');
    await page.click('#walletOtherIncomeModal button:has-text("Cancelar"), #walletOtherIncomeModal button:has-text("Cancel")');
    await expect(page.locator('#walletOtherIncomeModal')).not.toHaveClass(/open/);
    const ingresoCount = await page.evaluate(() =>
      _editData.transacciones.filter(t => t.categoria === 'ingreso').length
    );
    expect(ingresoCount).toBe(0);
  });

  test('opens the wallet-setup modal first if no wallet is configured yet', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    await page.evaluate(() => {
      const data = window.defaultEditData();
      data.forNow.cuentas = [{ id: 'cnt_bank', nombre: 'Banco', moneda: 'RD', saldo: 1000, tipo: 'banco' }];
      data.config.defaultCashAccountId = null;
      window._testLoadData(data);
    });
    await page.evaluate(() => openWalletOtherIncome());
    await expect(page.locator('#walletSetupModal')).toHaveClass(/open/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Otro ingreso — i18n', () => {
  test('Spanish: button + modal labels', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window._testSetLang('es'));
    const btn = await page.locator('#walletCard .wallet-other-income-btn').textContent();
    expect(btn).toContain('Otro ingreso');
    await page.evaluate(() => openWalletOtherIncome());
    const title = await page.locator('#walletOtherIncomeTitle').textContent();
    expect(title).toContain('Otro ingreso');
  });

  test('English: button + modal labels', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window._testSetLang('en'));
    const btn = await page.locator('#walletCard .wallet-other-income-btn').textContent();
    expect(btn).toContain('Other income');
    await page.evaluate(() => openWalletOtherIncome());
    const title = await page.locator('#walletOtherIncomeTitle').textContent();
    expect(title).toContain('Other income');
  });
});
