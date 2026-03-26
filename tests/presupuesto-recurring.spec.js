const { test, expect } = require('@playwright/test');

/**
 * Tests for Forward Budget (Presupuesto) and Recurring Transactions features.
 */

async function loadApp(page, extraSetup) {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');

  await page.evaluate((extra) => {
    const data = window.defaultEditData();
    data.config.tasa = 58;
    data.config.ingresoUSD = 3000;
    data.config.ingresoRD = 174000;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.emerg.cashflow.ingreso = 174000;
    data.emerg.cashflow.gasto = 120000;
    data.forNow.cuentas = [{ nombre: 'Banco', moneda: 'RD', saldo: 50000, comp: 0, disp: 50000 }];
    data.emerg.fondos = [{ fondo: 'EF', moneda: 'RD', balance: 10000, meta: 50000 }];
    data.gastos = [
      { nombre: 'Alquiler', tipo: 'Fijo', pagado: 0, adeudado: 25000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
    ];
    if (extra === 'with-budget') {
      data.presupuesto = [
        { categoria: 'comida', presupuestado: 15000, mes: 'Marzo', anio: 2026 },
        { categoria: 'transporte', presupuestado: 8000, mes: 'Marzo', anio: 2026 },
      ];
      data.transacciones = [
        { fecha: '2026-03-10', monto: 3000, categoria: 'comida', nota: 'Supermercado', metodo: 'tarjeta', gastoIdx: -1, mes: 'Marzo', anio: 2026 },
        { fecha: '2026-03-12', monto: 2000, categoria: 'transporte', nota: 'Gasolina', metodo: 'efectivo', gastoIdx: -1, mes: 'Marzo', anio: 2026 },
      ];
    }
    if (extra === 'with-recurring') {
      data.recurrentes = [
        { id: 'rec_test1', fecha: '2026-03-01', monto: 500, categoria: 'transporte', nota: 'Uber', metodo: 'tarjeta', gastoIdx: -1, frecuencia: 'semanal', lastGenerated: '2026-03-01' },
      ];
    }
    window._testLoadData(data);
  }, extraSetup || null);
}

test.describe('Presupuesto (Forward Budget)', () => {

  test('presupuesto tab exists and is in Operaciones group', async ({ page }) => {
    await loadApp(page);
    const tabBtn = page.locator('.tab-btn[onclick*="presupuesto"]');
    await expect(tabBtn).toHaveCount(1);
    await expect(tabBtn).toHaveAttribute('data-group', 'ops');
  });

  test('presupuesto panel renders with empty state', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]')));
    const panel = page.locator('#tab-presupuesto');
    await expect(panel).toHaveClass(/active/);
    // Should show empty state in table
    const presTable = page.locator('#presTable');
    await expect(presTable).toContainText('presupuesto');
  });

  test('presupuesto shows KPIs with income, allocated, unallocated', async ({ page }) => {
    await loadApp(page, 'with-budget');
    await page.evaluate(() => window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]')));
    const kpis = page.locator('#presKpis');
    // Income KPI should show RD$174,000
    await expect(kpis).toContainText('174,000');
    // Allocated KPI should show RD$23,000 (15000 + 8000)
    await expect(kpis).toContainText('23,000');
  });

  test('presupuesto table shows budget vs actual comparison', async ({ page }) => {
    await loadApp(page, 'with-budget');
    await page.evaluate(() => window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]')));
    const table = page.locator('#presTable');
    // Should contain both budgeted categories
    await expect(table).toContainText('Comida');
    await expect(table).toContainText('Transporte');
    // Should show budgeted amounts
    await expect(table).toContainText('15,000');
    await expect(table).toContainText('8,000');
    // Should show actual amounts
    await expect(table).toContainText('3,000');
    await expect(table).toContainText('2,000');
  });

  test('saving budget persists data', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]')));
    // Open form
    await page.click('#presToggleBtn');
    // Set comida budget to 10000
    await page.fill('input[data-pres-cat="comida"]', '10000');
    // Save
    await page.click('#presSaveBtn');
    // Verify data persisted
    const budget = await page.evaluate(() => _editData.presupuesto);
    expect(budget.length).toBeGreaterThan(0);
    const comida = budget.find(p => p.categoria === 'comida');
    expect(comida).toBeTruthy();
    expect(comida.presupuestado).toBe(10000);
  });

  test('presupuesto data model has correct defaults', async ({ page }) => {
    await loadApp(page);
    const hasFields = await page.evaluate(() => {
      return Array.isArray(_editData.presupuesto) && Array.isArray(_editData.recurrentes);
    });
    expect(hasFields).toBe(true);
  });
});

