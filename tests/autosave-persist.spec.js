// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Tests for auto-save persistence — verifies that changes made in the edit modal,
 * config fields, checklist, and other interactions are saved to IndexedDB so
 * "Continue where I left off" restores them correctly.
 */

const DB_NAME = 'cnt_core_db';
const STORE = 'dashboard_data';

async function loadApp(page) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(() => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.ingresoRD = 180000;
    data.config.mes = 'Abril';
    data.config.anio = 2026;
    data.config.diasAlerta = 5;
    data.emerg.cashflow.ingreso = 180000;
    data.emerg.cashflow.gasto = 30000;
    data.emerg.cashflow.tasa = 60;
    data.forNow.cuentas = [
      { nombre: 'Banco Popular', moneda: 'RD', saldo: 50000, comp: 0, disp: 50000 },
    ];
    data.forNow.total = 50000;
    data.gastos = [
      { nombre: 'Alquiler', tipo: 'Fijo', pagado: 0, adeudado: 25000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, tasaCreacion: 60, fechaLimite: '', notas: '', pagadoMes: false },
      { nombre: 'Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 5000, dia: 15, tasa: 3.5, balance: 40000, originalRD: 50000, originalUSD: 0, tasaCreacion: 60, fechaLimite: '2027-06-15', notas: '', pagadoMes: false },
    ];
    data.emerg.fondos = [
      { fondo: 'Emergencia', moneda: 'RD', balance: 20000, meta: 100000 },
    ];
    data.historial = [];
    data.metas = [{ name: 'Laptop', saved: 5000, goal: 50000, monthly: 3000 }];
    data.transacciones = [];
    data.presupuesto = [];
    data.recurrentes = [];
    data.filename = 'test.json';
    window._testLoadData(data);
  });
}

/** Read editData from IndexedDB directly */
async function readDB(page) {
  return page.evaluate(({ db, store }) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(db, 1);
      req.onsuccess = () => {
        const tx = req.result.transaction(store, 'readonly');
        const get = tx.objectStore(store).get('editData');
        get.onsuccess = () => resolve(get.result);
        get.onerror = e => reject(e);
      };
      req.onerror = e => reject(e);
    });
  }, { db: DB_NAME, store: STORE });
}

/** Wait for the debounced autoSave (500ms) to flush */
async function waitForAutoSave(page) {
  await page.waitForTimeout(700);
}

// ══════════════════════════════════
// Edit modal fields trigger autoSave
// ══════════════════════════════════

test.describe('Edit modal fields auto-save to IndexedDB', () => {
  test('editing gasto nombre persists to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    // Change gasto name via the inline oninput handler
    await page.evaluate(() => {
      const input = document.querySelector('#editModal .tbl-input');
      input.value = 'Renta Nueva';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.gastos[0].nombre).toBe('Renta Nueva');
  });

  test('editing gasto adeudado persists to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    // The adeudado input is the 3rd tbl-input per row (nombre, pagado, adeudado)
    await page.evaluate(() => {
      _editData.gastos[0].adeudado = 30000;
      markChanged(document.body);
    });
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.gastos[0].adeudado).toBe(30000);
  });

  test('editing cuenta saldo persists to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    await page.evaluate(() => {
      _editData.forNow.cuentas[0].saldo = 75000;
      markChanged(document.body);
    });
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.forNow.cuentas[0].saldo).toBe(75000);
  });

  test('editing emergency fund balance persists to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    await page.evaluate(() => {
      _editData.emerg.fondos[0].balance = 35000;
      markChanged(document.body);
    });
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.emerg.fondos[0].balance).toBe(35000);
  });
});

// ══════════════════════════════════
// syncConfigField triggers autoSave
// ══════════════════════════════════

test.describe('Config field changes auto-save', () => {
  test('changing tasa via syncConfigField persists', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    await page.evaluate(() => {
      const el = document.getElementById('cfg-tasa');
      if (el) { el.value = '65'; syncConfigField('tasa', el); }
    });
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.config.tasa).toBe(65);
  });

  test('changing mes via syncConfigField persists', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    await page.evaluate(() => {
      const el = document.getElementById('cfg-mes');
      if (el) { el.value = 'Mayo'; syncConfigField('mes', el); }
    });
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.config.mes).toBe('Mayo');
  });

  test('changing ingresoUSD via syncConfigField persists', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    await page.evaluate(() => {
      const el = document.getElementById('cfg-ingreso');
      if (el) { el.value = '4000'; syncConfigField('ingresoUSD', el); }
    });
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.config.ingresoUSD).toBe(4000);
  });
});

// ══════════════════════════════════
// Checklist actions auto-save
// ══════════════════════════════════

