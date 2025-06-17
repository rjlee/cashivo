/**
 * @module utils/filters
 * Shared filtering utilities for date-based filters (year or month prefix).
 */

/**
 * Filter an array of objects whose 'month' property starts with the given month (YYYY-MM),
 * or whose 'date' property starts with that prefix.
 * @param {Array<Object>} arr
 * @param {string} month Prefix in 'YYYY-MM' format
 * @returns {Array<Object>}
 */
function filterByMonth(arr, month) {
  if (!Array.isArray(arr) || !month) return [];
  return arr.filter((item) => {
    if (item.month) return item.month === month;
    if (item.date) return item.date.startsWith(month);
    return false;
  });
}

/**
 * Filter an array of objects whose 'month' or 'date' starts with the given year (YYYY).
 * @param {Array<Object>} arr
 * @param {string} year 4-digit year string, e.g. '2023'
 * @returns {Array<Object>}
 */
function filterByYear(arr, year) {
  if (!Array.isArray(arr) || !year) return [];
  const prefix = `${year}-`;
  return arr.filter((item) => {
    if (item.month) return item.month.startsWith(prefix);
    if (item.date) return item.date.startsWith(prefix);
    return false;
  });
}

module.exports = { filterByMonth, filterByYear };
