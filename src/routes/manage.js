const express = require('express');
const path = require('path');
const router = express.Router();
const multer = require('multer');
// Save uploads into the project-root/import directory
const upload = multer({ dest: path.resolve(__dirname, '../../import') });
const manageCtrl = require('../controllers/manageController');
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

// Management endpoints
router.get(
  '/',
  csrfProtection,
  (req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
  },
  manageCtrl.showManage
);
router.get('/export', manageCtrl.exportData);
// Process uploaded files (multipart) with CSRF protection
router.post('/', upload.array('files'), csrfProtection, manageCtrl.uploadFiles);
// Reload default settings (categories, category groups, importer mappings)
router.post(
  '/load-default-settings',
  csrfProtection,
  manageCtrl.loadDefaultSettings
);
// Delete only transactions and summary data
router.post(
  '/delete-transactions',
  csrfProtection,
  manageCtrl.deleteTransactions
);
// Reset all data
router.post('/reset', csrfProtection, manageCtrl.resetData);
// Update a single transaction's category
router.post('/transaction/:idx/category', manageCtrl.updateTransactionCategory);
// Progress page
router.get('/progress/:jobId', manageCtrl.showProgressPage);
// SSE stream endpoint for job progress
router.get('/progress-stream/:jobId', manageCtrl.streamProgress);
// Train classifier endpoint
router.post('/train-classifier', csrfProtection, manageCtrl.trainClassifier);

module.exports = router;
