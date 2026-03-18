const { test, expect } = require('@playwright/test');

/**
 * Helper: load the app and inject data via the test harness.
 * Merges overrides into defaultEditData(), recalculates derived fields,
 * then calls _testLoadData which triggers buildDashboard + applyI18n.
 */
async function loadApp(page, overrides = {}) {
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');

  await page.evaluate((ov) => {
    const data = window.defaultEditData();

    // Sensible defaults so the dashboard renders without errors
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.ingresoRD = 180000;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.config.diasAlerta = 5;
    data.emerg.cashflow.ingreso = 180000;
    data.emerg.cashflow.gasto = 120000;
    data.emerg.cashflow.tasa = 60;

    // Apply overrides
    if (ov.config) Object.assign(data.config, ov.config);
    if (ov.gastos) data.gastos = ov.gastos;
    if (ov.fondos) data.emerg.fondos = ov.fondos;
    if (ov.cuentas) data.forNow.cuentas = ov.cuentas;

    // Recalculate derived income
    data.config.ingresoRD = data.config.ingresoUSD * data.config.tasa;

    window._testLoadData(data);
  }, overrides);
}

/** Navigate to the Alerts tab */
async function goToAlertasTab(page) {
  const tabBtn = page.locator('.tab-btn', { hasText: /alertas|alerts/i });
  if (await tabBtn.count() > 0) {
    await tabBtn.first().click();
  } else {
    const mobileBtn = page.locator('.mnav-btn', { hasText: /alertas|alerts/i });
    if (await mobileBtn.count() > 0) await mobileBtn.first().click();
  }
  await expect(page.locator('#tab-alertas')).toBeVisible();
}

/** Build a gasto (debt/expense) object with defaults */
function mkGasto(overrides = {}) {
  return {
    nombre: 'Test Debt',
    tipo: 'Fijo',
    pagado: 0,
    adeudado: 10000,
    dia: 15,
    tasa: 0,
    balance: 0,
    originalRD: 0,
    originalUSD: 0,
    fechaLimite: null,
    notas: '',
    pagadoMes: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// 1. DUE DATE ALERTS (Vencimientos)
// ─────────────────────────────────────────────

test.describe('Alerts - Due Date Alerts', () => {
  test('overdue unpaid debt shows urgent alert with days late', async ({ page }) => {
    const today = new Date();
    const pastDay = today.getDate() - 5 > 0 ? today.getDate() - 5 : 1;

    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Renta', dia: pastDay, adeudado: 25000, pagado: 0, pagadoMes: false })],
    });
    await goToAlertasTab(page);

    const venc = page.locator('#alertasVenc');
    await expect(venc).toBeVisible();

    // Should show overdue alert with the debt name
    const urgentItem = venc.locator('.alert-item.urgent');
    if (today.getDate() - 5 > 0) {
      await expect(urgentItem.first()).toContainText('Renta');
      // Should show negative days indicator
      await expect(urgentItem.first().locator('.alert-days')).toContainText('-');
    }
  });

  test('debt due within diasAlerta shows warning alert', async ({ page }) => {
    const today = new Date();
    // Set due day to 2 days from now (wrapping around month if needed)
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const futureDay = ((today.getDate() + 2 - 1) % daysInMonth) + 1;

    await loadApp(page, {
      config: { diasAlerta: 5 },
      gastos: [mkGasto({ nombre: 'Seguro', dia: futureDay, adeudado: 7000 })],
    });
    await goToAlertasTab(page);

    const venc = page.locator('#alertasVenc');
    const alertItem = venc.locator('.alert-item');
    await expect(alertItem.first()).toContainText('Seguro');
  });

  test('already paid debt does not show due date alert', async ({ page }) => {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const futureDay = ((today.getDate() + 2 - 1) % daysInMonth) + 1;

    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Pagado', dia: futureDay, adeudado: 5000, pagadoMes: true })],
    });
    await goToAlertasTab(page);

    const venc = page.locator('#alertasVenc');
    const html = await venc.innerHTML();
    expect(html).not.toContain('Pagado');
  });

  test('debt with pagado >= adeudado does not show alert', async ({ page }) => {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const futureDay = ((today.getDate() + 2 - 1) % daysInMonth) + 1;

    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'FullPaid', dia: futureDay, adeudado: 5000, pagado: 5000 })],
    });
    await goToAlertasTab(page);

    const venc = page.locator('#alertasVenc');
    const html = await venc.innerHTML();
    expect(html).not.toContain('FullPaid');
  });

  test('no due dates shows empty state message', async ({ page }) => {
    await loadApp(page, { gastos: [] });
    await goToAlertasTab(page);

    const venc = page.locator('#alertasVenc');
    const html = await venc.innerHTML();
    // Should show "no upcoming" message (either language)
    expect(html).toMatch(/sin vencimientos|no upcoming/i);
  });
});

