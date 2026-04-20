const { test, expect } = require('@playwright/test');

/**
 * Load the app with representative data so all sections render content.
 */
async function loadApp(page) {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');

  await page.evaluate(() => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.ingresoRD = 180000;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.emerg.cashflow.ingreso = 180000;
    data.emerg.cashflow.gasto = 120000;
    data.emerg.cashflow.tasa = 60;
    data.emerg.cashflow.ahorros = 10000;
    data.emerg.cashflow.balanceAhorros = 50000;

    // Accounts
    data.forNow.cuentas = [
      { nombre: 'Banco Popular', moneda: 'RD', saldo: 250000, comp: 0, disp: 250000 },
      { nombre: 'Savings USD', moneda: 'USD', saldo: 2000, comp: 0, disp: 2000 },
    ];
    data.forNow.total = 250000 + 2000 * 60;

    // Gastos with debts
    data.gastos = [
      { nombre: 'Tarjeta Visa', tipo: 'Tarjeta', pagado: 8000, adeudado: 15000, dia: 15, tasa: 28, balance: 180000, originalRD: 200000, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false },
      { nombre: 'Préstamo Auto', tipo: 'Préstamo', pagado: 12000, adeudado: 12000, dia: 1, tasa: 12, balance: 450000, originalRD: 600000, originalUSD: 0, fechaLimite: '2028-06-01', notas: '', pagadoMes: true },
      { nombre: 'Seguro Salud', tipo: 'Seguro', pagado: 0, adeudado: 5000, dia: 5, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false },
      { nombre: 'Internet Claro', tipo: 'Servicio', pagado: 2500, adeudado: 2500, dia: 20, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: true },
    ];

    // Emergency funds
    data.emerg.fondos = [
      { fondo: 'Fondo General', moneda: 'RD', balance: 80000, meta: 300000 },
      { fondo: 'Medical Fund', moneda: 'USD', balance: 500, meta: 2000 },
    ];

    // History for trend section
    data.historial = [
      { mes: 'Marzo', anio: 2026, ingresos: 180000, gasto: 120000, ahorro: 60000, tasaAhorro: 0.33, deudas: 630000, emergencia: 110000, netWorth: 200000, tasa: 60, notas: '' },
      { mes: 'Febrero', anio: 2026, ingresos: 175000, gasto: 115000, ahorro: 60000, tasaAhorro: 0.34, deudas: 660000, emergencia: 90000, netWorth: 150000, tasa: 59, notas: '' },
    ];

    // Savings goals
    data.metas = [
      { name: 'Vacaciones', goal: 50000, saved: 20000, monthly: 5000 },
      { name: 'Down payment casa', goal: 2000000, saved: 150000, monthly: 30000 },
    ];

    window._testLoadData(data);
  });
}

/** Navigate to a tab by clicking the appropriate button */
async function goToTab(page, tabId) {
  // Try desktop tab first
  const tabBtn = page.locator(`.tab-btn[onclick*="'${tabId}'"]`);
  if (await tabBtn.isVisible().catch(() => false)) {
    await tabBtn.click();
  } else {
    // Use mobile nav or JS fallback
    await page.evaluate(id => window.showTab(id), tabId);
  }
  await expect(page.locator(`#tab-${tabId}`)).toBeVisible();
}

/**
 * Check that no element overflows the viewport horizontally.
 * Excludes elements inside scrollable containers (overflow-x:auto/scroll),
 * hidden elements, and non-visual tags.
 */
async function findHorizontalOverflows(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflows = [];
    const skipTags = /^(SCRIPT|STYLE|HEAD|META|LINK|NOSCRIPT|BR|HR)$/i;
    // Check if an element is inside a scrollable container
    function inScrollable(el) {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const ov = getComputedStyle(p).overflowX;
        if (ov === 'auto' || ov === 'scroll') return true;
        p = p.parentElement;
      }
      return false;
    }
    document.querySelectorAll('*').forEach(el => {
      if (skipTags.test(el.tagName)) return;
      const rect = el.getBoundingClientRect();
      // Skip invisible, zero-size, or elements in scrollable containers
      if (rect.width <= 0 || rect.height <= 0) return;
      if (getComputedStyle(el).display === 'none') return;
      if (inScrollable(el)) return;
      if (rect.right > vw + 2) { // 2px tolerance
        overflows.push({
          tag: el.tagName,
          id: el.id || '',
          class: el.className?.toString().slice(0, 60) || '',
          width: Math.round(rect.width),
          right: Math.round(rect.right),
          vw,
          text: el.textContent?.slice(0, 40) || '',
        });
      }
    });
    return overflows;
  });
}

/**
 * Check that no text is visually clipped (element scrollWidth > clientWidth)
 * within the visible tab panel.
 */
