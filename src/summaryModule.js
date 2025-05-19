// summaryModule.js
// Provides functions to load generated summary data and render it in text or HTML formats.
const fs = require('fs');
const path = require('path');
// Currency symbols map
const currencySymbols = { USD: '$', GBP: '£', EUR: '€', JPY: '¥', CAD: 'CA$', AUD: 'A$', INR: '₹' };
/**
 * Format a numeric amount with the given or default currency.
 * @param {number|string} val
 * @param {string} [currencyRawParam] - Optional 3-letter currency code override
 * @returns {string}
 */
function fmtAmount(val, currencyRawParam) {
  const num = typeof val === 'number' ? val : Number(val) || 0;
  const cr = currencyRawParam && typeof currencyRawParam === 'string'
    ? currencyRawParam.toUpperCase()
    : (process.env.DEFAULT_CURRENCY || 'GBP');
  const symbol = (cr.length === 3 && currencySymbols[cr]) ? currencySymbols[cr] : cr;
  const formatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatter.format(num)}`;
}

/**
 * Render an insights page for a specific year
 * (monthly spending trends, category distribution, top merchants,
 *  flagged transactions, spending spikes, recurring bills & subscriptions).
 *
 * @param {object} summary
 * @param {string} year   – Four-digit year (e.g., "2025").
 * @param {string} [currencyRawParam] – Optional currency code override.
 * @returns {string} HTML string
 */
function renderYearInsightsHtml(summary, year, currencyRawParam) {
  const selYear = year;
  // Months in the year
  const allMonths = Array.isArray(summary.monthlySpending)
    ? summary.monthlySpending.map(s => s.month).filter(m => m.startsWith(selYear + '-')).sort()
    : [];
  // Aggregate category distribution over the year
  const catDist = {};
  allMonths.forEach(m => {
    const cb = summary.categoryBreakdown && summary.categoryBreakdown.perMonth && summary.categoryBreakdown.perMonth[m];
    if (cb && cb.categories) {
      Object.entries(cb.categories).forEach(([c, v]) => { catDist[c] = (catDist[c] || 0) + v; });
    }
  });
  // Begin HTML
  let html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Insights for ${year}</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>Insights for ${year}</h1>`;
  // Year navigation for insights
  const yearsList = Array.isArray(summary.yearlySummary) ? summary.yearlySummary.map(y => y.year).sort() : [];
  const idxY = yearsList.indexOf(year);
  const prevY = idxY > 0 ? yearsList[idxY - 1] : null;
  const nextY = idxY >= 0 && idxY < yearsList.length - 1 ? yearsList[idxY + 1] : null;
  html += '<div class="year-nav">';
  if (prevY) {
    html += `<a class="prev-year" href="/years/${prevY}/insights">← ${prevY}</a>`;
  } else {
    html += '<span></span>';
  }
  html += `<a class="year-summary" href="/years/${year}">Summary</a>`;
  if (nextY) {
    html += `<a class="next-year" href="/years/${nextY}/insights">${nextY} →</a>`;
  } else {
    html += '<span></span>';
  }
  html += '</div>';
  // Category filter panel
  const yearCategoryList = Object.keys(catDist);
  if (yearCategoryList.length) {
    html += `
  <details id="filter-panel" style="margin-bottom:1em;">
    <summary>Filter Categories</summary>
    <form id="category-filter" data-month="${selYear}" style="margin:0;">
      <fieldset style="border:1px solid #ccc; padding:.5em;">
        ${yearCategoryList.map(cat => {
          const isSt = /saving|transfer/i.test(cat);
          return `
        <label style="margin-right:.5em;">
          <input type="checkbox" name="category" value="${cat}" ${isSt ? '' : 'checked'}>
          ${cat}
        </label>`;
        }).join('')}
      </fieldset>
    </form>
    <div class="filter-actions" style="margin:.5em 0; font-size:.9em;">
      <a href="#" id="clear-all">Clear all</a> |
      <a href="#" id="select-all">Select all</a> |
      <a href="#" id="hide-savings-transfers">Hide savings & transfers</a>
    </div>
  </details>`;
  }
  // Category Distribution
  html += `
  <h2>Spending Category Distribution</h2>
  <canvas id="categoryDistributionChart" width="600" height="150"></canvas>
  <script>
    window.categoryDistributionChartRawData = ${JSON.stringify(catDist)};
  </script>`;
  // Top Merchants
  html += `
  <h2>Top Merchants</h2>
  <canvas id="topMerchantsChart" width="600" height="150"></canvas>
  <script>
    window.topMerchantsChartRawData = ${JSON.stringify(summary.merchantInsights.usageOverTime)};
    window.topMerchantsChartCategoryData = ${JSON.stringify(summary.merchantInsights.usageOverTimeByCategory || {})};
  </script>`;
  // (Spikes section removed)
  // Flagged Transactions
  html += `
  <h2>Flagged Transactions</h2>`;
  const yearOutliers = summary.anomalies && Array.isArray(summary.anomalies.outliers)
    ? summary.anomalies.outliers.filter(o => o.date.startsWith(selYear + '-'))
    : [];
  if (yearOutliers.length) {
    html += `
  <table id="flagged-transactions-table">
    <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th></tr></thead>
    <tbody>`;
    yearOutliers.forEach(o => {
      html += `
      <tr data-category="${o.category}">
        <td>${o.date}</td>
        <td>${o.description || ''}</td>
        <td>${fmtAmount(Math.abs(o.amount), currencyRawParam)}</td>
        <td><a href="/years/${year}/insights?category=${encodeURIComponent(o.category)}">${o.category || ''}</a></td>
      </tr>`;
    });
    html += `
    </tbody>
  </table>`;
  } else {
    html += `<p>No flagged transactions.</p>`;
  }
  // Recurring Bills & Subscriptions
  html += `
  <h2>Recurring Bills & Subscriptions</h2>`;
  const recDefs = Array.isArray(summary.trends.recurringBills) ? summary.trends.recurringBills : [];
  const recs = recDefs.map(item => {
    const usage = summary.merchantInsights.usageOverTime[item.description] || {};
    const vals = allMonths.map(m => usage[m] || 0).filter(v => v > 0);
    if (!vals.length) return null;
    const occurrences = vals.length;
    const total = vals.reduce((s, v) => s + v, 0);
    const avgAmount = total / occurrences;
    return { description: item.description, category: item.category, occurrences, total, avgAmount };
  }).filter(x => x);
  if (recs.length) {
    html += `
  <table id="recurring-table">
    <thead><tr><th>Merchant</th><th>Occurrences</th><th>Total Spend</th><th>Avg per Occurrence</th></tr></thead>
    <tbody>`;
    recs.forEach(r => {
      html += `
      <tr data-category="${r.category}">
        <td><a href="/years/${year}/insights?category=${encodeURIComponent(r.category)}">${r.description}</a></td>
        <td>${r.occurrences}</td>
        <td>${fmtAmount(r.total, currencyRawParam)}</td>
        <td>${fmtAmount(r.avgAmount, currencyRawParam)}</td>
      </tr>`;
    });
    html += `
    </tbody>
  </table>`;
  } else {
    html += `<p>No recurring bills detected.</p>`;
  }
  // Include scripts
  html += `
<script src="/charts.js"></script>
<script src="/insights.js"></script>
</body>
</html>`;
  return html;
}
// Month-year display helper: format "YYYY-MM" as "Mon YY", e.g., "Jan 25"
const monthShortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/**
 * Format a YYYY-MM string into short month name and two-digit year.
 * @param {string} ym - Month string in "YYYY-MM" format
 * @returns {string} Formatted month-year, e.g., "Jan 25"
 */
