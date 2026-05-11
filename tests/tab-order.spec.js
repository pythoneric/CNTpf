const { test, expect } = require('@playwright/test');

/**
 * Tests for tab order and section navigation. Verifies the desktop sub-tab bar,
 * the TAB_ORDER array, the 5-section mobile bottom nav, and that section
 * switching keeps pills + sub-tabs + bottom nav in sync.
 *
 * Sections (top-level): hoy / gastos / deudas / ahorros / historia
 * Sub-tabs are grouped by section in the .tabs bar and rendered HTML order.
 */

const EXPECTED_ORDER = [
  'resumen', 'alertas',                   // hoy
  'registro', 'gastos', 'presupuesto',    // gastos
  'deudas', 'proyector',                  // deudas
  'fornow', 'emergency', 'metas',         // ahorros
  'analisis', 'historial',                // historia
];

const SECTIONS = ['hoy', 'gastos', 'deudas', 'ahorros', 'historia'];

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

test.describe('Tab Order — Personal Finance Workflow', () => {

  test('desktop sub-tab bar matches expected sequence', async ({ page }) => {
    await loadApp(page);
    const tabIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.tabs .tab-btn')).map(btn => {
        const m = btn.getAttribute('onclick').match(/showTab\('([^']+)'/);
        return m ? m[1] : null;
      });
    });
    expect(tabIds).toEqual(EXPECTED_ORDER);
  });

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

  test('mobile bottom nav has exactly 5 section buttons in expected order', async ({ page }) => {
    await loadApp(page);
    const sections = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#mobileNav .mnav-btn')).map(btn => btn.dataset.section);
    });
    expect(sections).toEqual(SECTIONS);
  });

  test('TAB_ORDER and desktop sub-tabs contain the same 12 ids', async ({ page }) => {
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
    expect(desktopIds.length).toBe(tabOrderIds.length);
    for (const id of desktopIds) expect(tabOrderIds).toContain(id);
    for (const id of tabOrderIds) expect(desktopIds).toContain(id);
  });

  test('exactly 12 desktop sub-tabs with all original ids present', async ({ page }) => {
    await loadApp(page);
    const desktopIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.tabs .tab-btn')).map(btn => {
        const m = btn.getAttribute('onclick').match(/showTab\('([^']+)'/);
        return m ? m[1] : null;
      });
    });
    expect(desktopIds).toHaveLength(12);
    const allOriginals = ['resumen', 'alertas', 'registro', 'presupuesto', 'gastos', 'deudas',
      'emergency', 'proyector', 'fornow', 'historial', 'metas', 'analisis'];
    for (const id of allOriginals) expect(desktopIds).toContain(id);
  });

  test('TAB_ORDER has exactly 12 entries with all original ids', async ({ page }) => {
    await loadApp(page);
    const tabOrder = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const m = s.textContent.match(/const TAB_ORDER=\[([^\]]+)\]/);
        if (m) return m[1].replace(/'/g, '').split(',');
      }
      return [];
    });
    expect(tabOrder).toHaveLength(12);
    const allOriginals = ['resumen', 'alertas', 'registro', 'presupuesto', 'gastos', 'deudas',
      'emergency', 'proyector', 'fornow', 'historial', 'metas', 'analisis'];
    for (const id of allOriginals) expect(tabOrder).toContain(id);
  });

  test('Resumen is the default active tab on load', async ({ page }) => {
    await loadApp(page);
    const activePanel = await page.evaluate(() => document.querySelector('.panel.active')?.id);
    expect(activePanel).toBe('tab-resumen');
    const activeTab = await page.evaluate(() => {
      const btn = document.querySelector('.tab-btn.active');
      const m = btn?.getAttribute('onclick')?.match(/showTab\('([^']+)'/);
      return m ? m[1] : null;
    });
    expect(activeTab).toBe('resumen');
  });
});

test.describe('Section Switching — 5-section nav', () => {

  test('Hoy pill is active on load', async ({ page }) => {
    await loadApp(page);
    const hoyActive = await page.evaluate(() => document.getElementById('pillHoy').classList.contains('active'));
    expect(hoyActive).toBe(true);
    for (const s of SECTIONS.filter(s => s !== 'hoy')) {
      const cap = s.charAt(0).toUpperCase() + s.slice(1);
      const active = await page.evaluate(id => document.getElementById(id).classList.contains('active'), `pill${cap}`);
      expect(active).toBe(false);
    }
  });

  test('switchSection shows only the active section\'s sub-tabs', async ({ page }) => {
    await loadApp(page);
    for (const section of SECTIONS) {
      await page.evaluate(s => window.switchSection(s), section);
      const visibleSections = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.tab-btn[data-section]'))
          .filter(b => b.style.display !== 'none')
          .map(b => b.dataset.section)
      );
      expect(new Set(visibleSections)).toEqual(new Set([section]));
      expect(visibleSections.length).toBeGreaterThan(0);
    }
  });

  test('switchSection updates pill aria-selected', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.switchSection('deudas'));
    const deudasActive = await page.evaluate(() => document.getElementById('pillDeudas').getAttribute('aria-selected'));
    const hoyActive = await page.evaluate(() => document.getElementById('pillHoy').getAttribute('aria-selected'));
    expect(deudasActive).toBe('true');
    expect(hoyActive).toBe('false');
  });

  test('auto-switch: showTab on a sub-tab outside active section switches the section', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('analisis', null));
    const historiaActive = await page.evaluate(() => document.getElementById('pillHistoria').classList.contains('active'));
    const panel = await page.evaluate(() => document.querySelector('.panel.active')?.id);
    expect(historiaActive).toBe(true);
    expect(panel).toBe('tab-analisis');
  });

  test('mobile bottom-nav active state follows the section', async ({ page }) => {
    await loadApp(page);
    // Default: Hoy active
    let active = await page.evaluate(() => document.querySelector('#mobileNav .mnav-btn.active')?.dataset.section);
    expect(active).toBe('hoy');
    // Switch to ahorros
    await page.evaluate(() => window.switchSection('ahorros'));
    active = await page.evaluate(() => document.querySelector('#mobileNav .mnav-btn.active')?.dataset.section);
    expect(active).toBe('ahorros');
  });

  test('active section persists in localStorage', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.switchSection('deudas'));
    const stored = await page.evaluate(() => localStorage.getItem('cntActiveSection'));
    expect(stored).toBe('deudas');
  });

  test('hash navigation auto-switches section', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      window.location.hash = '#analisis';
      window.navigateToHash();
    });
    const historiaActive = await page.evaluate(() => document.getElementById('pillHistoria').classList.contains('active'));
    const panel = await page.evaluate(() => document.querySelector('.panel.active')?.id);
    expect(historiaActive).toBe(true);
    expect(panel).toBe('tab-analisis');
  });

  test('switching to a section jumps to its first sub-tab when current panel is elsewhere', async ({ page }) => {
    await loadApp(page);
    // Start on a non-default sub-tab inside hoy
    await page.evaluate(() => window.showTab('alertas', null));
    expect(await page.evaluate(() => document.querySelector('.panel.active')?.id)).toBe('tab-alertas');
    // Switch to gastos → should land on registro (first sub-tab of gastos)
    await page.evaluate(() => window.switchSection('gastos'));
    expect(await page.evaluate(() => document.querySelector('.panel.active')?.id)).toBe('tab-registro');
  });
});
