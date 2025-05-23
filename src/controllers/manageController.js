const path = require('path');
const fs = require('fs');
const summaryService = require('../services/summaryService');
// Render manage page
function showManage(req, res) {
  const showMsg = req.query.msg === 'defaults_loaded';
  // Render the manage view (explicit .ejs extension)
  res.render('manage.ejs', { showMsg });
}
// Export QIF
function exportData(req, res) {
  if (req.query.format !== 'qif') {
    return res.status(400).send('Unsupported format');
  }
  let qif;
  try {
    qif = summaryService.exportQif();
  } catch (err) {
    return res.status(500).send(err.message);
  }
  res.setHeader('Content-Type', 'application/x-qif');
  res.setHeader('Content-Disposition', 'attachment; filename="export.qif"');
  res.send(qif);
}
// Stubs for upload and reset
function uploadFiles(req, res) {
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).send('No files uploaded.');
  }
  const { exec } = require('child_process');
  const importersDir = path.resolve(__dirname, '..', 'importers');
  let importers = [];
  if (fs.existsSync(importersDir)) {
    importers = fs
      .readdirSync(importersDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => require(path.join(importersDir, f)));
  }
  const usedClassifiers = new Set();
  files.forEach((f) => {
    let headerLine = '';
    try {
      headerLine = fs.readFileSync(f.path, 'utf8').split(/\r?\n/)[0] || '';
    } catch {}
    const headers = headerLine.split(',').map((h) => h.trim());
    const importer = importers.find((i) => i.detect && i.detect(headers));
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
  const ingestCmd = 'npm run ingest';
  const categorizeCmd = classifyFlag
    ? `npm run categorize -- ${classifyFlag}`
    : 'npm run categorize';
  const summaryCmd = 'npm run summary';
  const fullCmd = `${ingestCmd} && ${categorizeCmd} && ${summaryCmd}`;
  // Run ingestion from project-root
  exec(
    fullCmd,
    { cwd: path.resolve(__dirname, '..', '..') },
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
      files.forEach((f) => {
        html += `<li>${f.originalname} → ${f.filename}</li>`;
      });
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
}
function resetData(req, res) {
  // Reset project-root/data
  const dataDir = path.resolve(__dirname, '..', '..', 'data');
  if (fs.existsSync(dataDir))
    fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  // After clearing data, redirect to GET /manage to generate a fresh CSRF token
  res.redirect('/manage');
}
function loadDefaultCategories(req, res) {
  // Default categories are at project-root/categories
  const srcCats = path.resolve(
    __dirname,
    '..',
    '..',
    'categories',
    'default_categories.json'
  );
  const dstCats = path.resolve(
    __dirname,
    '..',
    '..',
    'data',
    'categories.json'
  );
  fs.copyFileSync(srcCats, dstCats);
  res.redirect('/manage?msg=defaults_loaded');
}
module.exports = {
  showManage,
  exportData,
  uploadFiles,
  resetData,
  loadDefaultCategories,
};
