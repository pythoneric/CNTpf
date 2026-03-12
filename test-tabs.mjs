import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file:///' + path.join(__dirname, 'cnt.html').replace(/\\/g, '/');

const browser = await chromium.launch({ headless: false, slowMo: 200 });
const page = await browser.newPage();

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { console.log('  ✅', msg); passed++; }
  else           { console.error('  ❌', msg); failed++; }
}

// Helper: get text content of a tab panel
async function tabText(id) {
  return await page.evaluate(id => document.getElementById('tab-'+id)?.textContent || '', id);
}

// Helper: switch tab and wait
async function goTab(id) {
  await page.evaluate(id => window.showTab(id, null), id);
  await page.waitForTimeout(400);
}

await page.goto(fileUrl);
await page.waitForLoadState('domcontentloaded');

console.log('\n⏳ Waiting 10 seconds for file selection...');
await page.waitForSelector('#dashApp', { state: 'visible', timeout: 30000 }).catch(() => null);
await page.waitForTimeout(10000);

// ═══════════════════════════════════════════════════════════
//  SPANISH (ES) — all tabs
// ═══════════════════════════════════════════════════════════
console.log('\n══════════ ES LANGUAGE ══════════');

// ── Resumen ──
console.log('\n── Tab: Resumen (ES) ──');
await goTab('resumen');
assert(await page.evaluate(() => document.getElementById('tab-resumen')?.classList.contains('active')), 'resumen panel active');
const resumenText = await tabText('resumen');
assert(resumenText.includes('Ingresos'),       'KPI: "Ingresos" present');
assert(resumenText.includes('Gastos Totales'), 'KPI: "Gastos Totales" present');
assert(resumenText.includes('Superávit'),      'KPI: "Superávit del Mes" present');
assert(resumenText.includes('Net Worth'),      'KPI: "Net Worth" present');
const kpiVals = await page.evaluate(() =>
  [...document.querySelectorAll('#kpiRow .kpi-val')].map(el => el.textContent.trim())
);
console.log('  KPI values:', kpiVals.join(' | '));
assert(kpiVals.length === 4, `4 KPI value elements found (got ${kpiVals.length})`);
assert(kpiVals.every(v => v.includes('RD$')), 'All KPI values show RD$ currency');
assert(resumenText.includes('Salud Financiera'),        'Score card shows "Salud Financiera"');
assert(resumenText.includes('Distribución del Ingreso'),'CF card shows "Distribución del Ingreso"');
assert(resumenText.includes('Resumen de Deudas Totales'),'Debt summary shows "Resumen de Deudas Totales"');
assert(resumenText.includes('Balance Total'),           'Debt summary shows "Balance Total"');
const nwAlertEl = await page.$('#netWorthAlert');
assert(nwAlertEl !== null && (await nwAlertEl.textContent()).length > 0, 'Net worth alert has content');
assert(await page.$('#pieChart') !== null, 'pieChart canvas exists');
assert(await page.$('#barChart') !== null, 'barChart canvas exists');

// ── Alertas ──
console.log('\n── Tab: Alertas (ES) ──');
await goTab('alertas');
assert(await page.evaluate(() => document.getElementById('tab-alertas')?.classList.contains('active')), 'alertas panel active');
const alertasText = await tabText('alertas');
assert(alertasText.includes('Alertas Financieras'),   '"Alertas Financieras" title present');
assert(alertasText.includes('Resumen de Situación'),  '"Resumen de Situación" title present');
const alertasGenEl = await page.$('#alertasGen');
const alertasSitEl = await page.$('#alertasSit');
assert(alertasGenEl !== null, '#alertasGen element exists');
assert(alertasSitEl !== null, '#alertasSit element exists');

