// Summary generation for multiple reports
// Load environment variables from .env
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Safe JSON loader
function loadJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Paths
const dataDir = path.resolve(__dirname, '..', 'data');
const inputFile = path.resolve(dataDir, 'transactions_categorized.json');

if (!fs.existsSync(inputFile)) {
  console.error('Input file not found:', inputFile);
  process.exit(1);
}
const transactions = JSON.parse(fs.readFileSync(inputFile));
// Optional date range filtering (YYYY-MM). Transactions month >= START_MONTH and/or <= END_MONTH
const startMonth = process.env.START_MONTH;
const endMonth = process.env.END_MONTH;
let txsToProcess = transactions;
if (startMonth) {
  txsToProcess = txsToProcess.filter(
    (tx) => tx.date && tx.date.slice(0, 7) >= startMonth
  );
}
if (endMonth) {
  txsToProcess = txsToProcess.filter(
    (tx) => tx.date && tx.date.slice(0, 7) <= endMonth
  );
}
if (startMonth || endMonth) {
  console.log(
    `Filtering transactions${startMonth ? ` from ${startMonth}` : ''}${endMonth ? ` to ${endMonth}` : ''}: ${txsToProcess.length} records`
  );
}

// Optional configs
const budgets = loadJSON(path.resolve(__dirname, '..', 'budgets.json')) || {};
const goalsConfig = loadJSON(path.resolve(__dirname, '..', 'goals.json')) || {};
// Load category groups: user-provided or default
const defaultCategoryGroups = require(
  path.resolve(__dirname, '..', 'defaults', 'default_category_groups.json')
);
const categoryGroups =
  loadJSON(path.resolve(dataDir, 'category-groups.json')) ||
  defaultCategoryGroups;
const deductibleCategories =
  loadJSON(path.resolve(__dirname, '..', 'deductible-categories.json')) || [];

// Helper: group transactions by month
function getMonthlyData(txs) {
  const monthly = {};
  txs.forEach((tx) => {
    if (!tx.date) return;
    const month = tx.date.slice(0, 7);
    if (!monthly[month])
      monthly[month] = { income: 0, expenses: 0, categories: {} };
    const amt = tx.amount || 0;
    if (amt >= 0) {
      monthly[month].income += amt;
    } else {
      const expense = Math.abs(amt);
      monthly[month].expenses += expense;
      const cat = tx.category || 'Other expenses';
      monthly[month].categories[cat] =
        (monthly[month].categories[cat] || 0) + expense;
    }
  });
  return monthly;
}

// 1. Monthly Overview
function generateMonthlyOverview(monthly) {
  // Sort months newest first (YYYY-MM format)
  const sortedMonths = Object.keys(monthly).sort().reverse();
  return sortedMonths.map((month) => {
    const data = monthly[month];
    const net = data.income - data.expenses;
    const rate = data.income ? (net / data.income) * 100 : 0;
    const topCats = Object.entries(data.categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount }));
    return {
      month,
      totalIncome: Number(data.income.toFixed(2)),
      totalExpenses: Number(data.expenses.toFixed(2)),
      netCashFlow: Number(net.toFixed(2)),
      savingsRate: Number(rate.toFixed(2)),
      topCategories: topCats,
    };
  });
}

// 2. Category Breakdown
function generateCategoryBreakdown(monthly) {
  const sortedMonths = Object.keys(monthly).sort();
  const breakdown = {};
  sortedMonths.forEach((month, idx) => {
    const data = monthly[month];
    const prev = idx > 0 ? monthly[sortedMonths[idx - 1]].categories : {};
    breakdown[month] = {
      categories: data.categories,
      changeVsPrevious: {},
      budgetVsActual: {},
    };
    // change vs previous
    Object.keys(data.categories).forEach((cat) => {
      const prevAmt = prev[cat] || 0;
      breakdown[month].changeVsPrevious[cat] = Number(
        (data.categories[cat] - prevAmt).toFixed(2)
      );
    });
    // budgets if available
    if (budgets && Object.keys(budgets).length) {
      Object.entries(budgets).forEach(([cat, budgetAmt]) => {
        const actual = data.categories[cat] || 0;
        const variance = actual - budgetAmt;
        breakdown[month].budgetVsActual[cat] = {
          budget: budgetAmt,
          actual: Number(actual.toFixed(2)),
          variance: Number(variance.toFixed(2)),
          pctUsed: budgetAmt
            ? Number(((actual / budgetAmt) * 100).toFixed(2))
            : null,
        };
      });
    }
  });
  // custom category groups
  return { perMonth: breakdown };
}

