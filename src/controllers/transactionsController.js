const path = require('path');
const fs = require('fs');

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
  const dataFile = path.resolve(
    __dirname,
    '..',
    '..',
    'data',
    'transactions_categorized.json'
  );
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
  const filtered = all.filter((tx) => (tx.date || '').startsWith(prefix));
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
  res.render('monthTransactions', {
    year,
    month,
    transactions: pageItems,
    totalCount,
    totalPages,
    currentPage,
    allCategories,
  });
}

module.exports = {
  showMonthTransactions,
};
