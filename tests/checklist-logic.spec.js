// @ts-check
const { test, expect } = require('@playwright/test');

const APP = 'http://localhost:8080/cnt.html';

function mkGasto(overrides = {}) {
  return { nombre: 'Test', tipo: 'Fijo', pagado: 0, adeudado: 10000, dia: 15, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, tasaCreacion: 60, fechaLimite: '', notas: '', pagadoMes: false, ...overrides };
}

async function loadWithGastos(page, gastos) {
  await page.goto(APP);
  await page.waitForSelector('#loaderScreen', { state: 'visible' });
  const data = {
    config: { tasa: 60, mes: 'Mayo', anio: 2026, ingresoUSD: 3000, diasAlerta: 5, ingresoRD: 180000 },
    gastos,
    forNow: { cuentas: [], fecha: null, total: 0, comprometido: 0, disponible: 0 },
    emerg: { fondos: [], cashflow: { ingreso: 180000, gasto: gastos.reduce((a, g) => a + g.adeudado, 0), tasa: 60 } },
    historial: [],
    metas: [],
    transacciones: [],
    presupuesto: [],
    recurrentes: [],
    filename: 'test.json',
  };
  await page.evaluate((d) => {
    _editData = d;
    _editData.emerg.cashflow.ingreso = d.config.ingresoUSD * d.config.tasa;
    buildDashboard(d);
    document.getElementById('loaderScreen').style.display = 'none';
    document.getElementById('dashApp').style.display = 'block';
  }, data);
}

async function goToChecklist(page) {
  await page.evaluate(() => showTab('checklist', document.querySelector(".tab-btn[onclick*=\"'checklist'\"]")));
}

// ══════════════════════════════════
// toggleCheck() — mark/unmark payments
// ══════════════════════════════════

test.describe('toggleCheck — mark payment', () => {
  test('marking sets pagadoMes=true and pagado=adeudado', async ({ page }) => {
    await loadWithGastos(page, [mkGasto({ nombre: 'Renta', adeudado: 25000 })]);
    const result = await page.evaluate(() => {
      toggleCheck(0);
      return { pagadoMes: _editData.gastos[0].pagadoMes, pagado: _editData.gastos[0].pagado };
    });
    expect(result.pagadoMes).toBe(true);
    expect(result.pagado).toBe(25000);
  });

  test('unmarking sets pagadoMes=false and pagado=0', async ({ page }) => {
    await loadWithGastos(page, [mkGasto({ nombre: 'Renta', adeudado: 25000, pagado: 25000, pagadoMes: true })]);
    const result = await page.evaluate(() => {
      toggleCheck(0);
      return { pagadoMes: _editData.gastos[0].pagadoMes, pagado: _editData.gastos[0].pagado };
    });
    expect(result.pagadoMes).toBe(false);
    expect(result.pagado).toBe(0);
  });

  test('unmarking preserves pagado if manually different from adeudado', async ({ page }) => {
    // User manually set pagado=15000 (partial) then marked as pagadoMes, pagado stayed 15000
    await loadWithGastos(page, [mkGasto({ nombre: 'Visa', adeudado: 25000, pagado: 15000, pagadoMes: true })]);
    const result = await page.evaluate(() => {
      toggleCheck(0);
      return { pagadoMes: _editData.gastos[0].pagadoMes, pagado: _editData.gastos[0].pagado };
    });
    expect(result.pagadoMes).toBe(false);
    // pagado !== adeudado, so it should NOT be cleared to 0
    expect(result.pagado).toBe(15000);
  });

  test('toggleCheck with invalid index does nothing', async ({ page }) => {
    await loadWithGastos(page, [mkGasto({ nombre: 'Renta', adeudado: 25000 })]);
    const result = await page.evaluate(() => {
      toggleCheck(-1);
      toggleCheck(99);
      return { pagadoMes: _editData.gastos[0].pagadoMes, pagado: _editData.gastos[0].pagado };
    });
    expect(result.pagadoMes).toBe(false);
    expect(result.pagado).toBe(0);
  });

  test('toggleCheck on zero-adeudado item still toggles pagadoMes', async ({ page }) => {
    await loadWithGastos(page, [mkGasto({ nombre: 'Free', adeudado: 0 })]);
    const result = await page.evaluate(() => {
      toggleCheck(0);
      return { pagadoMes: _editData.gastos[0].pagadoMes, pagado: _editData.gastos[0].pagado };
    });
    expect(result.pagadoMes).toBe(true);
    expect(result.pagado).toBe(0); // adeudado is 0, so pagado stays 0
  });
});

