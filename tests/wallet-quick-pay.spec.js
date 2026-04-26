const { test, expect } = require('@playwright/test');

/**
 * Wallet — Batch 5: Quick-Pay floating button + modal
 *
 * The FAB is the headline "button for payment" the user originally asked
 * for. Click it, type an amount + method, hit Pay → tx is recorded and
 * the wallet is debited if cash. Designed for thumb-reachable speed.
 *
 * Sub-suites:
 *   1. FAB visibility (visible with wallet, hidden without)
 *   2. Open/close (button click, ESC, backdrop tap)
 *   3. Submission (cash debits, card doesn't, validation)
 *   4. Form reset between sessions
 *   5. i18n
 */

async function loadAppDefault(page, opts = {}) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(({ withDefault }) => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.payFrequency = 'mensual';
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.config.monedaPrincipal = 'RD';
    const cashId = 'cnt_cash_seed';
    data.forNow.cuentas = [
      { id: 'cnt_bank_seed', nombre: 'Banco', moneda: 'RD', saldo: 50000, tipo: 'banco', comp: 0, disp: 50000 },
      { id: cashId, nombre: 'Efectivo', moneda: 'RD', saldo: 5000, tipo: 'cash', comp: 0, disp: 5000 },
    ];
    if (withDefault) data.config.defaultCashAccountId = cashId;
    window._testLoadData(data);
  }, { withDefault: opts.withDefault !== false });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. FAB visibility
