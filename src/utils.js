const fs = require('fs');
const path = require('path');

/**
 * Load a JSON file and parse it, returning null on error.
 */
function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Load a JSON file from the data directory, returning defaultVal if not present or invalid.
 * @param {string} basename filename under the data directory (e.g. 'category-groups.json')
 * @param {*} defaultVal value to return if the file does not exist or parsing fails
 */
function loadDefaultJson(basename, defaultVal = null) {
  const getDataDir = require('./utils/getDataDir');
  const dataDir = getDataDir();
  const filePath = path.resolve(dataDir, basename);
  const v = loadJSON(filePath);
  if (v != null) return v;
  return defaultVal;
}

module.exports = { loadJSON, loadDefaultJson };
