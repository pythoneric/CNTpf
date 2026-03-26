const { test, expect } = require('@playwright/test');

/**
 * Tests for tab order — verifies desktop tab bar, TAB_ORDER array,
 * and mobile nav are all in sync with the personal finance workflow.
 */

const EXPECTED_ORDER = [
  'resumen', 'alertas', 'checklist', 'registro', 'presupuesto', 'gastos', 'fornow',
  'emergency', 'deudas', 'proyector', 'metas', 'analisis', 'historial',
];

const EXPECTED_MOBILE_ORDER = [
  'resumen', 'alertas', 'checklist', 'registro', 'presupuesto', 'gastos', 'fornow',
  'emergency', 'deudas', 'proyector', 'metas', 'analisis', 'historial',
];

const ALL_TAB_IDS = new Set([
  'resumen', 'alertas', 'checklist', 'registro', 'presupuesto', 'gastos', 'deudas',
  'emergency', 'proyector', 'fornow', 'historial', 'metas', 'analisis',
]);

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
    data.forNow.cuentas = [{ nombre: 'Banco', moneda: 'RD', saldo: 50000, comp: 0, disp: 50000 }];
    data.emerg.fondos = [{ fondo: 'EF', moneda: 'RD', balance: 10000, meta: 50000 }];
    data.gastos = [
      { nombre: 'Alquiler', tipo: 'Fijo', pagado: 0, adeudado: 25000, dia: 1, tasa: 0, balance: 0, originalRD: 0, originalUSD: 0, fechaLimite: '', notas: '', pagadoMes: false },
    ];
    window._testLoadData(data);
  });
}

/** Extract tab ID from onclick like showTab('resumen',this) */
function extractTabId(onclick) {
  const m = onclick.match(/(?:showTab|mobileTab)\('([^']+)'/);
  return m ? m[1] : null;
}

test.describe('Tab Order — Personal Finance Workflow', () => {

  // TEST 1 — Desktop tab bar order
  test('desktop tab bar matches expected sequence', async ({ page }) => {
    await loadApp(page);

    const tabIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.tabs .tab-btn')).map(btn => {
        const m = btn.getAttribute('onclick').match(/showTab\('([^']+)'/);
        return m ? m[1] : null;
      });
    });

    expect(tabIds).toEqual(EXPECTED_ORDER);
  });

  // TEST 2 — TAB_ORDER array matches expected sequence
  test('TAB_ORDER array matches expected sequence', async ({ page }) => {
    await loadApp(page);

    const tabOrder = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const m = s.textContent.match(/const TAB_ORDER=\[([^\]]+)\]/);
        if (m) return m[1].replace(/'/g, '').split(',');
      }
      return null;
    });

    expect(tabOrder).toEqual(EXPECTED_ORDER);
  });

  // TEST 3 — Mobile nav order matches expected sequence
  test('mobile nav matches expected sequence', async ({ page }) => {
    await loadApp(page);

    const mobileIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#mobileNav .mnav-btn')).map(btn => {
        const m = btn.getAttribute('onclick').match(/mobileTab\('([^']+)'/);
        return m ? m[1] : null;
      });
    });

    expect(mobileIds).toEqual(EXPECTED_MOBILE_ORDER);
  });

  // TEST 4 — TAB_ORDER and desktop tab bar are in sync
  test('TAB_ORDER and desktop tab bar contain the same tabs', async ({ page }) => {
    await loadApp(page);

    const { desktopIds, tabOrderIds } = await page.evaluate(() => {
      const desktopIds = Array.from(document.querySelectorAll('.tabs .tab-btn')).map(btn => {
        const m = btn.getAttribute('onclick').match(/showTab\('([^']+)'/);
        return m ? m[1] : null;
      });

      let tabOrderIds = [];
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const m = s.textContent.match(/const TAB_ORDER=\[([^\]]+)\]/);
        if (m) { tabOrderIds = m[1].replace(/'/g, '').split(','); break; }
      }

      return { desktopIds, tabOrderIds };
    });

    // Same length
    expect(desktopIds.length).toBe(tabOrderIds.length);

    // Every desktop tab is in TAB_ORDER
    for (const id of desktopIds) {
      expect(tabOrderIds).toContain(id);
    }

    // Every TAB_ORDER entry is in desktop tabs
    for (const id of tabOrderIds) {
      expect(desktopIds).toContain(id);
    }
  });

  // TEST 5 — No tabs were removed or added
  test('exactly 13 desktop tabs with all original IDs present', async ({ page }) => {
    await loadApp(page);

    const desktopIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.tabs .tab-btn')).map(btn => {
        const m = btn.getAttribute('onclick').match(/showTab\('([^']+)'/);
        return m ? m[1] : null;
      });
    });

    expect(desktopIds).toHaveLength(13);

    const allOriginals = ['resumen', 'alertas', 'checklist', 'registro', 'presupuesto', 'gastos', 'deudas',
      'emergency', 'proyector', 'fornow', 'historial', 'metas', 'analisis'];
    for (const id of allOriginals) {
      expect(desktopIds).toContain(id);
    }
  });

  test('TAB_ORDER has exactly 13 entries with all original IDs', async ({ page }) => {
    await loadApp(page);

    const tabOrder = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const m = s.textContent.match(/const TAB_ORDER=\[([^\]]+)\]/);
        if (m) return m[1].replace(/'/g, '').split(',');
      }
      return [];
    });

    expect(tabOrder).toHaveLength(13);

    const allOriginals = ['resumen', 'alertas', 'checklist', 'registro', 'presupuesto', 'gastos', 'deudas',
      'emergency', 'proyector', 'fornow', 'historial', 'metas', 'analisis'];
    for (const id of allOriginals) {
      expect(tabOrder).toContain(id);
    }
  });

  // Bonus — Resumen is still the default active tab on load
  test('Resumen is the default active tab on load', async ({ page }) => {
    await loadApp(page);

    const activePanel = await page.evaluate(() => {
      const panel = document.querySelector('.panel.active');
      return panel ? panel.id : null;
    });

    expect(activePanel).toBe('tab-resumen');

    const activeTab = await page.evaluate(() => {
      const btn = document.querySelector('.tab-btn.active');
      const m = btn?.getAttribute('onclick')?.match(/showTab\('([^']+)'/);
      return m ? m[1] : null;
    });

    expect(activeTab).toBe('resumen');
  });
});
