// Client-side script for month insights: handles table collapsing and category filtering
document.addEventListener('DOMContentLoaded', function() {
  var form = document.getElementById('category-filter');
  if (!form) return;
  var tableIds = ['flagged-transactions-table','spikes-table','recurring-table'];
  var monthSel = form.getAttribute('data-month');
  // Filter panel action links
  var clearAllLink = document.getElementById('clear-all');
  var selectAllLink = document.getElementById('select-all');
  var hideSTLink = document.getElementById('hide-savings-transfers');
  // Collapse each data table with Show all / Show less, preserving filters
  tableIds.forEach(function(id) {
    var tbl = document.getElementById(id);
    if (!tbl) return;
    var rows = Array.from(tbl.querySelectorAll('tbody tr'));
    var tfoot = document.createElement('tfoot');
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = tbl.tHead.rows[0].cells.length;
    td.style.textAlign = 'center';
    var expanded = false;
    var a = document.createElement('a');
    a.href = '#';
    // initial link text; will be overwritten by updateAll
    a.textContent = 'Show all (' + rows.length + ')';
    a.addEventListener('click', function(e) {
      e.preventDefault();
      // determine selected categories
      var selCats = Array.from(
        form.querySelectorAll('input[name="category"]:checked')
      ).map(function(cb) { return cb.value; });
      if (!expanded) {
        // show all filtered rows
        rows.forEach(function(r) {
          r.style.display = selCats.includes(r.dataset.category) ? '' : 'none';
        });
        a.textContent = 'Show less';
        expanded = true;
      } else {
        // collapse back to first 5 filtered rows
        var count = 0;
        rows.forEach(function(r) {
          if (selCats.includes(r.dataset.category)) {
            r.style.display = (count < 5 ? '' : 'none');
            count++;
          } else {
            r.style.display = 'none';
          }
        });
        a.textContent = 'Show all (' + count + ')';
        expanded = false;
      }
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
    var pie = window.categoryDistributionChart;
    var pcm = window.categoryDistributionChartRawData || {};
    if (pie) {
      var labels = selCats.filter(function(c) { return pcm.hasOwnProperty(c); });
      pie.data.labels = labels;
      pie.data.datasets[0].data = labels.map(function(c) { return pcm[c]; });
      pie.update();
    }
    // Update top merchants bar chart (handles monthly and yearly views)
    var topChart = window.topMerchantsChart;
    var ubc = window.topMerchantsChartCategoryData || {};
    if (topChart) {
      var arr = [];
      Object.keys(ubc).forEach(function(m) {
        // Aggregate category usage for selected period (month or year)
        var monthMap = {};
        Object.keys(ubc[m]).forEach(function(mo) {
          if (mo === monthSel || mo.startsWith(monthSel + '-')) {
            Object.entries(ubc[m][mo]).forEach(function(_ref) {
              var cat = _ref[0], val = _ref[1];
              monthMap[cat] = (monthMap[cat] || 0) + val;
            });
          }
        });
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
    var dailyChart = window.dailySpendingChart;
    var rawDaily = window.dailySpendingChartRawData || [];
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
  // Filter panel action handlers
  if (clearAllLink) {
    clearAllLink.addEventListener('click', function(e) {
      e.preventDefault();
      form.querySelectorAll('input[name="category"]')
        .forEach(function(cb) { cb.checked = false; });
      updateAll();
    });
  }
  if (selectAllLink) {
    selectAllLink.addEventListener('click', function(e) {
      e.preventDefault();
      form.querySelectorAll('input[name="category"]')
        .forEach(function(cb) { cb.checked = true; });
      updateAll();
    });
  }
  if (hideSTLink) {
    hideSTLink.addEventListener('click', function(e) {
      e.preventDefault();
      var regex = /saving|transfer/i;
      form.querySelectorAll('input[name="category"]')
        .forEach(function(cb) {
          if (regex.test(cb.value)) cb.checked = false;
        });
      updateAll();
    });
  }
  form.addEventListener('change', updateAll);
  updateAll();
});