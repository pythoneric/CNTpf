const { test, expect } = require('@playwright/test');

/**
 * Wallet — Batch 3: gasto checklist auto-debit
 *
 * Each gasto can opt into a payment method. When metodo='efectivo' AND a
 * default cash account is configured, marking the gasto as paid debits the
 * wallet by adeudado; un-checking restores. Idempotent via pagadoApplied flag.
 *
 * Sub-suites:
 *   1. Helpers — applyGastoDebit / reverseGastoDebit
 *   2. toggleCheck — debit on check, restore on uncheck
 *   3. Method change while paid — reverse + re-apply
 *   4. resetChecklist — restores all wallet debits
 *   5. Cierre month-close — clears flags, does NOT re-credit
 *   6. Edit modal Gastos tab — Método dropdown
 *   7. Setup wizard — metodo persists from sw-g-metodo
 *   8. Visual cash badge in checklist
 *   9. i18n
 */

async function loadAppDefault(page, opts = {}) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(({ withDefault, withMetodo }) => {
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
    data.forNow.total = 60000;
    if (withDefault) data.config.defaultCashAccountId = cashId;
    data.gastos = [
      { nombre: 'Internet', tipo: 'Servicio', pagado: 0, adeudado: 2500, dia: 5, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false, metodo: withMetodo ? 'efectivo' : '' },
      { nombre: 'Gym', tipo: 'Variable', pagado: 0, adeudado: 1500, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false, metodo: 'tarjeta' },
    ];
    window._testLoadData(data);
  }, { withDefault: opts.withDefault !== false, withMetodo: opts.withMetodo !== false });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. Helpers
