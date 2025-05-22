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
router.post(
  '/',
  upload.array('files'),
  csrfProtection,
  manageCtrl.uploadFiles
);
// Reload default categories
router.post(
  '/load-default-categories',
  csrfProtection,
  manageCtrl.loadDefaultCategories
);
// Reset all data
router.post(
  '/reset',
  csrfProtection,
  manageCtrl.resetData
);

module.exports = router;
