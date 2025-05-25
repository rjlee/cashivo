const path = require('path');
const fs = require('fs');
const summaryService = require('../services/summaryService');
const crypto = require('crypto');
const { spawn } = require('child_process');
const progressBus = require('../progressBus');
// Render manage page
function showManage(req, res) {
  const showMsg = req.query.msg === 'defaults_loaded';
  // Render the manage view (explicit .ejs extension)
  res.render('manage.ejs', { showMsg });
}
// Show progress page for a submitted job
function showProgressPage(req, res) {
  const { jobId } = req.params;
  res.render('manage_progress.ejs', { jobId });
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
function resetData(req, res) {
  // Reset project-root/data
  const dataDir = path.resolve(__dirname, '..', '..', 'data');
  if (fs.existsSync(dataDir)) {
    // Empty the data directory without removing the mount point
    fs.readdirSync(dataDir).forEach((name) => {
      const fp = path.join(dataDir, name);
      fs.rmSync(fp, { recursive: true, force: true });
    });
  } else {
    // Create data directory if missing
    fs.mkdirSync(dataDir, { recursive: true });
  }
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
// SSE-based upload and processing with real-time progress
function uploadFilesSse(req, res) {
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).send('No files uploaded.');
  }
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
    if (importer && importer.defaultClassifier) {
      usedClassifiers.add(importer.defaultClassifier);
    }
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
  const cwd = path.resolve(__dirname, '..', '..');
  const jobId = crypto.randomUUID();
  res.redirect(`/manage/progress/${jobId}`);
  const child = spawn(fullCmd, { cwd, shell: true });
  child.stdout.on('data', (chunk) => {
    progressBus.emit('progress', { jobId, data: { message: chunk.toString(), type: 'stdout' } });
  });
  child.stderr.on('data', (chunk) => {
    progressBus.emit('progress', { jobId, data: { message: chunk.toString(), type: 'stderr' } });
  });
  child.on('close', (code) => {
    progressBus.emit('progress', { jobId, data: { done: true, code } });
  });
}

// SSE endpoint to stream job progress updates
function streamProgress(req, res) {
  const { jobId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();
  const onProgress = ({ jobId: id, data }) => {
    if (id !== jobId) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (data.done) {
      progressBus.off('progress', onProgress);
      res.end();
    }
  };
  progressBus.on('progress', onProgress);
  req.on('close', () => {
    progressBus.off('progress', onProgress);
  });
}

module.exports = {
  showManage,
  exportData,
  uploadFiles: uploadFilesSse,
  resetData,
  loadDefaultCategories,
  showProgressPage,
  streamProgress,
};
