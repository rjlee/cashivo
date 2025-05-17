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
  txsToProcess = txsToProcess.filter(tx => tx.date && tx.date.slice(0,7) >= startMonth);
}
if (endMonth) {
  txsToProcess = txsToProcess.filter(tx => tx.date && tx.date.slice(0,7) <= endMonth);
}
if (startMonth || endMonth) {
  console.log(`Filtering transactions${startMonth ? ` from ${startMonth}` : ''}${endMonth ? ` to ${endMonth}` : ''}: ${txsToProcess.length} records`);
}

// Optional configs
const budgets = loadJSON(path.resolve(__dirname, '..', 'budgets.json')) || {};
const goalsConfig = loadJSON(path.resolve(__dirname, '..', 'goals.json')) || {};
// Load category groups: user-provided or default
const defaultCategoryGroups = require(path.resolve(__dirname, '..', 'categories', 'default_category_groups.json'));
const categoryGroups = loadJSON(path.resolve(dataDir, 'category-groups.json')) || defaultCategoryGroups;
const deductibleCategories = loadJSON(path.resolve(__dirname, '..', 'deductible-categories.json')) || [];

// Helper: group transactions by month
function getMonthlyData(txs) {
  const monthly = {};
  txs.forEach(tx => {
    const month = tx.date ? tx.date.slice(0, 7) : 'unknown';
    if (!monthly[month]) monthly[month] = { income: 0, expenses: 0, categories: {} };
    const amt = tx.amount || 0;
    if (amt >= 0) {
      monthly[month].income += amt;
    } else {
      const expense = Math.abs(amt);
      monthly[month].expenses += expense;
      const cat = tx.category || 'Other expenses';
      monthly[month].categories[cat] = (monthly[month].categories[cat] || 0) + expense;
    }
  });
  return monthly;
}

// 1. Monthly Overview
function generateMonthlyOverview(monthly) {
  // Sort months newest first (YYYY-MM format)
  const sortedMonths = Object.keys(monthly).sort().reverse();
  return sortedMonths.map(month => {
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
      topCategories: topCats
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
    breakdown[month] = { categories: data.categories, changeVsPrevious: {}, budgetVsActual: {} };
    // change vs previous
    Object.keys(data.categories).forEach(cat => {
      const prevAmt = prev[cat] || 0;
      breakdown[month].changeVsPrevious[cat] = Number((data.categories[cat] - prevAmt).toFixed(2));
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
          pctUsed: budgetAmt ? Number(((actual / budgetAmt) * 100).toFixed(2)) : null
        };
      });
    }
  });
  // custom category groups
  const groupsOut = {};
  Object.entries(categoryGroups).forEach(([groupName, cats]) => {
    groupsOut[groupName] = {};
    sortedMonths.forEach(month => {
      const total = cats.reduce((sum, c) => sum + (monthly[month].categories[c] || 0), 0);
      groupsOut[groupName][month] = Number(total.toFixed(2));
    });
  });
  return { perMonth: breakdown, groups: groupsOut };
}

// 3. Trends Over Time
function generateTrends(monthly, txs) {
  const sortedMonths = Object.keys(monthly).sort();
  // monthly trends
  const monthlyTrends = sortedMonths.map(m => ({
    month: m,
    income: Number(monthly[m].income.toFixed(2)),
    expenses: Number(monthly[m].expenses.toFixed(2))
  }));
  // recurring bills (simple detection: descriptions with >=3 occurrences)
  const descMap = {};
  txs.forEach(tx => {
    if (tx.amount < 0) {
      const key = tx.description;
      descMap[key] = descMap[key] || [];
      descMap[key].push(tx);
    }
  });
  const recurring = [];
  Object.entries(descMap).forEach(([desc, arr]) => {
    if (arr.length >= 3) {
      const total = arr.reduce((s, t) => s + Math.abs(t.amount), 0);
      const avg = total / arr.length;
      recurring.push({
        description: desc,
        occurrences: arr.length,
        total: Number(total.toFixed(2)),
        avgAmount: Number(avg.toFixed(2))
      });
    }
  });
  // seasonal patterns: avg spend per calendar month
  const monthVals = {};
  txs.forEach(tx => {
    if (tx.amount < 0) {
      const mo = tx.date.slice(5, 7);
      monthVals[mo] = monthVals[mo] || [];
      monthVals[mo].push(Math.abs(tx.amount));
    }
  });
  const seasonal = {};
  Object.entries(monthVals).forEach(([mo, arr]) => {
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    seasonal[mo] = Number(avg.toFixed(2));
  });
  return { monthlyTrends, recurringBills: recurring, seasonalPatterns: seasonal };
}

