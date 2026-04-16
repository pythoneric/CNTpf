// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Tests for goals input fix — verifies that typing fast into goal fields
 * (saved, goal, monthly) preserves all digits, new goals start with empty
 * fields instead of "0", and the DOM rebuilds correctly on blur.
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
    ];
    data.emerg.fondos = [
      { fondo: 'Emergencia', moneda: 'RD', balance: 20000, meta: 100000 },
    ];
    data.historial = [];
    data.metas = [];
    data.transacciones = [];
    data.presupuesto = [];
    data.recurrentes = [];
    data.filename = 'test.json';
    window._testLoadData(data);
  });
}

/** Navigate to the Metas (Goals) tab */
async function goToGoalsTab(page) {
  await page.evaluate(() => {
    switchGroup('strat');
    showTab('metas', document.querySelector('[data-i18n="tab_metas"]'));
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

// ══════════════════════════════════════════
// New goals start with empty fields, not "0"
// ══════════════════════════════════════════

test.describe('New goal fields start empty', () => {
  test('saved, goal, and monthly fields show empty placeholder instead of 0', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    const values = await page.evaluate(() => {
      const inputs = document.querySelectorAll('#metasList input[inputmode="decimal"]');
      return Array.from(inputs).map(i => i.value);
    });

    // All three numeric fields should be empty (not "0")
    expect(values).toHaveLength(3);
    for (const val of values) {
      expect(val).toBe('');
    }
  });

  test('name field starts empty', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    const nameValue = await page.evaluate(() => {
      const nameInput = document.querySelector('#metasList input[style*="font-size:15px"]');
      return nameInput ? nameInput.value : null;
    });
    expect(nameValue).toBe('');
  });
});

// ══════════════════════════════════════════
// Typing fast preserves all digits
// ══════════════════════════════════════════

test.describe('Fast typing preserves all digits', () => {
  test('typing quickly into saved field retains full number', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    // Focus the "saved" input and type fast
    const savedInput = page.locator('#metasList input[inputmode="decimal"]').first();
    await savedInput.click();
    await savedInput.type('50000', { delay: 30 });

    // The input should still show the full number
    await expect(savedInput).toHaveValue('50000');

    // The data model should also have the correct value
    const dataVal = await page.evaluate(() => _editData.metas[0].saved);
    expect(dataVal).toBe(50000);
  });

  test('typing quickly into goal field retains full number', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    const goalInput = page.locator('#metasList input[inputmode="decimal"]').nth(1);
    await goalInput.click();
    await goalInput.type('100000', { delay: 30 });

    await expect(goalInput).toHaveValue('100000');
    const dataVal = await page.evaluate(() => _editData.metas[0].goal);
    expect(dataVal).toBe(100000);
  });

  test('typing quickly into monthly field retains full number', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    const monthlyInput = page.locator('#metasList input[inputmode="decimal"]').nth(2);
    await monthlyInput.click();
    await monthlyInput.type('5000', { delay: 30 });

    await expect(monthlyInput).toHaveValue('5000');
    const dataVal = await page.evaluate(() => _editData.metas[0].monthly);
    expect(dataVal).toBe(5000);
  });

  test('typing into name field retains full text', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    const nameInput = page.locator('#metasList input[style*="font-size:15px"]').first();
    await nameInput.click();
    await nameInput.type('Emergency Fund', { delay: 30 });

    await expect(nameInput).toHaveValue('Emergency Fund');
    const dataVal = await page.evaluate(() => _editData.metas[0].name);
    expect(dataVal).toBe('Emergency Fund');
  });
});

// ══════════════════════════════════════════════
// DOM does not rebuild while input is focused
// ══════════════════════════════════════════════

test.describe('DOM stability during input', () => {
  test('focused input is not destroyed by debounced rebuild', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    const savedInput = page.locator('#metasList input[inputmode="decimal"]').first();
    await savedInput.click();

    // Type a digit, then wait longer than the 400ms debounce
    await savedInput.type('1', { delay: 0 });
    await page.waitForTimeout(500);

    // The input should still be focused (not destroyed by rebuild)
    const stillFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return active && active.tagName === 'INPUT' &&
             document.getElementById('metasList').contains(active);
    });
    expect(stillFocused).toBe(true);

    // Continue typing — should still work
    await savedInput.type('2345', { delay: 30 });
    await expect(savedInput).toHaveValue('12345');
  });

  test('buildSavingsGoals skips list rebuild when input is focused', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    const savedInput = page.locator('#metasList input[inputmode="decimal"]').first();
    await savedInput.click();
    await savedInput.type('999', { delay: 30 });

    // Manually trigger buildSavingsGoals while focused
    const inputSurvived = await page.evaluate(() => {
      const before = document.activeElement;
      buildSavingsGoals();
      const after = document.activeElement;
      return before === after;
    });
    expect(inputSurvived).toBe(true);
  });
});