// ── Gastos ──
console.log('\n── Tab: Gastos (ES) ──');
await goTab('gastos');
assert(await page.evaluate(() => document.getElementById('tab-gastos')?.classList.contains('active')), 'gastos panel active');
const gastosText = await tabText('gastos');
assert(gastosText.includes('Gastos & Deudas Mensuales'), '"Gastos & Deudas Mensuales" title present');
assert(gastosText.includes('Total Pagado'),              '"Total Pagado" label present');
assert(gastosText.includes('Pendiente este mes'),        '"Pendiente este mes" label present');
const gastosBodyRows = await page.$$('#gastosBody tr');
assert(gastosBodyRows.length > 0, `gastosBody has rows (got ${gastosBodyRows.length})`);
const tPagado = await page.evaluate(() => document.getElementById('tPagado')?.textContent?.trim() || '');
assert(tPagado.includes('RD$'), `tPagado shows RD$ (got "${tPagado}")`);
const tAdeudado = await page.evaluate(() => document.getElementById('tAdeudado')?.textContent?.trim() || '');
assert(tAdeudado.includes('RD$'), `tAdeudado shows RD$ (got "${tAdeudado}")`);

// ── Checklist ──
console.log('\n── Tab: Checklist (ES) ──');
await goTab('checklist');
assert(await page.evaluate(() => document.getElementById('tab-checklist')?.classList.contains('active')), 'checklist panel active');
const checklistText = await tabText('checklist');
assert(checklistText.includes('Pendientes'), '"Pendientes" section title present');
assert(checklistText.includes('Pagados'),    '"Pagados" section title present');
const checkPendingEl = await page.$('#checkPending, #checklistPending');
assert(checkPendingEl !== null, 'pending checklist container exists');
const checkDoneEl = await page.$('#checkDone, #checklistDone');
assert(checkDoneEl !== null, 'done checklist container exists');

// ── Deudas ──
console.log('\n── Tab: Deudas (ES) ──');
await goTab('deudas');
assert(await page.evaluate(() => document.getElementById('tab-deudas')?.classList.contains('active')), 'deudas panel active');
const deudasText = await tabText('deudas');
assert(deudasText.includes('Deuda Total'),           '"Deuda Total" KPI present');
assert(deudasText.includes('Distribución de Deudas'),'Distribución de Deudas" pie title present');
const deudaKpisEl = await page.$('#deudaKpis');
const deudaCardsEl = await page.$('#deudaCards');
const deudaPieEl = await page.$('#deudaPie');
assert(deudaKpisEl  !== null, '#deudaKpis exists');
assert(deudaCardsEl !== null, '#deudaCards exists');
assert(deudaPieEl   !== null, '#deudaPie canvas exists');

// ── Proyector ──
console.log('\n── Tab: Proyector (ES) ──');
await goTab('proyector');
await page.waitForTimeout(300); // proyector triggers updateProyector()
assert(await page.evaluate(() => document.getElementById('tab-proyector')?.classList.contains('active')), 'proyector panel active');
const proyText = await tabText('proyector');
assert(proyText.includes('Parámetro de Proyección'), '"Parámetro de Proyección" config title present');
assert(proyText.includes('Estrategia Avalancha'),    '"Estrategia Avalancha" section present');
assert(proyText.includes('Bola de Nieve'),           '"Bola de Nieve" section present');
const avalanchaEl = await page.$('#avalanchaTimeline');
const nieveEl     = await page.$('#nieveTimeline');
assert(avalanchaEl !== null, '#avalanchaTimeline exists');
assert(nieveEl     !== null, '#nieveTimeline exists');

// ── Emergencias ──
console.log('\n── Tab: Emergencias (ES) ──');
await goTab('emergency');
assert(await page.evaluate(() => document.getElementById('tab-emergency')?.classList.contains('active')), 'emergency panel active');
const efText = await tabText('emergency');
assert(efText.includes('Balance Emergencia'),               '"Balance Emergencia" KPI present');
assert(efText.includes('Fondos de Emergencia · Progreso'),  '"Fondos de Emergencia · Progreso" section present');
const efKpisEl = await page.$('#efKpis');
const efFundsEl = await page.$('#efFunds');
assert(efKpisEl  !== null, '#efKpis exists');
assert(efFundsEl !== null, '#efFunds exists');

