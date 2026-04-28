const { test, expect } = require('@playwright/test');

/**
 * Setup wizard step 2 — prominent Mi Saldo prompt + auto-default
 *
 * The "Mi Saldo principal" radio existed before, tucked next to the tipo
 * dropdown — easy to miss. Users finishing the wizard without ticking it
 * had to find the setting later in the dashboard. This spec locks the new
 * behavior:
 *
 *   1. Step 2 shows a green prompt card explaining what "Mi Saldo" is and
 *      that you can pick which account holds it.
 *   2. The radio label is now a pill-shaped chip ("💵 Mi Saldo principal")
 *      that highlights with a green background when selected.
 *   3. If the user advances without picking any account as wallet but has
 *      added at least one account, save() auto-defaults to the first
 *      'cash'-tipo account (or the first account if none is cash) and
 *      promotes its tipo to 'cash'.
 *   4. The prompt translates to English with the rest of the wizard.
 */

async function openStep2(page, lang) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testSetupGoToStep === 'function');
  await page.evaluate((l) => window._testSetLang(l), lang);
  await page.evaluate(() => {
    _editData = window.defaultEditData();
    document.getElementById('loaderScreen').style.display = 'none';
    document.getElementById('setupModal').style.display = 'flex';
    window._testSetupGoToStep(1);
  });
}

// ───────────────────────────────────────────────────────────────────
// 1. Prompt visibility + i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Step 2 — wallet prompt is prominent + i18n-aware', () => {
  test('Spanish: prompt card shows the green title and the explanation', async ({ page }) => {
    await openStep2(page, 'es');
    const prompt = page.locator('#sw-wallet-prompt');
    await expect(prompt).toBeVisible();
    const text = await prompt.innerText();
    expect(text).toContain('💵');
    expect(text).toContain('Mi Saldo');
    expect(text).toContain('efectivo del día a día');
  });

  test('English: prompt card translates to "Which one is your My Balance?"', async ({ page }) => {
    await openStep2(page, 'en');
    const prompt = page.locator('#sw-wallet-prompt');
    await expect(prompt).toBeVisible();
    const text = await prompt.innerText();
    expect(text).toContain('💵');
    expect(text).toContain('My Balance');
    expect(text).toContain('daily cash');
  });

  test('Toggling language while on step 2 swaps the prompt copy', async ({ page }) => {
    await openStep2(page, 'es');
    expect(await page.locator('#sw-wallet-prompt').innerText()).toContain('Mi Saldo');
    await page.evaluate(() => toggleLang());
    expect(await page.locator('#sw-wallet-prompt').innerText()).toContain('My Balance');
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Radio label is a visible pill
// ───────────────────────────────────────────────────────────────────
test.describe('Step 2 — wallet radio label as pill', () => {
  test('label has the new sw-wallet-radio-label class with chip styling', async ({ page }) => {
    await openStep2(page, 'es');
    const lbl = page.locator('#sw-cuentas-list .sw-wallet-radio-label').first();
    await expect(lbl).toBeVisible();
    expect(await lbl.innerText()).toContain('💵');
    expect(await lbl.innerText()).toContain('Mi Saldo principal');
  });

  test('selecting the radio gives the label a green background', async ({ page }) => {
    await openStep2(page, 'es');
    // Type a name so swSetDefaultCash has a stable cuentaId to target
    await page.fill('#sw-cuentas-list .sw-cnt-nombre', 'Banco Popular');
    const row = page.locator('#sw-cuentas-list .sw-cuenta-row').first();
    const id = await row.getAttribute('data-cuenta-id');
    await page.evaluate((cid) => swSetDefaultCash(cid), id);
    const bg = await page.locator('#sw-cuentas-list .sw-wallet-radio-label')
      .first().evaluate(el => el.style.background);
    expect(bg).toContain('rgba(34, 211, 160');
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Auto-default in save() when nothing is picked
// ───────────────────────────────────────────────────────────────────
test.describe('Step 2 save() — auto-default to first account if no radio picked', () => {
  test('one account, no radio picked → that account becomes the wallet', async ({ page }) => {
    await openStep2(page, 'es');
    await page.fill('#sw-cuentas-list .sw-cnt-nombre', 'Banco Popular');
    await page.fill('#sw-cuentas-list .sw-cnt-saldo', '5000');
    // Save step 2 without selecting a radio
    await page.evaluate(() => window._testSetupSave(1));
    const r = await page.evaluate(() => ({
      defaultId: _editData.config.defaultCashAccountId,
      cuentas: _editData.forNow.cuentas.map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })),
    }));
    expect(r.cuentas).toHaveLength(1);
    expect(r.defaultId).toBe(r.cuentas[0].id);
    // The auto-default also promotes tipo to 'cash'
    expect(r.cuentas[0].tipo).toBe('cash');
  });

  test('multiple accounts, no radio picked → the first cash-tipo wins', async ({ page }) => {
    await openStep2(page, 'es');
    // First row: bank
    await page.fill('#sw-cuentas-list .sw-cnt-nombre', 'Banco Popular');
    await page.fill('#sw-cuentas-list .sw-cnt-saldo', '5000');
    // Add a 'cash'-tipo row
    await page.evaluate(() => addSwCuenta());
    const rows = page.locator('#sw-cuentas-list .sw-cuenta-row');
    await rows.nth(1).locator('.sw-cnt-nombre').fill('Efectivo');
    await rows.nth(1).locator('.sw-cnt-saldo').fill('1000');
    await rows.nth(1).locator('.sw-cnt-tipo').selectOption('cash');
    await page.evaluate(() => window._testSetupSave(1));
    const r = await page.evaluate(() => {
      const defaultId = _editData.config.defaultCashAccountId;
      const target = _editData.forNow.cuentas.find(c => c.id === defaultId);
      return { defaultId, target };
    });
    expect(r.target.nombre).toBe('Efectivo');
    expect(r.target.tipo).toBe('cash');
  });

  test('user explicitly picks → save respects the choice over the auto-default', async ({ page }) => {
    await openStep2(page, 'es');
    await page.fill('#sw-cuentas-list .sw-cnt-nombre', 'Banco Popular');
    await page.fill('#sw-cuentas-list .sw-cnt-saldo', '5000');
    await page.evaluate(() => addSwCuenta());
    const rows = page.locator('#sw-cuentas-list .sw-cuenta-row');
    await rows.nth(1).locator('.sw-cnt-nombre').fill('Efectivo');
    await rows.nth(1).locator('.sw-cnt-saldo').fill('1000');
    // Pick the FIRST row (Banco) explicitly even though Efectivo would be the auto-pick
    const firstId = await rows.nth(0).getAttribute('data-cuenta-id');
    await page.evaluate((cid) => swSetDefaultCash(cid), firstId);
    await rows.nth(0).locator('.sw-cnt-default').check();
    await page.evaluate(() => window._testSetupSave(1));
    const target = await page.evaluate(() => {
      const id = _editData.config.defaultCashAccountId;
      return _editData.forNow.cuentas.find(c => c.id === id);
    });
    expect(target.nombre).toBe('Banco Popular');
  });

  test('zero accounts saved → defaultCashAccountId stays null', async ({ page }) => {
    await openStep2(page, 'es');
    // Don't fill any name — save() skips empty rows
    await page.evaluate(() => window._testSetupSave(1));
    const r = await page.evaluate(() => ({
      cuentas: _editData.forNow.cuentas.length,
      defaultId: _editData.config.defaultCashAccountId,
    }));
    expect(r.cuentas).toBe(0);
    expect(r.defaultId).toBeNull();
  });
});
