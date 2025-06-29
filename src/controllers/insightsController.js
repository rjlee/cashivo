const fs = require('fs');
const path = require('path');
const summaryService = require('../services/summaryService');
const { getCurrency } = require('../utils/currency');
const { makeYearNav, makeMonthNav } = require('../utils/navigation');
const { filterByYear, filterByMonth } = require('../utils/filters');
// summaryModule rendering functions replaced by EJS views

// GET /years
function showAllYears(req, res, next) {
  try {
    const summary = summaryService.getSummary();
    // Order years descending (most recent first)
    if (Array.isArray(summary.yearlySummary)) {
      summary.yearlySummary = summary.yearlySummary
        .slice()
        .sort((a, b) => Number(b.year) - Number(a.year));
    }
    const currency = getCurrency(req.query.currency);
    // Build year-spending map from monthlySpending
    const yearSpendingMap = {};
    (summary.monthlySpending || []).forEach(function (ms) {
      const yr = ms.month.split('-')[0];
      yearSpendingMap[yr] = (yearSpendingMap[yr] || 0) + (ms.spending || 0);
    });
    res.render('insightsAllYears.ejs', { summary, currency, yearSpendingMap });
  } catch (err) {
    next(err);
  }
}

// GET /years/:year
function showYear(req, res, next) {
  try {
    const year = req.params.year;
    const summary = summaryService.getSummary();
    const currency = getCurrency(req.query.currency);
    // Prepare list of years for navigation
    const yearsList = (summary.yearlySummary || []).map((y) => y.year).sort();
    const { prevYear, nextYear } = makeYearNav(yearsList, year);
    // Find yearly summary entry
    const yearly =
      (summary.yearlySummary || []).find((y) => y.year === year) || null;
    // Monthly overview and spending data for the year
    const months = filterByYear(summary.monthlyOverview || [], year);
    const spendingArr = filterByYear(summary.monthlySpending || [], year);
    // Total spending for the year
    const annualSpending = spendingArr.reduce(
      (sum, m) => sum + (m.spending || 0),
      0
    );
    res.render('insightsYear.ejs', {
      year,
      currency,
      yearly,
      months,
      spendingArr,
      annualSpending,
      prevYear,
      nextYear,
    });
  } catch (err) {
    next(err);
  }
}

// GET /years/:year/insights
function showYearInsights(req, res, next) {
  try {
    const year = req.params.year;
    const summary = summaryService.getSummary();
    const currency = getCurrency(req.query.currency);
    // Navigation: previous and next years
    const yearsList = (summary.yearlySummary || []).map((y) => y.year).sort();
    const { prevYear, nextYear } = makeYearNav(yearsList, year);
    // Months in this year
    const allMonths = Array.isArray(summary.monthlySpending)
      ? summary.monthlySpending
          .map((s) => s.month)
          .filter((m) => m.startsWith(year + '-'))
          .sort()
      : [];
    // Category distribution over the year
    const catDist = {};
    allMonths.forEach((m) => {
      const cb = summary.categoryBreakdown?.perMonth?.[m];
      if (cb?.categories) {
        Object.entries(cb.categories).forEach(([c, v]) => {
          catDist[c] = (catDist[c] || 0) + v;
        });
      }
    });
    // Flagged transactions (outliers) for the year
    const outliers = filterByYear(summary.anomalies?.outliers || [], year);
    // Top merchants data
    const topMerchantsData = summary.merchantInsights?.usageOverTime || {};
    const topMerchantsCategoryData =
      summary.merchantInsights?.usageOverTimeByCategory || {};
    // Recurring bills & subscriptions
    const recDefs = Array.isArray(summary.trends?.recurringBills)
      ? summary.trends.recurringBills
      : [];
    const recs = recDefs
      .map((item) => {
        const usage =
          summary.merchantInsights?.usageOverTime?.[item.description] || {};
        const vals = allMonths.map((m) => usage[m] || 0).filter((v) => v > 0);
        if (!vals.length) return null;
        const occurrences = vals.length;
        const total = vals.reduce((sum, v) => sum + v, 0);
        const avgAmount = total / occurrences;
        return {
          description: item.description,
          category: item.category,
          occurrences,
          total,
          avgAmount,
        };
      })
      .filter((x) => x);
    res.render('insightsYearInsights.ejs', {
      year,
      currency,
      prevYear,
      nextYear,
      catDist,
      topMerchantsData,
      topMerchantsCategoryData,
      outliers,
      recs,
    });
  } catch (err) {
    next(err);
  }
}