// ── ForNow / Fondos ──
console.log('\n── Tab: ForNow (ES) ──');
await goTab('fornow');
assert(await page.evaluate(() => document.getElementById('tab-fornow')?.classList.contains('active')), 'fornow panel active');
const fornowText = await tabText('fornow');
assert(fornowText.includes('Total en Cuentas'), '"Total en Cuentas" KPI present');
assert(fornowText.includes('Comprometido'),     '"Comprometido" KPI present');
assert(fornowText.includes('Disponible Real'),  '"Disponible Real" KPI present');
const forNowKpisEl = await page.$('#forNowKpis');
assert(forNowKpisEl !== null, '#forNowKpis exists');

// ── Historial ──
console.log('\n── Tab: Historial (ES) ──');
await goTab('historial');
assert(await page.evaluate(() => document.getElementById('tab-historial')?.classList.contains('active')), 'historial panel active');
const histText = await tabText('historial');
assert(histText.includes('Registro Mensual Completo'),     '"Registro Mensual Completo" table title present');
assert(histText.includes('Evolución Net Worth & Deudas'),  '"Evolución Net Worth & Deudas" chart title present');
const histBodyEl = await page.$('#histBody');
const histLineEl = await page.$('#histLine');
assert(histBodyEl !== null, '#histBody exists');
assert(histLineEl !== null, '#histLine canvas exists');

// ── Metas ──
console.log('\n── Tab: Metas (ES) ──');
await goTab('metas');
assert(await page.evaluate(() => document.getElementById('tab-metas')?.classList.contains('active')), 'metas panel active');
const metasText = await tabText('metas');
assert(metasText.includes('Metas de Ahorro'),       '"Metas de Ahorro" main title present');
assert(metasText.includes('Progreso Total de Metas'), '"Progreso Total de Metas" section present');
const metasKpisEl = await page.$('#metasKpis');
const metasListEl = await page.$('#metasList');
assert(metasKpisEl !== null, '#metasKpis exists');
assert(metasListEl !== null, '#metasList exists');

// ── Análisis ──
console.log('\n── Tab: Análisis (ES) ──');
await goTab('analisis');
assert(await page.evaluate(() => document.getElementById('tab-analisis')?.classList.contains('active')), 'analisis panel active');
const analText = await tabText('analisis');
assert(analText.includes('Presupuesto vs Real del Mes'),         '"Presupuesto vs Real del Mes" title present');
assert(analText.includes('Fechas Estimadas de Pago por Deuda'),  '"Fechas Estimadas de Pago por Deuda" title present');
const bvaEl     = await page.$('#budgetVsActual');
const bvaChartEl = await page.$('#bvaChart');
assert(bvaEl     !== null, '#budgetVsActual exists');
assert(bvaChartEl !== null, '#bvaChart canvas exists');

// ═══════════════════════════════════════════════════════════
//  ENGLISH (EN) — all tabs
// ═══════════════════════════════════════════════════════════
console.log('\n══════════ Switching to EN ══════════');
await page.click('#langBtn');
await page.waitForTimeout(500);

// ── Resumen EN ──
console.log('\n── Tab: Resumen (EN) ──');
await goTab('resumen');
const resumenTextEN = await tabText('resumen');
assert(resumenTextEN.includes('Income'),          'KPI: "Income" present in EN');
assert(resumenTextEN.includes('Total Expenses'),  'KPI: "Total Expenses" present in EN');
assert(resumenTextEN.includes('Monthly Surplus'), 'KPI: "Monthly Surplus" present in EN');
assert(resumenTextEN.includes('Net Worth'),       'KPI: "Net Worth" present in EN');
assert(resumenTextEN.includes('Financial Health'),   'Score card shows "Financial Health" in EN');
assert(resumenTextEN.includes('Income Distribution'),'CF card shows "Income Distribution" in EN');
assert(resumenTextEN.includes('Total Debt Summary'), 'Debt summary shows "Total Debt Summary" in EN');
assert(resumenTextEN.includes('Total Balance'),      'Debt summary shows "Total Balance" in EN');

