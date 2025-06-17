const path = require('path');
process.env.DATA_DIR = path.resolve(__dirname, '../tmp_data');
const fs = require('fs');
const { getSummary, exportQif } = require('../../src/services/summaryService');

const summaryPath = path.resolve(
  process.env.DATA_DIR || path.resolve(__dirname, '../tmp_data'),
  'summary.json'
);
let hadSummaryFile = false;
let origSummary;
beforeAll(() => {
  if (fs.existsSync(summaryPath)) {
    hadSummaryFile = true;
    origSummary = fs.readFileSync(summaryPath, 'utf8');
  }
});

const txPath = path.resolve(
  __dirname,
  '../../data/transactions_categorized.json'
);
let hadTxFile = false;
beforeAll(() => {
  if (fs.existsSync(txPath)) {
    hadTxFile = true;
  } else {
    const dataDir = path.dirname(txPath);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      txPath,
      JSON.stringify([
        {
          date: '2023-01-02',
          amount: 100.0,
          description: 'Test',
          category: 'Test',
          notes: 'Note',
        },
      ])
    );
  }
});

afterAll(() => {
  if (hadSummaryFile) {
    fs.writeFileSync(summaryPath, origSummary);
  } else {
    try {
      fs.unlinkSync(summaryPath);
    } catch {}
  }
  if (!hadTxFile) {
    try {
      fs.unlinkSync(txPath);
    } catch {}
  }
});

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

  test('getSummary filters data correctly when month option is provided', () => {
    // Seed summary.json with multiple months
    const monthA = '2023-01';
    const monthB = '2023-02';
    const input = {
      yearlySummary: [],
      monthlyOverview: [
        { month: monthA, totalIncome: 10, totalExpenses: 5 },
        { month: monthB, totalIncome: 20, totalExpenses: 8 },
      ],
      dailySpending: [
        { date: monthA + '-15', spending: 100 },
        { date: monthB + '-20', spending: 200 },
      ],
      categoryBreakdown: {
        perMonth: {
          [monthA]: { categories: { A: 1 } },
          [monthB]: { categories: { B: 2 } },
        },
      },
      trends: {
        monthlyTrends: [
          { month: monthA, income: 10 },
          { month: monthB, income: 20 },
        ],
        monthlyRecurringBills: { [monthA]: ['X'], [monthB]: ['Y'] },
        recurringBills: [],
      },
    };
    fs.writeFileSync(summaryPath, JSON.stringify(input, null, 2));
    const outA = getSummary({ month: monthA });
    expect(outA.monthlyOverview).toHaveLength(1);
    expect(outA.monthlyOverview[0].month).toBe(monthA);
    expect(outA.dailySpending.every((d) => d.date.startsWith(monthA))).toBe(
      true
    );
    expect(Object.keys(outA.categoryBreakdown.perMonth)).toEqual([monthA]);
    expect(outA.trends.monthlyTrends.every((t) => t.month === monthA)).toBe(
      true
    );
    expect(outA.trends.recurringBills).toEqual(
      input.trends.monthlyRecurringBills[monthA]
    );
  });
});
