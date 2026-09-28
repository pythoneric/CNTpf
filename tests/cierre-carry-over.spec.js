const { test, expect } = require('@playwright/test');

/**
 * Cierre — carry unpaid payments into the next month
 *
 * The month close resets every gasto to unpaid for the new month. Before this
 * feature, anything left unpaid simply vanished: there was no way to move it
 * into the next month as a pending payment. The last wizard step now lists
 * every gasto with money still owed; each ticked one becomes its own one-off
 * pending entry (`atrasado:true`) for the remainder.
 */

const GASTOS = [
  { nombre: 'Luz', tipo: 'Servicio', pagado: 0, adeudado: 2400, dia: 12, tasa: 0, balance: 0, pagadoMes: false, metodo: 'transferencia' },
  { nombre: 'Internet', tipo: 'Servicio', pagado: 1800, adeudado: 1800, dia: 8, tasa: 0, balance: 0, pagadoMes: true, metodo: 'transferencia' },
  { nombre: 'Visa', tipo: 'Tarjeta', pagado: 500, adeudado: 1800, dia: 22, tasa: 60, balance: 22500, pagadoMes: false, metodo: 'transferencia' },
  { nombre: 'Super', tipo: 'Variable', pagado: 0, adeudado: 8500, dia: 0, tasa: 0, balance: 0, pagadoMes: false, metodo: 'efectivo' },
];

async function loadApp(page, gastos) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate((gastos) => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.ingresoUSD = 3000;
    data.config.mes = 'Septiembre';
    data.config.anio = 2026;
    data.config.monedaPrincipal = 'RD';
    data.forNow.cuentas = [{ id: 'cnt_a', nombre: 'Banco', moneda: 'RD', saldo: 1000, tipo: 'banco', comp: 0, disp: 0 }];
    data.gastos = gastos;
    window._testLoadData(data);
  }, gastos);
  await page.waitForSelector('#dashApp', { state: 'visible' });
  await page.evaluate(() => window._testSetLang('es'));
}

async function openLastStep(page) {
  await page.evaluate(() => { openCierre(); _cierreStep = 7; renderCierre(); });
}

async function confirmCierre(page) {
  await page.evaluate(() => cierreNav(1));
}

const gastoNames = page => page.evaluate(() => _editData.gastos.map(g => g.nombre));

test.describe('Cierre carry-over — last step', () => {
  test('lists only gastos with money still owed, with the remainder', async ({ page }) => {
    await loadApp(page, GASTOS);
    await openLastStep(page);
    const rows = await page.$$eval('#cw-carry .cw-carry-cb', cbs => cbs.map(cb => ({
      idx: +cb.dataset.idx, checked: cb.checked,
    })));
    // Internet is fully paid → not offered
    expect(rows.map(r => r.idx)).toEqual([0, 2, 3]);
    // Bills ticked by default, variable spending unticked
    expect(rows.map(r => r.checked)).toEqual([true, true, false]);
  });

  test('no carry-over section when everything is paid', async ({ page }) => {
    await loadApp(page, [GASTOS[1]]);
    await openLastStep(page);
    expect(await page.$('#cw-carry')).toBeNull();
  });

  test('checkbox state survives going back and forward', async ({ page }) => {
    await loadApp(page, GASTOS);
    await openLastStep(page);
    await page.evaluate(() => { document.querySelector('.cw-carry-cb[data-idx="0"]').checked = false; });
    await page.evaluate(() => { cierreNav(-1); cierreNav(1); });
    const checked = await page.$eval('.cw-carry-cb[data-idx="0"]', cb => cb.checked);
    expect(checked).toBe(false);
  });
});

test.describe('Cierre carry-over — confirm', () => {
  test('ticked unpaid gastos become separate pending entries for the remainder', async ({ page }) => {
    await loadApp(page, GASTOS);
    await openLastStep(page);
    await confirmCierre(page);
    const gastos = await page.evaluate(() => _editData.gastos);
    // Originals stay, reset for the new month
    expect(gastos.slice(0, 4).map(g => g.nombre)).toEqual(['Luz', 'Internet', 'Visa', 'Super']);
    expect(gastos.slice(0, 4).every(g => !g.pagadoMes && g.pagado === 0)).toBe(true);
    // Two carried entries: Luz (full) and Visa (1800 - 500). Super was unticked.
    const carried = gastos.slice(4);
    expect(carried.map(g => [g.nombre, g.adeudado])).toEqual([
      ['Luz (pendiente de Septiembre 2026)', 2400],
      ['Visa (pendiente de Septiembre 2026)', 1300],
    ]);
    expect(carried.every(g => g.atrasado && !g.pagadoMes && g.pagado === 0 && g.balance === 0)).toBe(true);
    expect(carried[1].tipo).toBe('Tarjeta');
    expect(carried[1].dia).toBe(22);
  });

  test('unticking a gasto does not carry it', async ({ page }) => {
    await loadApp(page, GASTOS);
    await openLastStep(page);
    await page.evaluate(() => { document.querySelectorAll('.cw-carry-cb').forEach(cb => { cb.checked = false; }); });
    await confirmCierre(page);
    expect(await gastoNames(page)).toEqual(['Luz', 'Internet', 'Visa', 'Super']);
  });

  test('carried debt payment does not add to the debt balance', async ({ page }) => {
    await loadApp(page, GASTOS);
    await openLastStep(page);
    await confirmCierre(page);
    const total = await page.evaluate(() => _editData.gastos.reduce((a, g) => a + g.balance, 0));
    expect(total).toBe(22500);
  });

  test('a paid carried entry is dropped at the next close instead of recurring', async ({ page }) => {
    await loadApp(page, [GASTOS[0]]);
    await openLastStep(page);
    await confirmCierre(page);
    // Pay the carried entry during October, leave the regular Luz unpaid
    await page.evaluate(() => { const g = _editData.gastos[1]; g.pagadoMes = true; g.pagado = g.adeudado; });
    await openLastStep(page);
    await confirmCierre(page);
    expect(await gastoNames(page)).toEqual(['Luz', 'Luz (pendiente de Octubre 2026)']);
  });

  test('an unpaid carried entry stays pending once, not duplicated', async ({ page }) => {
    await loadApp(page, [GASTOS[0]]);
    await openLastStep(page);
    await confirmCierre(page);
    // Pay only the regular October bill, leave September's carry-over unpaid
    await page.evaluate(() => { const g = _editData.gastos[0]; g.pagadoMes = true; g.pagado = g.adeudado; });
    await openLastStep(page);
    await confirmCierre(page);
    const gastos = await page.evaluate(() => _editData.gastos.map(g => [g.nombre, g.adeudado]));
    expect(gastos).toEqual([['Luz', 2400], ['Luz (pendiente de Septiembre 2026)', 2400]]);
  });

  test('carried card payment is not offered as a card to charge', async ({ page }) => {
    await loadApp(page, GASTOS);
    await openLastStep(page);
    await confirmCierre(page);
    await page.evaluate(() => { _editData.gastos[0].metodo = ''; toggleCheck(0); });
    const options = await page.$$eval('#paymentMethodCardSel option', os => os.map(o => o.textContent));
    expect(options.some(o => o.startsWith('Visa ('))).toBe(true);
    expect(options.some(o => o.includes('pendiente de'))).toBe(false);
  });
});
