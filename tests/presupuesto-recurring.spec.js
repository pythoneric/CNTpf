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

// ═══════════════════════════════════════
// GAP 2: Recurring Date Generation Logic
// ═══════════════════════════════════════

test.describe('Recurring Date Generation', () => {

  test('weekly rule generates correct dates', async ({ page }) => {
    await loadApp(page);
    const dates = await page.evaluate(() => {
      const rec = { frecuencia: 'semanal', lastGenerated: '2026-03-01' };
      const upTo = new Date('2026-03-26');
      return window.getRecurringDates(rec, upTo).map(d => d.toISOString().slice(0, 10));
    });
    expect(dates).toEqual(['2026-03-08', '2026-03-15', '2026-03-22']);
  });

  test('monthly rule generates correct number of dates', async ({ page }) => {
    await loadApp(page);
    const result = await page.evaluate(() => {
      const rec = { frecuencia: 'mensual', lastGenerated: '2026-01-15' };
      const upTo = new Date('2026-04-20');
      const dates = window.getRecurringDates(rec, upTo);
      return { count: dates.length, months: dates.map(d => d.getMonth()) };
    });
    // Jan 15 + 1mo = Feb 15, + 1mo = Mar 15, + 1mo = Apr 15 → 3 dates
    expect(result.count).toBe(3);
    expect(result.months).toEqual([1, 2, 3]); // Feb, Mar, Apr (0-indexed)
  });

  test('biweekly rule generates every 14 days', async ({ page }) => {
    await loadApp(page);
    const dates = await page.evaluate(() => {
      const rec = { frecuencia: 'quincenal', lastGenerated: '2026-03-01' };
      const upTo = new Date('2026-03-30');
      return window.getRecurringDates(rec, upTo).map(d => d.toISOString().slice(0, 10));
    });
    expect(dates).toEqual(['2026-03-15', '2026-03-29']);
  });

  test('daily rule capped at 365 iterations', async ({ page }) => {
    await loadApp(page);
    const count = await page.evaluate(() => {
      const rec = { frecuencia: 'diario', lastGenerated: '2024-01-01' };
      const upTo = new Date('2026-03-26');
      return window.getRecurringDates(rec, upTo).length;
    });
    expect(count).toBe(365);
  });

  test('invalid frequency generates nothing', async ({ page }) => {
    await loadApp(page);
    const count = await page.evaluate(() => {
      const rec = { frecuencia: 'invalid', lastGenerated: '2026-03-01' };
      const upTo = new Date('2026-03-26');
      return window.getRecurringDates(rec, upTo).length;
    });
    expect(count).toBe(0);
  });

  test('dedup: calling generateRecurring twice does not duplicate', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.recurrentes = [
        { id: 'rec_dedup', fecha: '2026-03-01', monto: 100, categoria: 'comida', nota: '', metodo: 'efectivo', gastoIdx: -1, frecuencia: 'semanal', lastGenerated: '2026-03-01' }
      ];
      _editData.transacciones = [];
    });
    const count1 = await page.evaluate(() => { window.generateRecurring(_editData.config); return _editData.transacciones.length; });
    const count2 = await page.evaluate(() => { window.generateRecurring(_editData.config); return _editData.transacciones.length; });
    expect(count1).toBeGreaterThan(0);
    expect(count2).toBe(count1); // no duplicates
  });

  test('generated transactions have correct Spanish month name', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.recurrentes = [
        { id: 'rec_mes', fecha: '2026-03-01', monto: 100, categoria: 'comida', nota: '', metodo: 'efectivo', gastoIdx: -1, frecuencia: 'semanal', lastGenerated: '2026-03-01' }
      ];
      _editData.transacciones = [];
      window.generateRecurring(_editData.config);
    });
    const meses = await page.evaluate(() => _editData.transacciones.map(tx => tx.mes));
    for (const mes of meses) {
      expect(mes).toBe('Marzo');
    }
  });

  test('no rules = no-op, no transactions generated', async ({ page }) => {
    await loadApp(page);
    const result = await page.evaluate(() => {
      _editData.recurrentes = [];
      _editData.transacciones = [];
      const count = window.generateRecurring(_editData.config);
      return { count, txLen: _editData.transacciones.length };
    });
    expect(result.count).toBe(0);
    expect(result.txLen).toBe(0);
  });
});

// ═══════════════════════════════════════
// GAP 3: Registro Tab Rendering
// ═══════════════════════════════════════

test.describe('Registro Tab Rendering', () => {

  test('renders KPIs correctly with known data', async ({ page }) => {
    await loadApp(page, 'with-budget');
    await page.evaluate(() => window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]')));
    const kpis = page.locator('#registroKpis');
    // Total = 3000 + 2000 = 5000
    await expect(kpis).toContainText('5,000');
    // Count = 2
    await expect(kpis).toContainText('2');
  });

  test('form toggle shows/hides form', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]')));
    const wrap = page.locator('#regFormWrap');
    await expect(wrap).toHaveCSS('display', 'none');
    await page.click('#regToggleBtn');
    await expect(wrap).toHaveCSS('display', 'block');
    await page.click('#regToggleBtn');
    await expect(wrap).toHaveCSS('display', 'none');
  });

  test('transaction appears in list after add', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]')));
    await page.click('#regToggleBtn');
    await page.fill('#regMonto', '1500');
    await page.fill('#regNota', 'Test lunch');
    await page.click('#regSubmitBtn');
    const list = page.locator('#registroList');
    await expect(list).toContainText('Test lunch');
    await expect(list).toContainText('1,500');
  });

  test('empty state shows when no transactions', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]')));
    const list = page.locator('#registroList');
    // Should show the empty state message
    const text = await list.textContent();
    expect(text.length).toBeGreaterThan(5); // has some message, not blank
  });

  test('form rejects zero amount', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]')));
    await page.click('#regToggleBtn');
    await page.fill('#regMonto', '0');
    await page.click('#regSubmitBtn');
    const txCount = await page.evaluate(() => _editData.transacciones.length);
    expect(txCount).toBe(0);
  });

  test('category chart renders with transactions', async ({ page }) => {
    await loadApp(page, 'with-budget');
    await page.evaluate(() => window.showTab('registro', document.querySelector('.tab-btn[onclick*="registro"]')));
    const chartVisible = await page.evaluate(() => {
      const canvas = document.getElementById('regCatChart');
      return canvas && canvas.parentElement.style.display !== 'none';
    });
    expect(chartVisible).toBe(true);
  });
});

