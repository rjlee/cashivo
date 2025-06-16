require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { loadJSON } = require('./utils');
const { classifyWithRules } = require('./services/rulesClassifier');
const { classifyPassThrough } = require('./services/passClassifier');
const { classifyWithML } = require('./services/mlClassifier');
const { classifyWithAI } = require('./services/aiClassifier');
const { classifyWithTF } = require('./services/tfClassifier');
// Data directory path
const dataDir = path.resolve(__dirname, '..', 'data');

// Determine importer from CLI and load its categories config
const importerArg = process.argv.find((arg) => arg.startsWith('--importer='));
if (!importerArg) {
  console.error(
    'Error: --importer flag is required (e.g. --importer=moneyhub)'
  );
  process.exit(1);
}
const importerName = importerArg.split('=')[1];
const categoriesPath = path.resolve(
  __dirname,
  '..',
  'data',
  `${importerName}_categories.json`
);
const categories = loadJSON(categoriesPath);
if (!categories) {
  console.error(
    `Categories file not found for importer "${importerName}": ${categoriesPath}`
  );
  process.exit(1);
}
// Multi-pass classification per importer precedence
const importerConfig = loadJSON(path.join(dataDir, 'importerClassifiers.json'));
const importerFile = importerName + '.js';
let precedence =
  importerConfig &&
  importerConfig.importers &&
  importerConfig.importers[importerFile];
if (!Array.isArray(precedence))
  precedence = importerConfig && importerConfig.default;
if (!Array.isArray(precedence)) {
  console.error(`Invalid precedence config for importer "${importerFile}"`);
  process.exit(1);
}

async function run() {
  const inputFile = path.resolve(__dirname, '..', 'data', 'transactions.json');
  const outputFile = path.resolve(
    __dirname,
    '..',
    'data',
    'transactions_categorized.json'
  );
  if (!fs.existsSync(inputFile)) {
    console.error('Input file not found:', inputFile);
    process.exit(1);
  }
  const rawTx = JSON.parse(fs.readFileSync(inputFile));
  // Annotate each transaction with original index to track during multi-pass
  const transactions = rawTx.map((tx, idx) => ({ ...tx, _origIdx: idx }));
  const totalTransactions = transactions.length;
  let categorized;
  // Multi-pass classification with stats per classifier
  let remaining = [...transactions];
  categorized = [];
  const stats = [];
  for (const cls of precedence) {
    let mapped = [];
    if (cls === 'rules') {
      console.log('Applying RULES classifier');
      const rulesMap = loadJSON(
        path.resolve(dataDir, `${importerName}_categories.json`)
      );
      mapped = classifyWithRules(remaining, rulesMap).filter(
        (tx) => rulesMap && rulesMap.hasOwnProperty(tx.category)
      );
    } else if (cls === 'tf') {
      console.log('Applying TensorFlow classifier');
      // Use TensorFlow-based classifier model directory
      const modelDir = path.join(dataDir, 'tx-classifier');
      mapped = await classifyWithTF(remaining, modelDir);
    } else if (cls === 'ml') {
      console.log('Applying KNN classifier');
      // Use Embed+KNN model directory for KNN-based classification
      const modelDir = path.join(dataDir, 'tx-classifier-knn');
      mapped = await classifyWithML(remaining, modelDir);
    } else if (cls === 'ai') {
      console.log('Applying AI classifier');
      mapped = await classifyWithAI(remaining, categories);
    }
    // Record stats for this classifier
    const counts = mapped.reduce((acc, tx) => {
      acc[tx.category] = (acc[tx.category] || 0) + 1;
      return acc;
    }, {});
    stats.push({ classifier: cls, processed: mapped.length, counts });
    // Update results and remaining by filtering on _origIdx
    categorized.push(...mapped);
    const mappedIds = new Set(mapped.map((m) => m._origIdx));
    remaining = remaining.filter((tx) => !mappedIds.has(tx._origIdx));
  }
  // Fallback remaining to pass-through
  if (remaining.length) {
    console.log('Applying PASS-THROUGH fallback');
    const mapped = classifyPassThrough(remaining);
    const counts = mapped.reduce((acc, tx) => {
      acc[tx.category] = (acc[tx.category] || 0) + 1;
      return acc;
    }, {});
    stats.push({
      classifier: 'pass-through',
      processed: mapped.length,
      counts,
    });
    categorized.push(...mapped);
  }
  // Write output (strip internal index)
  const cleanOutput = categorized.map(({ _origIdx, ...tx }) => tx);
  fs.writeFileSync(outputFile, JSON.stringify(cleanOutput, null, 2));
  // Summary report
  console.log(`\n=== Classification Summary for ${importerName} ===`);
  console.log(`Total transactions: ${totalTransactions}`);
  stats.forEach((s) => {
    console.log(
      `\n-- ${s.classifier.toUpperCase()} (${s.processed} transactions) --`
    );
    console.table(s.counts);
  });
  console.log(`\nOutput written to ${outputFile}`);
}
// If run directly, execute classification
if (require.main === module) {
  run().catch((err) => {
    console.error('Error during categorization:', err);
    process.exit(1);
  });
}
// Export functions for evaluation
// Export classification functions
module.exports = {
  categorizeTransactions: classifyWithRules,
  categorizePassThrough: classifyPassThrough,
  categorizeWithAI: classifyWithAI,
  categorizeWithTF: classifyWithTF,
  categorizeWithML: classifyWithML,
};