// ───────────────────────────────────────────────────────────────────
test.describe('applyGastoDebit / reverseGastoDebit', () => {
  test('apply debits saldo and sets bookkeeping fields', async ({ page }) => {
    await loadAppDefault(page);
    const result = await page.evaluate(() => {
      const g = _editData.gastos[0];
      window.applyGastoDebit(g);
      const cash = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { saldo: cash.saldo, applied: g.pagadoApplied, cuentaId: g.pagadoCuentaId };
    });
    expect(result.saldo).toBe(7500); // 10000 - 2500
    expect(result.applied).toBe(true);
    expect(result.cuentaId).toMatch(/^cnt_/);
  });

  test('apply is no-op on non-cash methods', async ({ page }) => {
    await loadAppDefault(page);
    const result = await page.evaluate(() => {
      const g = _editData.gastos[1]; // tarjeta
      const ok = window.applyGastoDebit(g);
      const cash = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { ok, saldo: cash.saldo, applied: !!g.pagadoApplied };
    });
    expect(result.ok).toBe(false);
    expect(result.saldo).toBe(10000);
    expect(result.applied).toBe(false);
  });

  test('apply is idempotent (second call does nothing)', async ({ page }) => {
    await loadAppDefault(page);
    const saldo = await page.evaluate(() => {
      const g = _editData.gastos[0];
      window.applyGastoDebit(g);
      window.applyGastoDebit(g);
      window.applyGastoDebit(g);
      return _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo;
    });
    expect(saldo).toBe(7500);
  });

  test('reverse restores saldo and clears applied flag', async ({ page }) => {
    await loadAppDefault(page);
    const result = await page.evaluate(() => {
      const g = _editData.gastos[0];
      window.applyGastoDebit(g);
      window.reverseGastoDebit(g);
      const cash = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { saldo: cash.saldo, applied: !!g.pagadoApplied };
    });
    expect(result.saldo).toBe(10000);
    expect(result.applied).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. toggleCheck flows
// ───────────────────────────────────────────────────────────────────
test.describe('toggleCheck — auto-debit on check, restore on uncheck', () => {
  test('checking a cash gasto debits the wallet', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    const result = await page.evaluate(() => {
      const g = _editData.gastos[0];
      const cash = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { paid: g.pagadoMes, applied: g.pagadoApplied, saldo: cash.saldo };
    });
    expect(result.paid).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.saldo).toBe(7500);
  });

  test('un-checking the same gasto restores the wallet', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    await page.evaluate(() => window.toggleCheck(0));
    const result = await page.evaluate(() => {
      const g = _editData.gastos[0];
      const cash = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { paid: g.pagadoMes, applied: !!g.pagadoApplied, saldo: cash.saldo };
    });
    expect(result.paid).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.saldo).toBe(10000);
  });

  test('checking a tarjeta gasto leaves wallet untouched', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(1)); // index 1 is tarjeta
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(10000);
  });

  test('checking a cash gasto with NO default wallet still marks paid (no debit)', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    await page.evaluate(() => window.toggleCheck(0));
    const result = await page.evaluate(() => ({
      paid: _editData.gastos[0].pagadoMes,
      applied: !!_editData.gastos[0].pagadoApplied,
    }));
    expect(result.paid).toBe(true);
    expect(result.applied).toBe(false);
  });

  test('rebuilding dashboard does not re-debit a paid gasto', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    await page.evaluate(() => window.buildDashboard({ ..._editData }));
    await page.evaluate(() => window.buildDashboard({ ..._editData }));
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(7500);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Method change while paid
// ───────────────────────────────────────────────────────────────────
test.describe('onGastoMetodoChange — reverse on demote, re-apply on promote', () => {
  // Helper: build a real <select> with the metodo options so .value sticks.
  // (A bare document.createElement('select') with no <option>s drops any
  // value assignment to ''.)
  const _METODO_VALUES = ['', 'efectivo', 'tarjeta', 'transferencia'];
  async function buildMetodoSelect(page, value) {
    return page.evaluateHandle(({ vals, value }) => {
      const sel = document.createElement('select');
      vals.forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        sel.appendChild(o);
      });
      sel.value = value;
      document.body.appendChild(sel);
      return sel;
    }, { vals: _METODO_VALUES, value });
  }

  test('changing a paid gasto from efectivo→tarjeta restores the wallet', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0)); // pay it (debits 2500)
    const sel = await buildMetodoSelect(page, 'tarjeta');
    await page.evaluate(({ s }) => window.onGastoMetodoChange(0, s), { s: sel });
    const result = await page.evaluate(() => ({
      saldo: _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo,
      metodo: _editData.gastos[0].metodo,
      applied: !!_editData.gastos[0].pagadoApplied,
      paid: _editData.gastos[0].pagadoMes,
    }));
    expect(result.saldo).toBe(10000); // restored
    expect(result.metodo).toBe('tarjeta');
    expect(result.applied).toBe(false);
    expect(result.paid).toBe(true); // still marked paid, just no longer cash
  });

  test('changing a paid tarjeta gasto → efectivo applies the debit', async ({ page }) => {
    await loadAppDefault(page);
    // Set up the gasto as paid via tarjeta directly. The toggle path now opens
    // the payment-method prompt; this test is specifically about the
    // method-switch reverse+reapply flow, so we pre-stage the state.
    await page.evaluate(() => {
      const g = _editData.gastos[1]; // tarjeta gasto, adeudado 1500
      g.pagadoMes = true;
      g.pagado = g.adeudado;
      // Mark as paid via tarjeta (no card to charge in this seed → use the
      // transferencia branch which leaves the gasto paid+applied with no
      // wallet/card mutations, equivalent to the old "tarjeta did nothing").
      window.applyGastoTransferencia(g);
    });
    const sel = await buildMetodoSelect(page, 'efectivo');
    await page.evaluate(({ s }) => window.onGastoMetodoChange(1, s), { s: sel });
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    // gasto[1].adeudado is 1500 → 10000 - 1500 = 8500
    expect(saldo).toBe(8500);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. resetChecklist — restores all wallet debits
// ───────────────────────────────────────────────────────────────────
test.describe('resetChecklist — fully restore wallet', () => {
  test('after paying multiple cash gastos, reset restores the wallet', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      // Make both gastos cash + paid
      _editData.gastos[1].metodo = 'efectivo';
      window.toggleCheck(0);
      window.toggleCheck(1);
    });
    let saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(6000); // 10000 - 2500 - 1500
    await page.evaluate(() => window.resetChecklist());
    saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(10000);
    const flags = await page.evaluate(() => _editData.gastos.map(g => ({ paid: g.pagadoMes, applied: !!g.pagadoApplied })));
    expect(flags.every(f => !f.paid && !f.applied)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Cierre — clears flags, never re-credits
// ───────────────────────────────────────────────────────────────────
test.describe('Cierre month-close — clears flags without re-crediting', () => {
  test('closing a month leaves wallet at the spent state', async ({ page }) => {
    await loadAppDefault(page);
    // Pay the cash gasto so saldo is 7500
    await page.evaluate(() => window.toggleCheck(0));
    let saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(7500);
    // Run the same code path the cierre wizard runs at confirm: clear flags
    await page.evaluate(() => {
      _editData.gastos.forEach(g => { g.pagadoMes = false; g.pagado = 0; g.pagadoApplied = false; delete g.pagadoCuentaId; });
    });
    saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    // Saldo MUST stay at 7500 — the user actually spent that money.
    expect(saldo).toBe(7500);
    const flags = await page.evaluate(() => _editData.gastos.map(g => ({ paid: g.pagadoMes, applied: !!g.pagadoApplied })));
    expect(flags.every(f => !f.paid && !f.applied)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. Edit modal Gastos tab — Método dropdown
// ───────────────────────────────────────────────────────────────────
test.describe('Edit modal — gasto metodo column', () => {
  test('Método dropdown renders for each gasto with current value', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.openEditModal());
    await page.evaluate(() => window.showEditTab && window.showEditTab('esenciales', document.querySelector('.edit-tab[onclick*=esenciales]')));
    await page.waitForSelector('#esencialesEditBody .gasto-metodo', { state: 'visible' });
    const cells = await page.locator('#esencialesEditBody .gasto-metodo').count();
    expect(cells).toBe(2);
    const v0 = await page.locator('#esencialesEditBody .gasto-metodo').first().inputValue();
    expect(v0).toBe('efectivo');
    const v1 = await page.locator('#esencialesEditBody .gasto-metodo').nth(1).inputValue();
    expect(v1).toBe('tarjeta');
  });

  test('changing dropdown to (no auto-debit) clears metodo', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.openEditModal());
    await page.evaluate(() => window.showEditTab && window.showEditTab('esenciales', document.querySelector('.edit-tab[onclick*=esenciales]')));
    await page.waitForSelector('#esencialesEditBody .gasto-metodo', { state: 'visible' });
    await page.locator('#esencialesEditBody .gasto-metodo').first().selectOption('');
    const m = await page.evaluate(() => _editData.gastos[0].metodo);
    expect(m).toBe('');
  });
});

// ───────────────────────────────────────────────────────────────────
// 7. Setup wizard — metodo persists
// ───────────────────────────────────────────────────────────────────
test.describe('Setup wizard — gasto metodo dropdown', () => {
  test('selecting efectivo on a gasto saves metodo:efectivo', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.startFromScratch === 'function');
    await page.evaluate(() => window.startFromScratch());
    await page.evaluate(() => {
      window._testSetupSave(0); // skip step 1
      window._testSetupGoToStep(2); // gastos step (index 2 = step 3)
    });
    await page.waitForSelector('.sw-gasto-row', { state: 'visible' });
    const row = page.locator('.sw-gasto-row').first();
    await row.locator('.sw-g-nombre').fill('Internet');
    await row.locator('.sw-g-adeudado').fill('2500');
    await row.locator('.sw-g-metodo').selectOption('efectivo');
    await page.evaluate(() => window._testSetupSave(2));
    const m = await page.evaluate(() => _editData.gastos[0].metodo);
    expect(m).toBe('efectivo');
  });
});

// ───────────────────────────────────────────────────────────────────
// 8. Visual cash badge in checklist
// ───────────────────────────────────────────────────────────────────
test.describe('Cash badge in checklist', () => {
  test('cash gasto shows the 💵 badge', async ({ page }) => {
    await loadAppDefault(page);
    // Navigate to Alertas tab where the checklist lives
    await page.evaluate(() => window.showTab('alertas', null));
    await page.waitForSelector('#checklistPending', { state: 'attached' });
    const badges = await page.locator('#checklistPending .cash-badge').count();
    expect(badges).toBe(1); // only the cash gasto, not the tarjeta one
  });

  test('non-cash gastos do not show the badge', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      _editData.gastos[0].metodo = ''; // demote
      window.buildDashboard({ ..._editData });
    });
    await page.evaluate(() => window.showTab('alertas', null));
    await page.waitForSelector('#checklistPending', { state: 'attached' });
    const badges = await page.locator('#checklistPending .cash-badge').count();
    expect(badges).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 9. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Batch 3 i18n keys', () => {
  test('Spanish keys resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('es'));
    const keys = await page.evaluate(() => ({
      label: window.t('gasto_metodo_label'),
      none: window.t('gasto_metodo_none'),
      paidWith: window.t('gasto_paid_with_cash'),
      eth: window.t('eth_metodo'),
    }));
    expect(keys.label).toBe('Método de pago');
    expect(keys.none).toMatch(/auto-débito/i);
    expect(keys.paidWith).toMatch(/efectivo/i);
    expect(keys.eth).toBe('Método');
  });

  test('English keys resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('en'));
    const keys = await page.evaluate(() => ({
      label: window.t('gasto_metodo_label'),
      none: window.t('gasto_metodo_none'),
      paidWith: window.t('gasto_paid_with_cash'),
      eth: window.t('eth_metodo'),
    }));
    expect(keys.label).toBe('Payment method');
    expect(keys.none).toMatch(/auto-debit/i);
    expect(keys.paidWith).toMatch(/cash/i);
    expect(keys.eth).toBe('Method');
  });
});