// ══════════════════════════════════
// resetChecklist()
// ══════════════════════════════════

test.describe('resetChecklist', () => {
  test('resets all pagadoMes to false and pagado to 0', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 25000, pagado: 25000, pagadoMes: true }),
      mkGasto({ nombre: 'Luz', adeudado: 5000, pagado: 5000, pagadoMes: true }),
      mkGasto({ nombre: 'Internet', adeudado: 3000, pagado: 0, pagadoMes: false }),
    ]);
    const result = await page.evaluate(() => {
      resetChecklist();
      return _editData.gastos.map(g => ({ pagadoMes: g.pagadoMes, pagado: g.pagado }));
    });
    expect(result[0]).toEqual({ pagadoMes: false, pagado: 0 });
    expect(result[1]).toEqual({ pagadoMes: false, pagado: 0 });
    expect(result[2]).toEqual({ pagadoMes: false, pagado: 0 });
  });

  test('does not reset items with adeudado=0', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 25000, pagado: 25000, pagadoMes: true }),
      mkGasto({ nombre: 'Info', adeudado: 0, pagado: 0, pagadoMes: false }),
    ]);
    const result = await page.evaluate(() => {
      resetChecklist();
      return _editData.gastos.map(g => ({ pagadoMes: g.pagadoMes, pagado: g.pagado }));
    });
    expect(result[0]).toEqual({ pagadoMes: false, pagado: 0 });
    expect(result[1]).toEqual({ pagadoMes: false, pagado: 0 }); // unchanged
  });

  test('preserves pagado if manually set differently than adeudado', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Visa', adeudado: 25000, pagado: 10000, pagadoMes: true }),
    ]);
    const result = await page.evaluate(() => {
      resetChecklist();
      return { pagadoMes: _editData.gastos[0].pagadoMes, pagado: _editData.gastos[0].pagado };
    });
    expect(result.pagadoMes).toBe(false);
    // pagado (10000) !== adeudado (25000), so pagado is preserved
    expect(result.pagado).toBe(10000);
  });
});

// ══════════════════════════════════
// markAllChecklist()
// ══════════════════════════════════

test.describe('markAllChecklist', () => {
  test('marks all unpaid items as paid', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 25000 }),
      mkGasto({ nombre: 'Luz', adeudado: 5000 }),
      mkGasto({ nombre: 'Internet', adeudado: 3000 }),
    ]);
    const result = await page.evaluate(() => {
      markAllChecklist();
      return _editData.gastos.map(g => ({ pagadoMes: g.pagadoMes, pagado: g.pagado }));
    });
    expect(result[0]).toEqual({ pagadoMes: true, pagado: 25000 });
    expect(result[1]).toEqual({ pagadoMes: true, pagado: 5000 });
    expect(result[2]).toEqual({ pagadoMes: true, pagado: 3000 });
  });

  test('does not double-mark already paid items', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 25000, pagado: 25000, pagadoMes: true }),
      mkGasto({ nombre: 'Luz', adeudado: 5000 }),
    ]);
    const result = await page.evaluate(() => {
      markAllChecklist();
      return _editData.gastos.map(g => ({ pagadoMes: g.pagadoMes, pagado: g.pagado }));
    });
    expect(result[0]).toEqual({ pagadoMes: true, pagado: 25000 });
    expect(result[1]).toEqual({ pagadoMes: true, pagado: 5000 });
  });

  test('skips items with adeudado=0', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 25000 }),
      mkGasto({ nombre: 'Info', adeudado: 0 }),
    ]);
    const result = await page.evaluate(() => {
      markAllChecklist();
      return _editData.gastos.map(g => ({ pagadoMes: g.pagadoMes, pagado: g.pagado }));
    });
    expect(result[0]).toEqual({ pagadoMes: true, pagado: 25000 });
    expect(result[1]).toEqual({ pagadoMes: false, pagado: 0 }); // unchanged
  });

  test('preserves existing pagado if already partial', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Visa', adeudado: 25000, pagado: 10000 }),
    ]);
    const result = await page.evaluate(() => {
      markAllChecklist();
      return { pagadoMes: _editData.gastos[0].pagadoMes, pagado: _editData.gastos[0].pagado };
    });
    expect(result.pagadoMes).toBe(true);
    // pagado was already 10000 (not 0), so markAll does NOT overwrite it
    expect(result.pagado).toBe(10000);
  });
});

