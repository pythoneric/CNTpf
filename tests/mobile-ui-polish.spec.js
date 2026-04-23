const { test, expect } = require('@playwright/test');

/**
 * Mobile UI polish suite — covers the fixes from the mobile code-review:
 *  #1 numeric inputs (type=text + inputmode)
 *  #2 modal backdrop tap-to-close
 *  #3 min-height:100dvh
 *  #6 aria roles + live regions
 *  #7 minimum text sizes
 *  #8 prefers-reduced-motion + SVG chrome icons (replaces emoji)
 *  #9 stat-pill/stat-row/stat-value class system (replaces [style*=…] selectors)
 * #14 tabular-nums on .mono
 * #15 -webkit-overflow-scrolling:touch on modals
 * #16 navigator.vibrate haptic feedback on key actions
 * #17 .setup-card class (replaces fragile #setupModal>div>div selector)
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
    data.forNow.cuentas = [
      { nombre: 'Banco Popular', moneda: 'RD', saldo: 250000, comp: 0, disp: 250000 },
    ];
    data.forNow.total = 250000;
    data.gastos = [
      { nombre: 'Tarjeta Visa', tipo: 'Tarjeta', pagado: 0, adeudado: 15000, dia: 15, tasa: 28, balance: 180000, originalRD: 200000, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false },
      { nombre: 'Préstamo Auto', tipo: 'Préstamo', pagado: 0, adeudado: 12000, dia: 1, tasa: 12, balance: 450000, originalRD: 600000, originalUSD: 0, fechaLimite: null, notas: '', pagadoMes: false },
    ];
    data.emerg.fondos = [{ fondo: 'General', moneda: 'RD', balance: 50000, meta: 300000 }];
    data.metas = [{ name: 'Test goal', goal: 10000, saved: 2500, monthly: 500 }];
    window._testLoadData(data);
  });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────────────
// #1 — Numeric inputs use type=text + inputmode, not type=number
// ───────────────────────────────────────────────────────────────────────────
test.describe('#1 Numeric inputs — type=text + inputmode', () => {
  test('no type=number inputs anywhere in the app', async ({ page }) => {
    await loadApp(page);
    // Open edit modal so its inputs are in DOM
    await page.evaluate(() => window.openEditModal());
    const count = await page.locator('input[type="number"]').count();
    expect(count).toBe(0);
  });

  test('registro Monto input uses inputmode=decimal', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('registro'));
    const monto = page.locator('#regMonto');
    await expect(monto).toHaveAttribute('type', 'text');
    await expect(monto).toHaveAttribute('inputmode', 'decimal');
  });

  test('pf() strips commas so "1,500" parses as 1500', async ({ page }) => {
    await loadApp(page);
    const result = await page.evaluate(() => window.pf('1,500'));
    expect(result).toBe(1500);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #2 — Modal backdrop tap-to-close
// ───────────────────────────────────────────────────────────────────────────
test.describe('#2 Modal backdrop tap-to-close', () => {
  test('clicking edit modal backdrop closes it', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.openEditModal());
    const modal = page.locator('#editModal');
    await expect(modal).toHaveClass(/open/);
    // Click the backdrop (the modal element itself, not the inner .edit-container)
    await page.evaluate(() => {
      const m = document.getElementById('editModal');
      m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(modal).not.toHaveClass(/open/);
  });

  test('clicking inside edit modal content does NOT close it', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.openEditModal());
    await page.locator('.edit-header').click();
    await expect(page.locator('#editModal')).toHaveClass(/open/);
  });

  test('setup wizard backdrop does NOT close (guards against lost onboarding state)', async ({ page }) => {
    await loadApp(page);
    // Open setup modal directly
    await page.evaluate(() => {
      document.getElementById('setupModal').style.display = 'flex';
    });
    // Simulate click on modal backdrop
    await page.evaluate(() => {
      const m = document.getElementById('setupModal');
      m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const stillVisible = await page.evaluate(() =>
      document.getElementById('setupModal').style.display === 'flex'
    );
    expect(stillVisible).toBe(true);
    // Cleanup
    await page.evaluate(() => { document.getElementById('setupModal').style.display = 'none'; });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #3 — body min-height uses 100dvh with 100vh fallback
// ───────────────────────────────────────────────────────────────────────────
test.describe('#3 Viewport height uses dvh', () => {
  test('body stylesheet declares min-height:100dvh', async ({ page }) => {
    await loadApp(page);
    const hasDvh = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === 'body' && rule.style.minHeight) {
              // Chrome stores both fallback and final min-height; final declaration wins
              // We check the raw cssText for the dvh token.
              if (rule.cssText.includes('100dvh')) return true;
            }
          }
        } catch (e) { /* cross-origin sheet */ }
      }
      return false;
    });
    expect(hasDvh).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #6 — Accessibility: aria roles, labels, live regions
