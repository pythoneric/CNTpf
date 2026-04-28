const { test, expect } = require('@playwright/test');

/**
 * Cierre wizard step 8 — next-month auto-calculation
 *
 * config.mes is canonically stored in Spanish (defaultEditData seeds Spanish
 * names, the setup wizard hardcodes Spanish in step 1). When the user is in
 * English mode and opens cierre, the step-8 auto-calc used to look up the
 * current month in LANG.en.months — which never matches the Spanish-stored
 * value, so the lookup fell through to index 0 and silently suggested
 * January + (year+1) for ANY current month. This spec locks the language-
 * agnostic lookup + correct year-rollover behavior.
 */

async function loadAppWithConfig(page, opts) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate((opts) => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.mes = opts.mes;
    data.config.anio = opts.anio;
    data.config.monedaPrincipal = 'RD';
    data.forNow.cuentas = [
      { id: 'cnt_a', nombre: 'Banco', moneda: 'RD', saldo: 1000, tipo: 'banco', comp: 0, disp: 0 },
    ];
    window._testLoadData(data);
  }, opts);
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

async function jumpToCierreStep8(page, lang) {
  await page.evaluate((l) => window._testSetLang(l), lang);
  await page.evaluate(() => {
    openCierre();
    _cierreStep = 7;
    _cierreNextMes = '';
    _cierreNextAnio = 0;
    renderCierre();
  });
}

async function readNextMonthInputs(page) {
  return page.evaluate(() => ({
    mes: document.getElementById('cw-nextmes')?.value,
    anio: parseInt(document.getElementById('cw-nextanio')?.value) || null,
  }));
}

// ───────────────────────────────────────────────────────────────────
// 1. Spanish mode + Spanish-stored mes (canonical happy path)
// ───────────────────────────────────────────────────────────────────
test.describe('Step 8 in Spanish mode', () => {
  test('Marzo 2026 → suggests Abril 2026', async ({ page }) => {
    await loadAppWithConfig(page, { mes: 'Marzo', anio: 2026 });
    await jumpToCierreStep8(page, 'es');
    expect(await readNextMonthInputs(page)).toEqual({ mes: 'Abril', anio: 2026 });
  });

  test('Diciembre 2026 → suggests Enero 2027 (year +1)', async ({ page }) => {
    await loadAppWithConfig(page, { mes: 'Diciembre', anio: 2026 });
    await jumpToCierreStep8(page, 'es');
    expect(await readNextMonthInputs(page)).toEqual({ mes: 'Enero', anio: 2027 });
  });

  test('Abril 2026 → suggests Mayo 2026 (year unchanged)', async ({ page }) => {
    await loadAppWithConfig(page, { mes: 'Abril', anio: 2026 });
    await jumpToCierreStep8(page, 'es');
    expect(await readNextMonthInputs(page)).toEqual({ mes: 'Mayo', anio: 2026 });
  });

  test('Noviembre 2026 → suggests Diciembre 2026 (no rollover until December)', async ({ page }) => {
    await loadAppWithConfig(page, { mes: 'Noviembre', anio: 2026 });
    await jumpToCierreStep8(page, 'es');
    expect(await readNextMonthInputs(page)).toEqual({ mes: 'Diciembre', anio: 2026 });
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. English mode + Spanish-stored mes (the reported bug)
// ───────────────────────────────────────────────────────────────────
test.describe('Step 8 in English mode with Spanish-stored mes (regression)', () => {
  test('Marzo 2026 → suggests April 2026 (NOT January 2027)', async ({ page }) => {
    await loadAppWithConfig(page, { mes: 'Marzo', anio: 2026 });
    await jumpToCierreStep8(page, 'en');
    expect(await readNextMonthInputs(page)).toEqual({ mes: 'April', anio: 2026 });
  });

  test('Diciembre 2026 → suggests January 2027 (year rollover)', async ({ page }) => {
    await loadAppWithConfig(page, { mes: 'Diciembre', anio: 2026 });
    await jumpToCierreStep8(page, 'en');
    expect(await readNextMonthInputs(page)).toEqual({ mes: 'January', anio: 2027 });
  });

  test('Abril 2026 → suggests May 2026', async ({ page }) => {
    await loadAppWithConfig(page, { mes: 'Abril', anio: 2026 });
    await jumpToCierreStep8(page, 'en');
    expect(await readNextMonthInputs(page)).toEqual({ mes: 'May', anio: 2026 });
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. English mode + English-stored mes (after a prior cierre saved EN)
// ───────────────────────────────────────────────────────────────────
test.describe('Step 8 in English mode with English-stored mes', () => {
  test('March 2026 → suggests April 2026', async ({ page }) => {
    await loadAppWithConfig(page, { mes: 'March', anio: 2026 });
    await jumpToCierreStep8(page, 'en');
    expect(await readNextMonthInputs(page)).toEqual({ mes: 'April', anio: 2026 });
  });

  test('December 2026 → suggests January 2027', async ({ page }) => {
    await loadAppWithConfig(page, { mes: 'December', anio: 2026 });
    await jumpToCierreStep8(page, 'en');
    expect(await readNextMonthInputs(page)).toEqual({ mes: 'January', anio: 2027 });
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Edge cases
// ───────────────────────────────────────────────────────────────────
test.describe('Step 8 edge cases', () => {
  test('Unknown mes string falls through to January with year unchanged', async ({ page }) => {
    // If config.mes is corrupted to something not in either language array,
    // we suggest January and DO NOT roll the year (no rollover happened).
    await loadAppWithConfig(page, { mes: 'Garbage', anio: 2026 });
    await jumpToCierreStep8(page, 'es');
    const r = await readNextMonthInputs(page);
    expect(r.mes).toBe('Enero');
    expect(r.anio).toBe(2026); // year unchanged because curIdx !== 11
  });

  test('Year rollover only happens when current month is December (curIdx === 11)', async ({ page }) => {
    // Property check: walk all 12 Spanish months, only Diciembre triggers +1
    const cases = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    for (const mes of cases) {
      await loadAppWithConfig(page, { mes, anio: 2026 });
      await jumpToCierreStep8(page, 'es');
      const r = await readNextMonthInputs(page);
      const expectedYear = mes === 'Diciembre' ? 2027 : 2026;
      expect(r.anio, `month=${mes}`).toBe(expectedYear);
    }
  });
});
