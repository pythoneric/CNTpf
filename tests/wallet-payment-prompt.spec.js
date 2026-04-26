const { test, expect } = require('@playwright/test');

/**
 * Payment-method prompt — interactive flow on the Alertas & Pagos checklist.
 *
 * When the user marks a gasto as paid, the app now opens a modal that asks
 * "¿Cómo pagaste?" / "How did you pay?" with three options:
 *   - Efectivo  → debits Mi Saldo (existing wallet flow)
 *   - Tarjeta   → adds the gasto's adeudado to the chosen credit card's balance
 *   - Transferencia → no balance change, just marks paid
 *
 * Un-checking a paid gasto reverses whatever method was applied.
 *
 * Sub-suites:
 *   1. Modal opens on unpaid→paid toggle
 *   2. Each method's apply/reverse math
 *   3. Cancellation leaves gasto unpaid
 *   4. Modal hides options that don't apply (no wallet → hide Efectivo;
 *      no cards → hide Tarjeta)
 *   5. i18n
 */

async function loadAppDefault(page, opts = {}) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(({ withDefault, withCards }) => {
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
      { id: cashId, nombre: 'Efectivo', moneda: 'RD', saldo: 10000, tipo: 'cash', comp: 0, disp: 10000 },
    ];
    if (withDefault) data.config.defaultCashAccountId = cashId;
    data.gastos = [
      // index 0: ordinary expense (we'll mark this paid via the prompt)
      { nombre: 'Internet', tipo: 'Servicio', pagado: 0, adeudado: 2500, dia: 5, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false, metodo: '' },
    ];
    if (withCards) {
      data.gastos.push(
        // index 1: credit card #1
        { nombre: 'Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 1200, dia: 20, tasa: 28, balance: 30000, originalRD: 50000, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false },
        // index 2: credit card #2
        { nombre: 'Amex', tipo: 'Tarjeta', pagado: 0, adeudado: 800, dia: 15, tasa: 22, balance: 10000, originalRD: 20000, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false }
      );
    }
    window._testLoadData(data);
  }, { withDefault: opts.withDefault !== false, withCards: opts.withCards !== false });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. Modal opens on unpaid → paid toggle
// ───────────────────────────────────────────────────────────────────
test.describe('Payment-method prompt — opens on toggle', () => {
  test('clicking an unpaid gasto opens the prompt; gasto stays unpaid until confirm', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    await expect(page.locator('#paymentMethodModal')).toHaveClass(/open/);
    const paid = await page.evaluate(() => _editData.gastos[0].pagadoMes);
    expect(paid).toBe(false); // not yet — confirmation pending
  });

  test('cancel leaves the gasto unpaid + saldo unchanged', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    await page.evaluate(() => window.cancelPaymentPrompt());
    const result = await page.evaluate(() => ({
      paid: _editData.gastos[0].pagadoMes,
      saldo: _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo,
      cardBalance: _editData.gastos[1]?.balance,
    }));
    expect(result.paid).toBe(false);
    expect(result.saldo).toBe(10000);
    expect(result.cardBalance).toBe(30000); // unchanged
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Apply / reverse math per method
// ───────────────────────────────────────────────────────────────────
test.describe('Payment-method prompt — Efectivo', () => {
  test('confirm with Efectivo debits Mi Saldo + marks paid', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    // Pick efectivo radio + confirm
    await page.evaluate(() => {
      const r = document.querySelector('#paymentMethodOptions input[value="efectivo"]');
      r.checked = true;
      window.onPaymentMethodChange('efectivo');
      window.confirmPaymentPrompt();
    });
    const result = await page.evaluate(() => ({
      paid: _editData.gastos[0].pagadoMes,
      method: _editData.gastos[0].pagadoMethod,
      saldo: _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo,
    }));
    expect(result.paid).toBe(true);
    expect(result.method).toBe('efectivo');
    expect(result.saldo).toBe(7500); // 10000 - 2500
  });

  test('un-checking a cash-paid gasto restores Mi Saldo', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    await page.evaluate(() => {
      document.querySelector('#paymentMethodOptions input[value="efectivo"]').checked = true;
      window.confirmPaymentPrompt();
    });
    // Now toggle off
    await page.evaluate(() => window.toggleCheck(0));
    const result = await page.evaluate(() => ({
      paid: _editData.gastos[0].pagadoMes,
      saldo: _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo,
      method: _editData.gastos[0].pagadoMethod,
    }));
    expect(result.paid).toBe(false);
    expect(result.saldo).toBe(10000);
    expect(result.method).toBeUndefined();
  });
});