function formatYearMonth(ym) {
  if (typeof ym !== 'string') return '';
  const parts = ym.split('-');
  if (parts.length !== 2) return ym;
  const [year, mon] = parts;
  const idx = parseInt(mon, 10) - 1;
  const name = monthShortNames[idx] || mon;
  const shortY = year.slice(-2);
  return `${name} ${shortY}`;
}
// Format YYYY-MM to short month name and two-digit year, e.g. "Jan 25"
const _monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonth(ym) {
  if (typeof ym !== 'string') return '';
  const [yr, mo] = ym.split('-');
  const m = parseInt(mo, 10);
  if (!yr || isNaN(m) || m < 1 || m > 12) return ym;
  const name = _monthNames[m - 1];
  const shortYr = yr.length === 4 ? yr.slice(2) : yr;
  return `${name} ${shortYr}`;
}

/**
 * Render an HTML page listing all transactions for a given category/month.
 * @param {string} year - Four-digit year (e.g., "2025").
 * @param {string} month - Two-digit month (e.g., "05").
 * @param {string} category - Category name.
 * @param {Array} transactions - Array of transaction objects with date, description, amount, notes.
 * @returns {string} HTML string
 */
function renderCategoryTransactionsHtml(year, month, category, transactions, currencyRawParam) {
  let html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Transactions: ${category} (${fmtMonth(year + '-' + month)})</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <h1>Transactions for ${category} in ${fmtMonth(year + '-' + month)}</h1>
  <p><a href="/years/${year}/${month}">← Back to month summary</a></p>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Amount</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>`;
  transactions.forEach(tx => {
    html += `
      <tr>
        <td>${tx.date || ''}</td>
        <td>${tx.description || ''}</td>
        <td>${fmtAmount(tx.amount, currencyRawParam)}</td>
        <td>${tx.notes || ''}</td>
      </tr>`;
  });
  html += `
    </tbody>
  </table>
</body>
</html>`;
  return html;
}
/**
 * Render an index of all yearly summaries as HTML.
 * @param {object} summary
 * @param {string} [currencyRawParam] - Optional currency code override
 * @returns {string} HTML string
 */
function renderAllYearsHtml(summary, currencyRawParam) {
  const years = Array.isArray(summary.yearlySummary) ? summary.yearlySummary : [];
  // Compute spending per year (sum of monthlySpending excluding transfers/savings)
  const yearSpendingMap = {};
  if (Array.isArray(summary.monthlySpending)) {
    summary.monthlySpending.forEach(ms => {
      const [yr] = ms.month.split('-');
      yearSpendingMap[yr] = (yearSpendingMap[yr] || 0) + ms.spending;
    });
  }
  let html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Annual Summaries</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <h1>Annual Summaries</h1>`;
  if (years.length) {
    html += `
  <table>
    <thead>
      <tr>
        <th title="Calendar year">Year</th>
        <th title="Total inflows for the year">Income</th>
        <th title="Total outflows (all expenses, transfers, savings, etc.) for the year">Expenses</th>
        <th title="Total spending excluding transfers & savings for the year">Spending</th>
        <th title="Net cash flow: Income minus Expenses">Net Cash Flow</th>
        <th title="(Net Cash Flow / Income) * 100">Savings Rate</th>
      </tr>
    </thead>
    <tbody>`;
    years.forEach(y => {
      html += `
      <tr>
        <td><a href="/years/${y.year}">${y.year}</a></td>
        <td>${fmtAmount(y.totalIncome, currencyRawParam)}</td>
        <td>${fmtAmount(y.totalExpenses, currencyRawParam)}</td>
        <td>${fmtAmount(yearSpendingMap[y.year] || 0, currencyRawParam)}</td>
        <td>${fmtAmount(y.netCashFlow, currencyRawParam)}</td>
        <td>${y.savingsRate.toFixed(2)}%</td>
      </tr>`;
    });
    html += `
    </tbody>
  </table>
  <p><a href="/manage">Manage Data →</a></p>`;
  } else {
    html += `<p>No annual summaries available.</p>`;
    html += `<p><a href="/manage">Manage Data →</a></p>`;
  }

  html += `
</body>
</html>`;
  return html;
}

