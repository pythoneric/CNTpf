# CNT Core · Personal Finance Dashboard

> Personal finance dashboard built as a PWA (Progressive Web App). Works on phone, tablet and desktop. Your data never leaves your device.

---

## What is this?

A complete finance dashboard that lives in 5 files. No server, no cloud database, no account required. Your data is stored in your own browser using IndexedDB.

You can start **without any file** -- a setup wizard walks you through entering your data and generates the initial JSON backup automatically. You can also import a `.json` you exported previously.

Supports **Spanish and English** with real-time language switching, **dark and light themes**, and **dual currency USD / RD$** with automatic conversion.

---

## Files included

```
cnt.html            -- The complete dashboard (whole app in a single file)
manifest.json       -- PWA configuration (name, icon, install)
sw.js               -- Service worker (offline cache)
icon-192.png        -- App icon (required by Chrome to show the install banner)
icon-512.png        -- High-res app icon
```

The 5 files must live in the **same folder** for the PWA to work correctly.

Additional development files:
```
playwright.config.js  -- E2E test configuration
tests/                -- Playwright test suite (740 tests)
package.json          -- Dev dependencies (Playwright)
```

---

## Getting started

When you open the dashboard for the first time you'll see three options:

### Option A -- Start from scratch
If it's your first time, pick **"Start from scratch"**. A 5-step wizard walks you through:

| Step | What you set up |
|------|-----------------|
| 1 | Primary currency (USD or RD$), month, year, exchange rate, **pay frequency** (monthly / biweekly / weekly), income per paycheck, alert days |
| 2 | Available accounts (checking, savings, cash...) with their balances and currency (RD$/USD) |
| 3 | Fixed expenses, debts and monthly payments with type, rate and balance |
| 4 | Emergency funds with current balance, minimum goal and currency |
| 5 | Summary and confirmation |

On confirm, the dashboard launches with your data and a `cnt.json` backup downloads automatically. Your data is also saved locally in the browser.

### Option B -- Import file
Drag or pick a `.json` file you exported previously. The dashboard processes it locally and saves the data in the browser for future visits.

### Option C -- Continue where I left off
If you've used the dashboard in this browser before, this option appears automatically. It opens the saved data without uploading anything.

### Option D -- View demo with sample data
Two demos available:
- **Demo RD$** 🇩🇴 -- Dominican persona with a modest salary (Maria Fernandez, administrative assistant, lives with her mom in Santo Domingo Norte). Income RD$40,000/month, cooperative loan, Visa card, cash spending, monthly budget and Mi Saldo configured. **30 months** of history (December 2023 → May 2026).
- **Demo USD** 🇺🇸 -- US household persona with finances in dollars (US professional). Income $6,500/month, mortgage, car loan, student loan, credit cards, **30 months** of history (December 2023 → May 2026).

Both demos are fictional and useful for exploring the dashboard without entering your own data.

---

## Dashboard tabs

The dashboard has **12 tabs** organised in **2 groups** through a segmented pill toggle. The active group is remembered between sessions.

### Operations — day-to-day finances

| Tab | Description |
|-----|-------------|
| **Summary** | KPIs for income, expenses, surplus, net worth, savings rate and financial health |
| **Alerts & Payments** | Payment checklist with countdown, visual calendar, DTI alerts, negative amortization, emergency fund and anomalies |
| **Log** | Day-to-day expense log with categories, recurring transactions, charts by type and monthly totals |
| **Budget** | Zero-based budget per category with comparison vs actuals from the Log |
| **Expenses** | Full expense + debt table with payment status and per-item payoff ETA |
| **Funds** | Account balances (RD$/USD) vs monthly commitments, real availability, runway in months and detailed monthly cashflow |

### Strategy — planning and analysis

