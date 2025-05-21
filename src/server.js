require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
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
// Serve static assets (CSS, JS) for other routes (e.g. public/index.html)
app.use(express.static(path.join(__dirname, '..', 'public')));
// 404 for other routes
app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
