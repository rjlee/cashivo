require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { loadJSON } = require('./utils');
const { classifyWithRules } = require('./services/rulesClassifier');
const { classifyPassThrough } = require('./services/passClassifier');
const { classifyWithML } = require('./services/mlClassifier');
const { classifyWithAI } = require('./services/aiClassifier');
// Data directory path
const dataDir = path.resolve(__dirname, '..', 'data');

// Determine importer from CLI and load its categories config
const importerArg = process.argv.find((arg) => arg.startsWith('--importer='));
if (!importerArg) {
  console.error('Error: --importer flag is required (e.g. --importer=moneyhub)');
  process.exit(1);
}
const importerName = importerArg.split('=')[1];
const categoriesPath = path.resolve(__dirname, '..', 'data', `${importerName}_categories.json`);
const categories = loadJSON(categoriesPath);
if (!categories) {
  console.error(`Categories file not found for importer "${importerName}": ${categoriesPath}`);
  process.exit(1);
}
// Classification mode flags
// Legacy keyword rules flag
const rulesFlag =
  process.env.USE_RULES === 'true' || process.argv.includes('--rules');
// Pass-through flag: use originalCategory as category
const passFlag =
  process.env.USE_PASS === 'true' || process.argv.includes('--pass');
// AI-based classification flag (--ai or USE_AI=true)
const aiFlag = process.env.USE_AI === 'true' || process.argv.includes('--ai');
// ML-based classification flag (--ml or USE_ML=true)
const mlFlag = process.env.USE_ML === 'true' || process.argv.includes('--ml');
// Determine which classifier to use (precedence: rules > pass-through > ML > AI > fallback pass-through)
const useRules = rulesFlag;
const usePassThrough = !useRules && passFlag;
const useML = !useRules && !usePassThrough && mlFlag;
const useAI = !useRules && !usePassThrough && !useML && aiFlag;



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
  const transactions = JSON.parse(fs.readFileSync(inputFile));
  const totalTransactions = transactions.length;
  let categorized;
  // Dispatch classifier based on flags
  if (useRules) {
    console.log('Using keyword rules classifier');
    categorized = classifyWithRules(transactions, categories);
  } else if (usePassThrough) {
    console.log('Using pass-through classifier');
    categorized = classifyPassThrough(transactions);
  } else if (useML) {
    console.log('Using ML classifier');
    const modelDir = path.join(dataDir, 'tx-classifier');
    categorized = await classifyWithML(transactions, modelDir);
  } else if (useAI) {
    console.log('Using AI classifier');
    categorized = await classifyWithAI(transactions, categories);
  } else {
    console.log('Fallback to pass-through classifier');
    categorized = classifyPassThrough(transactions);
  }
  fs.writeFileSync(outputFile, JSON.stringify(categorized, null, 2));
  console.log(
    `Categorized ${categorized.length}/${totalTransactions} transactions. Output to ${outputFile}`
  );
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
  categorizeWithML: classifyWithML,
};
