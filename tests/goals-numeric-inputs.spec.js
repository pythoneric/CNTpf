const { test, expect } = require('@playwright/test');

/**
 * Test suite: Goals tab numeric inputs should be plain text fields
 * (no spinner arrows) that accept manual keyboard entry and support
 * comma-separated numbers via pf().
 */

async function loadApp(page) {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');

  await page.evaluate(() => {
    const data = window.defaultEditData();
    data.config.tasa = 58;
    data.config.ingresoUSD = 3000;
    data.config.ingresoRD = 174000;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.emerg.cashflow.ingreso = 174000;
    data.emerg.cashflow.gasto = 120000;
    data.metas = [
      { name: 'Vacaciones', goal: 50000, saved: 15000, monthly: 5000 },
      { name: 'Laptop', goal: 80000, saved: 0, monthly: 10000 },
    ];
    window._testLoadData(data);
  });
}

function goalsTab(page) {
  return page.locator('#tab-metas');
}

async function showGoals(page) {
  await page.evaluate(() => showTab('metas'));
  await expect(goalsTab(page)).toBeVisible();
}

test.describe('Goals tab — numeric inputs without spinners', () => {
  test('saved/goal/monthly inputs are type="text" not type="number"', async ({ page }) => {
    await loadApp(page);
    await showGoals(page);

    const inputs = goalsTab(page).locator('#metasList input[inputmode="decimal"]');
    const count = await inputs.count();
    // 2 goals × 3 fields = 6 inputs
    expect(count).toBe(6);

    // Verify none are type="number"
    for (let i = 0; i < count; i++) {
      const type = await inputs.nth(i).getAttribute('type');
      expect(type).toBe('text');
    }
  });

  test('no spinner arrows visible on goal inputs', async ({ page }) => {
    await loadApp(page);
    await showGoals(page);

    // type="number" inputs have spinners; type="text" do not
    const numberInputs = goalsTab(page).locator('#metasList input[type="number"]');
    const count = await numberInputs.count();
    expect(count).toBe(0);
  });

  test('typing a value directly updates _editData', async ({ page }) => {
    await loadApp(page);
    await showGoals(page);

    // First goal's "saved" field (first inputmode="decimal" input)
    const savedInput = goalsTab(page).locator('#metasList input[inputmode="decimal"]').first();
    await savedInput.fill('25000');
    await savedInput.dispatchEvent('input');

    const saved = await page.evaluate(() => _editData.metas[0].saved);
    expect(saved).toBe(25000);
  });

  test('comma-separated values are parsed correctly via pf()', async ({ page }) => {
    await loadApp(page);
    await showGoals(page);

    // First goal's "goal" field (second inputmode="decimal" input)
    const goalInput = goalsTab(page).locator('#metasList input[inputmode="decimal"]').nth(1);
    await goalInput.fill('100,000');
    await goalInput.dispatchEvent('input');

    const goal = await page.evaluate(() => _editData.metas[0].goal);
    expect(goal).toBe(100000);
  });

  test('monthly field accepts decimal values', async ({ page }) => {
    await loadApp(page);
    await showGoals(page);

    // First goal's "monthly" field (third inputmode="decimal" input)
    const monthlyInput = goalsTab(page).locator('#metasList input[inputmode="decimal"]').nth(2);
    await monthlyInput.fill('7500.50');
    await monthlyInput.dispatchEvent('input');

    const monthly = await page.evaluate(() => _editData.metas[0].monthly);
    expect(monthly).toBeCloseTo(7500.50, 1);
  });

  test('empty input defaults to 0', async ({ page }) => {
    await loadApp(page);
    await showGoals(page);

    const savedInput = goalsTab(page).locator('#metasList input[inputmode="decimal"]').first();
    await savedInput.fill('');
    await savedInput.dispatchEvent('input');

    const saved = await page.evaluate(() => _editData.metas[0].saved);
    expect(saved).toBe(0);
  });

  test('inputs have inputmode="decimal" for mobile numeric keyboard', async ({ page }) => {
    await loadApp(page);
    await showGoals(page);

    const inputs = goalsTab(page).locator('#metasList input[inputmode="decimal"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(6);

    for (let i = 0; i < count; i++) {
      const mode = await inputs.nth(i).getAttribute('inputmode');
      expect(mode).toBe('decimal');
    }
  });

  test('new goal added via button also uses text inputs', async ({ page }) => {
    await loadApp(page);
    await showGoals(page);

    // Add a new goal
    await page.evaluate(() => addSavingsGoal());

    // Should now have 3 goals × 3 fields = 9 decimal inputs
    const inputs = goalsTab(page).locator('#metasList input[inputmode="decimal"]');
    await expect(inputs).toHaveCount(9);

    // Verify the new goal's inputs are text type
    const lastThree = [6, 7, 8];
    for (const idx of lastThree) {
      const type = await inputs.nth(idx).getAttribute('type');
      expect(type).toBe('text');
    }
  });
});