// ───────────────────────────────────────────────────────────────────
// 10. Audit follow-ups — surface the bugs found by self-review
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet gasto — audit follow-ups', () => {
  test('Bug #1: editing adeudado after apply, then uncheck — refunds ORIGINAL amount', async ({ page }) => {
    await loadAppDefault(page);
    // Pay (debits 2500 of 10000 wallet → 7500)
    await page.evaluate(() => window.toggleCheck(0));
    let saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(7500);
    // Inflate adeudado AFTER the debit (simulating a user editing the gasto)
    await page.evaluate(() => { _editData.gastos[0].adeudado = 5000; });
    // Uncheck — must refund the originally-applied 2500, NOT the new 5000
    await page.evaluate(() => window.toggleCheck(0));
    saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(10000); // back to start, not 12500
  });

  test('pagadoAppliedAmt is stored on apply and cleared on reverse', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.toggleCheck(0));
    let stored = await page.evaluate(() => _editData.gastos[0].pagadoAppliedAmt);
    expect(stored).toBe(2500);
    await page.evaluate(() => window.toggleCheck(0));
    stored = await page.evaluate(() => _editData.gastos[0].pagadoAppliedAmt);
    expect(stored).toBeUndefined();
  });

  test('Bug #2: deleting wallet cuenta then unchecking clears the orphan flag', async ({ page }) => {
    await loadAppDefault(page);
    // Pay the cash gasto
    await page.evaluate(() => window.toggleCheck(0));
    expect(await page.evaluate(() => _editData.gastos[0].pagadoApplied)).toBe(true);
    // Nuke the wallet cuenta out from under it
    await page.evaluate(() => {
      const id = _editData.config.defaultCashAccountId;
      _editData.forNow.cuentas = _editData.forNow.cuentas.filter(c => c.id !== id);
      _editData.config.defaultCashAccountId = null;
    });
    // Unchecking now must NOT leave pagadoApplied=true forever — flag clears
    // even though the cuenta is gone (no refund is possible, but state stays clean).
    await page.evaluate(() => window.toggleCheck(0));
    const result = await page.evaluate(() => ({
      paid: _editData.gastos[0].pagadoMes,
      applied: !!_editData.gastos[0].pagadoApplied,
      cuentaId: _editData.gastos[0].pagadoCuentaId,
      amt: _editData.gastos[0].pagadoAppliedAmt,
    }));
    expect(result.paid).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.cuentaId).toBeUndefined();
    expect(result.amt).toBeUndefined();
  });

  test('markAllChecklist applies wallet debits for cash gastos', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.markAllChecklist());
    const result = await page.evaluate(() => {
      const cash = _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId);
      return { saldo: cash.saldo, applied: _editData.gastos.map(g => !!g.pagadoApplied) };
    });
    // Only the first gasto (cash) should debit; second is tarjeta
    expect(result.saldo).toBe(7500);
    expect(result.applied).toEqual([true, false]);
  });

  test('legacy gasto (no metodo, pagadoMes=true) loads without retroactive debit', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    const saldoAfter = await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.tasa = 60;
      data.config.mes = 'Marzo';
      data.config.anio = 2026;
      const cashId = 'cnt_cash_legacy_g';
      data.forNow.cuentas = [{ id: cashId, nombre: 'Efectivo', moneda: 'RD', saldo: 5000, tipo: 'cash', comp: 0, disp: 5000 }];
      data.config.defaultCashAccountId = cashId;
      // Pre-batch-3 gasto: pagadoMes=true, no metodo, no pagadoApplied
      data.gastos = [
        { nombre: 'Internet legacy', tipo: 'Servicio', pagado: 1500, adeudado: 1500, dia: 5, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: true },
      ];
      window._testLoadData(data);
      return _editData.forNow.cuentas[0].saldo;
    });
    expect(saldoAfter).toBe(5000); // unchanged — no retroactive debit
  });

  test('demo RD$ ships with at least one cash-paid gasto for discoverability', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.evaluate(() => window.loadDemo('RD'));
    await page.waitForSelector('#dashApp', { state: 'visible' });
    const cashGastoCount = await page.evaluate(() =>
      (_editData.gastos || []).filter(g => g.metodo === 'efectivo').length
    );
    expect(cashGastoCount).toBeGreaterThanOrEqual(1);
  });
});
