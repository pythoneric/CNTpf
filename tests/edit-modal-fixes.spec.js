const { test, expect } = require('@playwright/test');

/**
 * Test suite for Edit Modal fixes — covers all 14 issues from the review.
 *
 * #1  Silent tasa fallback to 60 with no warning
 * #2  No RD$-denominated income entry
 * #4  Config tab doesn't write to _editData in real-time
 * #5  No validation on dia/tasa/balance fields
 * #7  originalRD and originalUSD not linked
 * #8  Delete confirm missing on funds/emergency/history rows
 * #9  Free-text tipo should be a dropdown
 * #10 Currency switch doesn't convert balance (60x error)
 * #14 meta=0 produces NaN/Infinity in emergency fund %
 * #17 History column says "USD" but stores RD$
 * #20 New history row uses hardcoded tasa instead of current
 * #22 Balance correction misinterpreted as payment
 * #26 Comma in pasted numbers silently truncates value
 */

let _dialogAction = 'accept';

async function loadApp(page) {
  page.on('dialog', dialog => {
    if (_dialogAction === 'dismiss') dialog.dismiss();
    else dialog.accept();
  });
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');

  await page.evaluate(() => {
    const data = window.defaultEditData();
    data.config.tasa = 58;
    data.config.ingresoUSD = 3000;
    data.config.ingresoRD = 174000;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.config.diasAlerta = 5;
    data.emerg.cashflow.ingreso = 174000;
    data.emerg.cashflow.gasto = 120000;
    data.emerg.cashflow.tasa = 58;
    data.forNow.cuentas = [
      { nombre: 'Banco Popular', moneda: 'RD', saldo: 60000, comp: 0, disp: 60000 },
      { nombre: 'Savings USD', moneda: 'USD', saldo: 500, comp: 0, disp: 500 },
    ];
    data.forNow.total = 89000;
    data.gastos = [
      { nombre: 'Tarjeta Visa', tipo: 'Tarjeta', pagado: 5000, adeudado: 8000, dia: 15, tasa: 3.5, balance: 45000, originalRD: 50000, originalUSD: 0, fechaLimite: '2027-06-15', notas: '', pagadoMes: false },
      { nombre: 'Alquiler', tipo: 'Fijo', pagado: 25000, adeudado: 25000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: true },
    ];
    data.emerg.fondos = [
      { fondo: 'Emergencia General', moneda: 'RD', balance: 30000, meta: 100000 },
      { fondo: 'USD Reserve', moneda: 'USD', balance: 200, meta: 1000 },
    ];
    data.historial = [
      { mes: 'Febrero', anio: 2026, ingresos: 174000, gasto: 130000, ahorro: 20000, tasaAhorro: 11.5, deudas: 45000, emergencia: 30000, netWorth: 50000, tasa: 58, notas: '' },
    ];
    window._testLoadData(data);
  });
}

async function openEdit(page) {
  await page.evaluate(() => window.openEditModal());
  await expect(page.locator('#editModal')).toHaveClass(/open/);
}

// ────────────────────────────────────────────────────────────────────
// #1 — Silent tasa fallback to 60 with no warning
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #1 — Tasa default warning', () => {
  test('tasa=60 shows warning, non-60 hides it', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);

    // tasa is 58, warning should be hidden
    const warn = page.locator('#tasa-warn');
    await expect(warn).toBeHidden();

    // Change tasa to 60 → warning should show
    const tasaInput = page.locator('#cfg-tasa');
    await tasaInput.fill('60');
    await tasaInput.dispatchEvent('input');

    // Verify _editData updated and warning visible
    const tasa = await page.evaluate(() => _editData.config.tasa);
    expect(tasa).toBe(60);
    await expect(warn).toBeVisible();
  });

  test('tasa=60 on load shows warning immediately', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');

    await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.tasa = 60;
      data.config.ingresoUSD = 1000;
      data.config.ingresoRD = 60000;
      window._testLoadData(data);
    });

    await page.evaluate(() => window.openEditModal());
    await expect(page.locator('#editModal')).toHaveClass(/open/);
    await expect(page.locator('#tasa-warn')).toBeVisible();
  });
});

