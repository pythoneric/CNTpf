const { test, expect } = require('@playwright/test');

/**
 * Every export entry point in the app.
 *
 * All JSON exports go through saveJSONFile(): an <a download> click whose
 * object URL is revoked on a delay (revoking synchronously cancels the
 * download in Safari / Firefox / some Android browsers), or the share sheet
 * on iOS home-screen apps where <a download> does nothing. Each export now
 * reports its result with a toast, so a failed export can't pass silently.
 *
 * Sub-suites:
 *   1. Edit modal "Guardar y exportar" — both buttons, every tab, content
 *   2. Edit modal "Guardar" does NOT export
 *   3. Save & export with the balance-debit prompt
 *   4. Robustness: render error, deferred revoke, failure toast
 *   5. iOS standalone → share sheet
 *   6. Checklist "Guardar"
 *   7. Setup wizard finish
 *   8. Cierre de mes finish
 *   9. Demo guard "Descargar respaldo y continuar"
 *  10. Header "Exportar PDF"
 *  11. i18n
 */

const EDIT_TABS = ['config', 'esenciales', 'fornow', 'emergency', 'historial', 'transacciones', 'presupuesto', 'recurrentes', 'activos', 'sinking', 'ingresos'];

async function loadDemo(page, currency = 'RD') {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window.loadDemo === 'function');
  await page.evaluate(c => window.loadDemo(c), currency);
  await page.waitForSelector('#dashApp', { state: 'visible' });
  await page.evaluate(() => window._testSetLang('es'));
}

async function openEdit(page, tab) {
  await page.evaluate(() => window.openEditModal());
  await expect(page.locator('#editModal')).toHaveClass(/open/);
  if (tab) await page.evaluate(id => showEditTab(id, document.querySelector(`.edit-tab[onclick*="'${id}'"]`)), tab);
}

async function readJSON(download) {
  const chunks = await (await download.createReadStream()).toArray();
  return JSON.parse(Buffer.concat(chunks).toString());
}

const toasts = page => page.locator('[role="status"]');