| Tab | Description |
|-----|-------------|
| **Emergency** | Emergency funds with months of coverage, doughnut progress chart and allocation plan |
| **Debts** | Per-debt cards with balance, rate, payoff ETA, interest projection and "Liquidate debt" button |
| **Projector** | Debt payoff simulator: Avalanche vs Snowball with what-if scenarios |
| **Goals** | Savings goals with projection sparkline, progress, ETA and over-commit warning |
| **Analysis** | Financial summary, waterfall cashflow, BVA, payment projections and expense trend |
| **History** | Historical record with trend charts, net worth projection, savings rate and debt evolution |

> On mobile, the pill toggle is fixed above the bottom nav bar. On desktop it's centered above the tabs. Navigating to a tab in the other group switches the group automatically (including deep links via `#tab-xxx`).

---

## Features

### Dashboard and KPIs
- **5 main KPIs** -- Income, total expenses (commitments + logged spending), monthly surplus, net worth and savings rate with the 50/30/20 guide
- **Month-over-month delta arrows** -- Each KPI shows ▲/▼ comparing to last month in the history (green = improvement, red = decline, contextual per metric)
- **Financial health** -- 0-100 score with grading (Excellent/Good/Fair/Critical) based on expense ratio, DTI, emergency fund and net-worth trend
- **Cashflow distribution** -- Visual bar of expenses vs surplus with USD withdrawal, exchange rate, savings and commitments metrics
- **Dual currency** -- Full support for USD and RD$ as primary currency. Selector in the setup wizard and in Edit > Configuration. All amounts, charts and KPIs adapt automatically. Internally data is stored in RD$ and converted on the fly for USD users
- **Pay frequency** -- Pick how you get paid: monthly, biweekly or weekly. Enter the per-paycheck amount and the dashboard calculates the monthly equivalent automatically (× 26/12 biweekly, × 52/12 weekly) for every KPI (DTI, savings rate, budget, financial health). Editable from the wizard or Edit > Configuration
- **My Balance (cash wallet)** -- Real-time tracking of your cash. Each Funds account has a type (`cash` / `bank` / `savings` / `investment`) and one is marked as the main **My Balance**. What this feature does for you:
  - **Header chip + Summary card** show the current balance plus the last 5 movements
  - **Auto-debit on cash transactions** -- logging a transaction in the Log with the "Cash" method drops the balance automatically. Deleting the transaction restores it
  - **Auto-debit on fixed expenses** -- each expense/debt can have a payment method (Cash / Card / Transfer / no auto-debit). Marking one as paid in the checklist with method Cash deducts the payment from the balance. Unchecking restores it. Cash items show a 💵 badge in the checklist
  - **"I got paid" button** -- on the Summary card, credits one paycheck to your wallet (per-pay amount, not the monthly aggregate). Click each pay day. Same-day double-clicks are deduped
  - **Floating quick-pay button** -- FAB with a "+" icon. 4-field modal (amount, method, category, note) to log a payment in seconds. If no wallet is configured, the setup wizard opens and resumes the payment on confirm
  - **Runway projection** -- the Summary card shows "After upcoming bills" and "Lowest point (day N)" for the next 31 days, computed over unpaid cash expenses. Numbers turn yellow when below your configurable threshold and red when projecting a negative balance
  - **Low-balance alert** -- a new `wallet_low` (warning) or `wallet_neg` (urgent) alert in Alerts & Payments when the projected lowest dips below the threshold. Threshold configurable in Edit > Configuration (`Low Balance threshold`); 0 = auto (10% of monthly income or RD$5,000, whichever is larger)
  - **Adjust My Balance (reconcile)** -- in Edit > Funds, the My Balance row exposes a ⚖️ Adjust button that opens a modal to log a real cash count. The delta is saved as an `ajuste` transaction (its own category) instead of silently overwriting the balance — the audit trail stays intact. Adjustments show in the movements list with a ⚖️ icon and neutral colour, and do NOT count toward expense, budget or close-month totals
  - **Transfer between accounts** -- 🔁 button on the Summary card (when ≥2 accounts exist) that opens a modal to move money between My Balance and another account. Creates two linked transactions (category `transferencia_interna`) sharing a `transferGroupId`. Deleting one leg reverses both atomically. Cross-currency: the exchange rate is snapshotted on each leg so reversal uses the original rate
  - **Setup** -- in the "Start from scratch" wizard (step 2) or in Edit > Funds. If you make your first cash transaction without a wallet, the system asks you to set the starting balance
  - **Mixed-currency support** -- a USD wallet with RD$ transactions (or vice versa) is converted via the exchange rate
