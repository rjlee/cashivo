const fs = require('fs');
const path = require('path');
/**
 * Load summary data from JSON file, optionally filtering by month (YYYY-MM).
 * @param {{month?: string}} options
 * @returns {object} summary data
 */
function getSummary({ month } = {}) {
  // summary JSON lives at project-root/data/summary.json
  const summaryPath = path.resolve(
    __dirname,
    '..',
    '..',
    'data',
    'summary.json'
  );
  let summary;
  if (fs.existsSync(summaryPath)) {
    const raw = fs.readFileSync(summaryPath, 'utf-8');
    summary = JSON.parse(raw);
  } else {
    summary = {
      yearlySummary: [],
      monthlyOverview: [],
      monthlySpending: [],
      dailySpending: [],
      categoryBreakdown: { perMonth: {} },
      trends: {
        monthlyTrends: [],
        monthlyRecurringBills: {},
        recurringBills: [],
      },
      lifestyle: [],
      merchantInsights: {
        topMerchants: [],
        transactionCounts: {},
        usageOverTime: {},
      },
      budgetAdherence: {},
      savingsGoals: {},
      anomalies: { outliers: [], spikes: [], duplicates: [] },
    };
  }
  if (month) {
    if (Array.isArray(summary.monthlyOverview)) {
      summary.monthlyOverview = summary.monthlyOverview.filter(
        (i) => i.month === month
      );
    }
    if (Array.isArray(summary.dailySpending)) {
      summary.dailySpending = summary.dailySpending.filter((d) =>
        d.date.startsWith(month)
      );
    }
    if (summary.categoryBreakdown && summary.categoryBreakdown.perMonth) {
      summary.categoryBreakdown.perMonth = {
        [month]: summary.categoryBreakdown.perMonth[month],
      };
    }
    if (summary.trends) {
      if (Array.isArray(summary.trends.monthlyTrends)) {
        summary.trends.monthlyTrends = summary.trends.monthlyTrends.filter(
          (t) => t.month === month
        );
      }
      if (summary.trends.monthlyRecurringBills) {
        summary.trends.recurringBills =
          summary.trends.monthlyRecurringBills[month] || [];
      }
    }
  }
  return summary;
}
/**
 * Export all transactions as QIF string
 * @returns {string}
 */
function exportQif() {
  // transactions file at project-root/data/transactions_categorized.json
  const txPath = path.resolve(
    __dirname,
    '..',
    '..',
    'data',
    'transactions_categorized.json'
  );
  if (!fs.existsSync(txPath)) throw new Error('No transaction data');
  const txs = JSON.parse(fs.readFileSync(txPath, 'utf-8'));
  txs.sort((a, b) => a.date.localeCompare(b.date));
  const lines = ['!Type:Bank'];
  txs.forEach((tx) => {
    const [y, m, d] = tx.date.split('-');
    lines.push('D' + [m.padStart(2, '0'), d.padStart(2, '0'), y].join('/'));
    lines.push('T' + tx.amount.toFixed(2));
    lines.push('P' + tx.description);
    if (tx.notes) lines.push('M' + tx.notes);
    lines.push('L' + tx.category);
    lines.push('^');
  });
  return lines.join('\n');
}
module.exports = { getSummary, exportQif };