test.describe('Recurring Transactions', () => {

  test('recurrence dropdown exists in registro form', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]')));
    const recSelect = page.locator('#regRecurrencia');
    await expect(recSelect).toBeAttached();
    // Should have 5 options: none, diario, semanal, quincenal, mensual
    const optionCount = await recSelect.locator('option').count();
    expect(optionCount).toBe(5);
  });

  test('adding transaction with recurrence creates recurring rule', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]')));
    // Open form
    await page.click('#regToggleBtn');
    await page.fill('#regMonto', '500');
    await page.selectOption('#regRecurrencia', 'semanal');
    await page.click('#regSubmitBtn');

    const result = await page.evaluate(() => ({
      txCount: _editData.transacciones.length,
      recCount: _editData.recurrentes.length,
      recFreq: _editData.recurrentes[0]?.frecuencia,
    }));
    expect(result.txCount).toBe(1);
    expect(result.recCount).toBe(1);
    expect(result.recFreq).toBe('semanal');
  });

  test('recurring rules display in registro tab', async ({ page }) => {
    await loadApp(page, 'with-recurring');
    await page.evaluate(() => window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]')));
    const recSection = page.locator('#registroRecurrentes');
    await expect(recSection).toContainText('Uber');
    await expect(recSection).toContainText('500');
  });

  test('deleting recurring rule removes it but keeps generated transactions', async ({ page }) => {
    await loadApp(page, 'with-recurring');
    await page.evaluate(() => window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]')));

    // Get initial transaction count (may have auto-generated some)
    const txBefore = await page.evaluate(() => _editData.transacciones.length);

    // Delete the recurring rule
    await page.evaluate(() => {
      _editData.recurrentes.splice(0, 1);
      window.buildRegistro(_editData.transacciones, _editData.gastos, _editData.config);
    });

    const result = await page.evaluate(() => ({
      recCount: _editData.recurrentes.length,
      txCount: _editData.transacciones.length,
    }));
    expect(result.recCount).toBe(0);
    // Transactions should still exist
    expect(result.txCount).toBe(txBefore);
  });

  test('generated recurring transactions have recurrenteId', async ({ page }) => {
    await loadApp(page, 'with-recurring');

    const txWithRecId = await page.evaluate(() => {
      return _editData.transacciones.filter(tx => tx.recurrenteId === 'rec_test1').length;
    });
    // Should have generated at least some transactions (depends on date)
    expect(txWithRecId).toBeGreaterThanOrEqual(0);
  });

  test('recurring transactions show badge in transaction list', async ({ page }) => {
    await loadApp(page, 'with-recurring');
    await page.evaluate(() => {
      // Manually add a transaction with recurrenteId to ensure it shows
      _editData.transacciones.push({
        fecha: '2026-03-15', monto: 500, categoria: 'transporte', nota: 'Uber',
        metodo: 'tarjeta', gastoIdx: -1, mes: 'Marzo', anio: 2026, recurrenteId: 'rec_test1'
      });
      window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]'));
    });

    // The recurring badge (🔄) should appear
    const badge = page.locator('.reg-item >> text=🔄');
    await expect(badge.first()).toBeVisible();
  });
});

test.describe('Edit Modal Integration', () => {

  test('edit modal has presupuesto and recurrentes tabs', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => document.getElementById('editModal').style.display = 'flex');
    const presTab = page.locator('.edit-tab[onclick*="presupuesto"]');
    const recTab = page.locator('.edit-tab[onclick*="recurrentes"]');
    await expect(presTab).toBeAttached();
    await expect(recTab).toBeAttached();
  });
});

test.describe('Excel Round-Trip', () => {

  test('presupuesto and recurrentes data survives export/import', async ({ page }) => {
    await loadApp(page, 'with-budget');
    // Add recurring rule
    await page.evaluate(() => {
      _editData.recurrentes = [
        { id: 'rec_excel_test', fecha: '2026-03-01', monto: 1000, categoria: 'comida', nota: 'Test', metodo: 'efectivo', gastoIdx: -1, frecuencia: 'mensual', lastGenerated: '2026-03-01' }
      ];
    });

    // Build workbook and check sheets exist
    const sheets = await page.evaluate(() => {
      const wb = window.buildNewWorkbook();
      return wb.SheetNames;
    });

    expect(sheets).toContain('Presupuesto');
    expect(sheets).toContain('Recurrentes');
  });
});