// ── Alertas EN ──
console.log('\n── Tab: Alertas (EN) ──');
await goTab('alertas');
const alertasTextEN = await tabText('alertas');
assert(alertasTextEN.includes('Financial Alerts'),   '"Financial Alerts" present in EN');
assert(alertasTextEN.includes('Situation Summary'),  '"Situation Summary" present in EN');

// ── Gastos EN ──
console.log('\n── Tab: Gastos (EN) ──');
await goTab('gastos');
const gastosTextEN = await tabText('gastos');
assert(gastosTextEN.includes('Expenses & Monthly Debts'), '"Expenses & Monthly Debts" present in EN');
assert(gastosTextEN.includes('Total Paid'),               '"Total Paid" present in EN');
assert(gastosTextEN.includes('Pending this month'),       '"Pending this month" present in EN');

// ── Checklist EN ──
console.log('\n── Tab: Checklist (EN) ──');
await goTab('checklist');
const checklistTextEN = await tabText('checklist');
assert(checklistTextEN.includes('Pending'), '"Pending" section title present in EN');
assert(checklistTextEN.includes('Paid'),    '"Paid" section title present in EN');

// ── Deudas EN ──
console.log('\n── Tab: Deudas (EN) ──');
await goTab('deudas');
const deudasTextEN = await tabText('deudas');
assert(deudasTextEN.includes('Total Debt'),        '"Total Debt" KPI present in EN');
assert(deudasTextEN.includes('Debt Distribution'), '"Debt Distribution" pie title present in EN');

// ── Proyector EN ──
console.log('\n── Tab: Proyector (EN) ──');
await goTab('proyector');
await page.waitForTimeout(300);
const proyTextEN = await tabText('proyector');
assert(proyTextEN.includes('Projection Parameter'), '"Projection Parameter" config title in EN');
assert(proyTextEN.includes('Avalanche Strategy'),   '"Avalanche Strategy" section in EN');
assert(proyTextEN.includes('Snowball Strategy'),    '"Snowball Strategy" section in EN');

// ── Emergencias EN ──
console.log('\n── Tab: Emergencias (EN) ──');
await goTab('emergency');
const efTextEN = await tabText('emergency');
assert(efTextEN.includes('Emergency Balance'),          '"Emergency Balance" KPI in EN');
assert(efTextEN.includes('Emergency Funds · Progress'), '"Emergency Funds · Progress" section in EN');

// ── ForNow EN ──
console.log('\n── Tab: ForNow (EN) ──');
await goTab('fornow');
const fornowTextEN = await tabText('fornow');
assert(fornowTextEN.includes('Total in Accounts'), '"Total in Accounts" KPI in EN');
assert(fornowTextEN.includes('Committed'),         '"Committed" KPI in EN');
assert(fornowTextEN.includes('Real Available'),    '"Real Available" KPI in EN');

// ── Historial EN ──
console.log('\n── Tab: Historial (EN) ──');
await goTab('historial');
const histTextEN = await tabText('historial');
assert(histTextEN.includes('Complete Monthly Record'),   '"Complete Monthly Record" table title in EN');
assert(histTextEN.includes('Net Worth & Debt Evolution'),'Net Worth & Debt Evolution" chart title in EN');

// ── Metas EN ──
console.log('\n── Tab: Metas (EN) ──');
await goTab('metas');
const metasTextEN = await tabText('metas');
assert(metasTextEN.includes('Savings Goals'),        '"Savings Goals" main title in EN');
assert(metasTextEN.includes('Total Goals Progress'), '"Total Goals Progress" section in EN');

// ── Análisis EN ──
console.log('\n── Tab: Análisis (EN) ──');
await goTab('analisis');
const analTextEN = await tabText('analisis');
assert(analTextEN.includes('Budget vs Actual This Month'),    '"Budget vs Actual This Month" title in EN');
assert(analTextEN.includes('Estimated Payoff Date per Debt'), '"Estimated Payoff Date per Debt" title in EN');

// ── Summary ──
console.log(`\n${'─'.repeat(45)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log('🎉 All tests passed!');

await browser.close();
process.exit(failed > 0 ? 1 : 0);
