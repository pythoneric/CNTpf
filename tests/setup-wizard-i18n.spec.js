const { test, expect } = require('@playwright/test');

/**
 * Setup wizard — full i18n coverage
 *
 * The "Empezar desde cero" flow used to have several hardcoded Spanish
 * strings that never translated when the user toggled language: the modal
 * header ("Configuración inicial" + sub), step 3 gasto-row labels (CUOTA/MES,
 * DÍA DE PAGO, TASA %, BALANCE TOTAL, Descripción placeholder, tipo dropdown
 * options), step 4 fondo placeholders (Balance actual, Meta mínima), step 3
 * and 4 hints, and the step 5 summary table + closing checklist.
 *
 * This spec walks every step in both languages and locks the fix.
 */

async function openWizard(page, lang) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testSetupGoToStep === 'function');
  await page.evaluate((l) => window._testSetLang(l), lang);
  await page.evaluate(() => {
    _editData = window.defaultEditData();
    document.getElementById('loaderScreen').style.display = 'none';
    document.getElementById('setupModal').style.display = 'flex';
  });
}

async function gotoStep(page, idx) {
  await page.evaluate((i) => window._testSetupGoToStep(i), idx);
}

// ───────────────────────────────────────────────────────────────────
// 1. Modal header
// ───────────────────────────────────────────────────────────────────
test.describe('Setup modal header — translates to selected language', () => {
  test('Spanish: header reads "Configuración inicial"', async ({ page }) => {
    await openWizard(page, 'es');
    const title = await page.locator('#setupModal [data-i18n="setup_title"]').textContent();
    const sub = await page.locator('#setupModal [data-i18n="setup_sub"]').textContent();
    expect(title).toBe('Configuración inicial');
    expect(sub).toBe('Completa estos pasos para generar tu dashboard');
  });

  test('English: header reads "Initial Setup"', async ({ page }) => {
    await openWizard(page, 'en');
    const title = await page.locator('#setupModal [data-i18n="setup_title"]').textContent();
    const sub = await page.locator('#setupModal [data-i18n="setup_sub"]').textContent();
    expect(title).toBe('Initial Setup');
    expect(sub).toBe('Complete these steps to generate your dashboard');
  });

  test('Header flips when language toggled while wizard is open', async ({ page }) => {
    await openWizard(page, 'es');
    expect(await page.locator('[data-i18n="setup_title"]').textContent()).toBe('Configuración inicial');
    await page.evaluate(() => toggleLang());
    expect(await page.locator('[data-i18n="setup_title"]').textContent()).toBe('Initial Setup');
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Step 3 — gasto row labels translate
// ───────────────────────────────────────────────────────────────────
test.describe('Setup step 3 — gasto row labels translate', () => {
  test('Spanish: column labels show "CUOTA/MES", "DÍA DE PAGO", "TASA %", "BALANCE TOTAL"', async ({ page }) => {
    await openWizard(page, 'es');
    await gotoStep(page, 2);
    const cellTexts = await page.locator('#sw-gastos-list .sw-gasto-row > div:nth-child(2) > div > div').allTextContents();
    expect(cellTexts.join(' | ')).toContain('CUOTA/MES');
    expect(cellTexts.join(' | ')).toContain('DÍA DE PAGO');
    expect(cellTexts.join(' | ')).toContain('TASA %');
    expect(cellTexts.join(' | ')).toContain('BALANCE TOTAL');
  });

  test('English: column labels show "PAYMENT/MO", "PAY DAY", "RATE %", "TOTAL BALANCE"', async ({ page }) => {
    await openWizard(page, 'en');
    await gotoStep(page, 2);
    const cellTexts = await page.locator('#sw-gastos-list .sw-gasto-row > div:nth-child(2) > div > div').allTextContents();
    expect(cellTexts.join(' | ')).toContain('PAYMENT/MO');
    expect(cellTexts.join(' | ')).toContain('PAY DAY');
    expect(cellTexts.join(' | ')).toContain('RATE %');
    expect(cellTexts.join(' | ')).toContain('TOTAL BALANCE');
  });

  test('English: tipo dropdown options are translated (Préstamo → Loan etc)', async ({ page }) => {
    await openWizard(page, 'en');
    await gotoStep(page, 2);
    const opts = await page.evaluate(() => {
      const sel = document.querySelector('#sw-gastos-list .sw-g-tipo');
      return Array.from(sel.options).map(o => ({ value: o.value, text: o.textContent }));
    });
    // Storage value stays Spanish for data compat
    expect(opts.find(o => o.value === 'Préstamo')).toBeTruthy();
    expect(opts.find(o => o.value === 'Educación')).toBeTruthy();
    // Display text is English
    expect(opts.find(o => o.text === 'Loan')).toBeTruthy();
    expect(opts.find(o => o.text === 'Education')).toBeTruthy();
    expect(opts.find(o => o.text === 'Housing')).toBeTruthy();
    expect(opts.find(o => o.text === 'Credit Card')).toBeTruthy();
  });

  test('Spanish: tipo dropdown options match storage values verbatim', async ({ page }) => {
    await openWizard(page, 'es');
    await gotoStep(page, 2);
    const opts = await page.evaluate(() => {
      const sel = document.querySelector('#sw-gastos-list .sw-g-tipo');
      return Array.from(sel.options).map(o => ({ value: o.value, text: o.textContent }));
    });
    // In Spanish, value === text (canonical = display)
    for (const o of opts) {
      expect(o.text).toBe(o.value);
    }
  });

  test('Step 3 hint text translates', async ({ page }) => {
    await openWizard(page, 'en');
    await gotoStep(page, 2);
    const content = await page.locator('#setupContent').innerText();
    expect(content).toContain('Add at least your main commitments');
    await page.evaluate(() => window._testSetLang('es'));
    await page.evaluate(() => window._testSetupGoToStep(2));
    const contentEs = await page.locator('#setupContent').innerText();
    expect(contentEs).toContain('Agrega al menos tus compromisos');
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Step 4 — fondo placeholders + hint
// ───────────────────────────────────────────────────────────────────
test.describe('Setup step 4 — fondo placeholders + hint translate', () => {
  test('English: fondo balance/meta placeholders are translated', async ({ page }) => {
    await openWizard(page, 'en');
    await gotoStep(page, 3);
    const balance = await page.locator('#sw-fondos-list .sw-f-balance').first().getAttribute('placeholder');
    const meta = await page.locator('#sw-fondos-list .sw-f-meta').first().getAttribute('placeholder');
    expect(balance).toBe('Current balance');
    expect(meta).toBe('Minimum goal');
  });

  test('Spanish: fondo balance/meta placeholders read "Balance actual" / "Meta mínima"', async ({ page }) => {
    await openWizard(page, 'es');
    await gotoStep(page, 3);
    const balance = await page.locator('#sw-fondos-list .sw-f-balance').first().getAttribute('placeholder');
    const meta = await page.locator('#sw-fondos-list .sw-f-meta').first().getAttribute('placeholder');
    expect(balance).toBe('Balance actual');
    expect(meta).toBe('Meta mínima');
  });

  test('Step 4 hint text translates', async ({ page }) => {
    await openWizard(page, 'en');
    await gotoStep(page, 3);
    const content = await page.locator('#setupContent').innerText();
    expect(content).toContain('Optional');
    expect(content).toContain('emergency funds');
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Step 5 — summary table labels + closing checklist
// ───────────────────────────────────────────────────────────────────
test.describe('Setup step 5 — summary translates', () => {
  test('English: summary labels show Period / Exchange Rate / Income / etc', async ({ page }) => {
    await openWizard(page, 'en');
    await gotoStep(page, 4);
    const text = await page.locator('#setupContent').innerText();
    expect(text).toContain('Period');
    expect(text).toContain('Exchange Rate');
    expect(text).toContain('Income');
    expect(text).toContain('Expenses/Payments');
    expect(text).toContain('Accounts');
    expect(text).toContain('Emergency funds');
    // Closing checklist
    expect(text).toContain('On confirm:');
    expect(text).toContain('Dashboard launches');
    expect(text).toContain('Data stays saved locally');
  });

  test('Spanish: summary labels show Período / Tasa Dólar / Ingreso / etc', async ({ page }) => {
    await openWizard(page, 'es');
    await gotoStep(page, 4);
    const text = await page.locator('#setupContent').innerText();
    expect(text).toContain('Período');
    expect(text).toContain('Tasa Dólar');
    expect(text).toContain('Ingreso');
    expect(text).toContain('Gastos/Cuotas');
    expect(text).toContain('Fondos emergencia');
    expect(text).toContain('Al confirmar:');
    expect(text).toContain('Los datos quedan guardados');
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Live language toggle while wizard is open re-renders dynamic content
// ───────────────────────────────────────────────────────────────────
test.describe('toggleLang re-renders the open wizard', () => {
  test('switching to English on step 3 updates dynamic gasto labels', async ({ page }) => {
    await openWizard(page, 'es');
    await gotoStep(page, 2);
    expect(await page.locator('#setupContent').innerText()).toContain('DÍA DE PAGO');
    await page.evaluate(() => toggleLang());
    expect(await page.locator('#setupContent').innerText()).toContain('PAY DAY');
  });

  test('switching back to Spanish on step 5 re-renders the closing checklist', async ({ page }) => {
    await openWizard(page, 'en');
    await gotoStep(page, 4);
    expect(await page.locator('#setupContent').innerText()).toContain('Dashboard launches');
    await page.evaluate(() => toggleLang());
    expect(await page.locator('#setupContent').innerText()).toContain('Se lanza el dashboard');
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. tipoLabel helper — direct unit test
// ───────────────────────────────────────────────────────────────────
test.describe('tipoLabel helper', () => {
  test('strips accents and resolves canonical Spanish tipos to translated labels', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof tipoLabel === 'function');
    const r = await page.evaluate(() => {
      window._testSetLang('en');
      return ['Fijo','Variable','Préstamo','Tarjeta','Educación','Vivienda','Familiar']
        .map(tp => tipoLabel(tp));
    });
    expect(r).toEqual(['Fixed','Variable','Loan','Credit Card','Education','Housing','Family']);
  });

  test('falls back to the raw tipo when no translation key matches', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof tipoLabel === 'function');
    const r = await page.evaluate(() => tipoLabel('TipoCustom'));
    expect(r).toBe('TipoCustom');
  });
});