test.describe('Checklist actions auto-save', () => {
  test('toggleCheck persists pagadoMes to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window._testToggleWithMethod(0, 'transferencia'));
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.gastos[0].pagadoMes).toBe(true);
    expect(saved.gastos[0].pagado).toBe(25000);
  });

  test('markAllChecklist persists to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => markAllChecklist());
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.gastos.every(g => g.pagadoMes)).toBe(true);
  });

  test('resetChecklist persists to IndexedDB', async ({ page }) => {
    await loadApp(page);
    // First mark all, wait, then reset
    await page.evaluate(() => markAllChecklist());
    await waitForAutoSave(page);
    await page.evaluate(() => resetChecklist());
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.gastos.every(g => !g.pagadoMes)).toBe(true);
  });
});

// ══════════════════════════════════
// Metas (savings goals) auto-save
// ══════════════════════════════════

test.describe('Metas auto-save', () => {
  test('editing meta name persists to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.metas[0].name = 'MacBook Pro';
      autoSave();
    });
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.metas[0].name).toBe('MacBook Pro');
  });

  test('editing meta saved amount persists', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.metas[0].saved = 15000;
      autoSave();
    });
    await waitForAutoSave(page);
    const saved = await readDB(page);
    expect(saved.metas[0].saved).toBe(15000);
  });
});

// ══════════════════════════════════
// "Continue where I left off" end-to-end
// ══════════════════════════════════

test.describe('Continue where I left off — full round-trip', () => {
  test('edit modal changes survive page reload via loadFromDB', async ({ page }) => {
    await loadApp(page);

    // Make changes in the edit modal
    await page.evaluate(() => {
      _editData.gastos[0].nombre = 'Alquiler Modificado';
      _editData.gastos[0].adeudado = 28000;
      _editData.gastos[1].balance = 35000;
      _editData.forNow.cuentas[0].saldo = 80000;
      _editData.config.diasAlerta = 7;
      markChanged(document.body);
    });
    await waitForAutoSave(page);

    // Verify data is in IndexedDB
    const saved = await readDB(page);
    expect(saved.gastos[0].nombre).toBe('Alquiler Modificado');
    expect(saved.gastos[0].adeudado).toBe(28000);

    // Reload page and use "Continue where I left off"
    await page.goto('/cnt.html');
    await page.waitForSelector('#savedDataBanner', { state: 'visible', timeout: 5000 });

    // Click the continue button
    await page.evaluate(() => loadFromDB());
    await page.waitForSelector('#dashApp', { state: 'visible' });

    // Verify the loaded data matches what we saved
    const loaded = await page.evaluate(() => ({
      nombre: _editData.gastos[0].nombre,
      adeudado: _editData.gastos[0].adeudado,
      balance: _editData.gastos[1].balance,
      saldo: _editData.forNow.cuentas[0].saldo,
      diasAlerta: _editData.config.diasAlerta,
    }));
    expect(loaded.nombre).toBe('Alquiler Modificado');
    expect(loaded.adeudado).toBe(28000);
    expect(loaded.balance).toBe(35000);
    expect(loaded.saldo).toBe(80000);
    expect(loaded.diasAlerta).toBe(7);
  });

  test('checklist toggles survive reload via loadFromDB', async ({ page }) => {
    await loadApp(page);

    // Toggle first payment as paid
    await page.evaluate(() => window._testToggleWithMethod(0, 'transferencia'));
    await waitForAutoSave(page);

    // Reload and continue
    await page.goto('/cnt.html');
    await page.waitForSelector('#savedDataBanner', { state: 'visible', timeout: 5000 });
    await page.evaluate(() => loadFromDB());
    await page.waitForSelector('#dashApp', { state: 'visible' });

    const loaded = await page.evaluate(() => ({
      pagadoMes: _editData.gastos[0].pagadoMes,
      pagado: _editData.gastos[0].pagado,
    }));
    expect(loaded.pagadoMes).toBe(true);
    expect(loaded.pagado).toBe(25000);
  });

  test('config changes via syncConfigField survive reload', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openEditModal());
    await page.evaluate(() => {
      const el = document.getElementById('cfg-tasa');
      if (el) { el.value = '62'; syncConfigField('tasa', el); }
    });
    await waitForAutoSave(page);

    // Reload and continue
    await page.goto('/cnt.html');
    await page.waitForSelector('#savedDataBanner', { state: 'visible', timeout: 5000 });
    await page.evaluate(() => loadFromDB());
    await page.waitForSelector('#dashApp', { state: 'visible' });

    const tasa = await page.evaluate(() => _editData.config.tasa);
    expect(tasa).toBe(62);
  });
});

// ══════════════════════════════════
// visibilitychange flushes pending save
// ══════════════════════════════════

test.describe('Page visibility change flushes save', () => {
  test('visibilitychange triggers immediate save of pending changes', async ({ page }) => {
    await loadApp(page);

    // Make a change and immediately fire visibilitychange (before 500ms debounce)
    await page.evaluate(() => {
      _editData.gastos[0].notas = 'urgent-note';
      _pendingSave = true;
      // Simulate tab being hidden
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    });

    // Give IndexedDB a moment to write
    await page.waitForTimeout(300);

    const saved = await readDB(page);
    expect(saved.gastos[0].notas).toBe('urgent-note');
  });
});
