const express = require('express');
const router = express.Router();
const insightsCtrl = require('../controllers/insightsController');

// Annual summaries index
router.get('/', insightsCtrl.showAllYears);
// Global transactions list (paginated, most recent first)
router.get('/transactions', require('../controllers/transactionsController').showAllTransactions);
// Year summary
router.get('/:year', insightsCtrl.showYear);
// Year insights
router.get('/:year/insights', insightsCtrl.showYearInsights);
// Monthly transactions listing (paginated)
const transactionsCtrl = require('../controllers/transactionsController');
router.get(
  '/:year/:month/transactions',
  transactionsCtrl.showMonthTransactions
);
// Monthly summary
router.get('/:year/:month', insightsCtrl.showMonth);
// Monthly insights
router.get('/:year/:month/insights', insightsCtrl.showMonthInsights);
// Category drill-down(s)
router.get(
  '/:year/:month/category/:category',
  insightsCtrl.showCategoryTransactions
);

module.exports = router;
