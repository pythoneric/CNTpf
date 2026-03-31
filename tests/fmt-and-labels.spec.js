// @ts-check
const { test, expect } = require('@playwright/test');

const APP = 'http://localhost:8080/cnt.html';

async function loadDemo(page) {
  await page.goto(APP);
  await page.waitForSelector('#loaderScreen', { state: 'visible' });
  await page.evaluate(() => { if (typeof loadDemo === 'function') loadDemo(); });
  await page.waitForSelector('#dashApp', { state: 'visible', timeout: 10000 });
}

// ══════════════════════════════════
// Group 1: fmt() decimal precision
// ══════════════════════════════════

test.describe('fmt() decimal precision', () => {
  test('preserves decimal values (13.05 not 13)', async ({ page }) => {
    await page.goto(APP);
    const result = await page.evaluate(() => fmt(13.05));
    expect(result).toBe('13.05');
  });

  test('whole numbers have no trailing zeros', async ({ page }) => {
    await page.goto(APP);
    const result = await page.evaluate(() => fmt(52000));
    expect(result).toBe('52,000');
  });

  test('single decimal shows without trailing zero', async ({ page }) => {
    await page.goto(APP);
    const result = await page.evaluate(() => fmt(1500.5));
    expect(result).toBe('1,500.5');
  });

  test('edge cases: undefined, NaN, 0', async ({ page }) => {
    await page.goto(APP);
    const results = await page.evaluate(() => [fmt(undefined), fmt(NaN), fmt(0)]);
    expect(results[0]).toBe('—');
    expect(results[1]).toBe('—');
    expect(results[2]).toBe('0');
  });

  test('Gastos tab renders exact decimal values', async ({ page }) => {
    await loadDemo(page);
    // Inject a gasto with a decimal adeudado value and rebuild
    await page.evaluate(() => {
      _editData.gastos[0].adeudado = 52000.75;
      buildDashboard(_editData);
    });
    await page.evaluate(() => showTab('gastos', document.querySelector(".tab-btn[onclick*=\"'gastos'\"]")));
    const cell = page.locator('#gastosBody tr:first-child td:nth-child(4)');
    const text = await cell.textContent();
    expect(text).toContain('52,000.75');
  });
});

// ══════════════════════════════════
// Group 2: Edit modal labels match display tabs
// ══════════════════════════════════

test.describe('Edit modal labels match display tabs — Spanish', () => {
  test('Cuota column matches Gastos tab', async ({ page }) => {
    await loadDemo(page);
    // Get display tab label
    const displayLabel = await page.evaluate(() => t('gastostbl_cuota'));
    // Get edit modal label
    const editLabel = await page.evaluate(() => t('eth_adeudado'));
    expect(editLabel).toBe(displayLabel);
  });

  test('Emergency Balance label matches display', async ({ page }) => {
    await loadDemo(page);
    const displayLabel = await page.evaluate(() => t('ef_balance_lbl'));
    const editLabel = await page.evaluate(() => t('eth_balanceActual'));
    // Display uses "Balance:" (with colon), edit uses "Balance" (no colon)
    expect(displayLabel.replace(':', '')).toBe(editLabel);
  });

  test('Emergency Meta label matches display', async ({ page }) => {
    await loadDemo(page);
    const displayLabel = await page.evaluate(() => t('ef_goal_lbl'));
    const editLabel = await page.evaluate(() => t('eth_metaMinima'));
    expect(displayLabel.replace(':', '')).toBe(editLabel);
  });

  test('Historial Tasa column matches display', async ({ page }) => {
    await loadDemo(page);
    const displayLabel = await page.evaluate(() => t('hist_col_rate'));
    const editLabel = await page.evaluate(() => t('eth_tasaDolar'));
    expect(editLabel).toBe(displayLabel);
  });
});

test.describe('Edit modal labels match display tabs — English', () => {
  test('Payment column matches Gastos tab', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => { localStorage.setItem('cntLang', 'en'); applyI18n(); });
    const displayLabel = await page.evaluate(() => t('gastostbl_cuota'));
    const editLabel = await page.evaluate(() => t('eth_adeudado'));
    expect(editLabel).toBe(displayLabel);
  });

  test('Emergency Balance label matches display', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => { localStorage.setItem('cntLang', 'en'); applyI18n(); });
    const displayLabel = await page.evaluate(() => t('ef_balance_lbl'));
    const editLabel = await page.evaluate(() => t('eth_balanceActual'));
    expect(displayLabel.replace(':', '')).toBe(editLabel);
  });

  test('Emergency Goal label matches display', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => { localStorage.setItem('cntLang', 'en'); applyI18n(); });
    const displayLabel = await page.evaluate(() => t('ef_goal_lbl'));
    const editLabel = await page.evaluate(() => t('eth_metaMinima'));
    expect(displayLabel.replace(':', '')).toBe(editLabel);
  });

  test('Historial Rate column matches display', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => { localStorage.setItem('cntLang', 'en'); applyI18n(); });
    const displayLabel = await page.evaluate(() => t('hist_col_rate'));
    const editLabel = await page.evaluate(() => t('eth_tasaDolar'));
    expect(editLabel).toBe(displayLabel);
  });
});
