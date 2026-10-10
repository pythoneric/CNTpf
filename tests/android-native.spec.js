// @ts-check
// Android (Capacitor) platform layer. A fake window.Capacitor is injected before
// the page loads so the IS_NATIVE branches run in Chromium; the real plugins are
// exercised on device/emulator.
const { test, expect } = require('@playwright/test');

const APP = 'http://localhost:8080/cnt.html';

function fakeCapacitor() {
  const calls = [];
  const listeners = {};
  window.__cap = { calls, listeners };
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      App: {
        addListener: (ev, fn) => { listeners[ev] = fn; return Promise.resolve({ remove() {} }); },
        minimizeApp: () => { calls.push(['minimizeApp']); return Promise.resolve(); },
      },
      Filesystem: {
        writeFile: (o) => { calls.push(['writeFile', o.directory, o.path, o.data]); return Promise.resolve({ uri: 'file:///cache/' + o.path }); },
      },
      Share: {
        share: (o) => { calls.push(['share', o.files]); return window.__shareCancel ? Promise.reject(new Error('Share canceled')) : Promise.resolve({}); },
      },
      Print: {
        print: (o) => { calls.push(['print', o.name]); return Promise.resolve(); },
      },
    },
  };
}

async function loadNativeDemo(page) {
  await page.addInitScript(fakeCapacitor);
  await page.goto(APP);
  await page.waitForSelector('#loaderScreen', { state: 'visible' });
  await page.evaluate(() => loadDemo());
  await page.waitForSelector('#dashApp', { state: 'visible', timeout: 10000 });
}

test.describe('Web build is unaffected', () => {
  test('IS_NATIVE is false and no native class is set', async ({ page }) => {
    await page.goto(APP);
    expect(await page.evaluate(() => IS_NATIVE)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.classList.contains('cap-native'))).toBe(false);
  });
});

test.describe('Android platform layer', () => {
  test('flags the document and skips the service worker', async ({ page }) => {
    await page.addInitScript(fakeCapacitor);
    await page.goto(APP);
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => IS_NATIVE)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.classList.contains('cap-native'))).toBe(true);
    const regs = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length));
    expect(regs).toBe(0);
  });

  test('backup export writes to Documents/BitEric and opens the share sheet', async ({ page }) => {
    await loadNativeDemo(page);
    const ok = await page.evaluate(() => downloadJSON());
    expect(ok).toBe(true);
    const calls = await page.evaluate(() => window.__cap.calls);
    const docs = calls.find(c => c[0] === 'writeFile' && c[1] === 'DOCUMENTS');
    expect(docs[2]).toMatch(/^BitEric\/cnt_\d{8}\.json$/);
    const data = JSON.parse(docs[3]);
    expect(data._meta.app).toBe('CNTpf');
    expect(data.gastos).toBeDefined();
    expect(calls.some(c => c[0] === 'writeFile' && c[1] === 'CACHE')).toBe(true);
    expect(calls.find(c => c[0] === 'share')[1][0]).toMatch(/^file:\/\/\/cache\/cnt_\d{8}\.json$/);
  });

  test('dismissing the share sheet still counts as saved (Documents copy exists)', async ({ page }) => {
    await loadNativeDemo(page);
    await page.evaluate(() => { window.__shareCancel = true; });
    expect(await page.evaluate(() => downloadJSON())).toBe(true);
  });

  test('back button closes an open modal before navigating', async ({ page }) => {
    await loadNativeDemo(page);
    await page.evaluate(() => { showTab('deudas'); openHelp(); });
    await expect(page.locator('#helpModal')).toHaveClass(/open/);
    await page.evaluate(() => window.__cap.listeners.backButton());
    await expect(page.locator('#helpModal')).not.toHaveClass(/open/);
    await expect(page.locator('#tab-deudas')).toHaveClass(/active/);
  });

  test('back button returns to Resumen, then minimizes the app', async ({ page }) => {
    await loadNativeDemo(page);
    await page.evaluate(() => showTab('deudas'));
    await page.evaluate(() => window.__cap.listeners.backButton());
    await expect(page.locator('#tab-resumen')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.__cap.calls.some(c => c[0] === 'minimizeApp'))).toBe(false);
    await page.evaluate(() => window.__cap.listeners.backButton());
    expect(await page.evaluate(() => window.__cap.calls.some(c => c[0] === 'minimizeApp'))).toBe(true);
  });

  test('PDF snapshot uses the native print plugin instead of window.print', async ({ page }) => {
    await loadNativeDemo(page);
    await page.evaluate(() => { window.print = () => window.__cap.calls.push(['window.print']); exportSnapshot(); });
    const calls = await page.evaluate(() => window.__cap.calls.map(c => c[0]));
    expect(calls).toContain('print');
    expect(calls).not.toContain('window.print');
  });

  test('app pause flushes a pending autosave immediately', async ({ page }) => {
    await loadNativeDemo(page);
    // Read back well before the 500 ms debounce would have fired on its own.
    const mes = await page.evaluate(async () => {
      _editData.config.mes = 'PAUSE_TEST'; autoSave(); window.__cap.listeners.pause();
      await new Promise(r => setTimeout(r, 150));
      return (await dbGet(STORE_DATA, 'meta')).mes;
    });
    expect(mes).toBe('PAUSE_TEST');
  });
});
