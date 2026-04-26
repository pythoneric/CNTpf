const { test, expect } = require('@playwright/test');

/**
 * Wallet — Batch 2: header chip, Resumen card, cash-tx auto-debit, first-use prompt
 *
 * - Header chip (#walletChip) shows the default cash account's saldo and hides
 *   when no default is set.
 * - Resumen tab card (#walletCard) shows balance + the last 5 cash movements,
 *   or a CTA when no default is set.
 * - addTransaccion with metodo='efectivo' debits the default cash account.
 * - Deleting a cash tx restores the saldo (via reverseCashDebit).
 * - The applied-flag prevents double-debit on re-render / reload.
 * - When a user adds a cash tx without a default cash account, the first-use
 *   setup modal opens; on confirm a 'cash' cuenta is created and the pending
 *   tx is applied.
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
      { id: 'cnt_bank_seed', nombre: 'Banco Popular', moneda: 'RD', saldo: 250000, tipo: 'banco', comp: 0, disp: 250000 },
      { id: cashId, nombre: 'Efectivo', moneda: 'RD', saldo: 5000, tipo: 'cash', comp: 0, disp: 5000 },
    ];
    data.forNow.total = 255000;
    if (withDefault) data.config.defaultCashAccountId = cashId;
    window._testLoadData(data);
  }, { withDefault: opts.withDefault !== false });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. Header chip — visibility + balance display
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet header chip', () => {
  test('renders with saldo when defaultCashAccountId is set', async ({ page }) => {
    await loadAppDefault(page);
    const chip = page.locator('#walletChip');
    await expect(chip).toBeVisible();
    const val = await page.locator('#walletChipVal').textContent();
    // 5000 RD$ shows as "RD$5,000"
    expect(val).toMatch(/5[,.]?000/);
  });

  test('hidden when no defaultCashAccountId', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('walletChip')).display);
    expect(display).toBe('none');
  });

  test('balance updates after applyCashDebit + buildDashboard', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      const tx = { fecha: '2026-03-10', monto: 1000, categoria: 'comida', metodo: 'efectivo', mes: 'Marzo', anio: 2026 };
      window.applyCashDebit(tx);
      _editData.transacciones.push(tx);
      window.buildDashboard({ ..._editData });
    });
    const val = await page.locator('#walletChipVal').textContent();
    expect(val).toMatch(/4[,.]?000/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Resumen card
// ───────────────────────────────────────────────────────────────────
test.describe('Resumen Mi Saldo card', () => {
  test('shows balance + empty-state movements when no cash tx', async ({ page }) => {
    await loadAppDefault(page);
    const balance = await page.locator('#walletCard .wallet-card-balance').textContent();
    expect(balance).toMatch(/5[,.]?000/);
    const empty = await page.locator('#walletCard .wallet-empty-state').count();
    expect(empty).toBe(1);
  });

  test('shows movement entries after a cash tx', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      const tx = { fecha: '2026-03-10', monto: 1500, categoria: 'comida', nota: 'Almuerzo', metodo: 'efectivo', mes: 'Marzo', anio: 2026 };
      window.applyCashDebit(tx);
      _editData.transacciones.push(tx);
      window.buildDashboard({ ..._editData });
    });
    const items = await page.locator('#walletCard .wallet-mov-item').count();
    expect(items).toBe(1);
    const text = await page.locator('#walletCard .wallet-mov-item').first().textContent();
    expect(text).toContain('Almuerzo');
  });

  test('shows setup CTA when no default cash account', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    const cta = page.locator('#walletCard .wallet-cta');
    await expect(cta).toBeVisible();
    const text = (await cta.textContent()).trim();
    expect(text.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Auto-debit on addTransaccion
// ───────────────────────────────────────────────────────────────────
test.describe('addTransaccion → auto-debit', () => {
  test('cash tx debits the default cash account saldo', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      // Drive the form fields the same way the user would
      const fmt = id => document.getElementById(id);
      fmt('regFecha').value = '2026-03-12';
      fmt('regMonto').value = '500';
      fmt('regCategoria').value = 'comida';
      fmt('regNota').value = 'Test cash spend';
      fmt('regMetodo').value = 'efectivo';
      fmt('regVincular').value = '-1';
      fmt('regRecurrencia').value = 'none';
      window.addTransaccion();
    });
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(4500); // 5000 - 500
  });

  test('tarjeta tx does NOT touch the cash saldo', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      const fmt = id => document.getElementById(id);
      fmt('regFecha').value = '2026-03-12';
      fmt('regMonto').value = '500';
      fmt('regCategoria').value = 'comida';
      fmt('regNota').value = 'Card spend';
      fmt('regMetodo').value = 'tarjeta';
      fmt('regVincular').value = '-1';
      fmt('regRecurrencia').value = 'none';
      window.addTransaccion();
    });
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(5000);
  });

  test('idempotency — applying the same tx twice only debits once', async ({ page }) => {
    await loadAppDefault(page);
    const saldo = await page.evaluate(() => {
      const tx = { fecha: '2026-03-10', monto: 100, categoria: 'comida', metodo: 'efectivo', mes: 'Marzo', anio: 2026 };
      window.applyCashDebit(tx);
      _editData.transacciones.push(tx);
      // Try to apply again — must be a no-op
      window.applyCashDebit(tx);
      return _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo;
    });
    expect(saldo).toBe(4900);
  });

  test('rebuilding the dashboard does not re-debit', async ({ page }) => {
    await loadAppDefault(page);
    const saldo = await page.evaluate(() => {
      const tx = { fecha: '2026-03-10', monto: 200, categoria: 'comida', metodo: 'efectivo', mes: 'Marzo', anio: 2026 };
      window.applyCashDebit(tx);
      _editData.transacciones.push(tx);
      window.buildDashboard({ ..._editData });
      window.buildDashboard({ ..._editData });
      window.buildDashboard({ ..._editData });
      return _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo;
    });
    expect(saldo).toBe(4800);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Reverse on delete
// ───────────────────────────────────────────────────────────────────
test.describe('deleteTransaccion → reverse debit', () => {
  test('deleting a cash tx restores the saldo', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      const tx = { fecha: '2026-03-10', monto: 700, categoria: 'comida', metodo: 'efectivo', mes: 'Marzo', anio: 2026 };
      window.applyCashDebit(tx);
      _editData.transacciones.push(tx);
      window.buildDashboard({ ..._editData });
      // confirm() is auto-accepted by the page-level dialog handler
      window.deleteTransaccion(_editData.transacciones.length - 1);
    });
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(5000);
  });

  test('deleting a non-applied (non-cash) tx leaves saldo untouched', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      _editData.transacciones.push({ fecha: '2026-03-10', monto: 1000, categoria: 'comida', metodo: 'tarjeta', mes: 'Marzo', anio: 2026 });
      window.deleteTransaccion(_editData.transacciones.length - 1);
    });
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).saldo
    );
    expect(saldo).toBe(5000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. First-use prompt — explicit user action (Resumen CTA / chip click)
// ───────────────────────────────────────────────────────────────────
// Design: addTransaccion never blocks. If a user spends in cash without a
// wallet configured, the tx is still recorded (just not debited from any
// account). The wallet stays opt-in: the Resumen card CTA + chip click
// open the setup modal when the user is ready.
test.describe('First-use prompt — explicit setup', () => {
  test('cash tx with no default still records the tx (no blocking modal)', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    await page.evaluate(() => {
      const fmt = id => document.getElementById(id);
      fmt('regFecha').value = '2026-03-12';
      fmt('regMonto').value = '300';
      fmt('regCategoria').value = 'comida';
      fmt('regNota').value = 'First cash tx';
      fmt('regMetodo').value = 'efectivo';
      fmt('regVincular').value = '-1';
      fmt('regRecurrencia').value = 'none';
      window.addTransaccion();
    });
    const result = await page.evaluate(() => ({
      txCount: (_editData.transacciones || []).length,
      defaultId: _editData.config.defaultCashAccountId,
      txApplied: _editData.transacciones?.[0]?.applied,
    }));
    expect(result.txCount).toBe(1);
    expect(result.defaultId).toBeFalsy();
    expect(result.txApplied).toBeFalsy(); // not applied because no wallet configured
    // Modal stays closed
    const modalOpen = await page.evaluate(() =>
      document.getElementById('walletSetupModal')?.classList.contains('open')
    );
    expect(modalOpen).toBe(false);
  });

  test('clicking the Resumen card CTA opens the setup modal', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    await page.locator('#walletCard .wallet-cta').click();
    await expect(page.locator('#walletSetupModal')).toHaveClass(/open/);
  });

  test('confirming setup creates a cash cuenta + sets default', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    await page.evaluate(() => {
      window.promptFirstCashSetup();
      document.getElementById('walletSetupAmount').value = '1000';
      window.confirmWalletSetup();
    });
    const result = await page.evaluate(() => {
      const id = _editData.config.defaultCashAccountId;
      const cash = _editData.forNow.cuentas.find(c => c.id === id);
      return {
        cashSaldo: cash?.saldo,
        defaultId: id,
        cuentaCount: _editData.forNow.cuentas.length,
        cashTipo: cash?.tipo,
      };
    });
    expect(result.cashSaldo).toBe(1000);
    expect(result.defaultId).toBeTruthy();
    expect(result.cashTipo).toBe('cash');
    expect(result.cuentaCount).toBe(3); // 2 seeded + 1 new
  });

  test('cancelling setup leaves wallet unconfigured', async ({ page }) => {
    await loadAppDefault(page, { withDefault: false });
    await page.evaluate(() => {
      window.promptFirstCashSetup();
      window.cancelWalletSetup();
    });
    const result = await page.evaluate(() => ({
      defaultId: _editData.config.defaultCashAccountId,
      cuentas: _editData.forNow.cuentas.length,
    }));
    expect(result.defaultId).toBeFalsy();
    expect(result.cuentas).toBe(2);
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. Currency conversion in cuenta math
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet cross-currency math', () => {
  test('USD wallet debited by RD$-stored tx via tasa', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      // Switch the default cash account to USD with a known starting balance
      const cash = _editData.forNow.cuentas.find(c => c.tipo === 'cash');
      cash.moneda = 'USD';
      cash.saldo = 100; // USD$100
      _editData.config.tasa = 60;
      // Spend RD$1200 — should debit USD$20 (1200/60)
      const tx = { fecha: '2026-03-10', monto: 1200, categoria: 'comida', metodo: 'efectivo', mes: 'Marzo', anio: 2026 };
      window.applyCashDebit(tx);
      _editData.transacciones.push(tx);
    });
    const saldo = await page.evaluate(() =>
      _editData.forNow.cuentas.find(c => c.tipo === 'cash').saldo
    );
    expect(saldo).toBe(80);
  });
});

// ───────────────────────────────────────────────────────────────────
// 7. i18n — chip + setup labels
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet UI i18n', () => {
  test('Spanish labels resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('es'));
    const labels = await page.evaluate(() => ({
      chip: window.t('wallet_chip_label'),
      title: window.t('wallet_setup_title'),
      cta: window.t('wallet_setup_cta'),
      mov: window.t('wallet_movements'),
      empty: window.t('wallet_no_movements'),
    }));
    expect(labels.chip).toBe('Mi Saldo');
    expect(labels.title).toMatch(/Mi Saldo/);
    expect(labels.cta).toMatch(/Mi Saldo/);
    expect(labels.mov).toMatch(/movimientos/i);
    expect(labels.empty).toMatch(/Sin movimientos/i);
  });

  test('English labels resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('en'));
    const labels = await page.evaluate(() => ({
      chip: window.t('wallet_chip_label'),
      title: window.t('wallet_setup_title'),
      cta: window.t('wallet_setup_cta'),
      mov: window.t('wallet_movements'),
    }));
    expect(labels.chip).toBe('My Balance');
    expect(labels.title).toMatch(/My Balance/);
    expect(labels.cta).toMatch(/My Balance/);
    expect(labels.mov).toMatch(/activity/i);
  });
});

// ───────────────────────────────────────────────────────────────────
// 8. Audit follow-ups — flows surfaced by self-review
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet — audit follow-ups', () => {
  test('deleting the default cash cuenta via Edit modal clears the pointer', async ({ page }) => {
    await loadAppDefault(page);
    // The wallet was set up at load time; confirm the pointer is set
    const before = await page.evaluate(() => _editData.config.defaultCashAccountId);
    expect(before).toBeTruthy();
    // Open the edit modal, navigate to Fondos tab, delete the cash row
    await page.evaluate(() => window.openEditModal());
    await page.evaluate(() => window.showEditTab && window.showEditTab('fornow', document.querySelector('.edit-tab[onclick*=fornow]')));
    await page.waitForSelector('#fornowEditBody tr', { state: 'attached' });
    // Delete row 1 (the cash cuenta is index 1 in our seed)
    await page.evaluate(() => window.deleteFornowRow(1));
    // Apply changes (closes modal + rebuilds dashboard, which runs the migration cleanup)
    await page.evaluate(() => window.applyChanges());
    const after = await page.evaluate(() => _editData.config.defaultCashAccountId);
    expect(after).toBe(null);
    // Chip should be hidden again
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('walletChip')).display);
    expect(display).toBe('none');
  });

  test('manually editing cuenta saldo + applyChanges updates the chip', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.openEditModal());
    await page.evaluate(() => window.showEditTab && window.showEditTab('fornow', document.querySelector('.edit-tab[onclick*=fornow]')));
    await page.waitForSelector('#fornowEditBody tr', { state: 'attached' });
    // Mutate the underlying data the same way the saldo input would, then apply
    await page.evaluate(() => {
      _editData.forNow.cuentas[1].saldo = 9999;
      window.applyChanges();
    });
    const val = await page.locator('#walletChipVal').textContent();
    expect(val).toMatch(/9[,.]?999/);
  });

  test('switching the wallet cuenta moneda preserves the default pointer', async ({ page }) => {
    await loadAppDefault(page);
    // Promote wallet from RD to USD via the same code path the user clicks
    await page.evaluate(() => {
      const idx = _editData.forNow.cuentas.findIndex(c => c.id === _editData.config.defaultCashAccountId);
      _editData.forNow.cuentas[idx].moneda = 'USD';
      // Run buildDashboard (chip should follow)
      window.buildDashboard({ ..._editData });
    });
    const result = await page.evaluate(() => ({
      pointer: _editData.config.defaultCashAccountId,
      moneda: _editData.forNow.cuentas.find(c => c.id === _editData.config.defaultCashAccountId).moneda,
    }));
    expect(result.pointer).toBeTruthy();
    expect(result.moneda).toBe('USD');
  });

  test('"View all" link appears when there are movements and routes to Registro', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      const tx = { fecha: '2026-03-10', monto: 800, categoria: 'comida', nota: 'Almuerzo', metodo: 'efectivo', mes: 'Marzo', anio: 2026 };
      window.applyCashDebit(tx);
      _editData.transacciones.push(tx);
      window.buildDashboard({ ..._editData });
    });
    const link = page.locator('#walletCard .wallet-view-all');
    await expect(link).toBeVisible();
    await link.click();
    // Registro panel should be the active one now
    const activeId = await page.evaluate(() => document.querySelector('.panel.active')?.id);
    expect(activeId).toBe('tab-registro');
  });

  test('"View all" link is hidden when there are no movements', async ({ page }) => {
    await loadAppDefault(page);
    const count = await page.locator('#walletCard .wallet-view-all').count();
    expect(count).toBe(0);
  });

  test('legacy transacciones (no applied flag) do not retroactively debit', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    // Simulate a v3 payload: cash tx already exists, but no applied/cuentaId.
    // The user's existing saldo already reflects this spending mentally —
    // we MUST NOT subtract it again.
    const saldoAfter = await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.tasa = 60;
      data.config.mes = 'Marzo';
      data.config.anio = 2026;
      const cashId = 'cnt_cash_legacy';
      data.forNow.cuentas = [
        { id: cashId, nombre: 'Efectivo', moneda: 'RD', saldo: 5000, tipo: 'cash', comp: 0, disp: 5000 },
      ];
      data.config.defaultCashAccountId = cashId;
      // A pre-existing cash tx with no applied flag (v3 shape)
      data.transacciones = [
        { fecha: '2026-03-01', monto: 1500, categoria: 'comida', metodo: 'efectivo', mes: 'Marzo', anio: 2026 },
      ];
      window._testLoadData(data);
      return _editData.forNow.cuentas[0].saldo;
    });
    expect(saldoAfter).toBe(5000); // unchanged
  });
});
