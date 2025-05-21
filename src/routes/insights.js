const express = require('express');
const router = express.Router();
const insightsCtrl = require('../controllers/insightsController');

// Annual summaries index
router.get('/', insightsCtrl.showAllYears);
// Year summary
router.get('/:year', insightsCtrl.showYear);
// Year insights
router.get('/:year/insights', insightsCtrl.showYearInsights);
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
