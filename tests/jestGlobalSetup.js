const fs = require('fs');
const path = require('path');

/**
 * Jest global setup: ensure tmp_data directory exists for all tests.
 */
module.exports = async function globalSetup() {
  const tmpDir = path.resolve(__dirname, 'tmp_data');
  fs.mkdirSync(tmpDir, { recursive: true });
};
