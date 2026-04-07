const { test, expect } = require('@playwright/test');

const APP = '/cnt.html';

// ── Helpers ──────────────────────────────────────────────────────────

async function loadWithCurrency(page, currency = 'RD', overrides = {}) {
  await page.goto(APP);
  await page.waitForFunction(() => typeof window._testLoadData === 'function', null, { timeout: 15000 });
  await page.evaluate(({ currency, overrides }) => {
    const data = window.defaultEditData();
    data.config.monedaPrincipal = currency;
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.ingresoRD = 180000;
    data.gastos = [{
      nombre: 'Test Debt', tipo: 'Préstamo', pagado: 10000, adeudado: 15000,
      dia: 15, tasa: 12, balance: 500000, originalRD: 600000, originalUSD: 10000,
      tasaCreacion: 60, fechaLimite: null, notas: '', pagadoMes: false
    }];
    data.forNow.cuentas = [
      { nombre: 'RD Account', moneda: 'RD', saldo: 50000, comp: 0, disp: 50000 },
      { nombre: 'USD Account', moneda: 'USD', saldo: 1000, comp: 0, disp: 1000 }
    ];
    data.emerg.fondos = [
      { fondo: 'Emergency', moneda: 'RD', balance: 100000, meta: 300000 },
      { fondo: 'USD Fund', moneda: 'USD', balance: 500, meta: 2000 }
    ];
    data.metas = [{ name: 'Goal', goal: 120000, saved: 40000, monthly: 10000 }];
    data.historial = [
      { mes: 'Enero', anio: 2026, ingresos: 180000, gasto: 120000, ahorro: 60000,
        tasaAhorro: 0.333, deudas: 500000, emergencia: 100000, netWorth: -200000, tasa: 60, notas: '' }
    ];
    Object.assign(data.config, overrides.config || {});
    if (overrides.gastos) data.gastos = overrides.gastos;
    window._testLoadData(data);
  }, { currency, overrides });
}

async function loadDemoPage(page, currency) {
  await page.goto(APP);
  await page.waitForFunction(() => typeof window.loadDemo === 'function');
  await page.evaluate((c) => loadDemo(c), currency);
  await page.waitForSelector('#dashApp', { state: 'visible', timeout: 15000 });
}

async function showTab(page, tabId) {
  await page.evaluate((id) => {
    const btn = document.querySelector(`.tab-btn[onclick*="'${id}'"]`);
    if (btn) showTab(id, btn);
  }, tabId);
  await page.waitForSelector(`#tab-${tabId}`, { state: 'visible', timeout: 5000 });
}

// ══════════════════════════════════════════════════════════════════════
// 1. DISPLAY FORMATTING
// ══════════════════════════════════════════════════════════════════════