// ─────────────────────────────────────────────
// 2. DEADLINE ALERTS (Fechas Límite)
// ─────────────────────────────────────────────

test.describe('Alerts - Deadline Alerts', () => {
  test('debt with fechaLimite within 60 days shows info alert', async ({ page }) => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const fechaLimite = future.toISOString().split('T')[0];

    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Préstamo Auto', dia: 0, adeudado: 0, balance: 100000, fechaLimite })],
    });
    await goToAlertasTab(page);

    const venc = page.locator('#alertasVenc');
    const infoItem = venc.locator('.alert-item.info');
    await expect(infoItem.first()).toContainText('Préstamo Auto');
    // Allow +/- 1 day due to Math.round and time-of-day
    const daysText = await infoItem.first().locator('.alert-days').textContent();
    const daysNum = parseInt(daysText);
    expect(daysNum).toBeGreaterThanOrEqual(29);
    expect(daysNum).toBeLessThanOrEqual(31);
  });

  test('debt with fechaLimite beyond 60 days does not show alert', async ({ page }) => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 90);
    const fechaLimite = farFuture.toISOString().split('T')[0];

    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Far Debt', dia: 0, adeudado: 0, balance: 50000, fechaLimite })],
    });
    await goToAlertasTab(page);

    const venc = page.locator('#alertasVenc');
    const html = await venc.innerHTML();
    expect(html).not.toContain('Far Debt');
  });

  test('debt with balance 0 does not show deadline alert', async ({ page }) => {
    const future = new Date();
    future.setDate(future.getDate() + 15);
    const fechaLimite = future.toISOString().split('T')[0];

    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Paid Off', dia: 0, adeudado: 0, balance: 0, fechaLimite })],
    });
    await goToAlertasTab(page);

    const venc = page.locator('#alertasVenc');
    const html = await venc.innerHTML();
    expect(html).not.toContain('Paid Off');
  });
});

// ─────────────────────────────────────────────
// 3. OVERSPENDING / HIGH EXPENSES ALERTS
// ─────────────────────────────────────────────