// GET /years/:year/:month
function showMonth(req, res, next) {
  try {
    const year = req.params.year;
    const month = req.params.month.padStart(2, '0');
    const summary = summaryService.getSummary({ month: `${year}-${month}` });
    const currency = getCurrency(req.query.currency);
    // Determine prev/next months for navigation
    const allMonths = Array.isArray(summary.monthlySpending)
      ? summary.monthlySpending.map((s) => s.month).sort()
      : [];
    const { prevYear, prevMonth, nextYear, nextMonth } = makeMonthNav(
      allMonths,
      year,
      month
    );
    const prev = prevYear && prevMonth ? `${prevYear}-${prevMonth}` : null;
    const next = nextYear && nextMonth ? `${nextYear}-${nextMonth}` : null;
    // Monthly overview (should be single entry)
    const monthlyOverview = summary.monthlyOverview || [];
    const isMonthView = monthlyOverview.length === 1;
    // Spending chart data
    const spendingChartRawData = summary.monthlySpending || [];
    const spendingChartSelMonth = isMonthView ? monthlyOverview[0].month : null;
    // Category breakdown rows
    let categoryRows = [];
    const cb = summary.categoryBreakdown?.perMonth?.[`${year}-${month}`] || {};
    if (isMonthView && cb.categories) {
      const sortedCats = Object.keys(cb.categories).sort((a, b) => {
        const aVal = cb.changeVsPrevious?.[a] ?? Number.NEGATIVE_INFINITY;
        const bVal = cb.changeVsPrevious?.[b] ?? Number.NEGATIVE_INFINITY;
        return bVal - aVal;
      });
      categoryRows = sortedCats.map((cat) => {
        const amt = cb.categories[cat] || 0;
        const changeVal = cb.changeVsPrevious?.[cat];
        const bud = cb.budgetVsActual?.[cat] || {};
        return {
          category: cat,
          amount: amt,
          change: changeVal,
          budget: bud.budget,
          actual: bud.actual,
          variance: bud.variance,
          pctUsed: bud.pctUsed,
        };
      });
    }
    res.render('insightsMonth.ejs', {
      year,
      month,
      currency,
      prevYear,
      prevMonth,
      nextYear,
      nextMonth,
      monthlyOverview,
      spendingChartRawData,
      spendingChartSelMonth,
      categoryRows,
    });
  } catch (err) {
    next(err);
  }
}

// GET /years/:year/:month/insights
function showMonthInsights(req, res, next) {
  try {
    const year = req.params.year;
    const month = req.params.month.padStart(2, '0');
    const sel = `${year}-${month}`;
    const summary = summaryService.getSummary({ month: sel });
    const currency = getCurrency(req.query.currency);
    // Categories for filter panel
    const cbMonth = summary.categoryBreakdown?.perMonth?.[sel] || {};
    const monthCategoryList = cbMonth.categories
      ? Object.keys(cbMonth.categories)
      : [];
    // Prev/Next month navigation
    const allMonths = Array.isArray(summary.monthlySpending)
      ? summary.monthlySpending.map((s) => s.month).sort()
      : [];
    const { prevYear, prevMonth, nextYear, nextMonth } = makeMonthNav(
      allMonths,
      year,
      month
    );
    const prev = prevYear && prevMonth ? `${prevYear}-${prevMonth}` : null;
    const next = nextYear && nextMonth ? `${nextYear}-${nextMonth}` : null;
    // Daily spending data
    const dailyData = summary.dailySpending || [];
    // Category distribution data
    const monthCategories = cbMonth.categories || {};
    // Spending spikes
    const spikes = filterByMonth(summary.anomalies?.spikes || [], sel);
    // Top merchants
    const topMerchantsData = summary.merchantInsights?.usageOverTime || {};
    const topMerchantsCategoryData =
      summary.merchantInsights?.usageOverTimeByCategory || {};
    // Flagged transactions
    const flagged = filterByMonth(summary.anomalies?.outliers || [], sel);
    // Recurring bills & subscriptions for this month
    const recDefs = summary.trends?.recurringBills || [];
    const recs = recDefs.filter((item) => {
      const usage =
        summary.merchantInsights?.usageOverTime?.[item.description] || {};
      return (usage[sel] || 0) > 0;
    });
    res.render('insightsMonthInsights.ejs', {
      year,
      month,
      currency,
      prev,
      prevYear,
      prevMonth,
      next,
      nextYear,
      nextMonth,
      monthCategoryList,
      dailyData,
      monthCategories,
      spikes,
      topMerchantsData,
      topMerchantsCategoryData,
      flagged,
      recs,
    });
  } catch (err) {
    next(err);
  }
}

// GET /years/:year/:month/category/:category
function showCategoryTransactions(req, res, next) {
  try {
    const year = req.params.year;
    const month = req.params.month.padStart(2, '0');
    const category = decodeURIComponent(req.params.category);
    const txPath = path.join(
      __dirname,
      '..',
      '..',
      'data',
      'transactions_categorized.json'
    );
    let allTx = JSON.parse(fs.readFileSync(txPath, 'utf-8'));
    allTx = allTx.map((tx, idx) => ({ ...tx, _idx: idx }));
    // Apply filters
    const { dateFrom, dateTo, amountMin, amountMax } = req.query;
    // Build years list for filter dropdown
    const yearsList = Array.from(
      new Set(allTx.map((tx) => tx.date.slice(0, 4)))
    ).sort((a, b) => b.localeCompare(a));
    let transactions = allTx.filter(
      (tx) => tx.category === category && tx.date.startsWith(`${year}-${month}`)
    );
    transactions = transactions.filter((tx) => {
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo) return false;
      if (amountMin && parseFloat(tx.amount) < parseFloat(amountMin))
        return false;
      if (amountMax && parseFloat(tx.amount) > parseFloat(amountMax))
        return false;
      return true;
    });
    const currency = req.query.currency;
    // Load category list from summary
    const summary = summaryService.getSummary();
    const allCategories = Array.isArray(summary.categoriesList)
      ? summary.categoriesList
      : [];
    res.render('categoryTransactions', {
      year,
      month,
      category,
      transactions,
      currency,
      allCategories,
      yearsList,
      dateFrom,
      dateTo,
      amountMin,
      amountMax,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  showAllYears,
  showYear,
  showYearInsights,
  showMonth,
  showMonthInsights,
  showCategoryTransactions,
};