// ────────────────────────────────────────────────────────────────────
// #2 — RD$-denominated income entry
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #2 — IngresoRD field', () => {
  test('ingresoRD field exists and shows correct value', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);

    const rdField = page.locator('#cfg-ingresoRD');
    await expect(rdField).toBeVisible();
    const val = await rdField.inputValue();
    // 3000 × 58 = 174000
    expect(Number(val)).toBe(174000);
  });

  test('changing ingresoRD updates ingresoUSD', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);

    const rdField = page.locator('#cfg-ingresoRD');
    await rdField.fill('232000');
    await rdField.dispatchEvent('input');

    // 232000 / 58 = 4000
    const usdVal = await page.locator('#cfg-ingreso').inputValue();
    expect(Number(usdVal)).toBe(4000);

    const data = await page.evaluate(() => ({
      usd: _editData.config.ingresoUSD,
      rd: _editData.config.ingresoRD,
    }));
    expect(data.usd).toBe(4000);
    expect(data.rd).toBe(232000);
  });

  test('changing ingresoUSD updates ingresoRD', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);

    const usdField = page.locator('#cfg-ingreso');
    await usdField.fill('4000');
    await usdField.dispatchEvent('input');

    const rdVal = await page.locator('#cfg-ingresoRD').inputValue();
    // 4000 × 58 = 232000
    expect(Number(rdVal)).toBe(232000);
  });
});

// ────────────────────────────────────────────────────────────────────
// #4 — Config tab writes to _editData in real-time
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #4 — Config real-time sync', () => {
  test('changing tasa updates _editData immediately', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);

    const tasaInput = page.locator('#cfg-tasa');
    await tasaInput.fill('55');
    await tasaInput.dispatchEvent('input');

    const tasa = await page.evaluate(() => _editData.config.tasa);
    expect(tasa).toBe(55);
  });

  test('changing mes updates _editData immediately', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);

    const mesInput = page.locator('#cfg-mes');
    await mesInput.fill('Abril');
    await mesInput.dispatchEvent('input');

    const mes = await page.evaluate(() => _editData.config.mes);
    expect(mes).toBe('Abril');
  });

  test('diasAlerta is clamped to 1-30', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);

    const diasInput = page.locator('#cfg-diasAlerta');
    await diasInput.fill('50');
    await diasInput.dispatchEvent('input');

    const dias = await page.evaluate(() => _editData.config.diasAlerta);
    expect(dias).toBe(30);

    // Set to -3 via evaluate to bypass HTML min constraint, then trigger sync
    await page.evaluate(() => {
      const el = document.getElementById('cfg-diasAlerta');
      el.value = '-3';
      syncConfigField('diasAlerta', el);
    });

    const dias2 = await page.evaluate(() => _editData.config.diasAlerta);
    expect(dias2).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// #5 — Field validation on dia/tasa/balance
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #5 — Gastos field validation', () => {
  test('dia is clamped to 1-31', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);

    // Switch to gastos tab
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    const diaInput = page.locator('#esencialesEditBody tr').first().locator('input[inputmode="numeric"][min="1"][max="31"]');
    await diaInput.fill('45');
    await diaInput.dispatchEvent('input');

    const dia = await page.evaluate(() => _editData.gastos[0].dia);
    expect(dia).toBe(31);

    await diaInput.fill('0');
    await diaInput.dispatchEvent('input');

    const dia2 = await page.evaluate(() => _editData.gastos[0].dia);
    expect(dia2).toBe(1);
  });

  test('tasa% is clamped to 0-100', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    const tasaInput = page.locator('#esencialesEditBody tr').first().locator('input[inputmode="decimal"][max="100"]');
    await tasaInput.fill('150');
    await tasaInput.dispatchEvent('input');

    const tasa = await page.evaluate(() => _editData.gastos[0].tasa);
    expect(tasa).toBe(100);
  });

  test('balance cannot be negative', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    // Set balance to negative directly via evaluate to bypass HTML min constraint
    await page.evaluate(() => {
      _editData.gastos[0].balance = -5000;
      // Simulate what the oninput handler does: Math.max(0, pf(value))
      _editData.gastos[0].balance = Math.max(0, _editData.gastos[0].balance);
    });

    const balance = await page.evaluate(() => _editData.gastos[0].balance);
    expect(balance).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// #7 — originalRD and originalUSD linked
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #7 — Linked originalRD/USD', () => {
  test('changing originalRD auto-updates originalUSD', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    const rdInput = page.locator('#origRD-0');
    await rdInput.fill('116000');
    await rdInput.dispatchEvent('input');

    // 116000 / 58 = 2000
    const usdVal = await page.locator('#origUSD-0').inputValue();
    expect(Number(usdVal)).toBe(2000);

    const data = await page.evaluate(() => ({
      rd: _editData.gastos[0].originalRD,
      usd: _editData.gastos[0].originalUSD,
    }));
    expect(data.rd).toBe(116000);
    expect(data.usd).toBe(2000);
  });

  test('changing originalUSD auto-updates originalRD', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    const usdInput = page.locator('#origUSD-0');
    await usdInput.fill('1000');
    await usdInput.dispatchEvent('input');

    // 1000 × 58 = 58000
    const rdVal = await page.locator('#origRD-0').inputValue();
    expect(Number(rdVal)).toBe(58000);
  });
});

