const summaryService = require('../services/summaryService');

/**
 * GET /api/summary
 * Return raw summary JSON
 */
function getSummaryJson(req, res) {
  const month = req.query.month;
  const summary = summaryService.getSummary({ month });
  res.json(summary);
}

module.exports = { getSummaryJson };
