const fs = require('fs');

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

module.exports = { loadJSON };