// 3. Trends Over Time
function generateTrends(monthly, txs) {
  const sortedMonths = Object.keys(monthly).sort();
  // monthly trends
  const monthlyTrends = sortedMonths.map((m) => ({
    month: m,
    income: Number(monthly[m].income.toFixed(2)),
    expenses: Number(monthly[m].expenses.toFixed(2)),
  }));
  // recurring bills (simple detection: descriptions with >=3 occurrences)
  const descMap = {};
  txs.forEach((tx) => {
    if (tx.amount < 0) {
      const key = JSON.stringify([tx.description, tx.category || '']);
      descMap[key] = descMap[key] || [];
      descMap[key].push(tx);
    }
  });
  const recurring = [];
  Object.entries(descMap).forEach(([key, arr]) => {
    if (arr.length >= 3) {
      const [description, category] = JSON.parse(key);
      const total = arr.reduce((s, t) => s + Math.abs(t.amount), 0);
      const avg = total / arr.length;
      recurring.push({
        description,
        category,
        occurrences: arr.length,
        total: Number(total.toFixed(2)),
        avgAmount: Number(avg.toFixed(2)),
      });
    }
  });

  // Monthly recurring bills: only include recurring items that occur in each month
  const monthlyDescMap = {};
  txs.forEach((tx) => {
    if (tx.amount < 0 && tx.date) {
      const mo = tx.date.slice(0, 7);
      const key = JSON.stringify([tx.description, tx.category || '']);
      if (!monthlyDescMap[mo]) monthlyDescMap[mo] = {};
      if (!monthlyDescMap[mo][key]) monthlyDescMap[mo][key] = [];
      monthlyDescMap[mo][key].push(tx);
    }
  });
  const monthlyRecurringBills = {};
  sortedMonths.forEach((mo) => {
    const recs = [];
    recurring.forEach((item) => {
      const key = JSON.stringify([item.description, item.category]);
      const arr = (monthlyDescMap[mo] && monthlyDescMap[mo][key]) || [];
      if (arr.length > 0) {
        const total = arr.reduce((s, t) => s + Math.abs(t.amount), 0);
        const occurrences = arr.length;
        const avgAmount = total / occurrences;
        recs.push({
          description: item.description,
          category: item.category,
          occurrences,
          total: Number(total.toFixed(2)),
          avgAmount: Number(avgAmount.toFixed(2)),
        });
      }
    });
    monthlyRecurringBills[mo] = recs;
  });

  return { monthlyTrends, recurringBills: recurring, monthlyRecurringBills };
}

// 4. Lifestyle & Discretionary Spending Summary
function generateLifestyleSummary(monthly) {
  if (
    !categoryGroups ||
    !categoryGroups.Essentials ||
    !categoryGroups.Lifestyle
  )
    return null;
  const sortedMonths = Object.keys(monthly).sort();
  return sortedMonths.map((m) => {
    const data = monthly[m];
    const essentials = categoryGroups.Essentials.reduce(
      (s, c) => s + (data.categories[c] || 0),
      0
    );
    const lifestyle = categoryGroups.Lifestyle.reduce(
      (s, c) => s + (data.categories[c] || 0),
      0
    );
    const income = data.income;
    const discretionaryPct = income
      ? Number(((lifestyle / income) * 100).toFixed(2))
      : null;
    return {
      month: m,
      essentials: Number(essentials.toFixed(2)),
      lifestyle: Number(lifestyle.toFixed(2)),
      discretionaryPct,
      wantsVsNeeds: {
        wants: Number(lifestyle.toFixed(2)),
        needs: Number(essentials.toFixed(2)),
      },
    };
  });
}

