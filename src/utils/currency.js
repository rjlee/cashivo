/**
 * Determine the currency code to use, given an optional override.
 * Falls back to DEFAULT_CURRENCY environment variable or 'GBP'.
 * @param {string} [overrideCurrency] - optional currency code (e.g. from query or CLI flag)
 * @returns {string} valid currency code
 */
function getCurrency(overrideCurrency) {
  if (overrideCurrency) {
    return overrideCurrency;
  }
  if (process.env.DEFAULT_CURRENCY) {
    return process.env.DEFAULT_CURRENCY;
  }
  return 'GBP';
}

module.exports = { getCurrency };