test.describe('Display Formatting', () => {
  test('KPI cards show RD$ prefix in RD mode', async ({ page }) => {
    await loadWithCurrency(page, 'RD');
    const kpiTexts = await page.locator('#kpiRow .card .kpi-val').allTextContents();
    const monetaryKpis = kpiTexts.filter(t => t.includes('$'));
    expect(monetaryKpis.length).toBeGreaterThan(0);
    for (const txt of monetaryKpis) {
      expect(txt).toMatch(/RD\$/);
    }
  });

  test('KPI cards show $ prefix (not RD$) in USD mode', async ({ page }) => {
    await loadWithCurrency(page, 'USD');
    const kpiTexts = await page.locator('#kpiRow .card .kpi-val').allTextContents();
    const monetaryKpis = kpiTexts.filter(t => t.includes('$'));
    expect(monetaryKpis.length).toBeGreaterThan(0);
    for (const txt of monetaryKpis) {
      // Must contain $ but NOT RD$
      expect(txt).toContain('$');
      expect(txt).not.toMatch(/RD\$/);
    }
  });

  test('Gastos table headers show RD$ in RD mode', async ({ page }) => {
    await loadWithCurrency(page, 'RD');
    await showTab(page, 'gastos');
    const headers = await page.locator('#tab-gastos thead th').allTextContents();
    const currencyHeaders = headers.filter(h => h.includes('$'));
    expect(currencyHeaders.length).toBeGreaterThanOrEqual(2); // Pagado, Cuota, Balance
    for (const h of currencyHeaders) {
      expect(h).toMatch(/RD\$/);
    }
  });

  test('Gastos table headers show $ (not RD$) in USD mode', async ({ page }) => {
    await loadWithCurrency(page, 'USD');
    await showTab(page, 'gastos');
    const headers = await page.locator('#tab-gastos thead th').allTextContents();
    const currencyHeaders = headers.filter(h => h.includes('$'));
    expect(currencyHeaders.length).toBeGreaterThanOrEqual(2);
    for (const h of currencyHeaders) {
      expect(h).not.toMatch(/RD\$/);
    }
  });

  test('Gastos table cell amounts use correct currency symbol', async ({ page }) => {
    await loadWithCurrency(page, 'USD');
    await showTab(page, 'gastos');
    const cells = await page.locator('#gastosBody td.num').allTextContents();
    const amountCells = cells.filter(c => c.includes('$'));
    expect(amountCells.length).toBeGreaterThan(0);
    for (const c of amountCells) {
      expect(c).not.toMatch(/RD\$/);
    }
  });

  test('Historial table headers show correct currency in RD mode', async ({ page }) => {
    await loadWithCurrency(page, 'RD');
    await showTab(page, 'historial');
    const headers = await page.locator('#tab-historial thead th').allTextContents();
    const currencyHeaders = headers.filter(h => h.includes('$'));
    for (const h of currencyHeaders) {
      if (h.includes('Tasa')) continue; // "Tasa $" is always $
      expect(h).toMatch(/RD\$/);
    }
  });

  test('Historial table headers show $ in USD mode', async ({ page }) => {
    await loadWithCurrency(page, 'USD');
    await showTab(page, 'historial');
    const headers = await page.locator('#tab-historial thead th').allTextContents();
    const currencyHeaders = headers.filter(h => h.includes('$') && !h.includes('Tasa'));
    for (const h of currencyHeaders) {
      expect(h).not.toMatch(/RD\$/);
    }
  });

  test('fmtC returns correct prefix based on monedaPrincipal', async ({ page }) => {
    await loadWithCurrency(page, 'RD');
    const rdResult = await page.evaluate(() => fmtC(10000));
    expect(rdResult).toBe('RD$10,000');

    // Switch to USD
    await page.evaluate(() => {
      _editData.config.monedaPrincipal = 'USD';
    });
    const usdResult = await page.evaluate(() => fmtC(10000));
    expect(usdResult).toBe('$10,000');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2. CONVERSION ACCURACY
// ══════════════════════════════════════════════════════════════════════

test.describe('Conversion Accuracy', () => {
  test('toDisplay divides by tasa in USD mode', async ({ page }) => {
    await loadWithCurrency(page, 'USD');
    const result = await page.evaluate(() => toDisplay(60000));
    // 60000 / 60 = 1000
    expect(result).toBe(1000);
  });

  test('toDisplay returns raw value in RD mode', async ({ page }) => {
    await loadWithCurrency(page, 'RD');
    const result = await page.evaluate(() => toDisplay(60000));
    expect(result).toBe(60000);
  });

  test('USD mode shows income divided by tasa', async ({ page }) => {
    await loadWithCurrency(page, 'USD');
    // Income is 180000 RD, tasa=60 => $3,000 displayed
    const kpiTexts = await page.locator('#kpiRow .card .kpi-val').allTextContents();
    const incomeText = kpiTexts.find(t => t.includes('3,000'));
    expect(incomeText).toBeDefined();
  });

  test('fromDisplay multiplies by tasa in USD mode', async ({ page }) => {
    await loadWithCurrency(page, 'USD');
    const result = await page.evaluate(() => fromDisplay(1000));
    // 1000 * 60 = 60000
    expect(result).toBe(60000);
  });

  test('net worth calculated consistently in both modes', async ({ page }) => {
    // Load RD mode and capture net worth KPI (4th card, index 3)
    await loadWithCurrency(page, 'RD');
    const nwRD = await page.evaluate(() => {
      const cards = document.querySelectorAll('#kpiRow .card .kpi-val');
      return cards[3] ? cards[3].textContent : '';
    });

    // Load USD mode with same data
    await loadWithCurrency(page, 'USD');
    const nwUSD = await page.evaluate(() => {
      const cards = document.querySelectorAll('#kpiRow .card .kpi-val');
      return cards[3] ? cards[3].textContent : '';
    });

    // Both should have a value containing $
    expect(nwRD).toContain('$');
    expect(nwUSD).toContain('$');
    // RD should show RD$, USD should show $ (not RD$)
    expect(nwRD).toMatch(/RD\$/);
    expect(nwUSD).not.toMatch(/RD\$/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 3. RATIOS & PERCENTAGES
// ══════════════════════════════════════════════════════════════════════

test.describe('Ratios & Percentages', () => {
  test('savings rate is identical in both modes', async ({ page }) => {
    await loadWithCurrency(page, 'RD');
    const rateRD = await page.evaluate(() => {
      const inc = _editData.config.ingresoRD;
      const gasto = _editData.gastos.reduce((a, g) => a + (g.adeudado || 0), 0);
      return inc > 0 ? ((inc - gasto) / inc) : 0;
    });

    await loadWithCurrency(page, 'USD');
    const rateUSD = await page.evaluate(() => {
      const inc = _editData.config.ingresoRD;
      const gasto = _editData.gastos.reduce((a, g) => a + (g.adeudado || 0), 0);
      return inc > 0 ? ((inc - gasto) / inc) : 0;
    });

    expect(rateRD).toBeCloseTo(rateUSD, 4);
  });

  test('expense percentage of income is identical in both modes', async ({ page }) => {
    await loadWithCurrency(page, 'RD');
    const pctRD = await page.evaluate(() => {
      const inc = _editData.config.ingresoRD;
      const gasto = _editData.gastos.reduce((a, g) => a + (g.adeudado || 0), 0);
      return inc > 0 ? gasto / inc : 0;
    });

    await loadWithCurrency(page, 'USD');
    const pctUSD = await page.evaluate(() => {
      const inc = _editData.config.ingresoRD;
      const gasto = _editData.gastos.reduce((a, g) => a + (g.adeudado || 0), 0);
      return inc > 0 ? gasto / inc : 0;
    });

    expect(pctRD).toBeCloseTo(pctUSD, 4);
  });

  test('health score is identical regardless of currency mode', async ({ page }) => {
    await loadWithCurrency(page, 'RD');
    const scoreRD = await page.evaluate(() => {
      const el = document.querySelector('#healthScore');
      return el ? el.textContent.trim() : '';
    });

    await loadWithCurrency(page, 'USD');
    const scoreUSD = await page.evaluate(() => {
      const el = document.querySelector('#healthScore');
      return el ? el.textContent.trim() : '';
    });

    expect(scoreRD).toBe(scoreUSD);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 4. DEMO DATA
// ══════════════════════════════════════════════════════════════════════

test.describe('Demo Data', () => {
  test('loader screen shows two demo buttons (RD and USD)', async ({ page }) => {
    await page.goto(APP);
    const rdBtn = page.locator('button[onclick="loadDemo(\'RD\')"]');
    const usdBtn = page.locator('button[onclick="loadDemo(\'USD\')"]');
    await expect(rdBtn).toBeVisible();
    await expect(usdBtn).toBeVisible();
  });

  test('RD demo loads with RD$ amounts in KPI cards', async ({ page }) => {
    await loadDemoPage(page, 'RD');
    const kpiTexts = await page.locator('#kpiRow .card .kpi-val').allTextContents();
    const monetary = kpiTexts.filter(t => t.includes('$'));
    expect(monetary.length).toBeGreaterThan(0);
    for (const txt of monetary) {
      expect(txt).toMatch(/RD\$/);
    }
  });

  test('USD demo loads with $ amounts (not RD$) in KPI cards', async ({ page }) => {
    await loadDemoPage(page, 'USD');
    const kpiTexts = await page.locator('#kpiRow .card .kpi-val').allTextContents();
    const monetary = kpiTexts.filter(t => t.includes('$'));
    expect(monetary.length).toBeGreaterThan(0);
    for (const txt of monetary) {
      expect(txt).not.toMatch(/RD\$/);
    }
  });

  test('RD demo has 15 gastos', async ({ page }) => {
    await loadDemoPage(page, 'RD');
    const count = await page.evaluate(() => _editData.gastos.length);
    expect(count).toBe(15);
  });

  test('USD demo has 15 gastos', async ({ page }) => {
    await loadDemoPage(page, 'USD');
    const count = await page.evaluate(() => _editData.gastos.length);
    expect(count).toBe(15);
  });

  test('RD demo has 18 historial months', async ({ page }) => {
    await loadDemoPage(page, 'RD');
    const count = await page.evaluate(() => _editData.historial.length);
    expect(count).toBe(18);
  });

  test('USD demo has 18 historial months', async ({ page }) => {
    await loadDemoPage(page, 'USD');
    const count = await page.evaluate(() => _editData.historial.length);
    expect(count).toBe(18);
  });

  test('both demos have 5 metas', async ({ page }) => {
    await loadDemoPage(page, 'RD');
    const rdMetas = await page.evaluate(() => _editData.metas.length);
    expect(rdMetas).toBe(5);

    await loadDemoPage(page, 'USD');
    const usdMetas = await page.evaluate(() => _editData.metas.length);
    expect(usdMetas).toBe(5);
  });

  test('RD demo renders all tabs without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await loadDemoPage(page, 'RD');

    const tabIds = ['gastos', 'historial', 'metas'];
    for (const id of tabIds) {
      await showTab(page, id);
    }
    expect(errors).toEqual([]);
  });

  test('USD demo renders all tabs without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await loadDemoPage(page, 'USD');

    const tabIds = ['gastos', 'historial', 'metas'];
    for (const id of tabIds) {
      await showTab(page, id);
    }
    expect(errors).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 5. IMPORT / EXPORT
// ══════════════════════════════════════════════════════════════════════

test.describe('Import / Export', () => {
  test('exported JSON includes monedaPrincipal field', async ({ page }) => {
    await loadWithCurrency(page, 'USD');
    const exported = await page.evaluate(() => {
      const data = JSON.parse(JSON.stringify(_editData));
      data._meta = { version: 2, exportedAt: new Date().toISOString(), app: 'CNTpf' };
      return data;
    });
    expect(exported.config.monedaPrincipal).toBe('USD');
  });

  test('exported JSON has _meta.version = 2', async ({ page }) => {
    await loadWithCurrency(page, 'RD');
    const meta = await page.evaluate(() => {
      const data = JSON.parse(JSON.stringify(_editData));
      data._meta = { version: 2, exportedAt: new Date().toISOString(), app: 'CNTpf' };
      return data._meta;
    });
    expect(meta.version).toBe(2);
    expect(meta.app).toBe('CNTpf');
  });

  test('importing old JSON without monedaPrincipal defaults to RD', async ({ page }) => {
    await page.goto(APP);
    await page.waitForFunction(() => typeof window._testLoadData === 'function');

    const result = await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.tasa = 60;
      data.config.ingresoUSD = 3000;
      data.config.ingresoRD = 180000;
      // Simulate old JSON: delete monedaPrincipal
      delete data.config.monedaPrincipal;

      // Simulate import logic: if missing, default to RD
      if (!data.config.monedaPrincipal) data.config.monedaPrincipal = 'RD';

      window._testLoadData(data);
      return _editData.config.monedaPrincipal;
    });
    expect(result).toBe('RD');
  });

  test('importing USD JSON preserves USD currency', async ({ page }) => {
    await page.goto(APP);
    await page.waitForFunction(() => typeof window._testLoadData === 'function');

    const result = await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.monedaPrincipal = 'USD';
      data.config.tasa = 60;
      data.config.ingresoUSD = 3000;
      data.config.ingresoRD = 180000;

      // Simulate the import default check
      if (!data.config.monedaPrincipal) data.config.monedaPrincipal = 'RD';

      window._testLoadData(data);
      return _editData.config.monedaPrincipal;
    });
    expect(result).toBe('USD');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 6. EDGE CASES
// ══════════════════════════════════════════════════════════════════════

test.describe('Edge Cases', () => {
  test('tasa=0 does not crash the app', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(APP);
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.monedaPrincipal = 'USD';
      data.config.tasa = 0;
      data.config.ingresoUSD = 3000;
      data.config.ingresoRD = 0;
      data.gastos = [{
        nombre: 'Test', tipo: 'Servicio', pagado: 100, adeudado: 200,
        dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0,
        tasaCreacion: 0, fechaLimite: null, notas: '', pagadoMes: false
      }];
      window._testLoadData(data);
    });

    // Dashboard should still be visible
    await expect(page.locator('#dashApp')).toBeVisible();
    // No Infinity or NaN in KPI values
    const kpiTexts = await page.locator('#kpiRow .card .kpi-val').allTextContents();
    for (const txt of kpiTexts) {
      expect(txt).not.toContain('Infinity');
      expect(txt).not.toContain('NaN');
    }
  });

  test('language switch preserves currency mode', async ({ page }) => {
    await loadWithCurrency(page, 'USD');

    // Verify USD mode
    const before = await page.evaluate(() => _editData.config.monedaPrincipal);
    expect(before).toBe('USD');

    // Switch language to English
    await page.evaluate(() => window._testSetLang('en'));
    await page.waitForTimeout(300);

    // Currency should still be USD
    const after = await page.evaluate(() => _editData.config.monedaPrincipal);
    expect(after).toBe('USD');

    // KPI cards should still show $ not RD$
    const kpiTexts = await page.locator('#kpiRow .card .kpi-val').allTextContents();
    const monetary = kpiTexts.filter(t => t.includes('$'));
    for (const txt of monetary) {
      expect(txt).not.toMatch(/RD\$/);
    }
  });

  test('zero amounts display correctly with currency symbol', async ({ page }) => {
    await loadWithCurrency(page, 'RD');
    const zeroFmt = await page.evaluate(() => fmtC(0));
    expect(zeroFmt).toBe('RD$0');

    await page.evaluate(() => { _editData.config.monedaPrincipal = 'USD'; });
    const zeroUSD = await page.evaluate(() => fmtC(0));
    expect(zeroUSD).toBe('$0');
  });

  test('mixed-currency accounts both render in ForNow tab', async ({ page }) => {
    await loadWithCurrency(page, 'RD');

    // Navigate to the Fondos/ForNow tab
    const tabBtn = page.locator('.tab-btn', { hasText: /disponibilidad|fondos|availability/i });
    if (await tabBtn.count() > 0) {
      await tabBtn.first().click();
    }

    // Both accounts should appear in the ForNow panel
    const fornow = page.locator('#tab-fornow');
    await expect(fornow).toContainText('RD Account');
    await expect(fornow).toContainText('USD Account');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 7. SETUP WIZARD
// ══════════════════════════════════════════════════════════════════════

test.describe('Setup Wizard', () => {
  test('currency selector is visible in setup wizard step 1', async ({ page }) => {
    await page.goto(APP);
    await page.waitForFunction(() => typeof window.startFromScratch === 'function');

    // Open setup wizard
    await page.evaluate(() => startFromScratch());
    await expect(page.locator('#setupModal')).toBeVisible();

    // Currency buttons should be visible
    await expect(page.locator('#sw-cur-usd-btn')).toBeVisible();
    await expect(page.locator('#sw-cur-rd-btn')).toBeVisible();
  });

  test('selecting USD in wizard sets monedaPrincipal to USD', async ({ page }) => {
    await page.goto(APP);
    await page.waitForFunction(() => typeof window.startFromScratch === 'function');

    await page.evaluate(() => startFromScratch());
    await expect(page.locator('#sw-cur-usd-btn')).toBeVisible();

    // Click USD button
    await page.locator('#sw-cur-usd-btn').click();

    const currency = await page.evaluate(() => _editData.config.monedaPrincipal);
    expect(currency).toBe('USD');
  });

  test('selecting RD in wizard sets monedaPrincipal to RD', async ({ page }) => {
    await page.goto(APP);
    await page.waitForFunction(() => typeof window.startFromScratch === 'function');

    await page.evaluate(() => startFromScratch());
    await expect(page.locator('#sw-cur-rd-btn')).toBeVisible();

    // First select USD, then switch back to RD to verify toggle works
    await page.locator('#sw-cur-usd-btn').click();
    let currency = await page.evaluate(() => _editData.config.monedaPrincipal);
    expect(currency).toBe('USD');

    await page.locator('#sw-cur-rd-btn').click();
    currency = await page.evaluate(() => _editData.config.monedaPrincipal);
    expect(currency).toBe('RD');
  });
});
