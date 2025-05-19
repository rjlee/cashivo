// Centralized chart initialization for Budget App
document.addEventListener('DOMContentLoaded', function() {
  // Monthly Summary: Spending Chart
  if (window.spendingChartRawData && document.getElementById('spendingChart')) {
    const raw = window.spendingChartRawData;
    const sel = window.spendingChartSelMonth;
    const sorted = raw.slice().sort((a, b) => a.month.localeCompare(b.month));
    const idx = sorted.findIndex(e => e.month === sel);
    const sliceArr = idx >= 0 ? sorted.slice(Math.max(0, idx - 5), idx + 1) : [];
    const spendingChartLabels = sliceArr.map(e => e.month);
    const spendingChartData = sliceArr.map(e => e.spending);
    const spendingChartCtx = document.getElementById('spendingChart').getContext('2d');
    window.spendingChart = new Chart(spendingChartCtx, {
      type: 'bar',
      data: { labels: spendingChartLabels, datasets: [{ label: 'Spending', data: spendingChartData, backgroundColor: 'rgba(75, 192, 192, 0.5)' }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
  // Summary Page: Collapse Category Breakdown table to first 5 rows with toggle (Show all / Show less)
  var catTbl = document.getElementById('category-breakdown-table');
  if (catTbl) {
    var rows = Array.from(catTbl.querySelectorAll('tbody tr'));
    // Initial collapse
    rows.forEach(function(r, i) { if (i >= 5) r.style.display = 'none'; });
    var tfoot = document.createElement('tfoot');
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = catTbl.tHead.rows[0].cells.length;
    td.style.textAlign = 'center';
    var expanded = false;
    var a = document.createElement('a');
    a.href = '#';
    a.textContent = 'Show all (' + rows.length + ')';
    a.addEventListener('click', function(e) {
      e.preventDefault();
      if (!expanded) {
        // show all rows
        rows.forEach(function(r) { r.style.display = ''; });
        a.textContent = 'Show less';
        expanded = true;
      } else {
        // collapse back to 5 rows
        rows.forEach(function(r, i) { r.style.display = (i < 5 ? '' : 'none'); });
        a.textContent = 'Show all (' + rows.length + ')';
        expanded = false;
      }
    });
    td.appendChild(a);
    tr.appendChild(td);
    tfoot.appendChild(tr);
    catTbl.appendChild(tfoot);
  }

  // Yearly Summary: Year Spending Chart
  if (window.yearSpendingChartRawData && document.getElementById('yearSpendingChart')) {
    const raw = window.yearSpendingChartRawData;
    const yearSpendingChartLabels = raw.map(e => e.month).reverse();
    const yearSpendingChartData = raw.map(e => e.spending).reverse();
    const yearSpendingChartCtx = document.getElementById('yearSpendingChart').getContext('2d');
    window.yearSpendingChart = new Chart(yearSpendingChartCtx, {
      type: 'bar',
      data: { labels: yearSpendingChartLabels, datasets: [{ label: 'Spending', data: yearSpendingChartData, backgroundColor: 'rgba(75, 192, 192, 0.5)' }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  // Month Insights: Daily Spending Chart
  if (window.dailySpendingChartRawData && document.getElementById('dailySpendingChart')) {
    const raw = window.dailySpendingChartRawData;
    const dailySpendingChartLabels = raw.map(d => d.date);
    const dailySpendingChartData = raw.map(d => d.spending);
    const dailySpendingChartCtx = document.getElementById('dailySpendingChart').getContext('2d');
    window.dailySpendingChart = new Chart(dailySpendingChartCtx, {
      type: 'line',
      data: {
        labels: dailySpendingChartLabels,
        datasets: [{
          label: 'Daily Spending',
          data: dailySpendingChartData,
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          fill: true
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { display: true, title: { display: true, text: 'Date' } },
          y: { beginAtZero: true }
        }
      }
    });
  }

  // Month Insights: Category Distribution Chart
  if (window.categoryDistributionChartRawData && document.getElementById('categoryDistributionChart')) {
    const catMap = window.categoryDistributionChartRawData;
    const categoryDistributionChartLabels = Object.keys(catMap);
    const categoryDistributionChartData = categoryDistributionChartLabels.map(c => catMap[c]);
    const categoryDistributionChartCtx = document.getElementById('categoryDistributionChart').getContext('2d');
    window.categoryDistributionChart = new Chart(categoryDistributionChartCtx, {
      type: 'pie',
      data: { labels: categoryDistributionChartLabels, datasets: [{ data: categoryDistributionChartData, backgroundColor: categoryDistributionChartLabels.map((_, i) => 'hsl(' + (i * 360 / categoryDistributionChartLabels.length) + ',70%,70%)') }] },
      options: { plugins: { legend: { position: 'right' } } }
    });
  }

  // Month Insights: Top Merchants Chart
  if (window.topMerchantsChartRawData && document.getElementById('topMerchantsChart')) {
    const usageMap = window.topMerchantsChartRawData;
    const form = document.getElementById('category-filter');
    const sel = form ? form.getAttribute('data-month') : null;
    let arr = [];
    if (sel && /^\d{4}-\d{2}$/.test(sel)) {
      // monthly insights
      arr = Object.entries(usageMap).map(([m, data]) => ({ merchant: m, total: data[sel] || 0 }));
    } else if (sel && /^\d{4}$/.test(sel)) {
      // yearly insights: sum all months in the year
      arr = Object.entries(usageMap).map(([m, data]) => ({
        merchant: m,
        total: Object.entries(data).reduce((sum, [mo, v]) => mo.startsWith(sel + '-') ? sum + v : sum, 0)
      }));
    } else {
      // fallback: all-time
      arr = Object.entries(usageMap).map(([m, data]) => ({
        merchant: m,
        total: Object.values(data).reduce((sum, v) => sum + v, 0)
      }));
    }
    arr = arr.filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
    const topMerchantsChartLabels = arr.map(x => x.merchant);
    const topMerchantsChartData = arr.map(x => x.total);
    const topMerchantsChartCtx = document.getElementById('topMerchantsChart').getContext('2d');
    window.topMerchantsChart = new Chart(topMerchantsChartCtx, {
      type: 'bar',
      data: { labels: topMerchantsChartLabels, datasets: [{ label: 'Total Spend', data: topMerchantsChartData, backgroundColor: topMerchantsChartLabels.map((_, i) => 'hsl(' + (i * 360 / topMerchantsChartLabels.length) + ',70%,70%)') }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
});