test.describe('Alerts - Expense Ratio Alerts', () => {
  test('expenses exceeding income shows urgent overspending alert', async ({ page }) => {
    // Income: 3000 USD * 60 = 180,000 RD$. Expenses > 180,000
    await loadApp(page, {
      gastos: [
        mkGasto({ nombre: 'Renta', adeudado: 100000 }),
        mkGasto({ nombre: 'Auto', adeudado: 90000 }),
      ],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    // Should show overspend alert (expenses 190k > income 180k)
    expect(html).toMatch(/gastos superan|expenses exceed/i);
  });

  test('expenses at 90% of income shows high expenses warning', async ({ page }) => {
    // 90% of 180,000 = 162,000
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Expenses', adeudado: 162000 })],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    expect(html).toMatch(/gastos elevados|high expenses/i);
  });

  test('expenses at 50% of income shows no expense alert', async ({ page }) => {
    // 50% of 180,000 = 90,000
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Low', adeudado: 90000 })],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    expect(html).not.toMatch(/gastos superan|expenses exceed|gastos elevados|high expenses/i);
  });
});

// ─────────────────────────────────────────────
// 4. HIGH DEBT RATIO ALERT
// ─────────────────────────────────────────────

test.describe('Alerts - High Debt Ratio', () => {
  test('debt > 150% of annual income shows urgent alert', async ({ page }) => {
    // Annual income: 180,000 * 12 = 2,160,000. 150% = 3,240,000
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Hipoteca', adeudado: 50000, balance: 3500000, tasa: 10 })],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    expect(html).toMatch(/deuda muy alta|very high debt/i);
  });

  test('debt < 150% of annual income shows no debt ratio alert', async ({ page }) => {
    // Balance 1,000,000 < 3,240,000 (150% annual)
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Small Debt', adeudado: 20000, balance: 1000000, tasa: 8 })],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    expect(html).not.toMatch(/deuda muy alta|very high debt/i);
  });
});

// ─────────────────────────────────────────────
// 5. HIGH INTEREST RATE ALERT
// ─────────────────────────────────────────────

test.describe('Alerts - High Interest Rate', () => {
  test('debt with rate > 15% shows high rate warning', async ({ page }) => {
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Tarjeta Visa', adeudado: 5000, balance: 80000, tasa: 24 })],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    await expect(gen).toContainText('Tarjeta Visa');
    await expect(gen).toContainText('24%');
  });

  test('debt with rate <= 15% shows no high rate alert', async ({ page }) => {
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Low Rate', adeudado: 5000, balance: 80000, tasa: 12 })],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    expect(html).not.toContain('Low Rate');
  });

  test('debt with rate > 15% but balance 0 shows no alert', async ({ page }) => {
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Paid High', adeudado: 5000, balance: 0, tasa: 30 })],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    expect(html).not.toContain('Paid High');
  });
});

// ─────────────────────────────────────────────
// 6. EMERGENCY FUND ALERTS
// ─────────────────────────────────────────────

test.describe('Alerts - Emergency Fund', () => {
  test('emergency fund below 25% shows critical urgent alert', async ({ page }) => {
    await loadApp(page, {
      fondos: [{ fondo: 'Emergency', moneda: 'RD', balance: 5000, meta: 100000 }],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const urgentItems = gen.locator('.alert-item.urgent');
    const html = await gen.innerHTML();
    expect(html).toMatch(/fondo de emergencia crítico|emergency fund critical/i);
  });

  test('emergency fund at 35% shows low warning alert', async ({ page }) => {
    await loadApp(page, {
      fondos: [{ fondo: 'Emergency', moneda: 'RD', balance: 35000, meta: 100000 }],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    expect(html).toMatch(/fondo de emergencia bajo|emergency fund low/i);
  });

  test('emergency fund at 60% shows no emergency alert', async ({ page }) => {
    await loadApp(page, {
      fondos: [{ fondo: 'Healthy Fund', moneda: 'RD', balance: 60000, meta: 100000 }],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    expect(html).not.toMatch(/fondo de emergencia|emergency fund/i);
  });

  test('no emergency funds does not crash', async ({ page }) => {
    await loadApp(page, { fondos: [] });
    await goToAlertasTab(page);

    // Should render without errors
    const gen = page.locator('#alertasGen');
    await expect(gen).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// 7. INTEREST BURDEN ALERT (including deficit fix)
// ─────────────────────────────────────────────

test.describe('Alerts - Interest Burden', () => {
  test('interest > 50% of surplus shows warning/urgent alert', async ({ page }) => {
    // Income 180k, expenses 80k, surplus 100k
    // Balance 3,000,000 at 24% = 60,000/mo interest = 60% of surplus → triggers
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'High Interest', adeudado: 80000, balance: 3000000, tasa: 24 })],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    expect(html).toMatch(/carga de intereses|high interest burden/i);
  });

  test('interest alert shows when user is in deficit (resta <= 0)', async ({ page }) => {
    // Income 180k, expenses 200k = deficit. Interest should still alert.
    await loadApp(page, {
      gastos: [
        mkGasto({ nombre: 'Renta', adeudado: 200000 }),
        mkGasto({ nombre: 'Deuda Grande', adeudado: 0, balance: 500000, tasa: 24 }),
      ],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    // Should show interest alert even in deficit (the fix we applied)
    expect(html).toMatch(/carga de intereses|high interest burden/i);
    // Should mention deficit/critical
    expect(html).toMatch(/déficit|critical|crítica/i);
  });

  test('low interest relative to surplus shows no interest alert', async ({ page }) => {
    // Income 180k, expenses 50k, surplus 130k
    // Balance 100,000 at 12% = 1,000/mo interest = <1% of surplus
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Low Burden', adeudado: 50000, balance: 100000, tasa: 12 })],
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    expect(html).not.toMatch(/carga de intereses|high interest burden/i);
  });
});

// ─────────────────────────────────────────────
// 8. SITUATION SUMMARY (KPI cards)
// ─────────────────────────────────────────────

test.describe('Alerts - Situation Summary', () => {
  test('healthy finances show all green indicators', async ({ page }) => {
    // Low expenses, positive surplus, low debt ratio, no upcoming payments
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Expense', adeudado: 50000, dia: 28, pagadoMes: true })],
    });
    await goToAlertasTab(page);

    const sit = page.locator('#alertasSit');
    await expect(sit).toBeVisible();

    // All 4 KPI cards should render
    const cards = sit.locator('[style*="border-left"]');
    await expect(cards).toHaveCount(4);
  });

  test('deficit shows red surplus indicator', async ({ page }) => {
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Huge Expense', adeudado: 200000 })],
    });
    await goToAlertasTab(page);

    const sit = page.locator('#alertasSit');
    const html = await sit.innerHTML();
    // Should show deficit text
    expect(html).toMatch(/déficit|deficit/i);
  });

  test('expense threshold aligned at 85% — shows green at 84%', async ({ page }) => {
    // 84% of 180,000 = 151,200
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Near Limit', adeudado: 151200 })],
    });
    await goToAlertasTab(page);

    const sit = page.locator('#alertasSit');
    const html = await sit.innerHTML();
    // Should still be green (<=85%)
    expect(html).toContain('var(--green)');
  });

  test('expense threshold aligned at 85% — shows yellow at 90%', async ({ page }) => {
    // 90% of 180,000 = 162,000
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'High Exp', adeudado: 162000 })],
    });
    await goToAlertasTab(page);

    const sit = page.locator('#alertasSit');
    const html = await sit.innerHTML();
    // Should show yellow (between 85% and 100%)
    expect(html).toContain('var(--yellow)');
  });
});

