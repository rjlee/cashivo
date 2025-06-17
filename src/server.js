require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
// Security headers via Helmet
// Gzip compression
// Determine active page for navbar highlighting
app.use((req, res, next) => {
  const p = req.path;
  if (p === '/') res.locals.activePage = 'home';
  else if (p.startsWith('/transactions'))
    res.locals.activePage = 'transactions';
  else if (p.startsWith('/years')) res.locals.activePage = 'summaries';
  else if (p.startsWith('/manage')) res.locals.activePage = 'manage';
  else res.locals.activePage = '';
  next();
});
app.use(compression());
// Cookie parsing (for CSRF tokens)
app.use(cookieParser());
// Parse URL-encoded bodies (for form submissions)
// Parse URL-encoded bodies and JSON bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
const { getCurrency } = require('./utils/currency');

app.locals.fmtCurrency = (value, currencyCode) => {
  const code = getCurrency(currencyCode);
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
  }).format(value);
};
// Helper to format year-month strings (YYYY-MM) as 'Mon YYYY', e.g. 'Jan 2025'
app.locals.fmtMonthYear = (ym) => {
  if (!ym || typeof ym !== 'string') return '';
  const parts = ym.split('-');
  if (parts.length !== 2) return ym;
  const [year, month] = parts;
  const idx = parseInt(month, 10) - 1;
  const names = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sept',
    'Oct',
    'Nov',
    'Dec',
  ];
  const mName = names[idx] || '';
  // Use full calendar year
  return `${mName} ${year}`;
};
// Basic HTTP auth if USERNAME and PASSWORD are set in env
const { USERNAME, PASSWORD } = process.env;
if (USERNAME && PASSWORD) {
  app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="Protected"');
      return res.status(401).send('Authentication required');
    }
    const creds = Buffer.from(auth.split(' ')[1], 'base64')
      .toString()
      .split(':');
    const [user, pass] = creds;
    if (user === USERNAME && pass === PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="Protected"');
    return res.status(401).send('Invalid credentials');
  });
}
// Determine data directory (allow override via DATA_DIR, e.g. in tests) and seed default files
const getDataDir = require('./utils/getDataDir');
const dataDir = getDataDir();
// Bootstrap default JSON files into dataDir if missing, stripping 'default_' prefix
const defaultsDir = path.resolve(__dirname, '..', 'defaults');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (fs.existsSync(defaultsDir)) {
  fs.readdirSync(defaultsDir)
    .filter((file) => file.endsWith('.json'))
    .forEach((srcFile) => {
      const dstName = srcFile.replace(/^default_/, '');
      const srcPath = path.join(defaultsDir, srcFile);
      const dstPath = path.join(dataDir, dstName);
      if (!fs.existsSync(dstPath)) {
        try {
          fs.copyFileSync(srcPath, dstPath);
        } catch (err) {
          console.warn(`Warning: could not seed ${dstName}: ${err.message}`);
        }
      }
    });
}
// Regenerate summary.json on startup when using default data directory
// (skip when DATA_DIR is overridden, e.g. during tests)
// Regenerate summary.json on startup
console.log('Generating data/summary.json...');
const runSummary = require('./utils/runSummary');
runSummary();
const port = process.env.PORT || 3000;

// Endpoint to serve summary JSON
const apiCtrl = require('./controllers/apiController');
// API endpoint to return summary JSON
app.get('/api/summary', apiCtrl.getSummaryJson);

// Mount manage routes
app.use('/manage', require('./routes/manage'));
// Mount insights routes (annual, monthly, category)
const insightsRouter = require('./routes/insights');
app.use('/years', insightsRouter);
// Global transactions listing (paginated, most recent first)
const transactionsCtrl = require('./controllers/transactionsController');
app.get('/transactions', transactionsCtrl.showAllTransactions);
// Bulk actions on global transactions
app.post('/transactions/bulk', transactionsCtrl.bulkActions);
// Dashboard for current year summary
const dashboardCtrl = require('./controllers/dashboardController');
app.get('/', dashboardCtrl.showDashboard);
// Serve static assets (CSS, JS, etc.) from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));
// Handle favicon requests to avoid 404 errors
app.get('/favicon.ico', (req, res) => res.status(204).end());
// 404 handler for unmatched routes
app.use((req, res) => {
  console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404);
  res.render('error', { error: { status: 404, message: 'Not Found' } });
});
// global error handler (logs only server errors)
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(err.stack || err);
  }
  res.status(status);
  res.render('error', { error: err });
});

// Start server if this file is run directly
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  });
}
module.exports = app;