test.describe('Payment-method prompt — Tarjeta', () => {
  test('confirm with Tarjeta + chosen card increments that card balance', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    await page.evaluate(() => {
      document.querySelector('#paymentMethodOptions input[value="tarjeta"]').checked = true;
      window.onPaymentMethodChange('tarjeta');
      // Pick the first card (Visa, gasto index 1)
      document.getElementById('paymentMethodCardSel').value = '1';
      window.confirmPaymentPrompt();
    });
    const result = await page.evaluate(() => ({
      paid: _editData.gastos[0].pagadoMes,
      method: _editData.gastos[0].pagadoMethod,
      tarjetaIdx: _editData.gastos[0].pagadoTarjetaIdx,
      visaBalance: _editData.gastos[1].balance,
      amexBalance: _editData.gastos[2].balance,
      walletSaldo: _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo,
    }));
    expect(result.paid).toBe(true);
    expect(result.method).toBe('tarjeta');
    expect(result.tarjetaIdx).toBe(1);
    // Visa balance: 30000 + 2500 = 32500
    expect(result.visaBalance).toBe(32500);
    expect(result.amexBalance).toBe(10000); // untouched
    expect(result.walletSaldo).toBe(10000); // untouched
  });

  test('un-checking a card-paid gasto decrements that card balance', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    await page.evaluate(() => {
      document.querySelector('#paymentMethodOptions input[value="tarjeta"]').checked = true;
      window.onPaymentMethodChange('tarjeta');
      document.getElementById('paymentMethodCardSel').value = '1';
      window.confirmPaymentPrompt();
    });
    expect(await page.evaluate(() => _editData.gastos[1].balance)).toBe(32500);
    await page.evaluate(() => window.toggleCheck(0));
    const after = await page.evaluate(() => ({
      paid: _editData.gastos[0].pagadoMes,
      visaBalance: _editData.gastos[1].balance,
    }));
    expect(after.paid).toBe(false);
    expect(after.visaBalance).toBe(30000);
  });

  test('the gasto being marked paid is excluded from its own card dropdown', async ({ page }) => {
    await loadAppDefault(page);
    // Toggle card #1 (Visa, index 1) — its dropdown should NOT list itself
    await page.evaluate(() => window.toggleCheck(1));
    const cardOpts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#paymentMethodCardSel option')).map(o => parseInt(o.value, 10))
    );
    expect(cardOpts).not.toContain(1);
    expect(cardOpts).toContain(2); // the OTHER card is fair game
    await page.evaluate(() => window.cancelPaymentPrompt());
  });
});

