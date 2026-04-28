const { test, expect } = require('@playwright/test');

/**
 * Setup wizard — income currency follows the primary currency selection
 *
 * The income-currency toggle in step 1 used to always default to USD active
 * regardless of which primary currency the user had chosen. So a user
 * picking RD$ as primary still saw "💵 USD" highlighted, the input prefix
 * "USD", and an example placeholder in dollars — confusing and pre-filling
 * the field with the wrong unit.
 *
 * Now the income-currency button + prefix + placeholder all follow
 * `_editData.config.monedaPrincipal` at render time. Toggling the primary
 * currency updates the income default in lockstep (already wired via
 * swSetPrimaryCurrency → swSetIngresoCurrency).
 */

async function openWizard(page) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testSetupGoToStep === 'function');
  await page.evaluate(() => {
    _editData = window.defaultEditData();
    document.getElementById('loaderScreen').style.display = 'none';
    document.getElementById('setupModal').style.display = 'flex';
    window._testSetupGoToStep(0);
  });
}

function activeBg(el) {
  // Helper for assertions: an "active" toggle button has var(--accent) bg.
  return el.evaluate(node => node.style.background);
}

// ───────────────────────────────────────────────────────────────────
// 1. Initial render reflects monedaPrincipal
// ───────────────────────────────────────────────────────────────────
test.describe('Income currency — initial render follows monedaPrincipal', () => {
  test('default monedaPrincipal=RD: RD button is active, prefix is "RD$", placeholder is the RD example', async ({ page }) => {
    await openWizard(page);
    const rdBg = await activeBg(page.locator('#sw-ing-rd-btn'));
    const usdBg = await activeBg(page.locator('#sw-ing-usd-btn'));
    expect(rdBg).toBe('var(--accent)');
    expect(usdBg).toBe('var(--surface2)');
    expect(await page.locator('#sw-ing-prefix').textContent()).toBe('RD$');
    const placeholder = await page.locator('#sw-ingreso').getAttribute('placeholder');
    expect(placeholder).toMatch(/240,?000/);
  });

  test('monedaPrincipal=USD: USD button is active, prefix is "USD", placeholder is the USD example', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testSetupGoToStep === 'function');
    await page.evaluate(() => {
      _editData = window.defaultEditData();
      _editData.config.monedaPrincipal = 'USD';
      document.getElementById('loaderScreen').style.display = 'none';
      document.getElementById('setupModal').style.display = 'flex';
      window._testSetupGoToStep(0);
    });
    const usdBg = await activeBg(page.locator('#sw-ing-usd-btn'));
    const rdBg = await activeBg(page.locator('#sw-ing-rd-btn'));
    expect(usdBg).toBe('var(--accent)');
    expect(rdBg).toBe('var(--surface2)');
    expect(await page.locator('#sw-ing-prefix').textContent()).toBe('USD');
    const placeholder = await page.locator('#sw-ingreso').getAttribute('placeholder');
    expect(placeholder).toMatch(/1,?500/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Toggling primary currency updates the income default
// ───────────────────────────────────────────────────────────────────
test.describe('Income currency — flips with primary currency toggle', () => {
  test('clicking USD primary switches the income button to USD', async ({ page }) => {
    await openWizard(page); // starts as RD primary + RD income
    await page.click('#sw-cur-usd-btn');
    expect(await activeBg(page.locator('#sw-ing-usd-btn'))).toBe('var(--accent)');
    expect(await activeBg(page.locator('#sw-ing-rd-btn'))).toBe('var(--surface2)');
    expect(await page.locator('#sw-ing-prefix').textContent()).toBe('USD');
  });

  test('clicking RD primary while USD active flips the income button back to RD', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testSetupGoToStep === 'function');
    await page.evaluate(() => {
      _editData = window.defaultEditData();
      _editData.config.monedaPrincipal = 'USD';
      document.getElementById('loaderScreen').style.display = 'none';
      document.getElementById('setupModal').style.display = 'flex';
      window._testSetupGoToStep(0);
    });
    await page.click('#sw-cur-rd-btn');
    expect(await activeBg(page.locator('#sw-ing-rd-btn'))).toBe('var(--accent)');
    expect(await activeBg(page.locator('#sw-ing-usd-btn'))).toBe('var(--surface2)');
    expect(await page.locator('#sw-ing-prefix').textContent()).toBe('RD$');
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Placeholders are language-aware
// ───────────────────────────────────────────────────────────────────
test.describe('Income placeholder — language-aware', () => {
  test('Spanish: placeholder uses "ej." prefix', async ({ page }) => {
    await openWizard(page);
    await page.evaluate(() => window._testSetLang('es'));
    await page.evaluate(() => window._testSetupGoToStep(0));
    const ph = await page.locator('#sw-ingreso').getAttribute('placeholder');
    expect(ph).toMatch(/^ej\./);
  });

  test('English: placeholder uses "e.g." prefix', async ({ page }) => {
    await openWizard(page);
    await page.evaluate(() => window._testSetLang('en'));
    await page.evaluate(() => window._testSetupGoToStep(0));
    const ph = await page.locator('#sw-ingreso').getAttribute('placeholder');
    expect(ph).toMatch(/^e\.g\./);
  });

  test('toggle between USD and RD swaps placeholder magnitude', async ({ page }) => {
    await openWizard(page);
    // Start RD → switch to USD
    await page.click('#sw-ing-usd-btn');
    expect(await page.locator('#sw-ingreso').getAttribute('placeholder')).toMatch(/1,?500/);
    // Switch back to RD
    await page.click('#sw-ing-rd-btn');
    expect(await page.locator('#sw-ingreso').getAttribute('placeholder')).toMatch(/240,?000/);
  });
});
