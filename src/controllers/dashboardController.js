const summaryService = require('../services/summaryService');
const { getCurrency } = require('../utils/currency');

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
  const spendingArr = (summary.monthlySpending || []).filter((s) =>
    s.month.startsWith(year + '-')
  );
  const currency = getCurrency(req.query.currency);
  // Extract key insights for dashboard
  const numFlagged = Array.isArray(summary.anomalies?.outliers)
    ? summary.anomalies.outliers.filter((o) => o.date.startsWith(year + '-'))
        .length
    : 0;
  const recurringCount = Array.isArray(summary.trends?.recurringBills)
    ? summary.trends.recurringBills.length
    : 0;
  // Determine top merchant by annual spending
  const usageOverTime = summary.merchantInsights?.usageOverTime || {};
  const topMerchant = Object.entries(usageOverTime)
    .map(([merchant, data]) => ({
      merchant,
      total: Object.entries(data).reduce(
        (sum, [mo, v]) => (mo.startsWith(year + '-') ? sum + v : sum),
        0
      ),
    }))
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
