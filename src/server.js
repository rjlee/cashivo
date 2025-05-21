require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
// (Views rendering now handled by controllers via EJS templates)
// summaryModule is no longer needed here

const app = express();
// Configure EJS view engine and views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
// Helper for formatting amounts with currency and grouping
app.locals.fmtCurrency = function (value, currencyCode) {
  const code = currencyCode || process.env.DEFAULT_CURRENCY || 'USD';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
  }).format(value);
};
// Mount manage router for all /manage endpoints
const manageRouter = require('./routes/manage');
app.use('/manage', manageRouter);
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
// Set up file upload handling for transaction imports
const multer = require('multer');
const uploadDir = path.resolve(__dirname, '..', 'import');
// Ensure import directory exists
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
// Ensure data directory exists and default categories are seeded
const dataDir = path.resolve(__dirname, '..', 'data');
const categoriesDir = path.resolve(__dirname, '..', 'categories');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
// Persist default categories.json if missing
const dataCategoriesFile = path.join(dataDir, 'categories.json');
if (!fs.existsSync(dataCategoriesFile)) {
  try {
    fs.copyFileSync(
      path.join(categoriesDir, 'default_categories.json'),
      dataCategoriesFile
    );
  } catch (err) {
    console.warn(
      `Warning: unable to copy default categories.json: ${err.message}`
    );
  }
}
// Persist default category-groups.json if missing
const dataCatGroupsFile = path.join(dataDir, 'category-groups.json');
if (!fs.existsSync(dataCatGroupsFile)) {
  try {
    fs.copyFileSync(
      path.join(categoriesDir, 'default_category_groups.json'),
      dataCatGroupsFile
    );
  } catch (err) {
    console.warn(
      `Warning: unable to copy default category-groups.json: ${err.message}`
    );
  }
}
const port = process.env.PORT || 3000;

// (Static assets serving moved below to allow custom root and month routes)

