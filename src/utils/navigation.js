/**
 * Utility functions to compute previous/next navigation items.
 */

/**
 * Compute previous and next year relative to currentYear in yearsList.
 * @param {string[]} yearsList - Array of year strings (e.g. ["2023","2024"]).
 * @param {string} currentYear
 * @returns {{prevYear: string|null, nextYear: string|null}}
 */
function makeYearNav(yearsList, currentYear) {
  const sorted = Array.isArray(yearsList) ? yearsList.slice().sort() : [];
  const idx = sorted.indexOf(currentYear);
  const prevYear = idx > 0 ? sorted[idx - 1] : null;
  const nextYear = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
  return { prevYear, nextYear };
}

/**
 * Compute previous and next month relative to currentYear-currentMonth.
 * @param {string[]} monthsList - Array of month strings (e.g. ["2024-05","2024-06"]).
 * @param {string} currentYear
 * @param {string} currentMonth
 * @returns {{prevYear: string|null, prevMonth: string|null, nextYear: string|null, nextMonth: string|null}}
 */
function makeMonthNav(monthsList, currentYear, currentMonth) {
  const key = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const sorted = Array.isArray(monthsList) ? monthsList.slice().sort() : [];
  const idx = sorted.indexOf(key);
  let prevYear = null,
    prevMonth = null,
    nextYear = null,
    nextMonth = null;
  if (idx > 0) {
    [prevYear, prevMonth] = sorted[idx - 1].split('-');
  }
  if (idx >= 0 && idx < sorted.length - 1) {
    [nextYear, nextMonth] = sorted[idx + 1].split('-');
  }
  return { prevYear, prevMonth, nextYear, nextMonth };
}

module.exports = { makeYearNav, makeMonthNav };
