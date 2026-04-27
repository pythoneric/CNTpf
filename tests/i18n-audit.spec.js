const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * i18n audit — comprehensive guardrail
 *
 * The previous regression had Spanish UI showing English fragments ("Net
 * Worth" on the Dashboard, English-only labels in setup-wizard fields,
 * unlocalised table headers in the Edit modal). This spec catches every
 * known way that bug class can come back:
 *
 *   1. Static parity — LANG.es and LANG.en have the same key set.
 *   2. No untranslated English in Spanish — flagged terms ('Net Worth',
 *      'Personal Finance' as a title, etc.) must not appear in any LANG.es
 *      value.
 *   3. data-i18n hygiene — every key referenced in HTML resolves in both
 *      languages.
 *   4. No bare hardcoded text in the body of <th>, <button data-i18n=*>
 *      defaults, etc. (regression check for the three Edit-modal table
 *      headers we just added data-i18n to).
 *   5. Live render — load demo, switch language, snapshot a few critical
 *      labels (KPI Patrimonio Neto / Net Worth, Historial header, etc.).
 *   6. Setup wizard renders translated step titles and nav buttons.
 *   7. Cuenta-tipo dropdown shows 'Banco' in ES and 'Bank' in EN — locks
 *      the user-reported 'Banc' fragment from sneaking back via a typo.
 */

const SRC = fs.readFileSync(path.join(__dirname, '..', 'cnt.html'), 'utf8');

