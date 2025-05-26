const path = require('path');
const fs = require('fs');
const summaryService = require('../services/summaryService');
const crypto = require('crypto');
const { spawn } = require('child_process');
const progressBus = require('../progressBus');
// Render manage page
function showManage(req, res) {
  const showDefaultsMsg = req.query.msg === 'defaults_loaded';
  const showDeletedMsg = req.query.msg === 'transactions_deleted';
  // Render the manage view (explicit .ejs extension)
  res.render('manage.ejs', { showDefaultsMsg, showDeletedMsg });
}
// Show progress page for a submitted job or training task
function showProgressPage(req, res) {
  const { jobId } = req.params;
  const task = req.query.task || 'upload';
  res.render('manage_progress.ejs', { jobId, task });
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
// Reload default settings (categories, category groups, importer mappings)
function loadDefaultSettings(req, res) {
  const defaultsDir = path.resolve(__dirname, '..', '..', 'defaults');
  const dataDir = path.resolve(__dirname, '..', '..', 'data');
  // Copy all default JSON configs into data/, stripping 'default_' prefix
  if (fs.existsSync(defaultsDir)) {
    fs.readdirSync(defaultsDir)
      .filter((file) => file.endsWith('.json'))
      .forEach((file) => {
        const src = path.join(defaultsDir, file);
        const dstName = file.replace(/^default_/, '');
        const dst = path.join(dataDir, dstName);
        try {
          fs.copyFileSync(src, dst);
        } catch (e) {
          console.warn(`Could not load default settings ${file}: ${e.message}`);
        }
      });
  }
  res.redirect('/manage?msg=defaults_loaded');
}
// Delete transactions and summary files
function deleteTransactions(req, res) {
  const dataDir = path.resolve(__dirname, '..', '..', 'data');
  ['transactions.json', 'transactions_categorized.json', 'summary.json'].forEach((file) => {
    const fp = path.join(dataDir, file);
    if (fs.existsSync(fp)) {
      try { fs.unlinkSync(fp); } catch (e) { console.warn(`Could not delete ${file}: ${e.message}`); }
    }
  });
  res.redirect('/manage?msg=transactions_deleted');
}
// Kick off classifier training as a background job and redirect to progress
function trainClassifier(req, res) {
  const jobId = crypto.randomUUID();
  const cwd = path.resolve(__dirname, '..', '..');
  // Spawn the npm script for classifier training with shell to enable streaming
  const fullCmd = 'npm run train:classifier';
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
  // Redirect to generic progress page with task type
  res.redirect(`/manage/progress/${jobId}?task=train`);
}
// SSE-based upload and processing with per-importer classifier mapping
function uploadFilesSse(req, res) {
  const files = req.files || [];
  if (!files.length) return res.status(400).send('No files uploaded.');
  const importersDir = path.resolve(__dirname, '..', 'importers');
  // Load importer modules with their filenames
  const importerConfig = require(path.resolve(__dirname, '..', '..', 'data', 'importerClassifiers.json'));
  const importerEntries = [];
  if (fs.existsSync(importersDir)) {
    fs.readdirSync(importersDir)
      .filter((fname) => fname.endsWith('.js'))
      .forEach((fname) => {
        const mod = require(path.join(importersDir, fname));
        importerEntries.push({ name: fname, mod });
      });
  }
  // Determine which importers applied
  const usedImporters = new Set();
  files.forEach((f) => {
    let headerLine = '';
    try { headerLine = fs.readFileSync(f.path, 'utf8').split(/\r?\n/)[0] || ''; } catch {}
    const headers = headerLine.split(',').map((h) => h.trim());
    const found = importerEntries.find((imp) => imp.mod.detect && imp.mod.detect(headers));
    if (found) usedImporters.add(found.name);
  });
  // Determine importer name (without extension) and build categorize command
  const importerName = [...usedImporters][0].replace(/\.js$/, '');
  const ingestCmd = 'npm run ingest';
  const categorizeCmd = `npm run categorize -- --importer=${importerName}`;
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
  // SSE headers, disable compression and buffering
  // signal compression middleware to skip
  req.headers['x-no-compression'] = true;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'identity');
  if (res.flushHeaders) res.flushHeaders();
  const onProgress = ({ jobId: id, data }) => {
    if (id !== jobId) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
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
  loadDefaultSettings,
  deleteTransactions,
  trainClassifier,
  showProgressPage,
  streamProgress,
};
