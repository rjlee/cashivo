const summaryService = require('../services/summaryService');
const { getCurrency } = require('../utils/currency');
const { filterByYear } = require('../utils/filters');

/**
 * Dashboard showing summary info for current year
 */
function showDashboard(req, res, next) {
  const year = String(new Date().getFullYear());
  const summary = summaryService.getSummary();
  // Find yearly summary entry
  const yearly =
    (summary.yearlySummary || []).find((y) => y.year === year) || null;
  // Spending per month for chart/table
  const spendingArr = filterByYear(summary.monthlySpending || [], year);
  const currency = getCurrency(req.query.currency);
  // Extract key insights for dashboard, excluding Savings & Transfers by default
  const excludeCats = ['Savings', 'Transfers'];
  const flagged = filterByYear(summary.anomalies?.outliers || [], year).filter(
    (o) => !excludeCats.includes(o.category)
  );
  const numFlagged = flagged.length;
  const recurringCount = Array.isArray(summary.trends?.recurringBills)
    ? summary.trends.recurringBills.length
    : 0;
  // Determine top merchant for the current year, excluding Savings & Transfers
  const usageByCategory =
    summary.merchantInsights?.usageOverTimeByCategory || {};
  const topMerchant = Object.entries(usageByCategory)
    .map(([merchant, monthMap]) => ({
      merchant,
      total: Object.entries(monthMap).reduce((sum, [mo, catMap]) => {
        if (!mo.startsWith(year + '-')) return sum;
        return (
          sum +
          Object.entries(catMap).reduce(
            (s2, [cat, amt]) => (excludeCats.includes(cat) ? s2 : s2 + amt),
            0
          )
        );
      }, 0),
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)[0] || { merchant: '', total: 0 };
  res.render('dashboard', {
    year,
    yearly,
    spendingArr,
    currency,
    numFlagged,
    recurringCount,
    topMerchant,
  });
}

module.exports = { showDashboard };
