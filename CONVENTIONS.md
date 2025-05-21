# Application Conventions

This document outlines the coding conventions, especially JavaScript variable naming policies, established in the application to ensure consistency and avoid collisions.

## 1. JavaScript Chart Variable Naming

Every embedded Chart.js instance uses a clear, chart-specific naming pattern to avoid identifier collisions in inline `<script>` tags.

Pattern:

- `<canvasID>RawData`: the original JSON array or object feeding the chart.
- `<canvasID>Labels`: array of labels for the chart’s X-axis (or pie slices).
- `<canvasID>Data`: array of numeric values for the chart’s dataset.
- `<canvasID>Ctx`: the 2D drawing context obtained via `document.getElementById('<canvasID>').getContext('2d')`.

Examples:

### Month View Charts (`renderHtml` in `summaryModule.js`)

- **6-Month Spending Bar**
  - Canvas ID: `spendingChart`
  - Variables: `spendingChartRawData`, `spendingChartLabels`, `spendingChartData`, `spendingChartCtx`
- **Daily Spending Line**
  - Canvas ID: `dailySpendingChart`
  - Variables: `dailySpendingChartRawData`, `dailySpendingChartLabels`, `dailySpendingChartData`, `dailySpendingChartCtx`
- **Category Distribution Pie**
  - Canvas ID: `categoryDistributionChart`
  - Variables: `monthCategoryMap`, `monthCategoryLabels`, `monthCategoryData`, `monthCategoryCtx`
- **Top Merchants Bar**
  - Canvas ID: `topMerchantsChart`
  - Variables: `topMerchantsChartRawData`, `topMerchantsChartLabels`, `topMerchantsChartData`, `topMerchantsChartCtx`

### Year View Charts (`renderYearHtml` in `summaryModule.js`)

- **Yearly Spending Bar**
  - Canvas ID: `yearSpendingChart`
  - Variables: `yearSpendingChartRawData`, `yearSpendingChartLabels`, `yearSpendingChartData`, `yearSpendingChartCtx`
- **Top Merchants Bar**
  - Canvas ID: `topMerchantsYearChart`
  - Variables: `topMerchantsYearChartRawData`, `topMerchantsYearChartLabels`, `topMerchantsYearChartData`, `topMerchantsYearChartCtx`
- **Category Distribution Pie**
  - Canvas ID: `categoryDistributionChart`
  - Variables: `yearCategoryLabels`, `yearCategoryData`, `cdCtx` (or full: `categoryDistributionChartCtx`)

## 2. Summary Generation Conventions (`src/summary.js`)

- Functions are named `generateXyz` and return plain JS objects/arrays for each report section:
  1. `generateMonthlyOverview`
  2. `generateMonthlySpending`

3.  `generateCategoryBreakdown`
4.  `generateTrends`
5.  `generateLifestyleSummary`
6.  `generateMerchantInsights`
7.  `generateBudgetAdherence`
8.  `generateSavingsGoals`
9.  `generateAnomalies`
10. `generateYearlySummary`

- The main `summary.js` builds a top-level `summary` object with these keys in order:
  ```js
  {
    monthlyOverview,
      monthlySpending,
      categoryBreakdown,
      trends,
      lifestyle,
      merchantInsights,
      budgetAdherence,
      savingsGoals,
      anomalies,
      yearlySummary,
      dailySpending; // when enabled
  }
  ```

## 3. HTML Rendering Module (`src/summaryModule.js`)

- Exposes functions:

  - `renderHtml` → single-month view
  - `renderYearHtml` → specific year view
  - `renderAllYearsHtml` → index of years
  - `renderCategoryTransactionsHtml` → drill-down page

- Each renderer function:
  1. Builds navigation links using `fmtMonth` and `fmtAmount` helpers.
  2. Injects inline `<script>` with pre-serialized JSON (never dynamic object mutation in browser).
  3. Uses unique chart variable prefixes to avoid clashes.

## 4. Helper Naming

- Formatter functions:
  - `fmtAmount(value, currency)` → formats numbers with currency symbols
  - `fmtMonth('YYYY-MM')` → returns `'Mon YY'`

## 5. General Guidelines

- Avoid top-level `const labels`, `const data`, `const ctx` in inline scripts.
- Always namespace variables by the chart or component they belong to.
- Pre-serialize data on the server; minimize client-side logic in `<script>` blocks.
- Extract complex interactive behaviors into standalone `.js` files under `public/` and include them via `<script src="/your-script.js"></script>`, instead of embedding large inline `<script>` sections in HTML templates.

Feel free to reference this file when adding new charts or renderers to maintain consistent patterns.

## 6. Testing & CI/CD Conventions

- **Test File Organization**
  - Place all test files under `tests/`, using the `.test.js` suffix.
  - Unit tests go in `tests/service/`; integration (HTTP) tests go in `tests/routes/`.
- **Testing Framework**
  - Use Jest (`describe`, `test`, `expect`) with the `jest` environment enabled in ESLint.
  - For HTTP route tests, use Supertest (`require('supertest')`).
- **Test Fixtures**
  - Use `beforeAll`/`afterAll` to seed or cleanup temporary fixtures (e.g., under `data/`) so tests run on a fresh checkout.
- **Pre-commit Hooks & Linting**
  - Husky and lint-staged enforce `eslint --fix` and `prettier` on staged `.js` files before commit.
- **CI Pipeline**
  - A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on pushes and pull requests, installing dependencies, linting, and running tests automatically.