async function findClippedText(page, panelId) {
  return page.evaluate((id) => {
    const panel = document.getElementById(id);
    if (!panel) return [];
    const clipped = [];
    panel.querySelectorAll('.mono, .kpi-val, .cf-val, .num').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 4) { // 4px tolerance
        clipped.push({
          tag: el.tagName,
          text: el.textContent?.trim().slice(0, 50) || '',
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
        });
      }
    });
    return clipped;
  }, panelId);
}

// ─────────────────────────────────────────────
// PHONE TESTS (iPhone 13 — 390×844)
// ─────────────────────────────────────────────

test.describe('Responsive - Phone (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Summary tab: no horizontal overflow', async ({ page }) => {
    await loadApp(page);
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Projector tab: committed funds pills do not overflow', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'proyector');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Projector tab: no clipped text in stat pills', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'proyector');
    const clipped = await findClippedText(page, 'tab-proyector');
    expect(clipped).toHaveLength(0);
  });

  test('Funds tab: KPIs and availability rows do not overflow', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'fornow');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Emergency tab: fund cards do not overflow', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'emergency');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Analysis tab: BVA and debt payoff do not overflow', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'analisis');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('History tab: KPIs and trend section do not overflow', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'historial');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Goals tab: goal cards do not overflow', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'metas');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Debts tab: debt cards do not overflow', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'deudas');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Mobile nav is visible and tabs are hidden', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('#mobileNav')).toBeVisible();
    await expect(page.locator('.tabs')).toBeHidden();
  });
});

// ─────────────────────────────────────────────
// SMALL PHONE TESTS (375px — iPhone SE)
// ─────────────────────────────────────────────

test.describe('Responsive - Small Phone (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('Projector tab: stat pills wrap to grid, no overflow', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'proyector');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Summary tab: KPIs display in 2-column grid', async ({ page }) => {
    await loadApp(page);
    const kpiRow = page.locator('#kpiRow');
    const cards = kpiRow.locator('.card');
    await expect(cards).toHaveCount(6);
    // All cards should be visible without horizontal overflow
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('All tabs: no clipped monetary values', async ({ page }) => {
    await loadApp(page);
    const tabs = ['resumen', 'proyector', 'fornow', 'deudas', 'analisis', 'historial'];
    for (const tabId of tabs) {
      await goToTab(page, tabId);
      const clipped = await findClippedText(page, `tab-${tabId}`);
      expect(clipped, `Clipped text in ${tabId}`).toHaveLength(0);
    }
  });
});

// ─────────────────────────────────────────────
// ANDROID SMALL PHONE TESTS (360px — Galaxy S, Motorola, Xiaomi)
// ─────────────────────────────────────────────

test.describe('Responsive - Android Small Phone (360px)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('Summary tab: no overflow at 360px', async ({ page }) => {
    await loadApp(page);
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Projector tab: committed funds and config do not overflow', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'proyector');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Projector tab: no clipped monetary values', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'proyector');
    const clipped = await findClippedText(page, 'tab-proyector');
    expect(clipped).toHaveLength(0);
  });

  test('All tabs: no horizontal overflow at 360px', async ({ page }) => {
    await loadApp(page);
    const tabs = ['resumen', 'alertas', 'gastos', 'deudas', 'emergency', 'proyector', 'fornow', 'historial', 'metas', 'analisis'];
    for (const tabId of tabs) {
      await goToTab(page, tabId);
      const overflows = await findHorizontalOverflows(page);
      expect(overflows, `Overflow in tab-${tabId} at 360px`).toHaveLength(0);
    }
  });

  test('All tabs: no clipped text at 360px', async ({ page }) => {
    await loadApp(page);
    const tabs = ['resumen', 'proyector', 'fornow', 'deudas', 'analisis', 'historial'];
    for (const tabId of tabs) {
      await goToTab(page, tabId);
      const clipped = await findClippedText(page, `tab-${tabId}`);
      expect(clipped, `Clipped text in ${tabId} at 360px`).toHaveLength(0);
    }
  });
});

// ─────────────────────────────────────────────
// TABLET TESTS (iPad — 810×1080)
// ─────────────────────────────────────────────

test.describe('Responsive - Tablet (810px)', () => {
  test.use({ viewport: { width: 810, height: 1080 } });

  test('Desktop tabs are visible, mobile nav hidden', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('.tabs')).toBeVisible();
    await expect(page.locator('#mobileNav')).toBeHidden();
  });

  test('Projector tab: no overflow on tablet', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'proyector');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });

  test('Analysis tab: BVA table readable on tablet', async ({ page }) => {
    await loadApp(page);
    await goToTab(page, 'analisis');
    const overflows = await findHorizontalOverflows(page);
    expect(overflows).toHaveLength(0);
  });
});