// 5. Merchant Insights
function generateMerchantInsights(txs) {
  const spendMap = {},
    countMap = {},
    monthMap = {},
    usageOverTimeByCategory = {};
  txs.forEach((tx) => {
    const desc = tx.description || 'Unknown';
    const amt = Math.abs(tx.amount) || 0;
    if (tx.amount < 0) {
      spendMap[desc] = (spendMap[desc] || 0) + amt;
      countMap[desc] = (countMap[desc] || 0) + 1;
      const mo = tx.date.slice(0, 7);
      monthMap[desc] = monthMap[desc] || {};
      monthMap[desc][mo] = (monthMap[desc][mo] || 0) + amt;
      usageOverTimeByCategory[desc] = usageOverTimeByCategory[desc] || {};
      usageOverTimeByCategory[desc][mo] =
        usageOverTimeByCategory[desc][mo] || {};
      const cat = tx.category || 'Other expenses';
      usageOverTimeByCategory[desc][mo][cat] =
        (usageOverTimeByCategory[desc][mo][cat] || 0) + amt;
    }
  });
  // top 5 merchants
  const topMerchants = Object.entries(spendMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([merchant, total]) => ({
      merchant,
      total: Number(total.toFixed(2)),
    }));
  // usage over time for all merchants
  const usageOverTime = monthMap;
  return {
    topMerchants,
    transactionCounts: countMap,
    usageOverTime,
    usageOverTimeByCategory,
  };
}

// 6. Budget Adherence Report
function generateBudgetAdherence(monthly) {
  if (!budgets || !Object.keys(budgets).length) return null;
  const out = {};
  Object.entries(monthly).forEach(([m, data]) => {
    out[m] = {};
    Object.entries(budgets).forEach(([cat, b]) => {
      const actual = data.categories[cat] || 0;
      const rem = b - actual;
      out[m][cat] = {
        budget: b,
        actual: Number(actual.toFixed(2)),
        remaining: Number(rem.toFixed(2)),
        pctUsed: b ? Number(((actual / b) * 100).toFixed(2)) : null,
      };
    });
  });
  return out;
}

// 7. Savings & Goals Tracking
function generateSavingsGoals(txs) {
  if (!goalsConfig || !Object.keys(goalsConfig).length) return null;
  const goals = {};
  Object.entries(goalsConfig).forEach(([name, cfg]) => {
    const { category, target } = cfg;
    // Include all transactions for this category, regardless of sign
    const relevant = txs.filter((t) => t.category === category);
    const actual = relevant.reduce((s, t) => s + Math.abs(t.amount), 0);
    // monthly contributions
    const monthly = {};
    relevant.forEach((t) => {
      const mo = t.date.slice(0, 7);
      monthly[mo] = (monthly[mo] || 0) + Math.abs(t.amount);
    });
    goals[name] = {
      target,
      actual: Number(actual.toFixed(2)),
      progressPct: target ? Number(((actual / target) * 100).toFixed(2)) : null,
      monthlyContributions: monthly,
    };
  });
  return goals;
}

// 9. Anomalies or Outliers
function generateAnomalies(txs, monthly) {
  // outliers: transactions >2 std dev in their category
  const catVals = {};
  txs.forEach((t) => {
    if (t.amount < 0) {
      const cat = t.category || 'Other expenses';
      catVals[cat] = catVals[cat] || [];
      catVals[cat].push(Math.abs(t.amount));
    }
  });
  const stats = {};
  Object.entries(catVals).forEach(([cat, arr]) => {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const sd = Math.sqrt(
      arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length
    );
    stats[cat] = { mean, sd };
  });
  const outliers = txs
    .filter((t) => {
      if (t.amount < 0) {
        const cat = t.category || 'Other expenses';
        const amt = Math.abs(t.amount);
        const { mean, sd } = stats[cat] || {};
        return (
          typeof sd === 'number' &&
          (sd > 0 ? Math.abs(amt - mean) > 2 * sd : amt > mean)
        );
      }
      return false;
    })
    .map((t) => {
      const cat = t.category || 'Other expenses';
      const amt = Math.abs(t.amount);
      const { mean, sd } = stats[cat] || {};
      return {
        date: t.date,
        description: t.description || '',
        category: cat,
        amount: amt,
        mean: Number(mean.toFixed(2)),
        sd: Number(sd.toFixed(2)),
      };
    });
  // spikes: months where cat spend > mean+2sd
  const spikes = [];
  const monthlyCats = {};
  Object.entries(monthly).forEach(([m, d]) => {
    Object.entries(d.categories).forEach(([cat, amt]) => {
      monthlyCats[cat] = monthlyCats[cat] || [];
      monthlyCats[cat].push({ month: m, amt });
    });
  });
  Object.entries(monthlyCats).forEach(([cat, arr]) => {
    const vals = arr.map((x) => x.amt);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(
      vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length
    );
    arr.forEach(({ month, amt }) => {
      if (amt > mean + 2 * sd)
        spikes.push({
          category: cat,
          month,
          amount: amt,
          mean: Number(mean.toFixed(2)),
          sd: Number(sd.toFixed(2)),
        });
    });
  });
  // duplicates
  const dupMap = {};
  txs.forEach((t) => {
    // Use JSON serialization to avoid separator collisions
    const key = JSON.stringify([t.date, t.amount, t.description]);
    dupMap[key] = (dupMap[key] || 0) + 1;
  });
  const duplicates = Object.entries(dupMap)
    .filter(([, c]) => c > 1)
    .map(([k, c]) => {
      const [date, amount, description] = JSON.parse(k);
      return { date, amount: Number(amount), description, occurrences: c };
    });
  return { outliers, spikes, duplicates };
}