// Export data in QIF format
app.get('/manage/export', (req, res) => {
  const format = req.query.format;
  if (format !== 'qif') {
    return res.status(400).send('Unsupported export format');
  }
  const txPath = path.join(dataDir, 'transactions_categorized.json');
  if (!fs.existsSync(txPath)) {
    return res
      .status(404)
      .send('No transaction data found. Please import transactions first.');
  }
  let txs;
  try {
    txs = JSON.parse(fs.readFileSync(txPath, 'utf-8'));
  } catch (err) {
    return res
      .status(500)
      .send('Error reading transaction data: ' + err.message);
  }
  // Sort transactions by date
  txs.sort((a, b) => a.date.localeCompare(b.date));
  // Build QIF content
  let qif = '!Type:Bank\n';
  txs.forEach((tx) => {
    const [year, month, day] = tx.date.split('-');
    const dateStr = [month.padStart(2, '0'), day.padStart(2, '0'), year].join(
      '/'
    );
    qif += 'D' + dateStr + '\n';
    qif += 'T' + tx.amount.toFixed(2) + '\n';
    qif += 'P' + tx.description + '\n';
    if (tx.notes) qif += 'M' + tx.notes + '\n';
    qif += 'L' + tx.category + '\n';
    qif += '^\n';
  });
  res.setHeader('Content-Type', 'application/x-qif');
  res.setHeader('Content-Disposition', 'attachment; filename="export.qif"');
  res.send(qif);
});
// Handle upload POST: save files, ingest, and report status
app.post('/manage', upload.array('files'), (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).send('No files uploaded.');
  }
  // Run ingestion script to process imported CSVs
  const { exec } = require('child_process');
  // Determine default classifier based on importer modules
  const importersDir = path.resolve(__dirname, 'importers');
  let importers = [];
  if (fs.existsSync(importersDir)) {
    importers = fs
      .readdirSync(importersDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => require(path.join(importersDir, f)));
  }
  const usedClassifiers = new Set();
  files.forEach((f) => {
    const fp = f.path;
    let headerLine = '';
    try {
      headerLine = fs.readFileSync(fp, 'utf8').split(/\r?\n/)[0] || '';
    } catch {}
    const headers = headerLine.split(',').map((h) => h.trim());
    const importer = importers.find(
      (i) => typeof i.detect === 'function' && i.detect(headers)
    );
    if (importer && importer.defaultClassifier)
      usedClassifiers.add(importer.defaultClassifier);
  });
  let classifyFlag = '';
  if (usedClassifiers.size === 1) {
    const cls = Array.from(usedClassifiers)[0];
    if (cls === 'pass') classifyFlag = '--pass';
    else if (cls === 'rules') classifyFlag = '--rules';
    else if (cls === 'emb') classifyFlag = '--emb';
    else if (cls === 'ai') classifyFlag = '--ai';
  }
  // Build full pipeline command
  const ingestCmd = 'npm run ingest';
  const categorizeCmd = classifyFlag
    ? `npm run categorize -- ${classifyFlag}`
    : 'npm run categorize';
  const summaryCmd = 'npm run summary';
  const fullCmd = `${ingestCmd} && ${categorizeCmd} && ${summaryCmd}`;
  exec(
    fullCmd,
    { cwd: path.resolve(__dirname, '..') },
    (err, stdout, stderr) => {
      let html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Upload Results</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <h1>Upload Results</h1>
  <p><a href="/manage">← New Upload</a> | <a href="/years">Annual Summaries</a></p>
  <ul>`;
      files.forEach(
        (f) => (html += `<li>${f.originalname} → ${f.filename}</li>`)
      );
      html += '</ul>';
      if (err) {
        html += `<h2 style="color:red">Error processing files</h2><pre>${stderr}</pre>`;
      } else {
        html += `<h2 style="color:green">Processing complete</h2><pre>${stdout}</pre>`;
      }
      html += '</body></html>';
      res.type('html').send(html);
    }
  );
});
// Reset data: delete all generated files in data/
app.post('/manage/reset', (req, res) => {
  const dataDir = path.resolve(__dirname, '..', 'data');
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(dataDir, { recursive: true });
  res.type('html').send(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Data Reset</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <h1>Data Reset Complete</h1>
  <p>All generated data has been deleted.</p>
  <p><a href="/manage">← Back to Manage</a> | <a href="/years">Annual Summaries</a></p>
</body>
</html>`
  );
});
// Load default categories and groups from templates
app.post('/manage/load-default-categories', (req, res) => {
  try {
    const srcCats = path.join(
      __dirname,
      '..',
      'categories',
      'default_categories.json'
    );
    const dstCats = path.join(__dirname, '..', 'data', 'categories.json');
    // Ensure data directory and file permissions are writable
    fs.mkdirSync(path.dirname(dstCats), { recursive: true });
    try {
      fs.chmodSync(path.dirname(dstCats), 0o777);
    } catch {}
    if (fs.existsSync(dstCats)) {
      try {
        fs.chmodSync(dstCats, 0o666);
      } catch {}
    }
    fs.copyFileSync(srcCats, dstCats);
    const srcGroups = path.join(
      __dirname,
      '..',
      'categories',
      'default_category_groups.json'
    );
    const dstGroups = path.join(
      __dirname,
      '..',
      'data',
      'category-groups.json'
    );
    fs.mkdirSync(path.dirname(dstGroups), { recursive: true });
    try {
      fs.chmodSync(path.dirname(dstGroups), 0o777);
    } catch {}
    if (fs.existsSync(dstGroups)) {
      try {
        fs.chmodSync(dstGroups, 0o666);
      } catch {}
    }
    fs.copyFileSync(srcGroups, dstGroups);
    res.redirect('/manage?msg=defaults_loaded');
  } catch (err) {
    res.status(500).send(`Error loading default categories: ${err.message}`);
  }
});
// Endpoint to serve summary JSON
app.get('/api/summary', (req, res) => {
  const summaryPath = path.join(__dirname, '..', 'data', 'summary.json');
  if (!require('fs').existsSync(summaryPath)) {
    return res
      .status(404)
      .send({ error: 'summary.json not found. Run npm run start first.' });
  }
  res.sendFile(summaryPath);
});
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