/**
 * Load summary data from JSON file, optionally filtering by month (YYYY-MM).
 * @param {{month?: string}} options
 * @returns {object} summary data
 */
function getSummary({ month } = {}) {
  const summaryPath = path.resolve(__dirname, '..', 'data', 'summary.json');
  // Load or initialize empty summary if file is missing
  let summary;
  if (fs.existsSync(summaryPath)) {
    const raw = fs.readFileSync(summaryPath, 'utf-8');
    summary = JSON.parse(raw);
  } else {
    // No summary generated yet: return empty data structures
    summary = {
      yearlySummary: [],
      monthlyOverview: [],
      monthlySpending: [],
      dailySpending: [],
      categoryBreakdown: { perMonth: {} },
      trends: { monthlyTrends: [], recurringBills: [] },
      lifestyle: [],
      merchantInsights: { topMerchants: [], transactionCounts: {}, usageOverTime: {} },
      budgetAdherence: {},
      savingsGoals: {},
      anomalies: { outliers: [], spikes: [], duplicates: [] }
    };
  }
  if (month) {
    // Filter for single-month views
    if (Array.isArray(summary.monthlyOverview)) {
      summary.monthlyOverview = summary.monthlyOverview.filter(item => item.month === month);
    }
    if (Array.isArray(summary.dailySpending)) {
      summary.dailySpending = summary.dailySpending.filter(d => d.date.startsWith(month));
    }
    if (summary.categoryBreakdown && summary.categoryBreakdown.perMonth) {
      summary.categoryBreakdown.perMonth = { [month]: summary.categoryBreakdown.perMonth[month] };
    }
    if (summary.trends && Array.isArray(summary.trends.monthlyTrends)) {
    summary.trends.monthlyTrends = summary.trends.monthlyTrends.filter(t => t.month === month);
  }
  if (summary.trends && summary.trends.monthlyRecurringBills) {
    summary.trends.recurringBills = summary.trends.monthlyRecurringBills[month] || [];
  }
    if (Array.isArray(summary.lifestyle)) {
      summary.lifestyle = summary.lifestyle.filter(l => l.month === month);
    }
    if (summary.anomalies) {
      if (Array.isArray(summary.anomalies.outliers)) {
        summary.anomalies.outliers = summary.anomalies.outliers.filter(o => o.date.startsWith(month));
      }
      if (Array.isArray(summary.anomalies.spikes)) {
        summary.anomalies.spikes = summary.anomalies.spikes.filter(s => s.month === month);
      }
      if (Array.isArray(summary.anomalies.duplicates)) {
        summary.anomalies.duplicates = summary.anomalies.duplicates.filter(d => d.date.startsWith(month));
      }
    }
    if (summary.merchantInsights) {
      const usage = summary.merchantInsights.usageOverTime || {};
      summary.merchantInsights.usageOverTime = Object.fromEntries(
        Object.entries(usage).map(([m, data]) => [
          m,
          data[month] != null ? { [month]: data[month] } : {}
        ])
      );
      summary.merchantInsights.transactionCounts = Object.fromEntries(
        Object.entries(summary.merchantInsights.transactionCounts || {}).filter(
          ([m]) => (summary.merchantInsights.usageOverTime[m] || {})[month] > 0
        )
      );
    }
    if (summary.budgetAdherence && summary.budgetAdherence[month]) {
      summary.budgetAdherence = { [month]: summary.budgetAdherence[month] };
    } else {
      summary.budgetAdherence = {};
    }
    if (summary.savingsGoals) {
      Object.values(summary.savingsGoals).forEach(g => {
        if (g.monthlyContributions) {
          g.monthlyContributions = { [month]: g.monthlyContributions[month] || 0 };
        }
      });
    }
  }
  return summary;
}