- **Net-worth milestones** -- Automatic celebrations when you hit positive net worth, debt-free, RD$100K, RD$500K and RD$1M

### Alerts & Payments (unified tab)
- **Payment checklist** -- Mark each commitment as paid with auto-persistence
- **Countdown** -- Shows the next pending payment with days remaining, name and amount (urgency-coloured)
- **Payment calendar** -- Visual timeline of pending payments grouped by day with totals
- Progress by count and by amount (RD$)
- Interest analysis with cost-per-debt table
- "Mark all" and "Reset" buttons
- **Upcoming due dates** -- Payments due within the next N days (configurable)
- **Overdue payments** -- Commitments unpaid past their due day
- **Deadlines** -- Debts with a deadline within 60 days
- **High DTI** -- Warns above 36% (credit risk) and urgent above 43% (lender threshold)
- **Negative amortization** -- Urgent alert when the monthly payment doesn't cover interest and the debt grows
- **High rate** -- Warning for debts with rate > 15% APR
- **Emergency fund** -- Critical if < 25% of goal, low if < 50%
- **Interest burden** -- Alert when interest consumes > 50% of surplus
- **Expense anomaly** -- Warning when this month's spending exceeds 120% of the 3-month average
- **Visual indicator** -- Pulsing red dot on the tab when there are urgent alerts

### Expense Log
- Log day-to-day actual spending to answer "where did my money go?"
- **Quick form** -- Date, amount, category, payment method (cash/card/transfer) and optional note
- **9 categories** -- Food, Transport, Entertainment, Health, Shopping, Home, Education, Personal, Other
- **Optional linking** -- Connect a transaction to an existing expense/debt
- **Recurring transactions** -- When adding a transaction pick a frequency (daily/weekly/biweekly/monthly) so it repeats automatically
- **Recurring rule management** -- List of active rules at the bottom of the tab with a delete option (already-generated transactions stay)
- **Auto-generation** -- Recurring transactions generate when the app opens, with date+ID dedup
- **Visual badge** -- Auto-generated transactions show a 🔄 indicator in the list
- **Monthly KPIs** -- Total spent (contextual colour: green/yellow/red vs budget), transaction count and daily average (correct for past and current months)
- **Spending trend** -- Mini bar chart comparing this month vs the last 2 months in history with a percent delta (green if down, red if up)
- **Doughnut chart** -- Spending distribution by category
- **Chronological list** -- All transactions for the month with a delete option
- On close-month, the logged total is archived in history as `gastoReal`
- Editable in the edit modal (Transactions tab)

### Budget (Forward Budget)
- Zero-based monthly budget: assign the amount available (after fixed commitments) to the 9 categories
- **Allocation form** -- 9 fields (one per category) with a real-time unallocated counter
- **Recurring estimate** -- Each category shows the expected amount from recurring transactions
- **Budget vs actual table** -- Compares allocated amounts vs actual logged spending with progress bars and variance
- **Grouped bar chart** -- Budgeted vs spent per category (Chart.js)
- **4 KPIs** -- Monthly income, fixed commitments (expenses/debts), available for categories, and unallocated (or over-allocated, in red)
- **Over-spend alert** -- Shows how many categories went over budget
- **Close-month** -- Total budgeted is archived in history; the budget copies over to next month automatically
- Editable in the edit modal (Budget tab)

