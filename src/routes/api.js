const express = require('express');
const router = express.Router();
const apiCtrl = require('../controllers/apiController');

// Serve summary JSON
router.get('/summary', apiCtrl.getSummaryJson);

module.exports = router;
