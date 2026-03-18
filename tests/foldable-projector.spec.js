const { test, expect } = require('@playwright/test');

/**
 * Tests for foldable phone layout in the Projector tab.
 * Verifies that committed funds simulator values don't overlap
 * on foldable inner screens (650-720px) and folded screens (~280-360px).
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
    data.emerg.cashflow.tasa = 58;
    data.forNow.cuentas = [
      { nombre: 'Banco Popular', moneda: 'RD', saldo: 250000, comp: 0, disp: 250000 },
      { nombre: 'USD Savings', moneda: 'USD', saldo: 2000, comp: 0, disp: 2000 },
    ];
    data.gastos = [
      { nombre: 'Tarjeta Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 8000, dia: 15, tasa: 24, balance: 120000, originalRD: 150000, originalUSD: 0, fechaLimite: '2028-01-15', notas: '', pagadoMes: false },
      { nombre: 'Alquiler', tipo: 'Fijo', pagado: 0, adeudado: 35000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
      { nombre: 'Préstamo Auto', tipo: 'Préstamo', pagado: 0, adeudado: 18000, dia: 20, tasa: 12, balance: 450000, originalRD: 600000, originalUSD: 0, fechaLimite: '2029-06-20', notas: '', pagadoMes: false },
    ];
    data.emerg.fondos = [{ fondo: 'EF General', moneda: 'RD', balance: 50000, meta: 200000 }];
    window._testLoadData(data);
  });
}

async function showProjector(page) {
  await page.evaluate(() => showTab('proyector'));
  await expect(page.locator('#tab-proyector')).toBeVisible();
}

/**
 * Checks if any child elements inside the committed funds simulator overflow their container.
 */
async function checkCommittedFundsOverflow(page) {
  return page.evaluate(() => {
    const container = document.getElementById('committedSimulation');
    if (!container) return [];
    const overflows = [];
    // Check the stat pill cards (the flex/grid children)
    const cards = container.querySelectorAll('[style*="min-width"]');
    cards.forEach((card, i) => {
      if (card.scrollWidth > card.clientWidth + 2) {
        overflows.push({
          index: i,
          scrollWidth: card.scrollWidth,
          clientWidth: card.clientWidth,
          text: card.textContent.trim().slice(0, 50),
        });
      }
    });
    // Also check .mono value elements for text overflow
    const monos = container.querySelectorAll('.mono');
    monos.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement.getBoundingClientRect();
      if (rect.right > parentRect.right + 2 || rect.left < parentRect.left - 2) {
        overflows.push({
          index: 100 + i,
          type: 'mono-overflow',
          text: el.textContent.trim(),
          elRight: Math.round(rect.right),
          parentRight: Math.round(parentRect.right),
        });
      }
    });
    return overflows;
  });
}

// ── Galaxy Z Fold (inner screen ~717px) ──
test.describe('Foldable inner screen (717px)', () => {
  test.use({ viewport: { width: 717, height: 1024 } });

  test('committed funds values do not overflow', async ({ page }) => {
    await loadApp(page);
    await showProjector(page);

    const overflows = await checkCommittedFundsOverflow(page);
    expect(overflows).toHaveLength(0);
  });

  test('committed funds cards use 2-column grid layout', async ({ page }) => {
    await loadApp(page);
    await showProjector(page);

    const layout = await page.evaluate(() => {
      const container = document.getElementById('committedSimulation');
      const flexContainer = container?.querySelector('[style*="display:flex;gap:12px"]') ||
                           container?.querySelector('[style*="display:grid"]');
      if (!flexContainer) return null;
      const cs = getComputedStyle(flexContainer);
      return { display: cs.display, gridTemplateColumns: cs.gridTemplateColumns };
    });

    expect(layout).not.toBeNull();
    expect(layout.display).toBe('grid');
  });

  test('committed funds font size is reduced from 22px', async ({ page }) => {
    await loadApp(page);
    await showProjector(page);

    const fontSize = await page.evaluate(() => {
      const mono = document.querySelector('#committedSimulation .mono');
      if (!mono) return null;
      return parseFloat(getComputedStyle(mono).fontSize);
    });

    expect(fontSize).not.toBeNull();
    expect(fontSize).toBeLessThanOrEqual(18);
  });
});

// ── Galaxy Z Fold (outer/folded screen ~280px) ──
test.describe('Foldable outer screen (280px)', () => {
  test.use({ viewport: { width: 280, height: 653 } });

  test('committed funds values do not overflow', async ({ page }) => {
    await loadApp(page);
    await showProjector(page);

    const overflows = await checkCommittedFundsOverflow(page);
    expect(overflows).toHaveLength(0);
  });

  test('committed funds font size is small enough for narrow screen', async ({ page }) => {
    await loadApp(page);
    await showProjector(page);

    const fontSize = await page.evaluate(() => {
      const mono = document.querySelector('#committedSimulation .mono');
      if (!mono) return null;
      return parseFloat(getComputedStyle(mono).fontSize);
    });

    expect(fontSize).not.toBeNull();
    expect(fontSize).toBeLessThanOrEqual(14);
  });
});

// ── Galaxy Z Flip (folded ~360px) ──
test.describe('Foldable flip screen (360px)', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('committed funds values do not overflow', async ({ page }) => {
    await loadApp(page);
    await showProjector(page);

    const overflows = await checkCommittedFundsOverflow(page);
    expect(overflows).toHaveLength(0);
  });
});

// ── Samsung Galaxy Z Fold inner (open, landscape-ish ~884px) ──
test.describe('Foldable wide inner screen (884px)', () => {
  test.use({ viewport: { width: 884, height: 1104 } });

  test('committed funds values do not overflow at wide foldable width', async ({ page }) => {
    await loadApp(page);
    await showProjector(page);

    const overflows = await checkCommittedFundsOverflow(page);
    expect(overflows).toHaveLength(0);
  });
});