### Debt Projector
- **Committed funds** -- Computes runway (months of expenses covered), safe disposable amount and redirection capacity
- **Extra-payment simulator** -- Configurable slider with what-if scenarios (25%, 40%, 50%, 100% of surplus)
- **Real cost of debt** -- Table with monthly interest, principal payment and efficiency per debt
- **Negative amortization detection** -- Prominent alert when payments don't cover interest
- **Strategy comparison** -- Avalanche (highest rate first) vs Snowball (lowest balance first) with timeline, total interest and months saved

### Emergency Funds
- **Months of coverage** -- KPI showing how many months of expenses the fund covers (green ≥6, yellow 3-6, red <3)
- **Coverage doughnut** -- Chart showing months covered vs the 6-month goal
- Per-fund individual progress with a coloured bar
- Dual currency (RD$/USD) with automatic conversion
- **Goal linked to expenses** -- New funds are pre-filled with goal = 3× monthly expenses
- Dynamic surplus allocation (20% if there's high-rate debt, 50% otherwise)
- Suggested contribution plan with estimated time to goal

### Savings Goals
- Name, goal amount, saved amount and monthly contribution per goal
- **Projection sparkline** -- Mini SVG showing the projected savings trajectory to the goal (with a dashed goal line)
- Progress bar with the estimated completion date (ETA)
- Warning if total monthly contributions exceed the surplus
- Horizontal progress chart per goal

### History
- Monthly records table with a colour-coded savings rate (green ≥20%, yellow 10-20%, red <10%)
- **Net-worth and debt chart** -- Historical evolution line with a 3-month dashed projection (linear extrapolation)
- **Income vs expenses chart** -- Side-by-side comparison per month
- **Debt-balance chart** -- Debt and emergency-fund trend
- **Savings-rate chart** -- Colour-coded bars with the 20% target
- **Recurring-expense trend** -- Current month vs previous, by type

### Analysis
- **Financial summary** -- Top card with 4 metrics: monthly obligations, monthly interest, debt-free time, projected total interest. Alert if interest > 50% of surplus
- **Waterfall cashflow** -- Visual breakdown: Income → Fixed commitments → Logged spending → Goal contributions → Surplus, with an interest note
- **Budget vs Actual (BVA)** -- Comparison of paid vs owed per expense with variance indicators
- **Payment projections** -- Estimated payoff dates per debt
- **Expense trend** -- Per-category evolution with direction arrows

### Edit
- Full edit modal with 8 tabs: Configuration, Expenses & Debts, Funds, Emergency, History, Transactions, Budget, Recurring
- **Real-time sync** -- Configuration changes reflect in the data immediately
- **Expense type as dropdown** -- 10 predefined categories to avoid duplicates
- **Linked fields** -- RD$ and USD originals stay in sync via the exchange rate
- **Currency conversion** -- Switching an account's currency offers to convert the balance
- **Field validation** -- Day of payment (1-31), rate (0-100%), non-negative balances
- **Payment detection** -- A balance reduction prompts to record it as a payment (with confirmation)
- **Comma support** -- Numbers pasted with commas (e.g. "1,500") parse correctly
- Unsaved-changes warning when closing
- Delete confirmation in every section
- Exports a JSON backup with all your changes at any time

### Close Month
- 8-step wizard guiding the full monthly process
- Records the month in history automatically
- Resets the payment checklist for the new month
- Downloads a JSON backup with the updated history
- **Post-close summary** -- Shows savings rate, debt change and net-worth change

| Step | What you do |
|------|-------------|
| 1 | Update the USD exchange rate |
| 2 | Confirm the month and year you're closing |
| 3 | Log your monthly income in USD |
| 4 | Enter the actual total spending for the month |
| 5 | Update your account balances |
| 6 | Log this month's savings and the running balance |
| 7 | Review the summary and confirm the close |
| 8 | Set the next month's name in the dashboard |

### Languages
- **Spanish** (default) and **English** -- 420+ translation keys (including dual currency)
- Real-time switching without reloading the page
- Language button in the header and the loader screen

### Dark / Light Theme
- Dark theme by default, toggle to light
- CSS variables for full customization
- Theme button in the header

### Export
- **JSON (.json)** -- Exports all data as a lossless JSON file (native backup format)
- **Snapshot (PDF)** -- Exports the current view optimised for printing

### PWA / Offline
- Installs as a native app on Android, iOS and PC
- Works fully offline after the first visit
- Data auto-saved in the browser (IndexedDB)
- Future visits load saved data with no upload needed

---

## Data format

### JSON (native format)

The backup is exported as a `.json` file with this structure:

```json
{
  "_meta": { "version": 4, "exportedAt": "2026-03-30T...", "app": "CNTpf" },
  "config": { "tasa": 60, "mes": "Marzo", "anio": 2026, "ingresoUSD": 3000, "diasAlerta": 5, "monedaPrincipal": "RD", "payFrequency": "mensual", "defaultCashAccountId": "cnt_…" },
  "gastos": [...],
  "forNow": { "cuentas": [...], "fecha": "...", "total": 0 },
  "emerg": { "fondos": [...], "cashflow": {...} },
  "historial": [...],
  "metas": [...],
  "transacciones": [...],
  "presupuesto": [...],
  "recurrentes": [...]
}
```

> **Note (v3 → v4):**
> - `config.payFrequency` controls how `ingresoUSD` is interpreted: `"mensual"` (default · multiplier 1), `"quincenal"` (× 26/12) or `"semanal"` (× 52/12). `ingresoRD` is always the already-multiplied monthly equivalent.
> - Each `forNow.cuentas[]` carries a stable `id` (`cnt_…`) and a `tipo` (`cash` / `banco` / `ahorro` / `inversion`). `config.defaultCashAccountId` points to the `id` of the account marked as **My Balance** (the main wallet used for cash payments).

### Categories (`gastos[].tipo` / `transacciones[].categoria`)

| Field | Values |
|-------|--------|
| `gastos[].tipo` | `Fijo`, `Variable`, `Cuota`, `Prestamo`, `Tarjeta`, `Servicio`, `Seguro`, `Familiar`, `Educacion`, `Vivienda` |
| `gastos[].metodo` | `efectivo`, `tarjeta`, `transferencia`, `''` (no auto-debit) |
| `transacciones[].categoria` | `comida`, `transporte`, `entretenimiento`, `salud`, `compras`, `hogar`, `educacion`, `personal`, `otro`, `ingreso`, `ajuste`, `transferencia_interna` |
| `transacciones[].metodo` | `efectivo`, `tarjeta`, `transferencia` |
| `recurrentes[].frecuencia` | `diario`, `semanal`, `quincenal`, `mensual` |

> The interest rate (`gastos[].tasa`) can arrive as a percentage (`19.45`) or as a decimal (`0.1945`) -- the dashboard normalises automatically.

> Storage values stay in Spanish for backward compatibility; the dashboard renders them translated when needed.

---

## Install and deploy

### Option 1 -- GitHub Pages (recommended)

1. Create a repo on [github.com](https://github.com)
2. Upload the 5 files (`cnt.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`)
3. Go to **Settings > Pages > Branch: main > Save**
4. Your URL: `https://username.github.io/repo-name/cnt.html`

### Option 2 -- Netlify Drop

1. Visit [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the folder containing the 5 files
3. Public URL in seconds, no account needed

### Option 3 -- Local server (WiFi network)

```bash
# In the folder with the 5 files:
python3 -m http.server 8080

# Reach it from any device on the same network:
# http://[your-PC-IP]:8080/cnt.html
```

> The service worker doesn't work over `file://`. Always use an HTTP server.

---

## Install as an app

### Android (Chrome)
1. Open the URL in **Chrome**
2. Wait for the banner: *"Add CNT Core to home screen"* > **Install**
3. If it doesn't appear: menu > **"Add to home screen"**

### iOS (Safari)
1. Open the URL in **Safari** (required on iOS — Chrome doesn't support PWA on iOS)
2. Share button > **"Add to Home Screen"** > **Add**

### PC (Chrome / Edge)
1. Open the URL in Chrome or Edge
2. Icon in the address bar > **Install**

---

## Local persistence (IndexedDB)

| Action | Result |
|--------|--------|
| First load / wizard completed | Auto-saved |
| Editing data and applying | Auto-saved |
| Marking a payment in the checklist | Auto-saved |
| Closing the month (wizard) | Auto-saved + JSON downloaded |
| Next visit | "Continue where I left off" banner |
| Clearing data | Button in the loader banner |

> Data is browser- and device-specific. If you switch browsers or devices, you need to import your JSON backup once.

---

## Recommended monthly flow

```
At the start of the month (or when first using the app):
  -- Budget > Allocate amounts to each spending category
  -- Log > Set up recurring transactions (daily coffee, weekly transit, etc.)

During the month:
  -- Open the app > Checklist > Mark payments as they happen
  -- Log actual spending in the Log (recurring entries generate themselves)
  -- Review the Budget to compare spent vs allocated per category
  -- Check Alerts for upcoming due dates and financial warnings
  -- Adjust Savings Goals based on progress
  -- Changes auto-saved

At the end of the month:
  -- Header > "Close Month"
  -- 8-step wizard: rate > month > income > actual spend > balances > savings > confirm > next month
  -- See the post-close summary with savings rate, debt change and net-worth delta
  -- History updated + JSON downloaded + checklist reset

When you fully pay off a debt:
  -- Debts tab > Card for the debt > "Liquidate debt"
  -- Confirm > balance = 0, marked as paid, auto-saved

At the start of the new month:
  -- If expenses/debts changed > Edit > adjust > apply
  -- If they didn't > start ticking the checklist directly
  -- Review the Projector to optimise debt payoff
```

---

## Tests

The project includes an end-to-end test suite using **Playwright**:

```bash
# Install dependencies
npm install

# Run all tests
npx playwright test

# Run a specific spec
npx playwright test tests/finance-advisor-features.spec.js
```

See the [Spanish README](README.md#tests) for the full suite breakdown by spec.

---

## Tech stack

| Tech | Use |
|------|-----|
| HTML / CSS / vanilla JavaScript | The whole app — no frameworks |
| [Chart.js](https://chartjs.org) | Doughnut, bar and line charts |
| IndexedDB | Local data persistence |
| Service Worker | Offline cache |
| Web App Manifest | Native-app installation |
| [Playwright](https://playwright.dev) | End-to-end tests |
| Google Fonts (Syne + JetBrains Mono) | Typography |

---

## Privacy

- No data is sent to any server
- All processing happens in your browser
- IndexedDB stores data only on your device
- The service worker only caches the app's files — never your financial data
- No analytics, no third-party cookies, no telemetry

---

## Technical notes

**Why 5 files and not just one?**
The service worker (`sw.js`) must be a separate file by browser specification. The `manifest.json` and PNG icons must also be external — Chrome rejects `data:` URI icons when displaying the install banner.

**Does it work over `file://`?**
The dashboard and the setup wizard work, but the service worker and PWA installation require HTTPS or `localhost`. IndexedDB does work over `file://`.

**What if I update the HTML?**
The service worker uses Network-first for HTML — it always tries to download the newest version. If you're offline it falls back to the cached version.

**Browser compatibility**

| Browser | PWA | IndexedDB | Offline |
|---------|-----|-----------|---------|
| Chrome / Edge | Full | Yes | Yes |
| Safari iOS 16.4+ | Full | Yes | Yes |
| Firefox | No install | Yes | Yes |