test.describe('Payment-method prompt — Transferencia', () => {
  test('confirm with Transferencia just marks paid; no balance changes', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    await page.evaluate(() => {
      document.querySelector('#paymentMethodOptions input[value="transferencia"]').checked = true;
      window.onPaymentMethodChange('transferencia');
      window.confirmPaymentPrompt();
    });
    const result = await page.evaluate(() => ({
      paid: _editData.gastos[0].pagadoMes,
      method: _editData.gastos[0].pagadoMethod,
      saldo: _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo,
      visaBalance: _editData.gastos[1].balance,
    }));
    expect(result.paid).toBe(true);
    expect(result.method).toBe('transferencia');
    expect(result.saldo).toBe(10000);
    expect(result.visaBalance).toBe(30000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Modal hides options that don't apply
// ───────────────────────────────────────────────────────────────────
test.describe('Payment-method prompt — context-aware options', () => {
  test('no wallet → Efectivo option is hidden', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    await page.evaluate(() => window.toggleCheck(0));
    const values = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#paymentMethodOptions input[name="paymethod"]')).map(r => r.value)
    );
    expect(values).not.toContain('efectivo');
    expect(values).toContain('tarjeta');
    expect(values).toContain('transferencia');
    await page.evaluate(() => window.cancelPaymentPrompt());
  });

  test('no credit cards → Tarjeta option is hidden', async ({ page }) => {
    await loadAppDefault(page, { withCards: false });
    await page.evaluate(() => window.toggleCheck(0));
    const values = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#paymentMethodOptions input[name="paymethod"]')).map(r => r.value)
    );
    expect(values).toContain('efectivo');
    expect(values).not.toContain('tarjeta');
    expect(values).toContain('transferencia');
    await page.evaluate(() => window.cancelPaymentPrompt());
  });

  test('Tarjeta selected → card dropdown becomes visible', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    // Initially the card wrap follows the preset radio (efectivo by default)
    let visible = await page.evaluate(() =>
      getComputedStyle(document.getElementById('paymentMethodCardWrap')).display !== 'none'
    );
    expect(visible).toBe(false);
    await page.evaluate(() => {
      document.querySelector('#paymentMethodOptions input[value="tarjeta"]').checked = true;
      window.onPaymentMethodChange('tarjeta');
    });
    visible = await page.evaluate(() =>
      getComputedStyle(document.getElementById('paymentMethodCardWrap')).display !== 'none'
    );
    expect(visible).toBe(true);
    await page.evaluate(() => window.cancelPaymentPrompt());
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Modal close handlers (ESC + backdrop)
// ───────────────────────────────────────────────────────────────────
test.describe('Payment-method prompt — close handlers', () => {
  test('ESC cancels the prompt', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    await page.keyboard.press('Escape');
    await expect(page.locator('#paymentMethodModal')).not.toHaveClass(/open/);
    expect(await page.evaluate(() => _editData.gastos[0].pagadoMes)).toBe(false);
  });

  test('backdrop tap cancels the prompt', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    await page.evaluate(() => {
      const m = document.getElementById('paymentMethodModal');
      m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(page.locator('#paymentMethodModal')).not.toHaveClass(/open/);
    expect(await page.evaluate(() => _editData.gastos[0].pagadoMes)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Payment-method prompt — i18n', () => {
  test('Spanish keys resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('es'));
    const k = await page.evaluate(() => ({
      title: window.t('paymethod_title'),
      efectivo: window.t('paymethod_efectivo'),
      tarjeta: window.t('paymethod_tarjeta'),
      transferencia: window.t('paymethod_transferencia'),
      confirm: window.t('paymethod_confirm'),
    }));
    expect(k.title).toMatch(/cómo|como/i);
    expect(k.efectivo).toBe('Efectivo');
    expect(k.tarjeta).toMatch(/tarjeta/i);
    expect(k.transferencia).toMatch(/transferencia/i);
    expect(k.confirm).toMatch(/marcar/i);
  });

  test('English keys resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('en'));
    const k = await page.evaluate(() => ({
      title: window.t('paymethod_title'),
      efectivo: window.t('paymethod_efectivo'),
      tarjeta: window.t('paymethod_tarjeta'),
      transferencia: window.t('paymethod_transferencia'),
      confirm: window.t('paymethod_confirm'),
    }));
    expect(k.title).toMatch(/how did you pay/i);
    expect(k.efectivo).toBe('Cash');
    expect(k.tarjeta).toMatch(/credit/i);
    expect(k.transferencia).toMatch(/transfer/i);
    expect(k.confirm).toMatch(/mark/i);
  });
});