/**
 * Render an insights page for a specific month
 * (daily spending, category distribution, top merchants,
 *  flagged transactions, recurring bills & subscriptions).
 *
 * @param {object} summary
 * @param {string} year   – Four-digit year (e.g., "2025").
 * @param {string} month  – Two-digit month (e.g., "05").
 * @param {string} [currencyRawParam] – Optional currency code override.
 * @returns {string} HTML string
 */
function renderMonthInsightsHtml(summary, year, month, currencyRawParam) {
  const sel = `${year}-${month}`;
  const cbMonth = summary.categoryBreakdown && summary.categoryBreakdown.perMonth && summary.categoryBreakdown.perMonth[sel];
  const monthCategoryList = cbMonth ? Object.keys(cbMonth.categories) : [];
  let html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Insights for ${fmtMonth(sel)}</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>Insights for ${fmtMonth(sel)}</h1>
`;

  const allMonths = Array.isArray(summary.monthlySpending)
    ? summary.monthlySpending.map(s => s.month).sort()
    : [];
  const idx = allMonths.indexOf(sel);
  const prev = idx > 0 ? allMonths[idx - 1] : null;
  const next = idx >= 0 && idx < allMonths.length - 1 ? allMonths[idx + 1] : null;
  html += '<div class="month-nav">';
  if (prev) {
    const [pY, pM] = prev.split('-');
    html += `<a class="prev-month" href="/years/${pY}/${pM}/insights">← ${fmtMonth(prev)}</a>`;
  } else {
    html += '<span></span>';
  }
  html += `<a class="year-link" href="/years/${year}/${month}">Summary</a>`;
  if (next) {
    const [nY, nM] = next.split('-');
    html += `<a class="next-month" href="/years/${nY}/${nM}/insights">${fmtMonth(next)} →</a>`;
  } else {
    html += '<span></span>';
  }
  html += '</div>';
  if (monthCategoryList.length) {
    html += `
  <details id="filter-panel" style="margin-bottom:1em;">
    <summary>Filter Categories</summary>
    <form id="category-filter" data-month="${sel}">
      <fieldset style="border:1px solid #ccc; padding:.5em;">
        ${monthCategoryList.map(cat => {
          const isSt = /saving|transfer/i.test(cat);
          return `
        <label style="margin-right:.5em;">
          <input type="checkbox" name="category" value="${cat}" ${isSt ? '' : 'checked'}>
          ${cat}
        </label>`;
        }).join('')}
      </fieldset>
    </form>
    <div class="filter-actions" style="margin: .5em 0; font-size: .9em;">
      <a href="#" id="clear-all" style="margin-right:1em;">Clear all</a>
      <a href="#" id="select-all" style="margin-right:1em;">Select all</a>
      <a href="#" id="hide-savings-transfers">Hide savings & transfers</a>
    </div>
  </details>`;
  }

  
  if (Array.isArray(summary.dailySpending)) {
    const dailyData = summary.dailySpending;
    html += `
  <h2>Daily Spending</h2>
  <canvas id="dailySpendingChart" width="600" height="150"></canvas>
  <script>
    window.dailySpendingChartRawData = ${JSON.stringify(dailyData)};
  </script>`;
  }

  
  const cb = summary.categoryBreakdown && summary.categoryBreakdown.perMonth && summary.categoryBreakdown.perMonth[sel];
  // Category Distribution section
  if (cb) {
    const monthCategories = cb.categories;
    html += `
  <h2>Spending Category Distribution</h2>
  <canvas id="categoryDistributionChart" width="600" height="150"></canvas>
  <script>
    window.categoryDistributionChartRawData = ${JSON.stringify(monthCategories)};
  </script>`;
  }
  // Spending Category Spikes (moved next)
  if (summary.anomalies && Array.isArray(summary.anomalies.spikes)) {
    const spikes = summary.anomalies.spikes.filter(s => s.month === sel);
    html += `
  <h2>Spending Category Spikes</h2>`;
    if (spikes.length) {
      html += `
  <table id="spikes-table">
    <thead><tr><th>Category</th><th>Month</th><th>Amount</th><th>Mean</th><th>SD</th></tr></thead>
    <tbody>`;
      spikes.forEach(s => {
        html += `
      <tr data-category="${s.category}">
        <td><a href="/years/${year}/${month}/category/${encodeURIComponent(s.category)}">${s.category}</a></td>
        <td>${fmtMonth(s.month)}</td>
        <td>${fmtAmount(s.amount, currencyRawParam)}</td>
        <td>${fmtAmount(s.mean, currencyRawParam)}</td>
        <td>${fmtAmount(s.sd, currencyRawParam)}</td>
      </tr>`;
      });
      html += `
    </tbody>
  </table>`;
    } else {
      html += `<p>No spending spikes detected.</p>`;
    }
  }

  
  if (summary.merchantInsights && summary.merchantInsights.usageOverTime) {
    html += `
  <h2>Top Merchants</h2>
  <canvas id="topMerchantsChart" width="600" height="150"></canvas>
  <script>
    window.topMerchantsChartRawData = ${JSON.stringify(summary.merchantInsights.usageOverTime)};
    window.topMerchantsChartCategoryData = ${JSON.stringify(summary.merchantInsights.usageOverTimeByCategory || {})};
  </script>`;
  }

  
  if (summary.anomalies && Array.isArray(summary.anomalies.outliers)) {
    const flagged = summary.anomalies.outliers.filter(o => o.date.startsWith(sel));
    html += `
  <h2>Flagged Transactions</h2>`;
    if (flagged.length) {
      html += `
  <table id="flagged-transactions-table">
    <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th></tr></thead>
    <tbody>`;
      flagged.forEach(o => {
      html += `
      <tr data-category="${o.category}">
        <td>${o.date}</td>
        <td>${o.description || ''}</td>
        <td>${fmtAmount(Math.abs(o.amount), currencyRawParam)}</td>
        <td><a href="/years/${year}/${month}/category/${encodeURIComponent(o.category)}">${o.category || ''}</a></td>
      </tr>`;
      });
      html += `
    </tbody>
  </table>`;
    } else {
      html += `
  <p>No flagged transactions.</p>`;
    }
  }



  // Recurring bills & subscriptions for the selected month
  html += `
  <h2>Recurring Bills & Subscriptions</h2>
  <table id="recurring-table">
    <thead>
      <tr>
        <th>Merchant</th>
        <th>Occurrences</th>
        <th>Total Spend</th>
        <th>Avg per Occurrence</th>
      </tr>
    </thead>
    <tbody>`;
  const recs = (summary.trends.recurringBills || []).filter(item =>
    (summary.merchantInsights.usageOverTime[item.description] || {})[sel] > 0
  );
  recs.forEach(item => {
    html += `
      <tr data-category="${item.category}">
        <td><a href="/years/${year}/${month}/category/${encodeURIComponent(item.category)}">${item.description}</a></td>
        <td>${item.occurrences}</td>
        <td>${fmtAmount(item.total, currencyRawParam)}</td>
        <td>${fmtAmount(item.avgAmount, currencyRawParam)}</td>
      </tr>`;
  });
  html += `
    </tbody>
  </table>`;

  html += `
<script src="/charts.js"></script>
<script src="/insights.js"></script>
</body>
</html>`;
  return html;
}


/**
 * Render summary data as a simple HTML page.
 * @param {object} summary
 * @param {string} [currencyRawParam] - Optional currency code override
 * @returns {string} HTML string
 */
function renderHtml(summary, currencyRawParam) {
  const title = (summary.monthlyOverview && summary.monthlyOverview.length === 1)
    ? `Summary for ${fmtMonth(summary.monthlyOverview[0].month)}`
    : 'Overall Summary';
  let html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>${title}</h1>`;
  // Add simple prev/next navigation for single-month view
  // Simple prev/next navigation for single-month view
  const isMonthView = Array.isArray(summary.monthlyOverview) && summary.monthlyOverview.length === 1;
  if (isMonthView) {
    const current = summary.monthlyOverview[0].month;
    const allMonths = Array.isArray(summary.monthlySpending)
      ? summary.monthlySpending.map(s => s.month).sort()
      : [];
    const idx = allMonths.indexOf(current);
    const prev = idx > 0 ? allMonths[idx - 1] : null;
    const next = idx >= 0 && idx < allMonths.length - 1 ? allMonths[idx + 1] : null;
    // extract current year for navigation
    const [curY] = current.split('-');
    // navigation links
    html += '<div class="month-nav">';
    if (prev) {
      const [pY, pM] = prev.split('-');
      html += `<a class="prev-month" href="/years/${pY}/${pM}">← ${fmtMonth(prev)}</a>`;
    } else {
      html += '<span></span>';
    }
    // central link back to annual overview
    html += `<a class="year-link" href="/years/${curY}">${curY}</a>`;
    if (next) {
      const [nY, nM] = next.split('-');
      html += `<a class="next-month" href="/years/${nY}/${nM}">${fmtMonth(next)} →</a>`;
    } else {
      html += '<span></span>';
    }
    html += '</div>';
  }
  if (Array.isArray(summary.monthlyOverview) && summary.monthlyOverview.length === 1) {
    const sel = summary.monthlyOverview[0].month;
    html += `
  <canvas id="spendingChart" width="600" height="150"></canvas>
  <script>
    window.spendingChartRawData = ${JSON.stringify(summary.monthlySpending)};
    window.spendingChartSelMonth = '${sel}';
  </script>`;
  }
  if (Array.isArray(summary.monthlyOverview)) {
    // Find spending per month
    const spendArr = Array.isArray(summary.monthlySpending) ? summary.monthlySpending : [];
    html += `
  <table>
    <thead>
      <tr>
        <th title="Calendar month in YYYY-MM format">Month</th>
        <th title="Total inflows for the month">Income</th>
        <th title="Total outflows (all expenses, transfers, savings) for the month">Expenses</th>
        <th title="Total spending excluding transfers and savings">Spending</th>
        <th title="Net cash flow: Income minus Expenses">Net Cash Flow</th>
        <th title="(Net Cash Flow / Income) * 100">Savings Rate</th>
      </tr>
    </thead>
    <tbody>`;
    summary.monthlyOverview.forEach(item => {
      const sp = spendArr.find(s => s.month === item.month);
      const spVal = sp ? sp.spending : 0;
      const [iyear, imonth] = item.month.split('-');
      html += `
      <tr>
        <td><a href="/years/${iyear}/${imonth}">${fmtMonth(item.month)}</a></td>
        <td>${fmtAmount(item.totalIncome, currencyRawParam)}</td>
        <td>${fmtAmount(item.totalExpenses, currencyRawParam)}</td>
        <td>${fmtAmount(spVal, currencyRawParam)}</td>
        <td>${fmtAmount(item.netCashFlow, currencyRawParam)}</td>
        <td>${item.savingsRate.toFixed(2)}%</td>
      </tr>`;
    });
    html += `
    </tbody>
  </table>`;
  }
  // If single-month view, add Category Breakdown
  if (Array.isArray(summary.monthlyOverview) && summary.monthlyOverview.length === 1) {
    const month = summary.monthlyOverview[0].month;
    // parse year and month for links
    const [cy, cm] = month.split('-');
    const cb = summary.categoryBreakdown && summary.categoryBreakdown.perMonth
      ? summary.categoryBreakdown.perMonth[month]
      : null;
    if (cb) {
      html += `
  <h2>Spending Category Breakdown (${fmtMonth(month)})</h2>
  <table id="category-breakdown-table">
    <thead>
      <tr>
        <th title="Category name">Category</th>
        <th title="Amount spent this month">Amount</th>
        <th title="Change vs previous month">Δ vs Prev</th>
        <th title="Budget allocated for this category">Budget</th>
        <th title="Actual spending vs budget">Actual</th>
        <th title="Variance: actual minus budget">Variance</th>
        <th title="Percent of budget used">% Used</th>
      </tr>
    </thead>
    <tbody>`;
      // sort categories by Δ vs Prev descending
      const sortedCats = Object.keys(cb.categories).sort((a, b) => {
        const aVal = (cb.changeVsPrevious && cb.changeVsPrevious[a] != null)
          ? cb.changeVsPrevious[a] : Number.NEGATIVE_INFINITY;
        const bVal = (cb.changeVsPrevious && cb.changeVsPrevious[b] != null)
          ? cb.changeVsPrevious[b] : Number.NEGATIVE_INFINITY;
        return bVal - aVal;
      });
      sortedCats.forEach(cat => {
        const amt = cb.categories[cat] || 0;
        const changeVal = (cb.changeVsPrevious && cb.changeVsPrevious[cat] != null)
          ? cb.changeVsPrevious[cat] : null;
        let changeHtml = '';
        if (changeVal != null) {
          const arrow = changeVal > 0
            ? '<span style="color:red;">▲</span>'
            : changeVal < 0
              ? '<span style="color:green;">▼</span>'
              : '';
          changeHtml = `${arrow} ${fmtAmount(changeVal, currencyRawParam)}`;
        }
        const bud = cb.budgetVsActual && cb.budgetVsActual[cat] ? cb.budgetVsActual[cat] : {};
        html += `
      <tr>
        <td>
          <a href="/years/${cy}/${cm}/category/${encodeURIComponent(cat)}">${cat}</a>
        </td>
        <td>${fmtAmount(amt, currencyRawParam)}</td>
        <td>${changeHtml}</td>
        <td>${bud.budget != null ? fmtAmount(bud.budget, currencyRawParam) : ''}</td>
        <td>${bud.actual != null ? fmtAmount(bud.actual, currencyRawParam) : ''}</td>
        <td>${bud.variance != null ? fmtAmount(bud.variance, currencyRawParam) : ''}</td>
        <td>${bud.pctUsed != null ? bud.pctUsed + '%' : ''}</td>
      </tr>`;
      });
      html += `
    </tbody>
  </table>`;
    }
  }
  html += `
<script src="/charts.js"></script>
</body>
</html>`;
  
  if (Array.isArray(summary.monthlyOverview) && summary.monthlyOverview.length === 1) {
    const [cy, cm] = summary.monthlyOverview[0].month.split('-');
    html += `
  <p><a href="/years/${cy}/${cm}/insights">View Insights for ${fmtMonth(summary.monthlyOverview[0].month)} →</a></p>`;
  }
  return html;
}
/**
 * Render a yearly report as HTML, showing the yearly summary and monthly breakdown for the given year.
 * @param {object} summary
 * @param {string} year
 * @param {string} [currencyRawParam] - Optional currency code override
 * @returns {string} HTML string
 */
