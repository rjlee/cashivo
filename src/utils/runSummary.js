const path = require('path');

/**
 * Run the summary generator script to rebuild summary.json and console report.
 */
function runSummary() {
  // summary.js performs dataDir resolution and console output internally
  require(path.resolve(__dirname, '..', 'summary.js'));
}

module.exports = runSummary;
