#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { classifyWithML } = require('../src/services/mlClassifier');

(async function classify() {
  const dataDir = path.resolve(__dirname, '../data');
  const inputFile = path.join(dataDir, 'transactions_categorized.json');
  const modelDir = path.join(dataDir, 'tx-classifier-knn');
  if (!fs.existsSync(inputFile)) {
    console.error('Input transactions file not found:', inputFile);
    process.exit(1);
  }
  // Expect binary KNN model files: meta.json + embeddings.bin
  const metaPath = path.join(modelDir, 'meta.json');
  const embPath = path.join(modelDir, 'embeddings.bin');
  if (!fs.existsSync(metaPath) || !fs.existsSync(embPath)) {
    console.error('Embed+KNN model files not found in', modelDir);
    process.exit(1);
  }
  let transactions;
  try {
    transactions = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  } catch (err) {
    console.error('Failed to read transactions:', err.message);
    process.exit(1);
  }
  console.log(
    `Classifying ${transactions.length} transactions using Embed+KNN classifier...`
  );
  let newTransactions;
  try {
    newTransactions = await classifyWithML(transactions, modelDir);
  } catch (err) {
    // Detect mismatches between meta.json and embeddings.bin
    if (/array length|expected dimension|Missing.*dim/i.test(err.message)) {
      console.error(
        '\nDimension mismatch detected between meta.json and embeddings.bin:'
      );
      console.error(err.message);
      console.error(
        '\nPlease re-run scripts/train_knn_classifier.js to regenerate the model files.\n'
      );
    } else {
      console.error('Classification error:', err.message);
    }
    process.exit(1);
  }
  try {
    fs.writeFileSync(inputFile, JSON.stringify(newTransactions, null, 2));
  } catch (err) {
    console.error('Failed to write transactions:', err.message);
    process.exit(1);
  }
  console.log('✅ Classification complete. Updated', inputFile);
})();
