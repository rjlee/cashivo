# Remaining PR Roadmap

The following pull requests outline upcoming enhancements to be implemented. Reference this file when scheduling or executing future PRs.

## PR #5 – Budget vs Actual Progress Bars
- If a `budgets.json` file is present at the project root, render a progress bar per category (for month and year views).
- Highlight over-budget categories in red and under-budget in green or default color.

## PR #6 – Recurring Bills & Subscriptions Section
- Detect merchants that appear in transactions every month (or at a regular interval).
- Show counts, total spending, and average per occurrence for each recurring merchant.
- Link each merchant to the category drill-down page.

## PR #7 – Savings Goals Progress
- If a `goals.json` file is provided, display progress bars for each savings goal on the Year view.
- Show goal name, target amount, actual saved, and percent complete.

## PR #8 – Year-over-Year Comparison
- On the Year view, compare current-year vs previous-year metrics for:
  - Total Income
  - Total Expenses
  - Net Cash Flow
  - Savings Rate
- Display differences both as absolute values and percentages.

## PR #9 – Anomalies & Alerts (Large/Unusual Transactions)
- Identify and highlight transactions more than 2× the average spend in their category.
- Add a “Flagged Transactions” section on month and year pages with links to transaction details.
- Optionally allow users to acknowledge or dismiss flags.