// ───────────────────────────────────────────────────────────────────────────
test.describe('#6 Accessibility roles and labels', () => {
  test('desktop tabs container is a tablist with role=tab children', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('.tabs')).toHaveAttribute('role', 'tablist');
    const firstTab = page.locator('.tab-btn').first();
    await expect(firstTab).toHaveAttribute('role', 'tab');
  });

  test('group toggle pills are a tablist with aria-selected mirroring active state', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('#groupToggle')).toHaveAttribute('role', 'tablist');
    await expect(page.locator('#pillOps')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#pillStrat')).toHaveAttribute('aria-selected', 'false');
    // Switch and verify the flip
    await page.evaluate(() => window.switchGroup('strat'));
    await expect(page.locator('#pillOps')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#pillStrat')).toHaveAttribute('aria-selected', 'true');
  });

  test('active tab has aria-selected=true, inactive has false', async ({ page }) => {
    await loadApp(page);
    const resumenTab = page.locator('.tab-btn').filter({ hasText: /Resumen/ });
    const alertasTab = page.locator('.tab-btn').filter({ hasText: /Alertas/ });
    await expect(resumenTab).toHaveAttribute('aria-selected', 'true');
    await expect(alertasTab).toHaveAttribute('aria-selected', 'false');
    await alertasTab.click();
    await expect(resumenTab).toHaveAttribute('aria-selected', 'false');
    await expect(alertasTab).toHaveAttribute('aria-selected', 'true');
  });

  test('all 12 panels have role=tabpanel', async ({ page }) => {
    await loadApp(page);
    const panels = await page.locator('.panel[role="tabpanel"]').count();
    expect(panels).toBe(12);
  });

  test('icon-only header buttons have aria-label', async ({ page }) => {
    await loadApp(page);
    for (const id of ['themeBtn', 'snapBtn', 'backBtn', 'refreshBtn', 'overflowBtn']) {
      const label = await page.locator(`#${id}`).getAttribute('aria-label');
      expect(label, `#${id} should have aria-label`).not.toBeNull();
      expect(label.length).toBeGreaterThan(0);
    }
  });

  test('kpiRow is an aria-live polite region', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('#kpiRow')).toHaveAttribute('aria-live', 'polite');
  });

  test('overflow menu trigger tracks aria-expanded', async ({ page }) => {
    await loadApp(page);
    const btn = page.locator('#overflowBtn');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await page.evaluate(() => window.toggleOverflow());
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await page.evaluate(() => window.closeOverflow());
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #7 — Minimum text sizes for legibility
// ───────────────────────────────────────────────────────────────────────────
test.describe('#7 Text sizes meet the 10-11px floor', () => {
  test('.meta-label is at least 11px on desktop', async ({ page }) => {
    await loadApp(page);
    const size = await page.evaluate(() => {
      const el = document.querySelector('.meta-label');
      return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
    });
    expect(size).toBeGreaterThanOrEqual(11);
  });

  test('mobile bottom-nav labels are at least 10px (was 9px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadApp(page);
    const size = await page.evaluate(() => {
      const btn = document.querySelector('.mnav-btn');
      return btn ? parseFloat(getComputedStyle(btn).fontSize) : 0;
    });
    expect(size).toBeGreaterThanOrEqual(10);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #8 — prefers-reduced-motion + SVG chrome icons
// ───────────────────────────────────────────────────────────────────────────
test.describe('#8 Reduced motion + SVG icons', () => {
  test.use({ colorScheme: 'dark' });

  test('prefers-reduced-motion disables pulse animation', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await loadApp(page);
    const duration = await page.evaluate(() => {
      const el = document.querySelector('.loader-dot, .logo-dot');
      if (!el) return null;
      return getComputedStyle(el).animationDuration;
    });
    // With reduced motion, we force .loader-dot,.logo-dot,.alert-dot animation to none
    expect(duration).toMatch(/^0s$|^none$/);
    await context.close();
  });

  test('header icon buttons render SVG, not emoji glyphs', async ({ page }) => {
    await loadApp(page);
    for (const id of ['themeBtn', 'snapBtn', 'backBtn', 'refreshBtn', 'overflowBtn']) {
      const svgCount = await page.locator(`#${id} svg`).count();
      expect(svgCount, `#${id} should contain an inline SVG`).toBeGreaterThanOrEqual(1);
    }
  });

  test('theme toggle swaps sun ↔ moon SVG', async ({ page }) => {
    await loadApp(page);
    // Starts in dark → expect sun icon (to switch to light)
    const initialHtml = await page.locator('#themeBtn').innerHTML();
    expect(initialHtml).toContain('<svg');
    await page.evaluate(() => window.toggleTheme());
    const afterHtml = await page.locator('#themeBtn').innerHTML();
    expect(afterHtml).toContain('<svg');
    // Different icon should have different path count signature
    expect(afterHtml).not.toBe(initialHtml);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #9 — Stat-pill / stat-row / stat-value class system
// ───────────────────────────────────────────────────────────────────────────
test.describe('#9 Stat-pill class system replaces [style*=…] selectors', () => {
  test('projector committed funds uses .stat-row container with .stat-pill children', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('proyector'));
    const row = await page.locator('#committedSimulation .stat-row').count();
    expect(row).toBeGreaterThanOrEqual(1);
    const pills = await page.locator('#committedSimulation .stat-pill').count();
    expect(pills).toBeGreaterThanOrEqual(4);
  });

  test('projector stat values use .stat-value class', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('proyector'));
    const count = await page.locator('#committedSimulation .stat-value').count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('metasList pct uses .stat-value (not inline font-size:22px selector)', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window.showTab('metas'));
    await expect(page.locator('#metasList .mono.stat-value').first()).toBeVisible();
  });

  test('no CSS rule references [style*= in remaining stylesheet', async ({ page }) => {
    await loadApp(page);
    const attrSelectors = await page.evaluate(() => {
      const count = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText && rule.cssText.includes('[style*=')) count.push(rule.cssText);
          }
        } catch (e) {}
      }
      return count;
    });
    expect(attrSelectors).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #14 — tabular-nums on .mono
// ───────────────────────────────────────────────────────────────────────────
test.describe('#14 Tabular nums prevent digit jitter', () => {
  test('.mono elements have font-variant-numeric:tabular-nums', async ({ page }) => {
    await loadApp(page);
    const variant = await page.evaluate(() => {
      const el = document.querySelector('.mono');
      return el ? getComputedStyle(el).fontVariantNumeric : '';
    });
    expect(variant).toContain('tabular-nums');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #15 — Momentum scrolling on modals
// ───────────────────────────────────────────────────────────────────────────
test.describe('#15 Modals use -webkit-overflow-scrolling:touch', () => {
  test('modal stylesheet declares -webkit-overflow-scrolling:touch', async ({ page }) => {
    // Chromium silently drops unrecognized properties like -webkit-overflow-scrolling
    // from the CSSOM (the declaration is for iOS Safari's benefit). Check the raw
    // HTML source instead so we confirm the CSS rule is shipped.
    await loadApp(page);
    const source = await page.evaluate(() => fetch('/cnt.html').then(r => r.text()));
    const modalWebkitRule = /#editModal[^{]*{[^}]*-webkit-overflow-scrolling:\s*touch/.test(source);
    expect(modalWebkitRule).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #16 — Haptic feedback on key actions
// ───────────────────────────────────────────────────────────────────────────
test.describe('#16 Haptic feedback', () => {
  test('toggling a pago calls navigator.vibrate', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      window.__vibrateCalls = [];
      navigator.vibrate = (p) => { window.__vibrateCalls.push(p); return true; };
    });
    await page.evaluate(() => window.toggleCheck(0));
    const calls = await page.evaluate(() => window.__vibrateCalls);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  test('liquidar deuda triggers a stronger vibration pattern', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => {
      window.__vibrateCalls = [];
      navigator.vibrate = (p) => { window.__vibrateCalls.push(p); return true; };
    });
    await page.evaluate(() => window.liquidarDeuda(0));
    const calls = await page.evaluate(() => window.__vibrateCalls);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // liquidar uses a multi-pulse pattern (array), not a single integer
    expect(Array.isArray(calls[0])).toBe(true);
    expect(calls[0].length).toBeGreaterThanOrEqual(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #17 — .setup-card class on setup modal
// ───────────────────────────────────────────────────────────────────────────
test.describe('#17 Setup modal uses .setup-card class', () => {
  test('setup modal contains an element with .setup-card class', async ({ page }) => {
    await loadApp(page);
    const count = await page.locator('#setupModal .setup-card').count();
    expect(count).toBe(1);
  });

  test('CSS rule uses .setup-card, not #setupModal>div>div', async ({ page }) => {
    await loadApp(page);
    const hasFragileSelector = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === '#setupModal>div>div') return true;
          }
        } catch (e) {}
      }
      return false;
    });
    expect(hasFragileSelector).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #5 — Magic mobile-chrome padding moved to a CSS custom property
// ───────────────────────────────────────────────────────────────────────────
test.describe('#5 Mobile chrome padding uses CSS variable', () => {
  test('--mobile-chrome-h is declared on :root', async ({ page }) => {
    await loadApp(page);
    const val = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--mobile-chrome-h').trim()
    );
    expect(val).toBe('120px');
  });

  test('mobile .panel padding-bottom references the variable (not a hard-coded px)', async ({ page }) => {
    await loadApp(page);
    const source = await page.evaluate(() => fetch('/cnt.html').then(r => r.text()));
    // The rule should reference var(--mobile-chrome-h), not 120px directly
    expect(source).toMatch(/padding-bottom:calc\(var\(--mobile-chrome-h\)/);
    expect(source).not.toMatch(/padding-bottom:calc\(120px \+ env/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #11 — Z-index scale as CSS custom properties
// ───────────────────────────────────────────────────────────────────────────
test.describe('#11 Z-index scale uses CSS variables', () => {
  test('all named z-indexes resolve to numeric values in ascending layer order', async ({ page }) => {
    await loadApp(page);
    const scale = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const names = ['--z-header', '--z-nav', '--z-group-toggle', '--z-pwa-banner',
                     '--z-overflow', '--z-edit-modal', '--z-cierre-modal', '--z-setup-modal'];
      return names.map(n => ({ n, v: parseInt(root.getPropertyValue(n).trim(), 10) }));
    });
    // All resolved
    for (const { n, v } of scale) expect(v, `${n} should be a number`).toBeGreaterThan(0);
    // Ascending order header < nav < banner < overflow < edit < cierre < setup
    const values = scale.map(s => s.v);
    const sorted = [...values].sort((a, b) => a - b);
    expect(values).toEqual(sorted);
  });

  test('core modals use the z-index variables (not literals)', async ({ page }) => {
    await loadApp(page);
    const source = await page.evaluate(() => fetch('/cnt.html').then(r => r.text()));
    // The CSS for #editModal and #cierreModal should use var(--z-...)
    expect(source).toMatch(/#editModal\{[^}]*z-index:var\(--z-edit-modal\)/);
    expect(source).toMatch(/#cierreModal\{[^}]*z-index:var\(--z-cierre-modal\)/);
    expect(source).toMatch(/#mobileNav\{[^}]*z-index:var\(--z-nav\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #13 — Chart heights use fixed breakpoints, not vw
// ───────────────────────────────────────────────────────────────────────────
test.describe('#13 Chart heights — no vw', () => {
  test('.chart-wrap stylesheet rule contains no vw unit', async ({ page }) => {
    await loadApp(page);
    const source = await page.evaluate(() => fetch('/cnt.html').then(r => r.text()));
    // Extract the .chart-wrap{...} block; assert it contains a px height but no vw
    const chartWrap = source.match(/\.chart-wrap\{[^}]+\}/);
    expect(chartWrap).not.toBeNull();
    expect(chartWrap[0]).not.toMatch(/vw/);
    expect(chartWrap[0]).toMatch(/\d+px/);
  });

  test('chart container renders with a concrete height on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadApp(page);
    const h = await page.evaluate(() => {
      const el = document.querySelector('.chart-wrap');
      return el ? el.getBoundingClientRect().height : 0;
    });
    expect(h).toBeGreaterThan(150);
    expect(h).toBeLessThan(260);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #10 — Mobile bottom nav: icon-only on narrow screens
// ───────────────────────────────────────────────────────────────────────────
test.describe('#10 Compact bottom nav', () => {
  test('≤400px viewport: mnav text labels are visually hidden (sr-only)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const page = await context.newPage();
    await loadApp(page);
    // Find a visible .mnav-btn and its label span (not mnav-icon)
    const labelGeom = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.mnav-btn')).find(b => b.offsetParent !== null);
      if (!btn) return null;
      const label = btn.querySelector('span:not(.mnav-icon)');
      if (!label) return null;
      const rect = label.getBoundingClientRect();
      const cs = getComputedStyle(label);
      return { w: rect.width, h: rect.height, position: cs.position };
    });
    expect(labelGeom, 'expected to find a .mnav-btn with a label span').not.toBeNull();
    // sr-only pattern clips to 1px × 1px with position:absolute
    expect(labelGeom.w).toBeLessThanOrEqual(1.5);
    expect(labelGeom.h).toBeLessThanOrEqual(1.5);
    expect(labelGeom.position).toBe('absolute');
    await context.close();
  });

  test('>400px viewport: labels visible at normal size', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 480, height: 800 } });
    const page = await context.newPage();
    await loadApp(page);
    const labelH = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.mnav-btn')).find(b => b.offsetParent !== null);
      if (!btn) return 0;
      const label = btn.querySelector('span:not(.mnav-icon)');
      return label ? label.getBoundingClientRect().height : 0;
    });
    expect(labelH).toBeGreaterThan(5);
    await context.close();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #12 — Hide-on-scroll header (mobile only)
// ───────────────────────────────────────────────────────────────────────────
test.describe('#12 Hide-on-scroll header', () => {
  test('mobile: scroll down past threshold adds .hidden class to header', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 700 } });
    const page = await context.newPage();
    await loadApp(page);
    // Trigger a scroll event with window.scrollY > threshold and a downward delta
    await page.evaluate(() => {
      // Ensure panel has enough content to be scrollable
      document.body.style.minHeight = '3000px';
      window.scrollTo(0, 200);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => { window.scrollTo(0, 400); window.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(50);
    const hidden = await page.evaluate(() => document.querySelector('header').classList.contains('hidden'));
    expect(hidden).toBe(true);
    await context.close();
  });

  test('mobile: scroll up reveals the header', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 700 } });
    const page = await context.newPage();
    await loadApp(page);
    await page.evaluate(() => {
      document.body.style.minHeight = '3000px';
      window.scrollTo(0, 500);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => { window.scrollTo(0, 700); window.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(50);
    await page.evaluate(() => { window.scrollTo(0, 600); window.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(50);
    const hidden = await page.evaluate(() => document.querySelector('header').classList.contains('hidden'));
    expect(hidden).toBe(false);
    await context.close();
  });

  test('desktop (>640px): header never gets .hidden class on scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loadApp(page);
    await page.evaluate(() => {
      document.body.style.minHeight = '3000px';
      window.scrollTo(0, 500);
      window.dispatchEvent(new Event('scroll'));
      window.scrollTo(0, 1000);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(100);
    const hidden = await page.evaluate(() => document.querySelector('header').classList.contains('hidden'));
    expect(hidden).toBe(false);
  });

  test('open modal suppresses hide-on-scroll', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 700 } });
    const page = await context.newPage();
    await loadApp(page);
    await page.evaluate(() => window.openEditModal());
    await page.evaluate(() => {
      document.body.style.minHeight = '3000px';
      window.scrollTo(0, 400);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(50);
    const hidden = await page.evaluate(() => document.querySelector('header').classList.contains('hidden'));
    expect(hidden).toBe(false);
    await context.close();
  });
});
