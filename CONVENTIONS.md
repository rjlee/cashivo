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

### Month View Charts

- **6-Month Spending Bar**
  - Canvas ID: `spendingChart`
  - Variables: `spendingChartRawData`, `spendingChartLabels`, `spendingChartData`, `spendingChartCtx`
- **Daily Spending Line**
  - Canvas ID: `dailySpendingChart`
  - Variables: `dailySpendingChartRawData`, `dailySpendingChartLabels`, `dailySpendingChartData`, `dailySpendingChartCtx`
  - **Category Distribution Pie**
  - Canvas ID: `categoryDistributionChart`
  - Variables: `categoryDistributionChartRawData`, `categoryDistributionChartLabels`, `categoryDistributionChartData`, `categoryDistributionChartCtx`
- **Top Merchants Bar**
  - Canvas ID: `topMerchantsChart`
  - Variables: `topMerchantsChartRawData`, `topMerchantsChartLabels`, `topMerchantsChartData`, `topMerchantsChartCtx`

### Year View Charts

- **Yearly Spending Bar**
  - Canvas ID: `yearSpendingChart`
  - Variables: `yearSpendingChartRawData`, `yearSpendingChartLabels`, `yearSpendingChartData`, `yearSpendingChartCtx`
  - **Top Merchants Bar**
  - Canvas ID: `topMerchantsChart`
  - Variables: `topMerchantsChartRawData`, `topMerchantsChartLabels`, `topMerchantsChartData`, `topMerchantsChartCtx`
  - **Category Distribution Pie**
  - Canvas ID: `categoryDistributionChart`
  - Variables: `categoryDistributionChartRawData`, `categoryDistributionChartLabels`, `categoryDistributionChartData`, `categoryDistributionChartCtx`

## 2. Summary Generation Conventions (`src/summary.js`)

Functions are named `generateXyz` and return plain JS objects/arrays for each report section, in file order:
  1. generateMonthlyOverview
  2. generateCategoryBreakdown
  3. generateTrends
  4. generateLifestyleSummary
  5. generateMerchantInsights
  6. generateBudgetAdherence
  7. generateSavingsGoals
  8. generateAnomalies
  9. generateYearlySummary
 10. generateMonthlySpending
 11. generateDailySpending

- The main `summary.js` builds a top-level `summary` object with these keys in order:
  ```js
  {
    monthlyOverview,
    categoryBreakdown,
    trends,
    lifestyle,
    merchantInsights,
    budgetAdherence,
    savingsGoals,
    anomalies,
    yearlySummary,
    monthlySpending,
    dailySpending // when enabled
  }
  ```

## 3. HTML Rendering & Client-Side Logic

- Views are implemented as EJS templates under the `views/` directory:
  - `insightsAllYears.ejs`, `insightsYear.ejs`, `insightsMonth.ejs`, `insightsYearInsights.ejs`, `insightsMonthInsights.ejs`, `categoryTransactions.ejs`
  - Shared partials in `views/partials/` (e.g., head, footer)
- Templates assemble navigation links, `<canvas>` elements, and inline `<script>` blocks to assign pre-serialized data to `window.<canvasID>RawData` variables.
- Chart initialization is centralized in `public/charts.js`, which:
  1. Reads `window.<canvasID>RawData`
  2. Computes `<canvasID>Labels`, `<canvasID>Data`
  3. Obtains `<canvasID>Ctx` and instantiates Chart.js charts
- Additional interactivity (filters, table toggles) is implemented in `public/insights.js`

## 4. Helper Naming

- Template helper in `src/server.js`:
  - `fmtCurrency(value, currencyCode)` → formats numbers as localized currency strings

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