// ─────────────────────────────────────────────
// 9. ALERT DOT INDICATOR
// ─────────────────────────────────────────────

test.describe('Alerts - Tab Dot Indicator', () => {
  test('urgent alerts show pulsing red dot on tab button', async ({ page }) => {
    const today = new Date();
    // Use a day that is definitely in the past this month (at least 7 days ago)
    const pastDay = today.getDate() > 7 ? today.getDate() - 7 : null;

    if (pastDay) {
      await loadApp(page, {
        gastos: [mkGasto({ nombre: 'Overdue', dia: pastDay, adeudado: 10000, pagado: 0, pagadoMes: false })],
      });

      // Verify the overdue alert renders
      await goToAlertasTab(page);
      await expect(page.locator('#alertasVenc .alert-item.urgent').first()).toContainText('Overdue');

      // The dot should be appended to the tab button and survive applyI18n
      const dot = page.locator('#tabAlertas .alert-dot');
      await expect(dot).toBeAttached();
    }
  });

  test('no urgent alerts clears the dot from tab button', async ({ page }) => {
    // All debts paid — no urgency
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Paid', dia: 1, adeudado: 5000, pagadoMes: true })],
    });

    const tabBtn = page.locator('#tabAlertas');
    const dot = tabBtn.locator('.alert-dot');
    await expect(dot).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────
// 10. I18N - ALERT TRANSLATIONS
// ─────────────────────────────────────────────

test.describe('Alerts - i18n', () => {
  test('Vencimientos Próximos header translates to English', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window._testSetLang('en'));
    await goToAlertasTab(page);

    const header = page.locator('#tab-alertas .card-title[data-i18n="panel_alertas_venc"]');
    await expect(header).toContainText('Upcoming Due Dates');
  });

  test('Vencimientos Próximos header shows Spanish by default', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window._testSetLang('es'));
    await goToAlertasTab(page);

    const header = page.locator('#tab-alertas .card-title[data-i18n="panel_alertas_venc"]');
    await expect(header).toContainText('Vencimientos Próximos');
  });

  test('high rate alert uses i18n sub key in English', async ({ page }) => {
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Credit Card', adeudado: 5000, balance: 80000, tasa: 24 })],
    });
    await page.evaluate(() => window._testSetLang('en'));
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    // Should use English translation — "annual" and "outstanding"
    await expect(gen).toContainText('annual');
    await expect(gen).toContainText('outstanding');
  });

  test('high rate alert uses i18n sub key in Spanish', async ({ page }) => {
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Tarjeta', adeudado: 5000, balance: 80000, tasa: 24 })],
    });
    await page.evaluate(() => window._testSetLang('es'));
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    // Should use Spanish translation — "anual" and "pendiente"
    await expect(gen).toContainText('anual');
    await expect(gen).toContainText('pendiente');
  });

  test('emergency fund critical alert uses i18n in English', async ({ page }) => {
    await loadApp(page, {
      fondos: [{ fondo: 'EF', moneda: 'RD', balance: 5000, meta: 100000 }],
    });
    await page.evaluate(() => window._testSetLang('en'));
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    await expect(gen).toContainText('Emergency fund critical');
    await expect(gen).toContainText('completed');
  });

  test('no financial alerts message translates correctly', async ({ page }) => {
    await loadApp(page, { gastos: [] });
    await page.evaluate(() => window._testSetLang('en'));
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    await expect(gen).toContainText('No financial alerts');
  });
});

