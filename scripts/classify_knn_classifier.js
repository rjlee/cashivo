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
  // Expect legacy KNN JSON model
  const knnPath = path.join(modelDir, 'knn.json');
  if (!fs.existsSync(knnPath)) {
    console.error('Embed+KNN model not found at', knnPath);
    process.exit(1);
  }
  let transactions;
  try {
    transactions = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  } catch (err) {
    console.error('Failed to read transactions:', err.message);
    process.exit(1);
  }
  console.log(`Classifying ${transactions.length} transactions using Embed+KNN classifier...`);
  let newTransactions;
  try {
    newTransactions = await classifyWithML(transactions, modelDir);
  } catch (err) {
    console.error('Classification error:', err.message);
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