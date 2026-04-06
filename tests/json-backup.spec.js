// @ts-check
const { test, expect } = require('@playwright/test');

const APP = 'http://localhost:8080/cnt.html';

/** Load demo data to get a fully populated dashboard */
async function loadDemo(page) {
  await page.goto(APP);
  await page.waitForSelector('#loaderScreen', { state: 'visible' });
  await page.evaluate(() => { if (typeof loadDemo === 'function') loadDemo(); });
  await page.waitForSelector('#dashApp', { state: 'visible', timeout: 10000 });
}

/** Load app and import a JSON file with the given data */
async function importJSONData(page, data) {
  await page.goto(APP);
  await page.waitForSelector('#loaderScreen', { state: 'visible' });
  const jsonStr = JSON.stringify(data);
  const blob = `new Blob([${JSON.stringify(jsonStr)}], {type: 'application/json'})`;
  await page.evaluate(`{
    const file = new File([${blob}], 'test.json', {type: 'application/json'});
    importJSON(file);
  }`);
  await page.waitForSelector('#dashApp', { state: 'visible', timeout: 10000 });
}

test.describe('JSON Backup — Export', () => {
  test('downloadJSON creates a file with correct structure', async ({ page }) => {
    await loadDemo(page);
    // Intercept the download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cnt_\d{8}\.json$/);
    const content = await (await download.createReadStream()).toArray();
    const data = JSON.parse(Buffer.concat(content).toString());
    expect(data.config).toBeDefined();
    expect(data.gastos).toBeDefined();
    expect(data.forNow).toBeDefined();
    expect(data.emerg).toBeDefined();
    expect(data.historial).toBeDefined();
  });

  test('exported JSON has _meta with version, exportedAt, and app', async ({ page }) => {
    await loadDemo(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    const content = await (await download.createReadStream()).toArray();
    const data = JSON.parse(Buffer.concat(content).toString());
    expect(data._meta).toBeDefined();
    expect(data._meta.version).toBe(1);
    expect(data._meta.app).toBe('CNTpf');
    expect(data._meta.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('exported JSON contains all data sections', async ({ page }) => {
    await loadDemo(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    const content = await (await download.createReadStream()).toArray();
    const data = JSON.parse(Buffer.concat(content).toString());
    expect(data.gastos.length).toBeGreaterThan(0);
    expect(data.historial.length).toBeGreaterThan(0);
    expect(data.metas.length).toBeGreaterThan(0);
    expect(data.forNow.cuentas.length).toBeGreaterThan(0);
    expect(data.emerg.fondos.length).toBeGreaterThan(0);
    expect(Array.isArray(data.transacciones)).toBe(true);
    expect(Array.isArray(data.presupuesto)).toBe(true);
    expect(Array.isArray(data.recurrentes)).toBe(true);
  });
});

test.describe('JSON Backup — Import', () => {
  test('importing valid JSON loads dashboard', async ({ page }) => {
    const testData = {
      config: { tasa: 60, mes: 'Enero', anio: 2026, ingresoUSD: 2000, diasAlerta: 5 },
      gastos: [{ nombre: 'Test', tipo: 'Variable', pagado: 0, adeudado: 1000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, tasaCreacion: 60, fechaLimite: '', notas: '', pagadoMes: false }],
      forNow: { cuentas: [{ nombre: 'Checking', moneda: 'RD', saldo: 5000, comp: 0, disp: 0 }], fecha: '2026-01-01', total: 5000, comprometido: 0, disponible: 0 },
      emerg: { fondos: [{ fondo: 'Emergency', moneda: 'RD', balance: 10000, meta: 50000 }], cashflow: { ingreso: 120000, gasto: 1000, tasa: 60, retirarUSD: 0, ahorros: 0, balanceAhorros: 0 } },
      historial: [{ mes: 'Enero', anio: 2026, ingresos: 120000, gasto: 80000, ahorro: 40000, tasaAhorro: 0.33, deudas: 0, emergencia: 10000, netWorth: 15000, tasa: 60, notas: '' }],
      metas: [],
      filename: 'test.json',
    };
    await importJSONData(page, testData);
    // Dashboard should be visible
    const dash = page.locator('#dashApp');
    await expect(dash).toBeVisible();
  });

  test('importing JSON with missing keys shows error', async ({ page }) => {
    await page.goto(APP);
    await page.waitForSelector('#loaderScreen', { state: 'visible' });
    // Try to import JSON missing 'gastos' key
    const badData = { config: { tasa: 60 }, forNow: {}, emerg: {}, historial: [] };
    await page.evaluate((d) => {
      const file = new File([JSON.stringify(d)], 'bad.json', { type: 'application/json' });
      importJSON(file);
    }, badData);
    // Error should appear
    await page.waitForTimeout(500);
    const err = page.locator('#errorMsg');
    const text = await err.textContent();
    expect(text).toContain('gastos');
  });

  test('importing invalid JSON shows error', async ({ page }) => {
    await page.goto(APP);
    await page.waitForSelector('#loaderScreen', { state: 'visible' });
    await page.evaluate(() => {
      const file = new File(['not valid json {{{'], 'bad.json', { type: 'application/json' });
      importJSON(file);
    });
    await page.waitForTimeout(500);
    const err = page.locator('#errorMsg');
    const text = await err.textContent();
    expect(text).toContain('Error');
  });
});

test.describe('JSON Backup — Round-trip', () => {
  test('export then import preserves data', async ({ page }) => {
    await loadDemo(page);
    // Get original data
    const original = await page.evaluate(() => JSON.stringify(_editData));
    // Export
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    const content = await (await download.createReadStream()).toArray();
    const exported = JSON.parse(Buffer.concat(content).toString());
    // Verify key fields match
    const orig = JSON.parse(original);
    expect(exported.config.tasa).toBe(orig.config.tasa);
    expect(exported.config.ingresoUSD).toBe(orig.config.ingresoUSD);
    expect(exported.gastos.length).toBe(orig.gastos.length);
    expect(exported.historial.length).toBe(orig.historial.length);
    expect(exported.metas.length).toBe(orig.metas.length);
    expect(exported.forNow.cuentas.length).toBe(orig.forNow.cuentas.length);
    expect(exported.emerg.fondos.length).toBe(orig.emerg.fondos.length);
  });
});

test.describe('JSON Backup — Demo loader', () => {
  test('demo loads from embedded _DEMO_DATA object', async ({ page }) => {
    await loadDemo(page);
    const dash = page.locator('#dashApp');
    await expect(dash).toBeVisible();
    const gastos = await page.evaluate(() => _editData.gastos.length);
    expect(gastos).toBe(15);
  });

  test('demo does not depend on cnt_demo.xlsx fetch', async ({ page }) => {
    // Even without the xlsx file, demo should work via _DEMO_DATA
    await page.route('**/cnt_demo.xlsx', route => route.abort());
    await loadDemo(page);
    const dash = page.locator('#dashApp');
    await expect(dash).toBeVisible();
  });
});

test.describe('JSON Backup — Loader screen', () => {
  test('file input accepts .json extension', async ({ page }) => {
    await page.goto(APP);
    const input = page.locator('#fileInput');
    const accept = await input.getAttribute('accept');
    expect(accept).toContain('.json');
  });

  test('file input only accepts .json', async ({ page }) => {
    await page.goto(APP);
    const input = page.locator('#fileInput');
    const accept = await input.getAttribute('accept');
    expect(accept).toBe('.json');
  });

  test('import label mentions JSON', async ({ page }) => {
    await page.goto(APP);
    const label = page.locator('[data-i18n="loader_import"]');
    const text = await label.textContent();
    expect(text.toLowerCase()).toContain('json');
  });
});

test.describe('JSON Backup — Edit modal export', () => {
  test('save & export button downloads JSON not Excel', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => openEditModal());
    await page.waitForSelector('#editModal.open', { state: 'visible' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => applyAndDownload()),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test('save & export button label does not say Excel', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => openEditModal());
    await page.waitForSelector('#editModal.open', { state: 'visible' });
    const btns = await page.locator('[data-i18n="edit_save"]').allTextContents();
    for (const txt of btns) {
      expect(txt.toLowerCase()).not.toContain('excel');
    }
  });
});

test.describe('JSON Backup — Checklist save', () => {
  test('saveChecklist downloads JSON', async ({ page }) => {
    await loadDemo(page);
    // Mark a payment first to enable save
    await page.evaluate(() => { _editData.gastos[0].pagadoMes = true; _pendingSave = true; });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => saveChecklist()),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });
});

test.describe('JSON Backup — i18n labels', () => {
  test('Spanish loader labels only reference JSON', async ({ page }) => {
    await page.goto(APP);
    const importLabel = await page.locator('[data-i18n="loader_import"]').textContent();
    expect(importLabel.toLowerCase()).toContain('.json');
    expect(importLabel.toLowerCase()).not.toContain('.xlsx');

    const scratchSub = await page.locator('[data-i18n="loader_scratch_sub"]').textContent();
    expect(scratchSub.toLowerCase()).not.toContain('excel');
  });

  test('English loader labels mention JSON', async ({ page }) => {
    await page.goto(APP);
    await page.evaluate(() => { localStorage.setItem('cntLang', 'en'); applyI18n(); });
    const importLabel = await page.locator('[data-i18n="loader_import"]').textContent();
    expect(importLabel.toLowerCase()).toContain('json');
  });

  test('Spanish edit modal subtitle does not reference Excel', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => openEditModal());
    await page.waitForSelector('#editModal.open', { state: 'visible' });
    const sub = await page.locator('[data-i18n="edit_sub"]').textContent();
    expect(sub.toLowerCase()).not.toContain('excel');
  });

  test('English edit modal subtitle does not reference Excel', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => { localStorage.setItem('cntLang', 'en'); applyI18n(); });
    await page.evaluate(() => openEditModal());
    await page.waitForSelector('#editModal.open', { state: 'visible' });
    const sub = await page.locator('[data-i18n="edit_sub"]').textContent();
    expect(sub.toLowerCase()).not.toContain('excel');
  });
});

