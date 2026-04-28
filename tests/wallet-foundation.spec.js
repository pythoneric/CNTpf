const { test, expect } = require('@playwright/test');

/**
 * Wallet (Mi Saldo / My Balance) — Batch 1: Foundation
 *
 * No behavior change yet — just the schema substrate that batches 2-5 will
 * build on:
 *   - Each forNow.cuentas[] entry has a stable `id` and a `tipo`
 *     (cash | banco | ahorro | inversion).
 *   - config.defaultCashAccountId points to whichever account is the wallet.
 *   - JSON _meta.version bumped 3 → 4. Older payloads migrate transparently.
 *
 * Sub-suites:
 *   1. Schema defaults
 *   2. Migration on import / demo / load
 *   3. Helper functions (getDefaultCashAccount / setDefaultCashAccount /
 *      ensureCuentaIds / payMult-style isolation)
 *   4. Setup wizard step 2 — tipo dropdown + radio
 *   5. Edit modal Fondos tab — tipo column + radio
 *   6. JSON export — version=4, cuentas carry id + tipo
 *   7. i18n keys resolve in es + en
 */

async function loadAppDefault(page) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(() => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.payFrequency = 'mensual';
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    data.forNow.cuentas = [
      { nombre: 'Banco Popular', moneda: 'RD', saldo: 250000, comp: 0, disp: 250000 },
      { nombre: 'Cash en mano', moneda: 'RD', saldo: 5000, comp: 0, disp: 5000 },
    ];
    data.forNow.total = 255000;
    window._testLoadData(data);
  });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. Schema defaults
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet schema — defaults', () => {
  test('defaultEditData() seeds defaultCashAccountId = null', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.defaultEditData === 'function');
    const id = await page.evaluate(() => window.defaultEditData().config.defaultCashAccountId);
    expect(id).toBe(null);
  });

  test('CUENTA_TIPOS exposes the canonical type list', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => Array.isArray(window.CUENTA_TIPOS));
    const tipos = await page.evaluate(() => window.CUENTA_TIPOS);
    expect(tipos).toEqual(['cash', 'banco', 'ahorro', 'inversion']);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Migration on data entry paths
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet migration — id + tipo on every cuenta', () => {
  test('buildDashboard injects id and tipo for cuentas missing them', async ({ page }) => {
    await loadAppDefault(page);
    const cuentas = await page.evaluate(() => _editData.forNow.cuentas.map(c => ({
      id: c.id, tipo: c.tipo, nombre: c.nombre,
    })));
    expect(cuentas).toHaveLength(2);
    for (const c of cuentas) {
      expect(c.id, `${c.nombre} should have a stable id`).toMatch(/^cnt_/);
      expect(c.tipo).toBe('banco'); // default — auto-promotion to 'cash' is reserved for the user explicitly opting in
    }
  });

  test('migration is idempotent (running buildDashboard twice keeps same ids)', async ({ page }) => {
    await loadAppDefault(page);
    const before = await page.evaluate(() => _editData.forNow.cuentas.map(c => c.id));
    await page.evaluate(() => window.buildDashboard({ ..._editData }));
    const after = await page.evaluate(() => _editData.forNow.cuentas.map(c => c.id));
    expect(after).toEqual(before);
  });

  test('demo loader (RD$) lands cuentas with id + tipo', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.evaluate(() => window.loadDemo('RD'));
    await page.waitForSelector('#dashApp', { state: 'visible' });
    const cuentas = await page.evaluate(() => _editData.forNow.cuentas);
    expect(cuentas.length).toBeGreaterThan(0);
    for (const c of cuentas) {
      expect(c.id).toMatch(/^cnt_/);
      expect(['cash', 'banco', 'ahorro', 'inversion']).toContain(c.tipo);
    }
  });

  test('stale defaultCashAccountId pointing at a deleted account is nulled out', async ({ page }) => {
    await loadAppDefault(page);
    const result = await page.evaluate(() => {
      _editData.config.defaultCashAccountId = 'cnt_does_not_exist';
      window.buildDashboard({ ..._editData });
      return _editData.config.defaultCashAccountId;
    });
    expect(result).toBe(null);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Helper functions
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet helpers — getDefaultCashAccount / setDefaultCashAccount', () => {
  test('getDefaultCashAccount returns null when no default is set', async ({ page }) => {
    await loadAppDefault(page);
    const acc = await page.evaluate(() => window.getDefaultCashAccount(_editData));
    expect(acc).toBe(null);
  });

  test('setDefaultCashAccount(id) flips tipo to cash and stores the pointer', async ({ page }) => {
    await loadAppDefault(page);
    const result = await page.evaluate(() => {
      const targetId = _editData.forNow.cuentas[1].id; // "Cash en mano"
      window.setDefaultCashAccount(targetId);
      return {
        pointer: _editData.config.defaultCashAccountId,
        tipo: _editData.forNow.cuentas[1].tipo,
      };
    });
    expect(result.pointer).toBe(await page.evaluate(() => _editData.forNow.cuentas[1].id));
    expect(result.tipo).toBe('cash');
  });

  test('setDefaultCashAccount(null) clears the pointer (other tipos unchanged)', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      window.setDefaultCashAccount(_editData.forNow.cuentas[1].id);
    });
    const after = await page.evaluate(() => {
      window.setDefaultCashAccount(null);
      return {
        pointer: _editData.config.defaultCashAccountId,
        tipo: _editData.forNow.cuentas[1].tipo,
      };
    });
    expect(after.pointer).toBe(null);
    // tipo stays 'cash' (we don't auto-demote to avoid surprising the user)
    expect(after.tipo).toBe('cash');
  });

  test('setDefaultCashAccount with unknown id is a no-op', async ({ page }) => {
    await loadAppDefault(page);
    const result = await page.evaluate(() => {
      window.setDefaultCashAccount('cnt_garbage');
      return _editData.config.defaultCashAccountId;
    });
    expect(result).toBe(null);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Setup wizard — tipo dropdown + radio
// ───────────────────────────────────────────────────────────────────
test.describe('Setup wizard — cuenta tipo + Mi Saldo radio', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.startFromScratch === 'function');
    await page.evaluate(() => window.startFromScratch());
    // Advance to step 2 (cuentas)
    await page.evaluate(() => {
      window._testSetupSave(0);
      window._testSetupGoToStep(1);
    });
    await page.waitForSelector('.sw-cuenta-row', { state: 'visible' });
  });

  test('each cuenta row renders a tipo dropdown with 4 options', async ({ page }) => {
    const rows = await page.locator('.sw-cuenta-row').count();
    expect(rows).toBeGreaterThanOrEqual(1);
    const optCount = await page.locator('.sw-cuenta-row').first().locator('.sw-cnt-tipo option').count();
    expect(optCount).toBe(4);
  });

  test('selecting "Use as Mi Saldo" radio sets config.defaultCashAccountId on save', async ({ page }) => {
    // Add a second account so we have two rows
    await page.evaluate(() => window.addSwCuenta());
    const rows = page.locator('.sw-cuenta-row');
    await expect(rows).toHaveCount(2);
    // Fill names + amounts so save() retains them
    const nombreInputs = rows.locator('.sw-cnt-nombre');
    await nombreInputs.nth(0).fill('Banco');
    await nombreInputs.nth(1).fill('Wallet');
    await rows.locator('.sw-cnt-saldo').nth(1).fill('300');
    // Click the second row's radio
    await rows.nth(1).locator('.sw-cnt-default').click();
    // Run the wizard step's save
    await page.evaluate(() => window._testSetupSave(1));
    const result = await page.evaluate(() => ({
      defaultId: _editData.config.defaultCashAccountId,
      tipos: _editData.forNow.cuentas.map(c => c.tipo),
      saldos: _editData.forNow.cuentas.map(c => c.saldo),
    }));
    expect(result.defaultId).toBeTruthy();
    expect(result.defaultId).toMatch(/^cnt_/);
    expect(result.tipos[1]).toBe('cash');
    expect(result.saldos[1]).toBe(300);
  });

  test('not flagging any radio auto-defaults to the first account after save', async ({ page }) => {
    // Updated contract (feat/setup-wallet-prompt): if the user adds at least
    // one cuenta but doesn't tick the radio, save() auto-picks the first
    // 'cash' tipo (or the first row) so the dashboard ships with a working
    // wallet — saves the user a trip into Editar > Fondos later.
    const row = page.locator('.sw-cuenta-row').first();
    await row.locator('.sw-cnt-nombre').fill('Solo banco');
    await row.locator('.sw-cnt-saldo').fill('1000');
    await page.evaluate(() => window._testSetupSave(1));
    const r = await page.evaluate(() => ({
      id: _editData.config.defaultCashAccountId,
      cuenta: _editData.forNow.cuentas[0],
    }));
    expect(r.id).toBe(r.cuenta.id);
    expect(r.cuenta.tipo).toBe('cash'); // promoted by the auto-default
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Edit modal Fondos tab — tipo dropdown + radio
// ───────────────────────────────────────────────────────────────────
test.describe('Edit modal Fondos tab — wallet UI', () => {
  test('tipo dropdown is present per cuenta row', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.openEditModal());
    await page.evaluate(() => window.showEditTab && window.showEditTab('fornow', document.querySelector('.edit-tab[onclick*=fornow]')));
    await page.waitForSelector('#fornowEditBody .fornow-tipo', { state: 'attached' });
    const tipoCount = await page.locator('#fornowEditBody .fornow-tipo').count();
    expect(tipoCount).toBe(2);
  });

  test('Mi Saldo radio promotes a cuenta to default + flips its tipo to cash', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window.openEditModal());
    await page.evaluate(() => window.showEditTab && window.showEditTab('fornow', document.querySelector('.edit-tab[onclick*=fornow]')));
    await page.waitForSelector('#fornowEditBody .fornow-default', { state: 'attached' });
    // Click the radio on the second row ("Cash en mano")
    const targetId = await page.evaluate(() => _editData.forNow.cuentas[1].id);
    await page.locator(`#fornowEditBody .fornow-default[data-cuenta-id="${targetId}"]`).click();
    const after = await page.evaluate(() => ({
      pointer: _editData.config.defaultCashAccountId,
      tipo: _editData.forNow.cuentas[1].tipo,
    }));
    expect(after.pointer).toBe(targetId);
    expect(after.tipo).toBe('cash');
  });

  test('demoting the wallet cuenta tipo away from cash clears the default pointer', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => {
      window.setDefaultCashAccount(_editData.forNow.cuentas[1].id);
    });
    await page.evaluate(() => window.openEditModal());
    await page.evaluate(() => window.showEditTab && window.showEditTab('fornow', document.querySelector('.edit-tab[onclick*=fornow]')));
    await page.waitForSelector('#fornowEditBody .fornow-tipo', { state: 'attached' });
    // Switch the wallet's tipo from 'cash' to 'banco'
    const tipoSelectors = page.locator('#fornowEditBody .fornow-tipo');
    await tipoSelectors.nth(1).selectOption('banco');
    const pointer = await page.evaluate(() => _editData.config.defaultCashAccountId);
    expect(pointer).toBe(null);
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. JSON export — version 4 + cuentas carry id + tipo
// ───────────────────────────────────────────────────────────────────
test.describe('JSON export — v4 schema', () => {
  test('exported _meta.version is 4 and cuentas have id + tipo', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.loadDemo === 'function');
    await page.evaluate(() => window.loadDemo('RD'));
    await page.waitForSelector('#dashApp', { state: 'visible' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => downloadJSON()),
    ]);
    const content = await (await download.createReadStream()).toArray();
    const data = JSON.parse(Buffer.concat(content).toString());
    expect(data._meta.version).toBe(4);
    for (const c of data.forNow.cuentas) {
      expect(c.id).toMatch(/^cnt_/);
      expect(['cash', 'banco', 'ahorro', 'inversion']).toContain(c.tipo);
    }
    // defaultCashAccountId is either null or one of the existing ids
    const ids = data.forNow.cuentas.map(c => c.id);
    expect(data.config.defaultCashAccountId === null ||
           ids.includes(data.config.defaultCashAccountId)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────
// 7. i18n keys (es + en)
// ───────────────────────────────────────────────────────────────────
test.describe('Wallet i18n keys', () => {
  test('Spanish wallet labels resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('es'));
    const labels = await page.evaluate(() => ({
      label: window.t('wallet_label'),
      setDefault: window.t('wallet_set_default'),
      cash: window.t('cuenta_tipo_cash'),
      banco: window.t('cuenta_tipo_banco'),
      ahorro: window.t('cuenta_tipo_ahorro'),
      inversion: window.t('cuenta_tipo_inversion'),
    }));
    expect(labels.label).toBe('Mi Saldo');
    expect(labels.setDefault).toMatch(/Mi Saldo/i);
    expect(labels.cash).toBe('Efectivo');
    expect(labels.banco).toBe('Banco');
    expect(labels.ahorro).toBe('Ahorros');
    expect(labels.inversion).toBe('Inversión');
  });

  test('English wallet labels resolve', async ({ page }) => {
    await loadAppDefault(page);
    await page.evaluate(() => window._testSetLang('en'));
    const labels = await page.evaluate(() => ({
      label: window.t('wallet_label'),
      setDefault: window.t('wallet_set_default'),
      cash: window.t('cuenta_tipo_cash'),
      banco: window.t('cuenta_tipo_banco'),
      ahorro: window.t('cuenta_tipo_ahorro'),
      inversion: window.t('cuenta_tipo_inversion'),
    }));
    expect(labels.label).toBe('My Balance');
    expect(labels.setDefault).toMatch(/My Balance/i);
    expect(labels.cash).toBe('Cash');
    expect(labels.banco).toBe('Bank');
    expect(labels.ahorro).toBe('Savings');
    expect(labels.inversion).toBe('Investment');
  });
});