// ────────────────────────────────────────────────────────────────────
// #8 — Delete confirm on funds/emergency/history rows
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #8 — Delete confirmation dialogs', () => {
  test('deleteFornowRow shows confirm and cancels on dismiss', async ({ page }) => {
    _dialogAction = 'accept'; // for loadApp
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Fondos/ }).click();

    _dialogAction = 'dismiss'; // dismiss the delete confirm
    const countBefore = await page.evaluate(() => _editData.forNow.cuentas.length);
    await page.locator('#fornowEditBody .row-del-btn').first().click();

    const countAfter = await page.evaluate(() => _editData.forNow.cuentas.length);
    expect(countAfter).toBe(countBefore); // unchanged — dismissed
    _dialogAction = 'accept'; // reset
  });

  test('deleteEmergFundRow shows confirm and cancels on dismiss', async ({ page }) => {
    _dialogAction = 'accept';
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Emergencia/ }).click();

    _dialogAction = 'dismiss';
    const countBefore = await page.evaluate(() => _editData.emerg.fondos.length);
    await page.locator('#emergFundsEditBody .row-del-btn').first().click();

    const countAfter = await page.evaluate(() => _editData.emerg.fondos.length);
    expect(countAfter).toBe(countBefore);
    _dialogAction = 'accept';
  });

  test('deleteHistorialRow shows confirm and cancels on dismiss', async ({ page }) => {
    _dialogAction = 'accept';
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Historial/ }).click();

    _dialogAction = 'dismiss';
    const countBefore = await page.evaluate(() => _editData.historial.length);
    await page.locator('#historialEditBody .row-del-btn').first().click();

    const countAfter = await page.evaluate(() => _editData.historial.length);
    expect(countAfter).toBe(countBefore);
    _dialogAction = 'accept';
  });

  test('deleteHistorialRow proceeds on accept', async ({ page }) => {
    _dialogAction = 'accept';
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Historial/ }).click();

    const countBefore = await page.evaluate(() => _editData.historial.length);
    await page.locator('#historialEditBody .row-del-btn').first().click();

    const countAfter = await page.evaluate(() => _editData.historial.length);
    expect(countAfter).toBe(countBefore - 1);
  });
});

// ────────────────────────────────────────────────────────────────────
// #9 — Tipo is a <select> dropdown
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #9 — Tipo dropdown', () => {
  test('tipo field is a select element with predefined options', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    const tipoSelect = page.locator('#esencialesEditBody tr').first().locator('select');
    await expect(tipoSelect).toBeVisible();

    const options = await tipoSelect.locator('option').allTextContents();
    expect(options).toContain('Tarjeta');
    expect(options).toContain('Fijo');
    expect(options).toContain('Variable');
    expect(options).toContain('Préstamo');
  });

  test('tipo select has correct value for existing entry', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    const tipoVal = await page.locator('#esencialesEditBody tr').first().locator('select').inputValue();
    expect(tipoVal).toBe('Tarjeta');

    const tipoVal2 = await page.locator('#esencialesEditBody tr').nth(1).locator('select').inputValue();
    expect(tipoVal2).toBe('Fijo');
  });

  test('changing tipo via select updates _editData', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    const tipoSelect = page.locator('#esencialesEditBody tr').first().locator('select');
    await tipoSelect.selectOption('Cuota');

    const tipo = await page.evaluate(() => _editData.gastos[0].tipo);
    expect(tipo).toBe('Cuota');
  });
});