// 4. Lifestyle & Discretionary Spending Summary
function generateLifestyleSummary(monthly) {
  if (!categoryGroups || !categoryGroups.Essentials || !categoryGroups.Lifestyle) return null;
  const sortedMonths = Object.keys(monthly).sort();
  return sortedMonths.map(m => {
    const data = monthly[m];
    const essentials = categoryGroups.Essentials.reduce((s, c) => s + (data.categories[c] || 0), 0);
    const lifestyle = categoryGroups.Lifestyle.reduce((s, c) => s + (data.categories[c] || 0), 0);
    const income = data.income;
    const discretionaryPct = income ? Number(((lifestyle / income) * 100).toFixed(2)) : null;
    return {
      month: m,
      essentials: Number(essentials.toFixed(2)),
      lifestyle: Number(lifestyle.toFixed(2)),
      discretionaryPct,
      wantsVsNeeds: { wants: Number(lifestyle.toFixed(2)), needs: Number(essentials.toFixed(2)) }
    };
  });
}

// 5. Merchant Insights
function generateMerchantInsights(txs) {
  const spendMap = {}, countMap = {}, monthMap = {};
  txs.forEach(tx => {
    const desc = tx.description || 'Unknown';
    const amt = Math.abs(tx.amount) || 0;
    if (tx.amount < 0) {
      spendMap[desc] = (spendMap[desc] || 0) + amt;
      countMap[desc] = (countMap[desc] || 0) + 1;
      const mo = tx.date.slice(0, 7);
      monthMap[desc] = monthMap[desc] || {};
      monthMap[desc][mo] = (monthMap[desc][mo] || 0) + amt;
    }
  });
  // top 5 merchants
  const topMerchants = Object.entries(spendMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([merchant, total]) => ({ merchant, total: Number(total.toFixed(2)) }));
  // usage over time for top merchants
  const usage = {};
  topMerchants.forEach(({ merchant }) => {
    usage[merchant] = monthMap[merchant] || {};
  });
  return { topMerchants, transactionCounts: countMap, usageOverTime: usage };
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
        pctUsed: b ? Number(((actual / b) * 100).toFixed(2)) : null
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
    const relevant = txs.filter(t => t.category === category);
    const actual = relevant.reduce((s, t) => s + Math.abs(t.amount), 0);
    // monthly contributions
    const monthly = {};
    relevant.forEach(t => {
      const mo = t.date.slice(0, 7);
      monthly[mo] = (monthly[mo] || 0) + Math.abs(t.amount);
    });
    goals[name] = {
      target,
      actual: Number(actual.toFixed(2)),
      progressPct: target ? Number(((actual / target) * 100).toFixed(2)) : null,
      monthlyContributions: monthly
    };
  });
  return goals;
}