// 10. Yearly Financial Summary
function generateYearlySummary(txs) {
  const years = {};
  txs.forEach((t) => {
    const yr = t.date.slice(0, 4);
    if (!years[yr]) years[yr] = { income: 0, expenses: 0, categories: {} };
    const amt = t.amount || 0;
    if (amt >= 0) years[yr].income += amt;
    else {
      const ex = Math.abs(amt);
      years[yr].expenses += ex;
      const cat = t.category || 'Other expenses';
      years[yr].categories[cat] = (years[yr].categories[cat] || 0) + ex;
    }
  });
  const sorted = Object.keys(years).sort();
  const out = [];
  sorted.forEach((yr, idx) => {
    const data = years[yr];
    const net = data.income - data.expenses;
    const rate = data.income ? (net / data.income) * 100 : 0;
    // category changes vs previous year
    const prevCats = idx > 0 ? years[sorted[idx - 1]].categories : {};
    const catChanges = { increased: [], decreased: [] };
    Object.keys(data.categories).forEach((cat) => {
      const diff = data.categories[cat] - (prevCats[cat] || 0);
      if (idx > 0) {
        if (diff > 0)
          catChanges.increased.push({
            category: cat,
            change: Number(diff.toFixed(2)),
          });
        else if (diff < 0)
          catChanges.decreased.push({
            category: cat,
            change: Number(diff.toFixed(2)),
          });
      }
    });
    // deductible total
    const dedTotal = deductibleCategories.length
      ? deductibleCategories.reduce((s, c) => s + (data.categories[c] || 0), 0)
      : null;
    // yoy comparison
    let yoy = null;
    if (idx > 0) {
      const prev = years[sorted[idx - 1]];
      const incomeDiff = data.income - prev.income;
      const expensesDiff = data.expenses - prev.expenses;
      const netPrev = prev.income - prev.expenses;
      const netDiff = net - netPrev;
      const prevRate = prev.income ? (netPrev / prev.income) * 100 : 0;
      const savingsRateDiff = rate - prevRate;
      yoy = {
        incomeDiff: Number(incomeDiff.toFixed(2)),
        expensesDiff: Number(expensesDiff.toFixed(2)),
        netDiff: Number(netDiff.toFixed(2)),
        savingsRateDiff: Number(savingsRateDiff.toFixed(2)),
      };
    }
    out.push({
      year: yr,
      totalIncome: Number(data.income.toFixed(2)),
      totalExpenses: Number(data.expenses.toFixed(2)),
      netCashFlow: Number(net.toFixed(2)),
      savingsRate: Number(rate.toFixed(2)),
      categoryChanges: catChanges,
      yearOnYearComparison: yoy,
      taxDeductibleTotal:
        dedTotal !== null ? Number(dedTotal.toFixed(2)) : null,
    });
  });
  return out;
}
// Monthly Spending: total expenses excluding Transfers, Savings, and Income per month
function generateMonthlySpending(monthly) {
  // months sorted descending (newest first)
  const sortedMonths = Object.keys(monthly).sort().reverse();
  // Determine categories to skip: use categoryGroups.Internal if defined, else defaults
  const defaultSkip = ['Transfers', 'Savings', 'Income'];
  const skipCats =
    Array.isArray(categoryGroups.Internal) && categoryGroups.Internal.length
      ? categoryGroups.Internal
      : defaultSkip;
  const skipSet = new Set(skipCats);
  return sortedMonths.map((month) => {
    const cats = monthly[month].categories || {};
    const total = Object.entries(cats).reduce((sum, [cat, amt]) => {
      // skip configured internal categories
      if (!skipSet.has(cat)) {
        return sum + amt;
      }
      return sum;
    }, 0);
    return { month, spending: Number(total.toFixed(2)) };
  });
}

