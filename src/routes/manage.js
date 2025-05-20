const express = require('express');
const path = require('path');
const router = express.Router();
const multer = require('multer');
// Save uploads into the project-root/import directory
const upload = multer({ dest: path.resolve(__dirname, '../../import') });
const manageCtrl = require('../controllers/manageController');

// Management endpoints
router.get('/', manageCtrl.showManage);
router.get('/export', manageCtrl.exportData);
// Process uploaded files
router.post('/', upload.array('files'), manageCtrl.uploadFiles);
// Reset all data
router.post('/reset', manageCtrl.resetData);
// Reload default categories
router.post('/load-default-categories', manageCtrl.loadDefaultCategories);
router.post('/', upload.array('files'), manageCtrl.uploadFiles);
router.post('/reset', manageCtrl.resetData);
router.post('/load-default-categories', manageCtrl.loadDefaultCategories);

module.exports = router;