// 9. Anomalies or Outliers
function generateAnomalies(txs, monthly) {
  // outliers: transactions >2 std dev in their category
  const catVals = {};
  txs.forEach(t => {
    if (t.amount < 0) {
      const cat = t.category || 'Other expenses';
      catVals[cat] = catVals[cat] || [];
      catVals[cat].push(Math.abs(t.amount));
    }
  });
  const stats = {};
  Object.entries(catVals).forEach(([cat, arr]) => {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length);
    stats[cat] = { mean, sd };
  });
  const outliers = txs.filter(t => {
    if (t.amount < 0) {
      const cat = t.category || 'Other expenses';
      const amt = Math.abs(t.amount);
      const { mean, sd } = stats[cat] || {};
      return sd && Math.abs(amt - mean) > 2 * sd;
    }
    return false;
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
    const vals = arr.map(x => x.amt);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length);
    arr.forEach(({ month, amt }) => {
      if (amt > mean + 2 * sd) spikes.push({ category: cat, month, amount: amt, mean: Number(mean.toFixed(2)), sd: Number(sd.toFixed(2)) });
    });
  });
  // duplicates
  const dupMap = {};
  txs.forEach(t => {
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
  txs.forEach(t => {
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
    Object.keys(data.categories).forEach(cat => {
      const diff = data.categories[cat] - (prevCats[cat] || 0);
      if (idx > 0) {
        if (diff > 0) catChanges.increased.push({ category: cat, change: Number(diff.toFixed(2)) });
        else if (diff < 0) catChanges.decreased.push({ category: cat, change: Number(diff.toFixed(2)) });
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
        savingsRateDiff: Number(savingsRateDiff.toFixed(2))
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
      taxDeductibleTotal: dedTotal !== null ? Number(dedTotal.toFixed(2)) : null
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
  const skipCats = Array.isArray(categoryGroups.Internal) && categoryGroups.Internal.length
    ? categoryGroups.Internal
    : defaultSkip;
  const skipSet = new Set(skipCats);
  return sortedMonths.map(month => {
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

// Daily Spending: total expenses per day across all transactions
function generateDailySpending(txs) {
  const daily = {};
  txs.forEach(tx => {
    if (tx.amount < 0 && tx.date) {
      const date = tx.date;
      daily[date] = (daily[date] || 0) + Math.abs(tx.amount);
    }
  });
  return Object.keys(daily).sort().map(date => ({
    date,
    spending: Number(daily[date].toFixed(2))
  }));
}

// Console renderer for human-friendly output
function renderConsole(summary) {
  // 1. Monthly Overview
  console.log('\n==== Monthly Overview ====');
  const overviewTable = summary.monthlyOverview.map(r => ({
    Month: r.month,
    Income: fmtAmount(r.totalIncome),
    Expenses: fmtAmount(r.totalExpenses),
    Net: fmtAmount(r.netCashFlow),
    'Savings %': r.savingsRate.toFixed(2)
  }));
  console.table(overviewTable);
  // Monthly spending
  console.log('\n==== Monthly spending ====');
  const spendingTable = summary.monthlySpending.map(r => ({
    Month: r.month,
    Spending: fmtAmount(r.spending)
  }));
  console.table(spendingTable);

  // 2. Category Breakdown for latest month
  const latest = summary.monthlyOverview[summary.monthlyOverview.length - 1];
  if (latest) {
    const month = latest.month;
    const cb = summary.categoryBreakdown.perMonth[month];
    console.log(`\n==== Category Breakdown (${month}) ====`);
    if (cb) {
      const catTable = Object.entries(cb.categories).map(([cat, amt]) => {
        const changeVal = cb.changeVsPrevious[cat];
        const change = changeVal != null ? fmtAmount(changeVal) : 'N/A';
        const bud = cb.budgetVsActual[cat];
        const budStr = bud && bud.pctUsed != null ? bud.pctUsed + '%' : 'N/A';
        return {
          Category: cat,
          Amount: fmtAmount(amt),
          'Δ vs Prev': change,
          'Budget %': budStr
        };
      });
      console.table(catTable);
    }
  }

  // 3. Trends Over Time
  console.log('\n==== Trends Over Time ====');
  console.log('- Monthly Income/Expenses (most recent first):');
  const trendME = summary.trends.monthlyTrends.slice().reverse().map(r => ({
    Month: r.month,
    Income: fmtAmount(r.income),
    Expenses: fmtAmount(r.expenses),
    Net: fmtAmount(r.income - r.expenses)
  }));
  console.table(trendME);
  // Cumulative savings removed per user request
  // Recurring Bills: show top 10 by transaction count
  console.log('- Top 10 Recurring Bills (by count):');
  // sort a copy to avoid mutating original
  const topRecurring = (summary.trends.recurringBills || [])
    .slice()
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 10);
  topRecurring.forEach(b => {
    console.log(
      `  • ${b.description}: ${b.occurrences} transactions, total ${fmtAmount(b.total)}, avg ${fmtAmount(b.avgAmount)}`
    );
  });

  // 4. Lifestyle & Discretionary
  console.log('\n==== Lifestyle & Discretionary (most recent first) ====');
  // Guard in case no lifestyle data is generated
  const lifestyleData = Array.isArray(summary.lifestyle) ? summary.lifestyle : [];
  console.table(
    lifestyleData.slice().reverse().map(r => ({
      Month: r.month,
      Essentials: fmtAmount(r.essentials),
      Lifestyle: fmtAmount(r.lifestyle),
      'Discretionary %': r.discretionaryPct != null ? r.discretionaryPct.toFixed(2) : 'N/A'
    }))
  );

  // 5. Merchant Insights
  console.log('\n==== Merchant Insights ====');
  console.table(
    summary.merchantInsights.topMerchants.map(m => ({
      Merchant: m.merchant,
      Total: fmtAmount(m.total),
      Count: summary.merchantInsights.transactionCounts[m.merchant] || 0
    }))
  );

  // 6. Budget Adherence
  if (summary.budgetAdherence) {
    console.log('\n==== Budget Adherence ====');
    const month = latest.month;
    const ba = summary.budgetAdherence[month] || {};
    Object.entries(ba).forEach(([cat, info]) => {
      console.log(
        `  • ${cat}: spent ${fmtAmount(info.actual)}/${fmtAmount(info.budget)}` +
        ` (${info.pctUsed}%), remaining ${fmtAmount(info.remaining)}`
      );
    });
  }

  // 7. Savings & Goals
  if (summary.savingsGoals) {
    console.log('\n==== Savings & Goals ====');
    Object.entries(summary.savingsGoals).forEach(([name, g]) => {
      console.log(
        `  • ${name}: ${fmtAmount(g.actual)}/${fmtAmount(g.target)}` +
        ` (${g.progressPct}%)`
      );
    });
  }

  // 9. Anomalies & Outliers
  console.log('\n==== Anomalies & Outliers ====');
  console.log('- Outliers (sample):');
  summary.anomalies.outliers.slice(0, 5).forEach(o => {
    console.log(
      `  • ${o.description} on ${o.date}: ${fmtAmount(Math.abs(o.amount))}`
    );
  });
  console.log('- Duplicates:');
  summary.anomalies.duplicates.forEach(d => {
    console.log(
      `  • ${d.description} ${fmtAmount(d.amount)} x${d.occurrences} on ${d.date}`
    );
  });

  // 10. Yearly Summary
  console.log('\n==== Yearly Summary ====');
  console.table(summary.yearlySummary.map(y => ({
    Year: y.year,
    Income: fmtAmount(y.totalIncome),
    Expenses: fmtAmount(y.totalExpenses),
    Net: fmtAmount(y.netCashFlow),
    'Savings %': y.savingsRate.toFixed(2)
  })));
}
// Main
// Parse CLI options: --currency (default GBP)
function parseOptions() {
  let currencyRaw = process.env.DEFAULT_CURRENCY || 'GBP';
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--currency=')) {
      currencyRaw = arg.split('=')[1];
    }
  }
  return { currencyRaw };
}
const { currencyRaw } = parseOptions();
// Map currency codes to symbols
const currencySymbols = { USD: '$', GBP: '£', EUR: '€', JPY: '¥', CAD: 'CA$', AUD: 'A$', INR: '₹' };
const currencySymbol = (currencyRaw.length === 3 && currencySymbols[currencyRaw.toUpperCase()])
  ? currencySymbols[currencyRaw.toUpperCase()] : currencyRaw;
// Helper: format amount with currency symbol and commas
const currencyFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  dailySpending: generateDailySpending(txsToProcess)
};

// persist JSON summary
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const outFile = path.join(dataDir, 'summary.json');
fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
// Render summary to console
renderConsole(summary);