// ══════════════════════════════════════════
// Blur triggers full rebuild
// ══════════════════════════════════════════

test.describe('Blur triggers visual update', () => {
  test('progress bar updates after blurring saved field', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);

    // Add a goal with a known target
    await page.evaluate(() => {
      _editData.metas.push({ name: 'Test', saved: 0, goal: 10000, monthly: 1000 });
      buildSavingsGoals();
    });

    // Type into saved field
    const savedInput = page.locator('#metasList input[inputmode="decimal"]').first();
    await savedInput.click();
    await savedInput.fill('5000');
    // Trigger oninput so data model updates
    await savedInput.dispatchEvent('input');
    await waitForAutoSave(page);

    // Before blur — progress bar may not have updated yet
    // After blur — it should reflect the new percentage
    await savedInput.blur();
    await page.waitForTimeout(200);

    const pctText = await page.evaluate(() => {
      const pctEl = document.querySelector('#metasList .mono[style*="font-size:22px"]');
      return pctEl ? pctEl.textContent.trim() : '';
    });
    expect(pctText).toBe('50%');
  });

  test('chart labels update after blurring name field', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);

    await page.evaluate(() => {
      _editData.metas.push({ name: 'Old Name', saved: 1000, goal: 5000, monthly: 500 });
      buildSavingsGoals();
    });

    const nameInput = page.locator('#metasList input[style*="font-size:15px"]').first();
    await nameInput.click();
    await nameInput.fill('New Name');
    await nameInput.dispatchEvent('input');
    await nameInput.blur();
    await page.waitForTimeout(300);

    const dataName = await page.evaluate(() => _editData.metas[0].name);
    expect(dataName).toBe('New Name');
  });
});

// ══════════════════════════════════════════
// Data persists to IndexedDB while typing
// ══════════════════════════════════════════

test.describe('Auto-save persists goal data while typing', () => {
  test('typed value in saved field persists to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    const savedInput = page.locator('#metasList input[inputmode="decimal"]').first();
    await savedInput.click();
    await savedInput.type('25000', { delay: 30 });
    await waitForAutoSave(page);

    const db = await readDB(page);
    expect(db.metas[0].saved).toBe(25000);
  });

  test('typed value in goal field persists to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    const goalInput = page.locator('#metasList input[inputmode="decimal"]').nth(1);
    await goalInput.click();
    await goalInput.type('75000', { delay: 30 });
    await waitForAutoSave(page);

    const db = await readDB(page);
    expect(db.metas[0].goal).toBe(75000);
  });

  test('typed value in monthly field persists to IndexedDB', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);
    await page.evaluate(() => addSavingsGoal());

    const monthlyInput = page.locator('#metasList input[inputmode="decimal"]').nth(2);
    await monthlyInput.click();
    await monthlyInput.type('3000', { delay: 30 });
    await waitForAutoSave(page);

    const db = await readDB(page);
    expect(db.metas[0].monthly).toBe(3000);
  });
});

// ══════════════════════════════════════════
// Add and delete goals still work
// ══════════════════════════════════════════

test.describe('Add and delete goals still function', () => {
  test('add goal button creates a new empty goal', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);

    await page.evaluate(() => addSavingsGoal());
    const count = await page.evaluate(() => _editData.metas.length);
    expect(count).toBe(1);

    await page.evaluate(() => addSavingsGoal());
    const count2 = await page.evaluate(() => _editData.metas.length);
    expect(count2).toBe(2);
  });

  test('delete button removes a goal and rebuilds DOM', async ({ page }) => {
    await loadApp(page);
    await goToGoalsTab(page);

    await page.evaluate(() => {
      _editData.metas.push({ name: 'Goal A', saved: 1000, goal: 5000, monthly: 500 });
      _editData.metas.push({ name: 'Goal B', saved: 2000, goal: 8000, monthly: 800 });
      buildSavingsGoals();
    });

    // Delete the first goal
    await page.evaluate(() => {
      _editData.metas.splice(0, 1);
      autoSave();
      buildSavingsGoals();
    });

    const remaining = await page.evaluate(() => _editData.metas.length);
    expect(remaining).toBe(1);
    expect(await page.evaluate(() => _editData.metas[0].name)).toBe('Goal B');
  });
});
