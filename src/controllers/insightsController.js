const fs = require('fs');
const path = require('path');
const summaryService = require('../services/summaryService');
const summaryModule = require('../summaryModule');

// GET /years
function showAllYears(req, res, next) {
  try {
    const summary = summaryService.getSummary();
    const currency = req.query.currency;
    res.send(summaryModule.renderAllYearsHtml(summary, currency));
  } catch (err) {
    next(err);
  }
}

// GET /years/:year
function showYear(req, res, next) {
  try {
    const year = req.params.year;
    const summary = summaryService.getSummary();
    const currency = req.query.currency;
    res.send(summaryModule.renderYearHtml(summary, year, currency));
  } catch (err) {
    next(err);
  }
}

// GET /years/:year/insights
function showYearInsights(req, res, next) {
  try {
    const year = req.params.year;
    const summary = summaryService.getSummary();
    const currency = req.query.currency;
    res.send(summaryModule.renderYearInsightsHtml(summary, year, currency));
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
    const currency = req.query.currency;
    res.send(summaryModule.renderHtml(summary, currency));
  } catch (err) {
    next(err);
  }
}

// GET /years/:year/:month/insights
function showMonthInsights(req, res, next) {
  try {
    const year = req.params.year;
    const month = req.params.month.padStart(2, '0');
    const summary = summaryService.getSummary({ month: `${year}-${month}` });
    const currency = req.query.currency;
    res.send(summaryModule.renderMonthInsightsHtml(summary, year, month, currency));
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
    const txPath = path.join(__dirname, '..', 'data', 'transactions_categorized.json');
    const allTx = JSON.parse(fs.readFileSync(txPath, 'utf-8'));
    const filtered = allTx.filter(tx =>
      tx.category === category && tx.date.startsWith(`${year}-${month}`)
    );
    const currency = req.query.currency;
    res.send(summaryModule.renderCategoryTransactionsHtml(year, month, category, filtered, currency));
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