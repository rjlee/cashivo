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
  res.render('dashboard', {
    year,
    yearly,
    spendingArr,
    currency,
  });
}

module.exports = { showDashboard };
