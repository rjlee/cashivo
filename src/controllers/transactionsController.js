const path = require('path');
const fs = require('fs');
const getDataDir = require('../utils/getDataDir');
const runSummary = require('../utils/runSummary');

/**
 * Show all transactions for a given year and month, paginated by 100.
 */
function showMonthTransactions(req, res, next) {
  const year = req.params.year;
  let month = req.params.month;
  if (month.length === 1) month = '0' + month;
  const prefix = `${year}-${month}`;
  const pageSize = 50;
  const page = parseInt(req.query.page, 10) || 1;
  // Data directory is at project root (not under src)
  const dataDir =
    process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data');
  const dataFile = path.resolve(dataDir, 'transactions_categorized.json');
  if (!fs.existsSync(dataFile)) {
    return res.status(404).render('error', {
      error: { status: 404, message: 'Transaction data not found' },
    });
  }
  let all;
  try {
    all = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    // Annotate original index for update operations
    all = all.map((tx, i) => ({ ...tx, _idx: i }));
  } catch (err) {
    return next(err);
  }
  const { category, dateFrom, dateTo, amountMin, amountMax } = req.query;
  const filtered = all.filter((tx) => {
    if (!tx.date.startsWith(prefix)) return false;
    if (category && tx.category !== category) return false;
    if (dateFrom && tx.date < dateFrom) return false;
    if (dateTo && tx.date > dateTo) return false;
    if (amountMin && parseFloat(tx.amount) < parseFloat(amountMin))
      return false;
    if (amountMax && parseFloat(tx.amount) > parseFloat(amountMax))
      return false;
    return true;
  });
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + pageSize);
  // Load category list from summary.json (populated by summary script)
  let allCategories = [];
  try {
    const summary = require(
      path.resolve(__dirname, '..', '..', 'data', 'summary.json')
    );
    allCategories = Array.isArray(summary.categoriesList)
      ? summary.categoriesList
      : [];
  } catch {}
  // Determine currency for formatting
  const currency = req.query.currency;
  // Build yearsList for filter (to allow quick switch across months)
  const yearsList = Array.from(
    new Set(all.map((tx) => tx.date.slice(0, 4)))
  ).sort((a, b) => b.localeCompare(a));
  res.render('monthTransactions', {
    year,
    month,
    transactions: pageItems,
    totalCount,
    totalPages,
    currentPage,
    allCategories,
    currency,
    yearsList,
    category,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
  });
}

/**
 * Show all transactions (no filtering), paginated by 50, most recent first.
 */
function showAllTransactions(req, res, next) {
  const pageSize = 50;
  const page = parseInt(req.query.page, 10) || 1;
  const dataDir =
    process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data');
  const dataFile = path.resolve(dataDir, 'transactions_categorized.json');
  if (!fs.existsSync(dataFile)) {
    return res.status(404).render('error', {
      error: { status: 404, message: 'Transaction data not found' },
    });
  }
  let all;
  try {
    all = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    all = all.map((tx, i) => ({ ...tx, _idx: i }));
  } catch (err) {
    return next(err);
  }
  // Gather filter parameters and build year dropdown list
  const { year, month, category, dateFrom, dateTo, amountMin, amountMax } =
    req.query;
  const yearsList = Array.from(
    new Set(all.map((tx) => tx.date.slice(0, 4)))
  ).sort((a, b) => b.localeCompare(a));
  // Apply filters if provided
  all = all.filter((tx) => {
    if (year && tx.date.slice(0, 4) !== year) return false;
    if (month && tx.date.slice(5, 7) !== month.padStart(2, '0')) return false;
    if (category && tx.category !== category) return false;
    if (dateFrom && tx.date < dateFrom) return false;
    if (dateTo && tx.date > dateTo) return false;
    if (amountMin && parseFloat(tx.amount) < parseFloat(amountMin))
      return false;
    if (amountMax && parseFloat(tx.amount) > parseFloat(amountMax))
      return false;
    return true;
  });
  // Sort newest first
  all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const totalCount = all.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = all.slice(startIdx, startIdx + pageSize);
  let allCategories = [];
  try {
    const summary = require(
      path.resolve(__dirname, '..', '..', 'data', 'summary.json')
    );
    allCategories = Array.isArray(summary.categoriesList)
      ? summary.categoriesList
      : [];
  } catch {}
  const currency = req.query.currency;
  res.render('allTransactions', {
    transactions: pageItems,
    totalCount,
    totalPages,
    currentPage,
    allCategories,
    currency,
    // Filtering context & dropdown data
    yearsList,
    year,
    month,
    category,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
  });
}

/**
 * Handle bulk delete or category‐update actions for selected transactions.
 */
function bulkActions(req, res, next) {
  const dataDir = getDataDir();
  const dataFile = path.resolve(dataDir, 'transactions_categorized.json');
  let txList;
  try {
    txList = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (err) {
    return next(err);
  }
  const { action, category } = req.body;
  const sel = Array.isArray(req.body.selected)
    ? req.body.selected
    : req.body.selected
      ? [req.body.selected]
      : [];
  if (action === 'delete') {
    txList = txList.filter((tx, i) => !sel.includes(String(i)));
  } else if (action === 'setCategory') {
    txList = txList.map((tx, i) =>
      sel.includes(String(i)) ? { ...tx, category } : tx
    );
  }
  try {
    fs.writeFileSync(dataFile, JSON.stringify(txList, null, 2));
    // Regenerate summary.json after transactions change
    runSummary();
  } catch (err) {
    return next(err);
  }
  // Redirect back to origin page safely; fallback to stripping '/bulk' if no Referrer
  let backURL = req.get('Referrer');
  if (!backURL) {
    backURL = req.originalUrl.replace(/\/bulk$/, '');
  }
  res.location(backURL);
  res.redirect(backURL);
}

module.exports = {
  showMonthTransactions,
  showAllTransactions,
  bulkActions,
};
