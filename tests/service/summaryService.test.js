const path = require('path');
const fs = require('fs');
const { getSummary, exportQif } = require('../../src/services/summaryService');

describe('summaryService', () => {
  test('getSummary returns an object with expected properties', () => {
    const summary = getSummary();
    expect(summary).toBeDefined();
    expect(typeof summary).toBe('object');
    expect(Array.isArray(summary.yearlySummary)).toBe(true);
    expect(Array.isArray(summary.monthlySpending)).toBe(true);
  });

  test('exportQif returns a non-empty string starting with QIF header', () => {
    // Ensure data file exists
    const txPath = path.resolve(
      __dirname,
      '../../data/transactions_categorized.json'
    );
    expect(fs.existsSync(txPath)).toBe(true);
    const qif = exportQif();
    expect(typeof qif).toBe('string');
    expect(qif.startsWith('!Type:Bank')).toBe(true);
  });
});