// ───────────────────────────────────────────────────────────────────
test.describe('Quick-pay FAB visibility', () => {
  test('FAB is visible when a wallet is configured', async ({ page }) => {
    await loadAppDefault(page);
    await expect(page.locator('#quickPayFab')).toBeVisible();
  });

  test('FAB is hidden when no wallet is configured', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    const display = await page.evaluate(() =>
      getComputedStyle(document.getElementById('quickPayFab')).display
    );
    expect(display).toBe('none');
  });

  test('FAB shows up after the user configures a wallet', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    await page.evaluate(() => {
      window.promptFirstCashSetup();
      document.getElementById('walletSetupAmount').value = '500';
      window.confirmWalletSetup();
    });
    await expect(page.locator('#quickPayFab')).toBeVisible();
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Open / close
// ───────────────────────────────────────────────────────────────────
test.describe('Quick-pay modal — open / close', () => {
  test('clicking the FAB opens the quick-pay modal', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    await expect(page.locator('#quickPayModal')).toHaveClass(/open/);
  });

  test('clicking the FAB with no wallet opens the setup modal instead', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    // The FAB is hidden in this state, but invoking openQuickPay directly
    // (e.g., from a deep link or test) routes to setup.
    await page.evaluate(() => window.openQuickPay());
    await expect(page.locator('#walletSetupModal')).toHaveClass(/open/);
    await expect(page.locator('#quickPayModal')).not.toHaveClass(/open/);
  });

  test('Cancel button closes the modal', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    await page.locator('#quickPayModal .btn-ghost').click();
    await expect(page.locator('#quickPayModal')).not.toHaveClass(/open/);
  });

  test('ESC closes the modal', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#quickPayModal')).not.toHaveClass(/open/);
  });

  test('backdrop tap closes the modal (mobile pattern)', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    await page.evaluate(() => {
      const m = document.getElementById('quickPayModal');
      m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(page.locator('#quickPayModal')).not.toHaveClass(/open/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Submission
// ───────────────────────────────────────────────────────────────────
test.describe('Quick-pay modal — submit', () => {
  test('cash payment debits the wallet and records a tx', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    await page.locator('#qpayAmount').fill('800');
    await page.locator('#qpayCategoria').selectOption('comida');
    await page.locator('#qpayNota').fill('Lunch');
    // metodo defaults to efectivo
    await page.locator('#quickPayModal .btn-primary').click();
    const result = await page.evaluate(() => {
      const cash = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      const tx = _editData.transacciones[0];
      return { saldo: cash.saldo, txMonto: tx.monto, txCat: tx.categoria, txMet: tx.metodo, applied: tx.applied };
    });
    expect(result.saldo).toBe(4200); // 5000 - 800
    expect(result.txMonto).toBe(800);
    expect(result.txCat).toBe('comida');
    expect(result.txMet).toBe('efectivo');
    expect(result.applied).toBe(true);
  });

  test('tarjeta payment records the tx but does NOT debit the wallet', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    await page.locator('#qpayAmount').fill('800');
    await page.locator('#qpayMethod').selectOption('tarjeta');
    await page.locator('#quickPayModal .btn-primary').click();
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(5000); // unchanged
    const txCount = await page.evaluate(() => _editData.transacciones.length);
    expect(txCount).toBe(1);
  });

  test('empty / zero amount blocks submission and surfaces an error', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    // Try empty
    await page.locator('#quickPayModal .btn-primary').click();
    await expect(page.locator('#qpayError')).toHaveClass(/show/);
    // Modal stays open
    await expect(page.locator('#quickPayModal')).toHaveClass(/open/);
    // Saldo / tx unchanged
    const result = await page.evaluate(() => ({
      saldo: _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo,
      txCount: _editData.transacciones.length,
    }));
    expect(result.saldo).toBe(5000);
    expect(result.txCount).toBe(0);
  });

  test('successful submit closes the modal', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    await page.locator('#qpayAmount').fill('100');
    await page.locator('#quickPayModal .btn-primary').click();
    await expect(page.locator('#quickPayModal')).not.toHaveClass(/open/);
  });

  test('comma-separated amount parses correctly via pf()', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    await page.locator('#qpayAmount').fill('1,500');
    await page.locator('#quickPayModal .btn-primary').click();
    const monto = await page.evaluate(() => _editData.transacciones[0].monto);
    expect(monto).toBe(1500);
  });

  test('synthetic income tx (categoria=ingreso) is NOT a category option', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    const cats = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#qpayCategoria option')).map(o => o.value)
    );
    expect(cats).not.toContain('ingreso');
    // 9 expense categories per QPAY_CATS in cnt.html
    expect(cats).toHaveLength(9);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Form reset between sessions
// ───────────────────────────────────────────────────────────────────
test.describe('Quick-pay modal — form reset', () => {
  test('reopening clears amount, note, and any prior error', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    await page.locator('#qpayAmount').fill('100');
    await page.locator('#qpayNota').fill('Test');
    // Trigger error to verify it gets reset too
    await page.locator('#qpayAmount').fill('');
    await page.locator('#quickPayModal .btn-primary').click();
    await expect(page.locator('#qpayError')).toHaveClass(/show/);
    // Cancel + re-open
    await page.locator('#quickPayModal .btn-ghost').click();
    await page.locator('#quickPayFab').click();
    const state = await page.evaluate(() => ({
      amount: document.getElementById('qpayAmount').value,
      nota: document.getElementById('qpayNota').value,
      errorClass: document.getElementById('qpayError').className,
    }));
    expect(state.amount).toBe('');
    expect(state.nota).toBe('');
    expect(state.errorClass).not.toMatch(/show/);
  });

  test('method dropdown defaults to efectivo + categoria defaults to otro', async ({ page }) => {
    await loadAppDefault(page);
    await page.locator('#quickPayFab').click();
    const m = await page.locator('#qpayMethod').inputValue();
    const c = await page.locator('#qpayCategoria').inputValue();
    expect(m).toBe('efectivo');
    expect(c).toBe('otro');
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Quick-pay i18n', () => {
  test('Spanish labels resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('es'));
    const labels = await page.evaluate(() => ({
      title: window.t('qpay_title'),
      amount: window.t('qpay_amount'),
      method: window.t('qpay_method'),
      submit: window.t('qpay_submit'),
      err: window.t('qpay_err_amount'),
      fab: window.t('qpay_fab_aria'),
    }));
    expect(labels.title).toBe('Pago rápido');
    expect(labels.amount).toBe('Monto');
    expect(labels.method).toBe('Método');
    expect(labels.submit).toBe('Pagar');
    expect(labels.err).toMatch(/monto/i);
    expect(labels.fab).toBe('Pago rápido');
  });

  test('English labels resolve + FAB aria-label updates on language toggle', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('en'));
    const labels = await page.evaluate(() => ({
      title: window.t('qpay_title'),
      amount: window.t('qpay_amount'),
      submit: window.t('qpay_submit'),
    }));
    expect(labels.title).toBe('Quick pay');
    expect(labels.amount).toBe('Amount');
    expect(labels.submit).toBe('Pay');
    // FAB aria-label tracks current language
    const aria = await page.locator('#quickPayFab').getAttribute('aria-label');
    expect(aria).toBe('Quick pay');
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. Final-audit follow-ups
// ───────────────────────────────────────────────────────────────────
test.describe('Quick-pay — final audit follow-ups', () => {
  test('FAB sits BEHIND open modals (z-index lower than modal layer)', async ({ page }) => {
    await loadAppDefault(page);
    // Open the edit modal
    await page.evaluate(() => window.openEditModal());
    const stack = await page.evaluate(() => ({
      fab: parseInt(getComputedStyle(document.getElementById('quickPayFab')).zIndex, 10),
      edit: parseInt(getComputedStyle(document.getElementById('editModal')).zIndex, 10),
      cierre: parseInt(getComputedStyle(document.getElementById('cierreModal')).zIndex, 10),
      qpay: parseInt(getComputedStyle(document.getElementById('quickPayModal')).zIndex, 10),
      setup: parseInt(getComputedStyle(document.getElementById('walletSetupModal')).zIndex, 10),
    }));
    expect(stack.fab).toBeLessThan(stack.edit);
    expect(stack.fab).toBeLessThan(stack.cierre);
    expect(stack.fab).toBeLessThan(stack.qpay);
    expect(stack.fab).toBeLessThan(stack.setup);
  });

  test('opening FAB while edit modal is already open: quick-pay still opens but stays at same z-layer', async ({ page }) => {
    // Real users can't tap a hidden FAB through a modal, but a
    // programmatic call shouldn't corrupt state.
    await loadAppDefault(page);
    await page.evaluate(() => window.openEditModal());
    await page.evaluate(() => window.openQuickPay());
    const both = await page.evaluate(() => ({
      edit: document.getElementById('editModal').classList.contains('open'),
      qpay: document.getElementById('quickPayModal').classList.contains('open'),
    }));
    // Both modals open simultaneously is an edge case; the test asserts the
    // app doesn't crash and quick-pay state is consistent.
    expect(both.qpay).toBe(true);
    expect(both.edit).toBe(true);
    // Closing quick-pay shouldn't take the edit modal with it
    await page.evaluate(() => window.closeQuickPay());
    const after = await page.evaluate(() => ({
      edit: document.getElementById('editModal').classList.contains('open'),
      qpay: document.getElementById('quickPayModal').classList.contains('open'),
    }));
    expect(after.qpay).toBe(false);
    expect(after.edit).toBe(true);
  });

  test('cross-currency: USD wallet, RD$-stored monto debits via tasa', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.tasa = 60;
      data.config.mes = 'Marzo';
      data.config.anio = 2026;
      const cashId = 'cnt_cash_usd';
      data.forNow.cuentas = [
        { id: cashId, nombre: 'Cash USD', moneda: 'USD', saldo: 100, tipo: 'cash', comp: 0, disp: 100 },
      ];
      data.config.defaultCashAccountId = cashId;
      window._testLoadData(data);
    });
    await page.waitForSelector('#dashApp', { state: 'visible' });
    await page.locator('#quickPayFab').click();
    await page.locator('#qpayAmount').fill('1200'); // RD$1,200
    await page.locator('#quickPayModal .btn-primary').click();
    const saldo = await page.evaluate(() => _editData.forNow.cuentas[0].saldo);
    // USD$100 - (1200/60) = $80
    expect(saldo).toBe(80);
  });

  test('full integration: setup → income deposit → quick-pay → balance is correct', async ({ page }) => {
    // Start with NO wallet; FAB opens setup; setup auto-resumes quick-pay
    await loadAppDefault(page, { withDefault: false });
    await page.evaluate(() => window.openQuickPay());
    // Setup modal is up first
    await expect(page.locator('#walletSetupModal')).toHaveClass(/open/);
    // Confirm setup with starting balance 5000
    await page.evaluate(() => {
      document.getElementById('walletSetupAmount').value = '5000';
      window.confirmWalletSetup();
    });
    // Auto-resume should reopen quick-pay
    await expect(page.locator('#quickPayModal')).toHaveClass(/open/);
    await page.locator('#qpayAmount').fill('800');
    await page.locator('#quickPayModal .btn-primary').click();
    let saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(4200); // 5000 - 800
    // Income deposit credits monthly equivalent
    await page.evaluate(() => window.depositIncomeToWallet());
    saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    // 4200 + 180000 = 184200
    expect(saldo).toBe(184200);
    // Wallet card on Resumen reflects the latest balance
    const balanceText = await page.locator('#walletCard .wallet-card-balance').textContent();
    expect(balanceText).toMatch(/184[,.]?200/);
  });

  test('cancelling setup from FAB flow does NOT auto-resume quick-pay', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    await page.evaluate(() => window.openQuickPay());
    await expect(page.locator('#walletSetupModal')).toHaveClass(/open/);
    await page.evaluate(() => window.cancelWalletSetup());
    // Both modals closed; the resume flag is reset
    const state = await page.evaluate(() => ({
      setup: document.getElementById('walletSetupModal').classList.contains('open'),
      qpay: document.getElementById('quickPayModal').classList.contains('open'),
    }));
    expect(state.setup).toBe(false);
    expect(state.qpay).toBe(false);
  });
});