// ══════════════════════════════════
// isPaid status logic in buildChecklist
// ══════════════════════════════════

test.describe('Checklist status display', () => {
  test('paid item shows in Pagados section', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 25000, pagado: 25000, pagadoMes: true }),
    ]);
    await goToChecklist(page);
    await expect(page.locator('#checklistDone')).toContainText('Renta');
  });

  test('unpaid item shows in Pendientes section', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Internet', adeudado: 3000 }),
    ]);
    await goToChecklist(page);
    await expect(page.locator('#checklistPending')).toContainText('Internet');
  });

  test('item with pagado >= adeudado (no pagadoMes flag) counts as paid', async ({ page }) => {
    // Edge case: pagadoMes is false but pagado >= adeudado
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Manual', adeudado: 5000, pagado: 5000, pagadoMes: false }),
    ]);
    await goToChecklist(page);
    await expect(page.locator('#checklistDone')).toContainText('Manual');
  });

  test('progress shows correct percentage and amounts', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 20000, pagado: 20000, pagadoMes: true }),
      mkGasto({ nombre: 'Luz', adeudado: 5000, pagado: 5000, pagadoMes: true }),
      mkGasto({ nombre: 'Internet', adeudado: 5000 }),
    ]);
    await goToChecklist(page);
    const progress = page.locator('#checklistProgress');
    // 25000 paid of 30000 total = 83%
    await expect(progress).toContainText('83%');
    await expect(progress).toContainText('25,000');
    await expect(progress).toContainText('30,000');
  });

  test('100% progress when all paid', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 20000, pagado: 20000, pagadoMes: true }),
      mkGasto({ nombre: 'Luz', adeudado: 5000, pagado: 5000, pagadoMes: true }),
    ]);
    await goToChecklist(page);
    await expect(page.locator('#checklistProgress')).toContainText('100%');
  });

  test('0% progress when none paid', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 20000 }),
      mkGasto({ nombre: 'Luz', adeudado: 5000 }),
    ]);
    await goToChecklist(page);
    await expect(page.locator('#checklistProgress')).toContainText('0%');
  });
});

// ══════════════════════════════════
// Full cycle: mark → verify → reset → verify
// ══════════════════════════════════

test.describe('Checklist full cycle', () => {
  test('mark all → 100% → reset → 0%', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 20000 }),
      mkGasto({ nombre: 'Luz', adeudado: 5000 }),
    ]);
    await goToChecklist(page);

    // Initially 0%
    await expect(page.locator('#checklistProgress')).toContainText('0%');

    // Mark all
    await page.evaluate(() => markAllChecklist());
    await expect(page.locator('#checklistProgress')).toContainText('100%');

    // Verify data
    const afterMark = await page.evaluate(() =>
      _editData.gastos.every(g => g.pagadoMes && g.pagado === g.adeudado)
    );
    expect(afterMark).toBe(true);

    // Reset
    await page.evaluate(() => resetChecklist());
    await expect(page.locator('#checklistProgress')).toContainText('0%');

    // Verify data
    const afterReset = await page.evaluate(() =>
      _editData.gastos.every(g => !g.pagadoMes && g.pagado === 0)
    );
    expect(afterReset).toBe(true);
  });

  test('toggle individual → verify counts update', async ({ page }) => {
    await loadWithGastos(page, [
      mkGasto({ nombre: 'Renta', adeudado: 15000 }),
      mkGasto({ nombre: 'Luz', adeudado: 5000 }),
    ]);
    await goToChecklist(page);

    // Mark first item (15000 of 20000 = 75%)
    await page.evaluate(() => toggleCheck(0));
    await expect(page.locator('#checklistProgress')).toContainText('75%');

    // Mark second item (20000 of 20000 = 100%)
    await page.evaluate(() => toggleCheck(1));
    await expect(page.locator('#checklistProgress')).toContainText('100%');

    // Unmark first item (5000 of 20000 = 25%)
    await page.evaluate(() => toggleCheck(0));
    await expect(page.locator('#checklistProgress')).toContainText('25%');
  });
});
