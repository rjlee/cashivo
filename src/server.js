require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net/npm/chart.js"]
      }
    }
  })
);
// Gzip compression
app.use(compression());
// CSRF protection
app.use(cookieParser());
app.use(csurf({ cookie: true }));
// Expose CSRF token to views
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.locals.fmtCurrency = (value, currencyCode) => {
  const code = currencyCode || process.env.DEFAULT_CURRENCY || 'USD';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
  }).format(value);
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
// Ensure data directory and seed default cat/files
const dataDir = path.resolve(__dirname, '..', 'data');
const categoriesDir = path.resolve(__dirname, '..', 'categories');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
[
  { src: 'default_categories.json', dst: 'categories.json' },
  { src: 'default_category_groups.json', dst: 'category-groups.json' },
].forEach(({ src, dst }) => {
  const dstPath = path.join(dataDir, dst);
  if (!fs.existsSync(dstPath)) {
    try {
      fs.copyFileSync(path.join(categoriesDir, src), dstPath);
    } catch (e) {
      console.warn(`Warning: could not seed ${dst}: ${e.message}`);
    }
  }
});
const port = process.env.PORT || 3000;

// Endpoint to serve summary JSON
app.get('/api/summary', (req, res) => {
  const summaryPath = path.join(__dirname, '..', 'data', 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    return res
      .status(404)
      .send({ error: 'summary.json not found. Run npm run start first.' });
  }
  res.sendFile(summaryPath);
});

// Mount manage routes
app.use('/manage', require('./routes/manage'));
// Mount insights routes (annual, monthly, category)
const insightsRouter = require('./routes/insights');
app.use('/years', insightsRouter);
// Redirect root '/' to '/years'
app.get('/', (req, res) => {
  res.redirect('/years');
});
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
