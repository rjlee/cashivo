const path = require('path');

/**
 * Return the directory where JSON data files live.
 * Uses DATA_DIR env var or falls back to <project-root>/data.
 */
function getDataDir() {
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }
  return path.resolve(process.cwd(), 'data');
}

module.exports = getDataDir;
