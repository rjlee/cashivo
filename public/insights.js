// Client-side script for month insights: handles table collapsing and category filtering
document.addEventListener('DOMContentLoaded', function() {
  var form = document.getElementById('category-filter');
  if (!form) return;
  var tableIds = ['flagged-transactions-table','spikes-table','recurring-table'];
  var monthSel = form.getAttribute('data-month');
  // Collapse each table to first 5 rows and add a "Show all" link
  tableIds.forEach(function(id) {
    var tbl = document.getElementById(id);
    if (!tbl) return;
    var rows = Array.from(tbl.querySelectorAll('tbody tr'));
    rows.forEach(function(r, idx) {
      if (idx >= 5) r.style.display = 'none';
    });
    var tfoot = document.createElement('tfoot');
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = tbl.tHead.rows[0].cells.length;
    td.style.textAlign = 'center';
    var a = document.createElement('a');
    a.href = '#';
    a.textContent = 'Show all (' + rows.length + ')';
    a.addEventListener('click', function(e) {
      e.preventDefault();
      rows.forEach(function(r) { r.style.display = ''; });
      a.remove();
    });
    td.appendChild(a);
    tr.appendChild(td);
    tfoot.appendChild(tr);
    tbl.appendChild(tfoot);
  });
  // Function to update filters and charts based on selected categories
  function updateAll() {
    var selCats = Array.from(
      form.querySelectorAll('input[name="category"]:checked')
    ).map(function(cb) { return cb.value; });
    // Filter table rows, collapse to first 5 visible rows, and update "Show all" counts
    tableIds.forEach(function(id) {
      var tbl = document.getElementById(id);
      if (!tbl) return;
      var rows = Array.from(tbl.querySelectorAll('tbody tr'));
      var visibleCount = 0;
      rows.forEach(function(r) {
        if (selCats.includes(r.dataset.category)) {
          if (visibleCount < 5) {
            r.style.display = '';
          } else {
            r.style.display = 'none';
          }
          visibleCount++;
        } else {
          r.style.display = 'none';
        }
      });
      var link = tbl.querySelector('tfoot a');
      if (link) {
        link.textContent = 'Show all (' + visibleCount + ')';
      }
    });
    // Update category distribution pie chart
    var pie = window.monthInsightsPieChart;
    var pcm = window.monthCategories || {};
    if (pie && pcm) {
      var labels = selCats.filter(function(c) { return pcm.hasOwnProperty(c); });
      pie.data.labels = labels;
      pie.data.datasets[0].data = labels.map(function(c) { return pcm[c]; });
      pie.update();
    }
    // Update top merchants bar chart
    var topChart = window.monthInsightsTopMerchantsChart;
    var ubc = window.monthInsightsUsageByCatMap || {};
    if (topChart) {
      var arr = [];
      Object.keys(ubc).forEach(function(m) {
        var monthMap = ubc[m][monthSel] || {};
        var total = selCats.reduce(function(sum, c) {
          return sum + (monthMap[c] || 0);
        }, 0);
        if (total > 0) arr.push({ merchant: m, total: total });
      });
      arr.sort(function(a, b) { return b.total - a.total; });
      var top = arr.slice(0, 5);
      topChart.data.labels = top.map(function(x) { return x.merchant; });
      topChart.data.datasets[0].data = top.map(function(x) { return x.total; });
      topChart.update();
    }
    // Update daily spending line chart
    var dailyChart = window.monthInsightsDailyChart;
    var rawDaily = window.monthInsightsDailyData || [];
    if (dailyChart && rawDaily.length) {
      dailyChart.data.labels = rawDaily.map(function(d) { return d.date; });
      dailyChart.data.datasets[0].data = rawDaily.map(function(d) {
        return d.byCategory.reduce(function(sum, item) {
          return sum + (selCats.includes(item.category) ? item.amount : 0);
        }, 0);
      });
      dailyChart.update();
    }
  }
  form.addEventListener('change', updateAll);
  updateAll();
});