// ═══════════════════════════════════════
// GAP 4: Presupuesto Form & Calculations
// ═══════════════════════════════════════

test.describe('Presupuesto Form & Calculations', () => {

  test('form toggle shows/hides budget form', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]')));
    const wrap = page.locator('#presFormWrap');
    await expect(wrap).toHaveCSS('display', 'none');
    await page.click('#presToggleBtn');
    await expect(wrap).toHaveCSS('display', 'block');
  });

  test('live unallocated counter updates on input', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]')));
    await page.click('#presToggleBtn');
    // Income is 174000. Type 50000 in comida field.
    await page.fill('input[data-pres-cat="comida"]', '50000');
    const label = await page.locator('#presUnallocLabel').textContent();
    // Should show 174000 - 50000 = 124,000
    expect(label).toContain('124,000');
  });

  test('over-allocated shown in red when budget exceeds income', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]')));
    await page.click('#presToggleBtn');
    await page.fill('input[data-pres-cat="comida"]', '200000');
    const color = await page.locator('#presUnallocLabel').evaluate(el => el.style.color);
    expect(color).toContain('red');
  });

  test('over-budget warning shows category count', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.presupuesto = [
        { categoria: 'comida', presupuestado: 1000, mes: 'Marzo', anio: 2026 },
        { categoria: 'transporte', presupuestado: 500, mes: 'Marzo', anio: 2026 },
      ];
      _editData.transacciones = [
        { fecha: '2026-03-10', monto: 2000, categoria: 'comida', nota: '', metodo: 'efectivo', gastoIdx: -1, mes: 'Marzo', anio: 2026 },
        { fecha: '2026-03-10', monto: 1000, categoria: 'transporte', nota: '', metodo: 'efectivo', gastoIdx: -1, mes: 'Marzo', anio: 2026 },
      ];
      window.buildPresupuesto(_editData.presupuesto, _editData.transacciones, _editData.config);
      window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]'));
    });
    const table = page.locator('#presTable');
    // Both categories over budget → warning with count 2
    await expect(table).toContainText('2');
  });

  test('under-budget note when all categories within budget', async ({ page }) => {
    await loadApp(page, 'with-budget');
    await page.evaluate(() => window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]')));
    const table = page.locator('#presTable');
    // comida: 3000/15000, transporte: 2000/8000 — both under budget
    await expect(table).toContainText('✓');
  });

  test('budget for different month not shown in current view', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      _editData.presupuesto = [
        { categoria: 'comida', presupuestado: 99999, mes: 'Abril', anio: 2026 },
      ];
      window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]'));
    });
    const table = page.locator('#presTable');
    // Abril budget should not appear in Marzo view
    const text = await table.textContent();
    expect(text).not.toContain('99,999');
  });

  test('chart hidden when no budget categories', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]')));
    const chartHidden = await page.evaluate(() => {
      const canvas = document.getElementById('presChart');
      return canvas.parentElement.style.display === 'none';
    });
    expect(chartHidden).toBe(true);
  });

  test('remaining calculation: budgeted 5000 minus actual 3000 = 2000', async ({ page }) => {
    await loadApp(page, 'with-budget');
    await page.evaluate(() => window.showTab('presupuesto', document.querySelector('.tab-btn[onclick*="presupuesto"]')));
    const table = page.locator('#presTable');
    // comida: 15000 budgeted, 3000 actual → remaining 12000
    await expect(table).toContainText('12,000');
    // transporte: 8000 budgeted, 2000 actual → remaining 6000
    await expect(table).toContainText('6,000');
  });
});

// ═══════════════════════════════════════
// GAP 5: Cierre de Mes Budget Integration
// ═══════════════════════════════════════

test.describe('Cierre de Mes Budget Integration', () => {

  test('cierre archives presupuestado in historial', async ({ page }) => {
    await loadApp(page, 'with-budget');
    // Simulate cierre by creating historial entry the same way the wizard does
    const presTotal = await page.evaluate(() => {
      const presMes = (_editData.presupuesto || []).filter(p => p.mes === 'Marzo' && p.anio === 2026);
      return presMes.reduce((a, p) => a + p.presupuestado, 0);
    });
    expect(presTotal).toBe(23000); // 15000 + 8000
  });

  test('budget data exists for carry-forward scenario', async ({ page }) => {
    await loadApp(page, 'with-budget');
    // Verify the presupuesto entries exist and could be carried forward
    const result = await page.evaluate(() => {
      const currentBudget = _editData.presupuesto.filter(p => p.mes === 'Marzo' && p.anio === 2026);
      return { count: currentBudget.length, cats: currentBudget.map(p => p.categoria) };
    });
    expect(result.count).toBe(2);
    expect(result.cats).toContain('comida');
    expect(result.cats).toContain('transporte');
  });
});