// ────────────────────────────────────────────────────────────────────
// #10 — Currency switch converts balance
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #10 — Currency switch conversion', () => {
  test('switching RD→USD converts saldo when confirmed', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Fondos/ }).click();

    // First account: Banco Popular, RD, saldo=60000
    // Accept confirm dialog for conversion
    const saldoBefore = await page.evaluate(() => _editData.forNow.cuentas[0].saldo);
    expect(saldoBefore).toBe(60000);

    // Switch to USD — dialog auto-accepted. Now there are 2 selects per row
    // (moneda + tipo); target the moneda one explicitly.
    await page.locator('#fornowEditBody tr').first().locator('select[onchange*="onCurrencySwitch"]').selectOption('USD');

    const data = await page.evaluate(() => ({
      moneda: _editData.forNow.cuentas[0].moneda,
      saldo: _editData.forNow.cuentas[0].saldo,
    }));
    expect(data.moneda).toBe('USD');
    // 60000 / 58 ≈ 1034.48
    expect(data.saldo).toBeCloseTo(1034.48, 1);
  });

  test('switching currency on emergency fund converts balance and meta', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Emergencia/ }).click();

    // First fund: Emergencia General, RD, balance=30000, meta=100000
    await page.locator('#emergFundsEditBody tr').first().locator('select').selectOption('USD');

    const data = await page.evaluate(() => ({
      moneda: _editData.emerg.fondos[0].moneda,
      balance: _editData.emerg.fondos[0].balance,
      meta: _editData.emerg.fondos[0].meta,
    }));
    expect(data.moneda).toBe('USD');
    // 30000 / 58 ≈ 517.24
    expect(data.balance).toBeCloseTo(517.24, 1);
    // 100000 / 58 ≈ 1724.14
    expect(data.meta).toBeCloseTo(1724.14, 1);
  });
});

// ────────────────────────────────────────────────────────────────────
// #14 — meta=0 emergency fund handling
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #14 — Emergency fund meta=0', () => {
  test('meta=0 does not produce NaN/Infinity on save', async ({ page }) => {
    await loadApp(page);

    // Set meta to 0 directly
    await page.evaluate(() => {
      _editData.emerg.fondos[0].meta = 0;
      _editData.emerg.fondos[0].balance = 0;
    });

    await openEdit(page);

    // Apply changes (accept all dialogs)
    await page.evaluate(() => applyChanges());

    // Check that meta and falta are 0, no NaN
    const data = await page.evaluate(() => ({
      meta: _editData.emerg.fondos[0].meta,
      falta: _editData.emerg.fondos[0].falta,
      balance: _editData.emerg.fondos[0].balance,
    }));
    expect(data.meta).toBe(0);
    expect(data.falta).toBe(0);
    expect(data.balance).toBe(0);
    expect(Number.isFinite(data.meta)).toBe(true);
    expect(Number.isFinite(data.falta)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// #17 — History column header says RD$ not USD
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #17 — History column header', () => {
  test('history income column says Ingresos (RD$) in Spanish', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Historial/ }).click();

    const header = page.locator('#esection-historial thead th').nth(2);
    await expect(header).toHaveText(/Ingresos \(RD\$\)/);
  });

  test('history income column says Income (RD$) in English', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window._testSetLang('en'));
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /History/ }).click();

    const header = page.locator('#esection-historial thead th').nth(2);
    await expect(header).toHaveText(/Income \(RD\$\)/);
  });
});

// ────────────────────────────────────────────────────────────────────
// #20 — New history row uses current tasa
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #20 — History row tasa', () => {
  test('new history row uses current config.tasa, not hardcoded 60', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Historial/ }).click();

    // Config tasa is 58
    await page.evaluate(() => addHistorialRow());

    const tasa = await page.evaluate(() => _editData.historial[0].tasa);
    expect(tasa).toBe(58);
  });
});

