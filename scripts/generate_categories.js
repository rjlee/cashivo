#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Paths
const dataDir = path.resolve(__dirname, '../data');
const inputFile = path.join(dataDir, 'transactions_categorized.json');
const outputFile = path.join(dataDir, 'categories.json');

if (!fs.existsSync(inputFile)) {
  console.error('Input transactions_categorized.json not found at', inputFile);
  process.exit(1);
}

// Load transactions
const transactions = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// Build mapping: assigned category => set of originalCategory
const map = {};
transactions.forEach((tx) => {
  const assigned = tx.category || 'other';
  const orig = tx.originalCategory || 'other';
  if (!map[assigned]) map[assigned] = new Set();
  map[assigned].add(orig);
});

// Convert to object with arrays
const categories = {};
Object.entries(map).forEach(([cat, set]) => {
  categories[cat] = Array.from(set).sort();
});

// Write categories.json
fs.writeFileSync(outputFile, JSON.stringify(categories, null, 2) + '\n');
console.log(`Generated categories.json with ${Object.keys(categories).length} categories at ${outputFile}`);