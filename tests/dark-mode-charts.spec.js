const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Dark-mode chart readability
 *
 * Chart.js renders to canvas and can't follow CSS variables, so the previous
 * setup hardcoded a single color (`#4a5d80`) for chart text in both themes —
 * making axes, legends and tooltip body text near-invisible on dark
 * backgrounds. This spec locks in:
 *
 *   1. Chart.defaults.color is theme-aware after applyChartTheme().
 *   2. ttStyleNow() returns dark-on-dark vs light-on-light tooltip styles.
 *   3. toggleTheme() flips Chart.defaults.color so existing charts re-render
 *      with readable text on the next buildDashboard.
 *   4. No chart legend config still hardcodes the dim slate color in source.
 */

test.describe('Chart theme defaults', () => {
  test('Chart.defaults.color is the brighter slate in dark mode at startup', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof Chart !== 'undefined');
    const c = await page.evaluate(() => Chart.defaults.color);
    // #94a3b8 (slate-400) — passes WCAG AA on the dark surface.
    expect(c.toLowerCase()).toBe('#94a3b8');
  });

  test('Chart.defaults.color flips to the slate-600 family after switching to light mode', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof Chart !== 'undefined' && typeof toggleTheme === 'function');
    await page.evaluate(() => toggleTheme());
    // Theme should now be 'light'
    const isLight = await page.evaluate(() => document.body.classList.contains('light'));
    expect(isLight).toBe(true);
    const c = await page.evaluate(() => Chart.defaults.color);
    expect(c.toLowerCase()).toBe('#475569');
  });
});

test.describe('ttStyleNow tooltip palette', () => {
  test('returns the dark palette by default', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof ttStyleNow === 'function');
    const tt = await page.evaluate(() => ttStyleNow());
    expect(tt.backgroundColor).toBe('#1a2540');
    expect(tt.titleColor).toBe('#e2eaf8');
    // bodyColor must be lighter than the previous static '#94a3b8' was OK,
    // but we now use #cbd5e1 (slate-300) for stronger readability.
    expect(tt.bodyColor).toBe('#cbd5e1');
  });

  test('flips to the light palette after toggleTheme', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof toggleTheme === 'function');
    await page.evaluate(() => toggleTheme());
    const tt = await page.evaluate(() => ttStyleNow());
    expect(tt.backgroundColor).toBe('#ffffff');
    expect(tt.titleColor).toBe('#1a2540');
    expect(tt.bodyColor).toBe('#475569');
  });
});

test.describe('Source hygiene — no stale chart color overrides', () => {
  test('no chart legend config hardcodes the old #4a5d80 muted color', async () => {
    // Grep-style guard against the previous bad pattern reappearing in chart
    // configs — read the file directly so we don't depend on app boot state.
    const src = fs.readFileSync(path.join(__dirname, '..', 'cnt.html'), 'utf8');
    expect(src).not.toMatch(/labels:\s*\{[^}]*color:\s*['"]#4a5d80['"]/);
    expect(src).not.toMatch(/labels:\s*\{[^}]*color:\s*['"]var\(--muted\)['"]/);
  });
});

test.describe('Demo render with theme flip — chart canvases stay populated', () => {
  test('toggling theme rebuilds the dashboard so the regCat doughnut keeps its canvas', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.evaluate(() => window.loadDemo('RD'));
    await page.waitForSelector('#dashApp', { state: 'visible' });
    // Switch to Registro tab where the spending-by-category doughnut lives
    await page.evaluate(() => showTab('registro', null));
    // Force-render at least one tx so the chart materializes
    await page.evaluate(() => {
      _editData.transacciones = _editData.transacciones || [];
      _editData.transacciones.push({ fecha: '2026-05-10', monto: 1500, categoria: 'comida', metodo: 'efectivo', mes: 'Mayo', anio: 2026, applied: true, cuentaId: _editData.config.defaultCashAccountId });
      buildDashboard({ ..._editData });
    });
    const canvasBefore = await page.locator('#regCatChart').count();
    expect(canvasBefore).toBe(1);
    // Flip theme; chart should re-render not vanish
    await page.evaluate(() => toggleTheme());
    const canvasAfter = await page.locator('#regCatChart').count();
    expect(canvasAfter).toBe(1);
    const isLight = await page.evaluate(() => document.body.classList.contains('light'));
    expect(isLight).toBe(true);
  });
});