// ─────────────────────────────────────────────
// 11. EDGE CASES
// ─────────────────────────────────────────────

test.describe('Alerts - Edge Cases', () => {
  test('zero income with zero cashflow fallback triggers expense alert', async ({ page }) => {
    // Must also zero out cashflow.ingreso so no fallback income kicks in
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.tasa = 60;
      data.config.ingresoUSD = 0;
      data.config.ingresoRD = 0;
      data.config.mes = 'Marzo';
      data.config.anio = 2026;
      data.emerg.cashflow.ingreso = 0;
      data.emerg.cashflow.gasto = 0;
      data.emerg.cashflow.tasa = 60;
      data.gastos = [{
        nombre: 'Any Expense', tipo: 'Fijo', pagado: 0, adeudado: 1000, dia: 0,
        tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false
      }];
      window._testLoadData(data);
    });
    await goToAlertasTab(page);

    const gen = page.locator('#alertasGen');
    const html = await gen.innerHTML();
    // With truly zero income (no fallback), gpct=1 → high expenses alert (gpct > 0.85)
    expect(html).toMatch(/gastos elevados|high expenses|gastos superan|expenses exceed/i);
  });

  test('debt with invalid fechaLimite does not crash', async ({ page }) => {
    await loadApp(page, {
      gastos: [mkGasto({ nombre: 'Bad Date', dia: 0, adeudado: 0, balance: 50000, fechaLimite: 'not-a-date' })],
    });
    await goToAlertasTab(page);

    // Should not crash — alerts panel should still render
    const venc = page.locator('#alertasVenc');
    await expect(venc).toBeVisible();
    // Invalid date should be skipped by the deadline parser
    const html = await venc.innerHTML();
    expect(html).not.toContain('Bad Date');
  });

  test('debt with dia=0 or no dia does not show due date alert', async ({ page }) => {
    await loadApp(page, {
      gastos: [
        mkGasto({ nombre: 'NoDia', dia: 0, adeudado: 5000 }),
        mkGasto({ nombre: 'NullDia', dia: null, adeudado: 5000 }),
      ],
    });
    await goToAlertasTab(page);

    const venc = page.locator('#alertasVenc');
    const html = await venc.innerHTML();
    expect(html).not.toContain('NoDia');
    expect(html).not.toContain('NullDia');
  });

  test('multiple alert types render simultaneously', async ({ page }) => {
    const today = new Date();
    const pastDay = today.getDate() - 2 > 0 ? today.getDate() - 2 : 1;
    const future = new Date();
    future.setDate(future.getDate() + 20);
    const fechaLimite = future.toISOString().split('T')[0];

    await loadApp(page, {
      gastos: [
        // Overdue debt
        mkGasto({ nombre: 'Overdue Rent', dia: pastDay, adeudado: 100000, pagado: 0 }),
        // High interest rate debt
        mkGasto({ nombre: 'Credit Card', adeudado: 50000, balance: 200000, tasa: 28 }),
        // Debt with upcoming deadline
        mkGasto({ nombre: 'Car Loan', adeudado: 15000, balance: 300000, tasa: 10, fechaLimite }),
        // Another expense to push total > income
        mkGasto({ nombre: 'Extra', adeudado: 50000 }),
      ],
      fondos: [{ fondo: 'EF', moneda: 'RD', balance: 2000, meta: 100000 }],
    });
    await goToAlertasTab(page);

    const venc = page.locator('#alertasVenc');
    const gen = page.locator('#alertasGen');

    // Multiple alert types should all be visible
    if (today.getDate() - 2 > 0) {
      await expect(venc).toContainText('Overdue Rent');
    }
    await expect(venc).toContainText('Car Loan');
    await expect(gen).toContainText('Credit Card');
    const genHtml = await gen.innerHTML();
    expect(genHtml).toMatch(/fondo de emergencia|emergency fund/i);
  });
});