// Daily Spending: total expenses per day and breakdown by category
function generateDailySpending(txs) {
  const dailyMap = {};
  txs.forEach((tx) => {
    if (tx.amount < 0 && tx.date) {
      const date = tx.date;
      const cat = tx.category || 'Other expenses';
      const amt = Math.abs(tx.amount);
      if (!dailyMap[date]) {
        dailyMap[date] = { total: 0, catMap: {} };
      }
      dailyMap[date].total += amt;
      dailyMap[date].catMap[cat] = (dailyMap[date].catMap[cat] || 0) + amt;
    }
  });
  return Object.keys(dailyMap)
    .sort()
    .map((date) => ({
      date,
      spending: Number(dailyMap[date].total.toFixed(2)),
      byCategory: Object.entries(dailyMap[date].catMap).map(
        ([category, amount]) => ({
          category,
          amount: Number(amount.toFixed(2)),
        })
      ),
    }));
}

// Console renderer for human-friendly output
function renderConsole(summary) {
  console.log('\n==== Yearly Summary ====');
  console.table(
    summary.yearlySummary.map((y) => ({
      Year: y.year,
      Income: fmtAmount(y.totalIncome),
      Expenses: fmtAmount(y.totalExpenses),
      Net: fmtAmount(y.netCashFlow),
      'Savings %': y.savingsRate.toFixed(2),
    }))
  );
  console.log('Upload & processing complete');
}
const { getCurrency } = require('./utils/currency');

// Main
// Parse CLI options: --currency flag overrides DEFAULT_CURRENCY env var (fallback GBP if unset)
function parseOptions() {
  const flag = process.argv
    .slice(2)
    .find((arg) => arg.startsWith('--currency='));
  const overrideCurrency = flag && flag.split('=')[1];
  return { currencyRaw: getCurrency(overrideCurrency) };
}
const { currencyRaw } = parseOptions();
// Map currency codes to symbols
const currencySymbols = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
  INR: '₹',
};
const currencySymbol =
  currencyRaw.length === 3 && currencySymbols[currencyRaw.toUpperCase()]
    ? currencySymbols[currencyRaw.toUpperCase()]
    : currencyRaw;
// Helper: format amount with currency symbol and commas
const currencyFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function fmtAmount(val) {
  const num = typeof val === 'number' ? val : Number(val) || 0;
  return `${currencySymbol}${currencyFormatter.format(num)}`;
}
const monthlyData = getMonthlyData(txsToProcess);
const summary = {
  monthlyOverview: generateMonthlyOverview(monthlyData),
  // Total monthly spending excluding Income and Transfers
  monthlySpending: generateMonthlySpending(monthlyData),
  categoryBreakdown: generateCategoryBreakdown(monthlyData),
  trends: generateTrends(monthlyData, txsToProcess),
  lifestyle: generateLifestyleSummary(monthlyData),
  merchantInsights: generateMerchantInsights(txsToProcess),
  budgetAdherence: generateBudgetAdherence(monthlyData),
  savingsGoals: generateSavingsGoals(txsToProcess),
  anomalies: generateAnomalies(txsToProcess, monthlyData),
  yearlySummary: generateYearlySummary(txsToProcess),
  dailySpending: generateDailySpending(txsToProcess),
};
// Include full category list for UI editing
summary.categoriesList = Array.from(
  new Set(txsToProcess.map((tx) => tx.category))
);

// persist JSON summary
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const outFile = path.join(dataDir, 'summary.json');
fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
// Render summary to console
renderConsole(summary);