// ───────────────────────────────────────────────────────────────────
// 1. Edit modal "Guardar y exportar"
// ───────────────────────────────────────────────────────────────────
test.describe('Edit → Guardar y exportar', () => {
  for (const tab of EDIT_TABS) {
    test(`bottom button exports from the ${tab} tab`, async ({ page }) => {
      await loadDemo(page);
      await openEdit(page, tab);
      await expect(page.locator(`#esection-${tab}`)).toHaveClass(/active/);
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('.save-bar .btn-success').click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^cnt_\d{8}\.json$/);
      await expect(page.locator('#editModal')).not.toHaveClass(/open/);
    });
  }

  test('top button exports too', async ({ page }) => {
    await loadDemo(page);
    await openEdit(page, 'fornow');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.edit-actions .btn-success').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cnt_\d{8}\.json$/);
  });

  test('exported file carries the Fondos edits and a _meta block', async ({ page }) => {
    await loadDemo(page);
    await openEdit(page, 'fornow');
    // First non-wallet account's saldo input (the wallet row is read-only)
    const input = page.locator('#fornowEditBody input[inputmode="decimal"]:not([readonly])').first();
    const idx = await input.evaluate(el => [...document.querySelectorAll('#fornowEditBody tr')].indexOf(el.closest('tr')));
    await input.fill('123456');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.save-bar .btn-success').click(),
    ]);
    const json = await readJSON(download);
    expect(json.forNow.cuentas[idx].saldo).toBe(123456);
    expect(json._meta).toMatchObject({ app: 'CNTpf' });
    expect(json._meta.version).toBe(await page.evaluate(() => SCHEMA_VERSION));
  });

  test('exported file carries Emergencia fund edits', async ({ page }) => {
    await loadDemo(page);
    await openEdit(page, 'emergency');
    await page.locator('#emergFundsEditBody tr').first().locator('input[inputmode="decimal"]').first().fill('7777');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.save-bar .btn-success').click(),
    ]);
    expect((await readJSON(download)).emerg.fondos[0].balance).toBe(7777);
  });

  test('shows a success toast with the file name', async ({ page }) => {
    await loadDemo(page);
    await openEdit(page, 'fornow');
    await Promise.all([page.waitForEvent('download'), page.locator('.save-bar .btn-success').click()]);
    await expect(toasts(page).filter({ hasText: /Respaldo exportado · cnt_\d{8}\.json/ })).toHaveCount(1);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. "Guardar" alone never exports
// ───────────────────────────────────────────────────────────────────
test.describe('Edit → Guardar', () => {
  test('saves and closes without downloading', async ({ page }) => {
    await loadDemo(page);
    await openEdit(page, 'fornow');
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.locator('.save-bar .btn-primary').click();
    await expect(page.locator('#editModal')).not.toHaveClass(/open/);
    await page.waitForTimeout(500);
    expect(downloaded).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. With the balance-debit prompt in between
// ───────────────────────────────────────────────────────────────────
test.describe('Save & export with a debt balance decrease', () => {
  async function lowerFirstDebt(page) {
    await page.evaluate(() => {
      const i = _editData.gastos.findIndex(g => g.balance > 1000);
      _editData.gastos[i].balance -= 1000;
    });
  }

  test('exports after the prompt is answered', async ({ page }) => {
    await loadDemo(page);
    await openEdit(page, 'esenciales');
    await lowerFirstDebt(page);
    await page.locator('.save-bar .btn-success').click();
    await expect(page.locator('#balanceDebitModal')).toHaveClass(/open/);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#balanceDebitModal .btn-primary').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cnt_\d{8}\.json$/);
  });

  test('"Volver a editar" exports nothing', async ({ page }) => {
    await loadDemo(page);
    await openEdit(page, 'esenciales');
    await lowerFirstDebt(page);
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.locator('.save-bar .btn-success').click();
    await page.locator('#balanceDebitModal .btn-ghost').click();
    await page.waitForTimeout(500);
    expect(downloaded).toBe(false);
    await expect(page.locator('#editModal')).toHaveClass(/open/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Robustness
// ───────────────────────────────────────────────────────────────────
test.describe('Export robustness', () => {
  test('a dashboard render error does not swallow the export', async ({ page }) => {
    await loadDemo(page);
    await openEdit(page, 'fornow');
    await page.evaluate(() => {
      const orig = window.buildDashboard;
      window.buildDashboard = function () { window.buildDashboard = orig; throw new Error('boom'); };
    });
    page.on('pageerror', () => {});
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => { try { applyAndDownload(); } catch (e) {} }),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cnt_\d{8}\.json$/);
  });

  test('object URL is revoked after a delay, not synchronously', async ({ page }) => {
    await loadDemo(page);
    const r = await page.evaluate(async () => {
      const revoked = [];
      const orig = URL.revokeObjectURL;
      URL.revokeObjectURL = u => { revoked.push(u); orig.call(URL, u); };
      downloadJSON();
      const sync = revoked.length;
      await new Promise(res => setTimeout(res, 4500));
      URL.revokeObjectURL = orig;
      return { sync, later: revoked.length, anchorsLeft: document.querySelectorAll('a[download]').length };
    });
    expect(r.sync).toBe(0);
    expect(r.later).toBe(1);
    expect(r.anchorsLeft).toBe(0);
  });

  test('a failure shows an error toast instead of failing silently', async ({ page }) => {
    await loadDemo(page);
    const ok = await page.evaluate(async () => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = () => { throw new Error('blocked'); };
      try { return await downloadJSON(); } finally { URL.createObjectURL = orig; }
    });
    expect(ok).toBe(false);
    await expect(toasts(page).filter({ hasText: 'No se pudo exportar' })).toHaveCount(1);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. iOS home-screen app → share sheet
// ───────────────────────────────────────────────────────────────────
test.describe('iOS standalone share sheet', () => {
  async function fakeIOSStandalone(page, shareImpl) {
    await page.addInitScript(impl => {
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15' });
      Object.defineProperty(navigator, 'standalone', { get: () => true });
      window.__shared = [];
      navigator.canShare = () => true;
      navigator.share = data => {
        window.__shared.push({ name: data.files[0].name, type: data.files[0].type });
        if (impl === 'abort') return Promise.reject(new DOMException('cancel', 'AbortError'));
        if (impl === 'fail') return Promise.reject(new Error('not allowed'));
        return Promise.resolve();
      };
    }, shareImpl);
  }

  test('uses navigator.share with a JSON file instead of a download', async ({ page }) => {
    await fakeIOSStandalone(page, 'ok');
    await loadDemo(page);
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    const ok = await page.evaluate(() => downloadJSON());
    expect(ok).toBe(true);
    const shared = await page.evaluate(() => window.__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0].name).toMatch(/^cnt_\d{8}\.json$/);
    expect(shared[0].type).toBe('application/json');
    expect(downloaded).toBe(false);
  });

  test('dismissing the share sheet is not an error and shows no toast', async ({ page }) => {
    await fakeIOSStandalone(page, 'abort');
    await loadDemo(page);
    expect(await page.evaluate(() => downloadJSON())).toBe(false);
    await expect(toasts(page).filter({ hasText: /exportado|exportar/ })).toHaveCount(0);
  });

  test('a share error falls back to a regular download', async ({ page }) => {
    await fakeIOSStandalone(page, 'fail');
    await loadDemo(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cnt_\d{8}\.json$/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. Checklist "Guardar"
// ───────────────────────────────────────────────────────────────────
test.describe('Checklist save button', () => {
  test('exports the JSON', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => { _pendingSave = true; buildChecklist(_editData.gastos); });
    const btn = page.locator('button[onclick="saveChecklist()"]').first();
    await expect(btn).toHaveCount(1);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      btn.evaluate(b => b.click()),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cnt_\d{8}\.json$/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 7. Setup wizard finish
// ───────────────────────────────────────────────────────────────────
test.describe('Setup wizard finish', () => {
  test('downloads the initial backup with only the wizard toast', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testSetupGoToStep === 'function');
    await page.evaluate(() => startFromScratch());
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => { window._testSetupGoToStep(_setupSteps.length - 1); setupNav(1); }),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cnt_\d{8}\.json$/);
    await expect(toasts(page).filter({ hasText: 'Respaldo exportado' })).toHaveCount(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 8. Cierre de mes finish
// ───────────────────────────────────────────────────────────────────
test.describe('Cierre de mes finish', () => {
  test('downloads the JSON and keeps the summary toast alone', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => { openCierre(); _cierreStep = cierreSteps().length - 1; renderCierre(); });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => cierreNav(1)),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cnt_\d{8}\.json$/);
    await expect(toasts(page).filter({ hasText: 'Respaldo exportado' })).toHaveCount(0);
  });
});

// ───────────────────────────────────────────────────────────────────
// 9. Demo guard backup
// ───────────────────────────────────────────────────────────────────
test.describe('Demo guard → Descargar respaldo y continuar', () => {
  test('backs up the saved record, then loads the demo', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemoSafe === 'function');
    await page.evaluate(async () => {
      const data = window.defaultEditData();
      data.config.ingresoUSD = 4321;
      data.filename = 'mine.json';
      await window.dbSet('dashboard_data', 'editData', data);
      await window.dbSet('dashboard_data', 'meta', { mes: 'Marzo', anio: 2026, filename: 'mine.json', savedAt: new Date().toISOString() });
    });
    await page.evaluate(() => window.loadDemoSafe('RD'));
    await expect(page.locator('#demoConfirmModal')).toHaveClass(/open/);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#demoConfirmModal .btn-success'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cnt_backup_\d{8}\.json$/);
    const json = await readJSON(download);
    expect(json.filename).toBe('mine.json');
    expect(json.config.ingresoUSD).toBe(4321);
    await expect(page.locator('#dashApp')).toBeVisible({ timeout: 10000 });
  });
});

// ───────────────────────────────────────────────────────────────────
// 10. PDF snapshot
// ───────────────────────────────────────────────────────────────────
test.describe('Exportar PDF', () => {
  test('header button and overflow item both open the print dialog', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => { window.__prints = 0; window.print = () => { window.__prints++; }; });
    await page.locator('#snapBtn').evaluate(b => b.click());
    await page.locator('.overflow-item[data-i18n="exportpdf"]').evaluate(b => b.click());
    expect(await page.evaluate(() => window.__prints)).toBe(2);
  });
});

// ───────────────────────────────────────────────────────────────────
// 11. i18n
// ───────────────────────────────────────────────────────────────────
test.describe('Export toasts i18n', () => {
  test('English success and failure toasts', async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => window._testSetLang('en'));
    await Promise.all([page.waitForEvent('download'), page.evaluate(() => downloadJSON())]);
    await expect(toasts(page).filter({ hasText: /Backup exported · cnt_\d{8}\.json/ })).toHaveCount(1);
    await page.evaluate(async () => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = () => { throw new Error('blocked'); };
      try { await downloadJSON(); } finally { URL.createObjectURL = orig; }
    });
    await expect(toasts(page).filter({ hasText: 'Could not export the backup' })).toHaveCount(1);
  });
});