function renderYearHtml(summary, year, currencyRawParam) {
  const selYear = year || new Date().getFullYear().toString();
  // Find yearly summary for the selected year
  const yearly = Array.isArray(summary.yearlySummary)
    ? summary.yearlySummary.find(y => y.year === selYear)
    : null;
  // Filter monthly overview for months in the selected year
  const months = Array.isArray(summary.monthlyOverview)
    ? summary.monthlyOverview.filter(m => m.month.startsWith(selYear + '-'))
    : [];
  // Filter monthly spending for the selected year
  const spendingArr = Array.isArray(summary.monthlySpending)
    ? summary.monthlySpending.filter(s => s.month.startsWith(selYear + '-'))
    : [];
  // Build HTML
  // Begin HTML document with Chart.js included for bar charts
  let html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Annual Summary for ${selYear}</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>Annual Summary for ${selYear}</h1>`;
  // Year navigation links
  const yearsList = Array.isArray(summary.yearlySummary)
    ? summary.yearlySummary.map(y => y.year).sort()
    : [];
  const idxY = yearsList.indexOf(selYear);
  const prevY = idxY > 0 ? yearsList[idxY - 1] : null;
  const nextY = idxY >= 0 && idxY < yearsList.length - 1 ? yearsList[idxY + 1] : null;
  html += '<div class="year-nav">';
  if (prevY) {
    html += `<a class="prev-year" href="/years/${prevY}">← ${prevY}</a>`;
  } else {
    html += '<span></span>';
  }
  // link back to full years list
  html += `<a class="years-index" href="/years">Years</a>`;
  if (nextY) {
    html += `<a class="next-year" href="/years/${nextY}">${nextY} →</a>`;
  } else {
    html += '<span></span>';
  }
  html += '</div>';
  // Add spending bar chart for the selected year (only if data exists)
  if (spendingArr.length) {
    html += `
  <canvas id="yearSpendingChart" width="600" height="150"></canvas>
  <script>
    window.yearSpendingChartRawData = ${JSON.stringify(spendingArr)};
  </script>
  `;
  }
  // Yearly summary table
  if (yearly) {
    // compute total spending for the year (sum of monthlySpending entries)
    const annualSpending = spendingArr.reduce((sum, m) => sum + m.spending, 0);
    html += `
  <table>
    <thead>
      <tr>
        <th title="Calendar year">Year</th>
        <th title="Total inflows for the year">Income</th>
        <th title="Total outflows (all expenses, transfers, savings, etc.) for the year">Expenses</th>
        <th title="Total spending excluding transfers & savings for the year">Spending</th>
        <th title="Net cash flow: Income minus Expenses">Net Cash Flow</th>
        <th title="(Net Cash Flow / Income) * 100">Savings Rate</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${yearly.year}</td>
        <td>${fmtAmount(yearly.totalIncome, currencyRawParam)}</td>
        <td>${fmtAmount(yearly.totalExpenses, currencyRawParam)}</td>
        <td>${fmtAmount(annualSpending, currencyRawParam)}</td>
        <td>${fmtAmount(yearly.netCashFlow, currencyRawParam)}</td>
        <td>${yearly.savingsRate.toFixed(2)}%</td>
      </tr>
    </tbody>
  </table>`;
  } else {
    html += `<p>No data for year ${selYear}</p>`;
  }

  // Monthly breakdown table for the selected year
  if (months.length) {
    html += `
  <h2>Monthly Breakdown</h2>
  <table>
    <thead>
      <tr>
        <th title="Calendar month in YYYY-MM format">Month</th>
        <th title="Total inflows for the month">Income</th>
        <th title="Total outflows (all expenses, transfers, savings) for the month">Expenses</th>
        <th title="Total spending excluding transfers and savings">Spending</th>
        <th title="Net cash flow: Income minus Expenses">Net Cash Flow</th>
        <th title="(Net Cash Flow / Income) * 100">Savings Rate</th>
      </tr>
    </thead>
    <tbody>`;
    months.forEach(item => {
      const sp = spendingArr.find(s => s.month === item.month);
      const spVal = sp ? sp.spending : 0;
      const [iyear, imonth] = item.month.split('-');
      html += `
      <tr>
        <td><a href="/years/${iyear}/${imonth}">${fmtMonth(item.month)}</a></td>
        <td>${fmtAmount(item.totalIncome, currencyRawParam)}</td>
        <td>${fmtAmount(item.totalExpenses, currencyRawParam)}</td>
        <td>${fmtAmount(spVal, currencyRawParam)}</td>
        <td>${fmtAmount(item.netCashFlow, currencyRawParam)}</td>
        <td>${item.savingsRate.toFixed(2)}%</td>
      </tr>`;
    });
    html += `
    </tbody>
  </table>`;
  } else {
    html += `<p>No monthly data for year ${selYear}</p>`;
  }



  html += `
<script src="/charts.js"></script>
</body>
</html>`;
  
  // Link to insights at bottom of page
  html += `<p><a href="/years/${selYear}/insights">View Insights for ${selYear} →</a></p>`;
  return html;
}

module.exports = {
  getSummary,
  renderHtml,
  renderYearHtml,
  renderAllYearsHtml,
  renderCategoryTransactionsHtml,
  renderMonthInsightsHtml,
  renderYearInsightsHtml
};