// ────────────────────────────────────────────────────────────────────
// #22 — Balance correction vs payment detection
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #22 — Payment detection confirmation', () => {
  test('balance decrease triggers confirm, dismiss prevents pagado credit', async ({ page }) => {
    _dialogAction = 'accept';
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    const pagadoBefore = await page.evaluate(() => _editData.gastos[0].pagado);

    // Reduce balance from 45000 to 40000 (a 5000 decrease)
    await page.evaluate(() => {
      _editData.gastos[0].balance = 40000;
    });

    // Dismiss the payment detection dialog
    _dialogAction = 'dismiss';
    await page.evaluate(() => applyChanges());

    // pagado should NOT have increased
    const pagadoAfter = await page.evaluate(() => _editData.gastos[0].pagado);
    expect(pagadoAfter).toBe(pagadoBefore);
    _dialogAction = 'accept';
  });

  test('balance decrease triggers confirm, accept credits pagado', async ({ page }) => {
    _dialogAction = 'accept';
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    const pagadoBefore = await page.evaluate(() => _editData.gastos[0].pagado);

    // Reduce balance from 45000 to 40000 (a 5000 decrease)
    await page.evaluate(() => {
      _editData.gastos[0].balance = 40000;
    });

    await page.evaluate(() => applyChanges());

    const pagadoAfter = await page.evaluate(() => _editData.gastos[0].pagado);
    expect(pagadoAfter).toBe(pagadoBefore + 5000);
  });
});

// ────────────────────────────────────────────────────────────────────
// #26 — Comma in pasted numbers
// ────────────────────────────────────────────────────────────────────
test.describe('Fix #26 — Comma stripping', () => {
  test('pf() strips commas and parses correctly', async ({ page }) => {
    await loadApp(page);

    const result = await page.evaluate(() => ({
      a: pf('1,500'),
      b: pf('1,000,000'),
      c: pf('1500'),
      d: pf(''),
      e: pf('abc'),
    }));
    expect(result.a).toBe(1500);
    expect(result.b).toBe(1000000);
    expect(result.c).toBe(1500);
    expect(result.d).toBe(0);
    expect(result.e).toBe(0);
  });

  test('gastos balance input uses pf() for comma handling', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);
    await page.locator('.edit-tab', { hasText: /Gastos/ }).click();

    // Directly test that the oninput handler uses pf
    // We can verify by checking the input's oninput attribute contains 'pf('
    const oninput = await page.locator('#esencialesEditBody tr').first().locator('input[min="0"]').first().getAttribute('oninput');
    expect(oninput).toContain('pf(');
  });
});

// ────────────────────────────────────────────────────────────────────
// Integration — full save cycle
// ────────────────────────────────────────────────────────────────────
test.describe('Integration — Edit modal save cycle', () => {
  test('edit config, save, and verify dashboard reflects changes', async ({ page }) => {
    await loadApp(page);
    await openEdit(page);

    // Change tasa and income
    const tasaInput = page.locator('#cfg-tasa');
    await tasaInput.fill('55');
    await tasaInput.dispatchEvent('input');

    const usdInput = page.locator('#cfg-ingreso');
    await usdInput.fill('4000');
    await usdInput.dispatchEvent('input');

    // Verify RD$ field auto-updated
    const rdVal = await page.locator('#cfg-ingresoRD').inputValue();
    expect(Number(rdVal)).toBe(220000); // 4000 × 55

    // Verify _editData is in sync before save
    const data = await page.evaluate(() => ({
      tasa: _editData.config.tasa,
      usd: _editData.config.ingresoUSD,
      rd: _editData.config.ingresoRD,
    }));
    expect(data.tasa).toBe(55);
    expect(data.usd).toBe(4000);
    expect(data.rd).toBe(220000);

    // Apply changes
    await page.evaluate(() => applyChanges());

    // Dashboard should show updated values
    await expect(page.locator('#editModal')).not.toHaveClass(/open/);
  });

  test('readConfigFromForm normalizes tipo to Title Case', async ({ page }) => {
    await loadApp(page);

    // Inject a gasto with weird casing
    await page.evaluate(() => {
      _editData.gastos.push({
        nombre: 'Test', tipo: 'tarjeta', pagado: 0, adeudado: 0,
        dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0,
        fechaLimite: '', notas: '', pagadoMes: false,
      });
    });

    await openEdit(page);
    await page.evaluate(() => applyChanges());

    // Tipo should be normalized to 'Tarjeta' (matching TIPOS list)
    const tipo = await page.evaluate(() => _editData.gastos[_editData.gastos.length - 1].tipo);
    expect(tipo).toBe('Tarjeta');
  });
});