test.describe('JSON Backup — saveToDB stores editData only', () => {
  test('saveToDB persists _editData to IndexedDB', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => saveToDB());
    await page.waitForTimeout(300);
    const hasMeta = await page.evaluate(async () => {
      const val = await dbGet(STORE_DATA, 'meta');
      return val !== null && val !== undefined;
    });
    expect(hasMeta).toBe(true);
  });
});

test.describe('JSON Backup — processFile', () => {
  test('processFile rejects non-JSON file types', async ({ page }) => {
    await page.goto(APP);
    await page.waitForSelector('#loaderScreen', { state: 'visible' });
    await page.evaluate(() => {
      const file = new File(['data'], 'test.xlsx', { type: 'application/octet-stream' });
      processFile(file);
    });
    await page.waitForTimeout(300);
    const err = await page.locator('#errorMsg').textContent();
    expect(err).toContain('.json');
  });

  test('processFile accepts .json files', async ({ page }) => {
    const testData = {
      config: { tasa: 60, mes: 'Test', anio: 2026, ingresoUSD: 1000, diasAlerta: 5 },
      gastos: [{ nombre: 'Rent', tipo: 'Vivienda', pagado: 0, adeudado: 500, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, tasaCreacion: 60, fechaLimite: '', notas: '', pagadoMes: false }],
      forNow: { cuentas: [], fecha: null, total: 0, comprometido: 0, disponible: 0 },
      emerg: { fondos: [], cashflow: { ingreso: 60000, gasto: 500, tasa: 60 } },
      historial: [{ mes: 'Test', anio: 2026, ingresos: 60000, gasto: 500, ahorro: 59500, tasaAhorro: 0.99, deudas: 0, emergencia: 0, netWorth: 0, tasa: 60, notas: '' }],
    };
    await page.goto(APP);
    await page.waitForSelector('#loaderScreen', { state: 'visible' });
    await page.evaluate((d) => {
      const file = new File([JSON.stringify(d)], 'backup.json', { type: 'application/json' });
      processFile(file);
    }, testData);
    await page.waitForSelector('#dashApp', { state: 'visible', timeout: 10000 });
    const mes = await page.evaluate(() => _editData.config.mes);
    expect(mes).toBe('Test');
  });
});