function parseLangBlock(blockName) {
  // Find the LANG object's <name>: { ... } block and parse key/value pairs.
  const langStart = SRC.indexOf('const LANG');
  const blockHeader = SRC.indexOf(`${blockName}: {`, langStart);
  // End at the next top-level lang block or the closing of LANG entirely.
  const nextLang = blockName === 'es'
    ? SRC.indexOf('\n  en: {', blockHeader)
    : SRC.indexOf('\n  }\n};', blockHeader);
  const block = SRC.slice(blockHeader, nextLang);
  const pairs = {};
  const re = /(?:^|,|\{)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(['"])((?:\\.|(?!\2).)*)\2/gms;
  let m;
  while ((m = re.exec(block))) pairs[m[1]] = m[3];
  return pairs;
}

const ES = parseLangBlock('es');
const EN = parseLangBlock('en');

// ───────────────────────────────────────────────────────────────────
// 1. Parity — every key exists in both languages
// ───────────────────────────────────────────────────────────────────
test.describe('i18n parity — LANG.es ↔ LANG.en', () => {
  test('both languages have at least one key', () => {
    expect(Object.keys(ES).length).toBeGreaterThan(500);
    expect(Object.keys(EN).length).toBeGreaterThan(500);
  });

  test('LANG.es and LANG.en have identical key sets', () => {
    const esKeys = new Set(Object.keys(ES));
    const enKeys = new Set(Object.keys(EN));
    const onlyEs = [...esKeys].filter(k => !enKeys.has(k));
    const onlyEn = [...enKeys].filter(k => !esKeys.has(k));
    expect(onlyEs, `Keys only in ES: ${onlyEs.join(', ')}`).toEqual([]);
    expect(onlyEn, `Keys only in EN: ${onlyEn.join(', ')}`).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. No untranslated English in Spanish values
// ───────────────────────────────────────────────────────────────────
test.describe('LANG.es — no untranslated English fragments', () => {
  // Phrases that have a real Spanish translation and should never appear in ES.
  // Each phrase must be word-bounded so 'Personal' (categoria) doesn't match.
  const FORBIDDEN_PATTERNS = [
    { pattern: /\bNet Worth\b/, replacement: 'Patrimonio Neto' },
    { pattern: /^Personal Finance$/, replacement: 'Finanzas Personales' },
  ];

  for (const { pattern, replacement } of FORBIDDEN_PATTERNS) {
    test(`no LANG.es value matches ${pattern} (use "${replacement}" instead)`, () => {
      const offending = Object.entries(ES).filter(([_, v]) => pattern.test(v));
      expect(offending, `Untranslated keys: ${offending.map(([k, v]) => `${k}="${v}"`).join('; ')}`).toEqual([]);
    });
  }
});

// ───────────────────────────────────────────────────────────────────
// 3. data-i18n hygiene — every HTML reference resolves
// ───────────────────────────────────────────────────────────────────
test.describe('data-i18n attribute hygiene', () => {
  test('every data-i18n key in HTML exists in both LANG.es and LANG.en', () => {
    // Limit scan to the HTML body (before LANG starts) so we don't pick up
    // accidental references inside the JS string fixtures.
    const htmlPart = SRC.slice(0, SRC.indexOf('const LANG'));
    const used = new Set();
    const re = /data-i18n="([^"]+)"/g;
    let m;
    while ((m = re.exec(htmlPart))) used.add(m[1]);
    expect(used.size).toBeGreaterThan(100); // sanity: lots of i18n in this app

    const missingEs = [...used].filter(k => !(k in ES));
    const missingEn = [...used].filter(k => !(k in EN));
    expect(missingEs, `data-i18n keys missing from ES: ${missingEs.join(', ')}`).toEqual([]);
    expect(missingEn, `data-i18n keys missing from EN: ${missingEn.join(', ')}`).toEqual([]);
  });

  test('no <th> tag in the static HTML body lacks data-i18n', () => {
    // Catches the regression where Edit-modal table headers were hardcoded.
    const htmlPart = SRC.slice(0, SRC.indexOf('const LANG'));
    const ths = htmlPart.match(/<th(?:\s[^>]*)?>(?:[^<]+)<\/th>/g) || [];
    const bare = ths.filter(h => !/data-i18n/.test(h) && !/^<th[^>]*>\s*<\/th>/.test(h));
    expect(bare, `<th> tags without data-i18n: ${bare.slice(0, 5).join(' | ')}`).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Live render — switching language updates dashboard labels
// ───────────────────────────────────────────────────────────────────
test.describe('Live render — language switch updates the rendered DOM', () => {
  async function loadDemoEs(page) {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.evaluate(() => window._testSetLang && window._testSetLang('es'));
    await page.evaluate(() => window.loadDemo('RD'));
    await page.waitForSelector('#dashApp', { state: 'visible' });
  }

  test('Spanish dashboard shows "Patrimonio Neto" not "Net Worth" in visible text', async ({ page }) => {
    // page.content() includes the LANG dictionary in the JS source, so we
    // assert against the rendered DOM text only.
    await loadDemoEs(page);
    const visible = await page.locator('#dashApp').innerText();
    expect(visible).toContain('Patrimonio Neto');
    expect(visible).not.toMatch(/\bNet Worth\b/);
  });

  test('English dashboard shows "Net Worth" after toggleLang in visible text', async ({ page }) => {
    await loadDemoEs(page);
    await page.evaluate(() => window._testSetLang('en'));
    const visible = await page.locator('#dashApp').innerText();
    expect(visible).toContain('Net Worth');
    expect(visible).not.toContain('Patrimonio Neto');
  });

  test('KPI label flips with language toggle', async ({ page }) => {
    await loadDemoEs(page);
    const esLabel = await page.locator('text=Patrimonio Neto').first().textContent();
    expect(esLabel).toContain('Patrimonio');
    await page.evaluate(() => window._testSetLang('en'));
    const enHeader = await page.locator('text=Net Worth').first().textContent();
    expect(enHeader).toContain('Net Worth');
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Setup wizard renders translated content
// ───────────────────────────────────────────────────────────────────
test.describe('Setup wizard — i18n applies to dynamic content', () => {
  test('Spanish setup wizard renders Spanish step title + button labels', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testSetupGoToStep === 'function');
    await page.evaluate(() => window._testSetLang('es'));
    // Open setup wizard with a fresh _editData so the render() functions have
    // the config object they reference.
    await page.evaluate(() => {
      _editData = window.defaultEditData();
      document.getElementById('loaderScreen').style.display='none';
      document.getElementById('setupModal').style.display='flex';
      window._testSetupGoToStep(0);
    });
    const title = await page.locator('#setupContent div').first().textContent();
    expect(title).toMatch(/Paso 1/);
    const next = await page.locator('#setupNext').textContent();
    expect(next).toMatch(/Siguiente/);
  });

  test('English setup wizard renders English step title + button labels', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testSetupGoToStep === 'function');
    await page.evaluate(() => window._testSetLang('en'));
    await page.evaluate(() => {
      _editData = window.defaultEditData();
      document.getElementById('loaderScreen').style.display='none';
      document.getElementById('setupModal').style.display='flex';
      window._testSetupGoToStep(0);
    });
    const title = await page.locator('#setupContent div').first().textContent();
    expect(title).toMatch(/Step 1/);
    const next = await page.locator('#setupNext').textContent();
    expect(next).toMatch(/Next/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. Cuenta-tipo dropdown — "Banco" / "Bank" with no truncation
// ───────────────────────────────────────────────────────────────────
test.describe('Cuenta tipo labels — no "Banc" truncation regression', () => {
  test('cuenta_tipo_banco resolves to "Banco" exactly in ES', () => {
    expect(ES.cuenta_tipo_banco).toBe('Banco');
  });

  test('cuenta_tipo_banco resolves to "Bank" exactly in EN', () => {
    expect(EN.cuenta_tipo_banco).toBe('Bank');
  });

  test('Edit modal Fondos tab shows the full "Banco" label in ES', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window._testLoadData === 'function');
    await page.evaluate(() => window._testSetLang('es'));
    await page.evaluate(() => {
      const data = window.defaultEditData();
      data.config.tasa = 60;
      data.forNow.cuentas = [
        { id:'cnt_bank',nombre:'Banco Popular',moneda:'RD',saldo:100,tipo:'banco',comp:0,disp:0 },
      ];
      window._testLoadData(data);
    });
    await page.evaluate(() => openEditModal());
    await page.click('[onclick*="showEditTab(\'fornow\'"]');
    // Read the option text of the tipo select for the bank row
    const bancoOption = await page.evaluate(() => {
      const sel = document.querySelector('#fornowEditBody tr[data-cuenta-id="cnt_bank"] select.fornow-tipo');
      const opt = Array.from(sel.options).find(o => o.value === 'banco');
      return opt && opt.textContent;
    });
    expect(bancoOption).toBe('Banco');
  });
});
