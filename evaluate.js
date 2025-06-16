#!/usr/bin/env node
// Suppress TensorFlow logs when embedding classification is used
process.env.TF_CPP_MIN_LOG_LEVEL = '3';
// Patch deprecated util methods to avoid DeprecationWarnings
{
  const util = require('util');
  util.isArray = Array.isArray;
  util.isNullOrUndefined = (v) => v === null || v === undefined;
}
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  categorizeTransactions,
  categorizeWithAI,
  categorizeWithML,
} = require('./src/categorize');

async function evaluate() {
  const inputFile = path.resolve(__dirname, 'data', 'transactions.json');
  if (!fs.existsSync(inputFile)) {
    console.error('No transactions.json found. Run ingest first.');
    process.exit(1);
  }
  const allTx = JSON.parse(fs.readFileSync(inputFile));
  const sample = allTx.slice(0, 100);
  console.log(`Evaluating on ${sample.length} transactions\n`);
  const ground = sample.map((tx) => tx.originalCategory || 'other');

  // Prepare summary results array
  const summaryResults = [];
  // 1. Rule-based
  console.log('Running rule-based classification...');
  const rulePred = categorizeTransactions(sample);
  const ruleCorrect = rulePred.filter(
    (tx, i) => tx.category === ground[i]
  ).length;
  const ruleAcc = (ruleCorrect / sample.length) * 100;
  console.log(
    `  Rule-based: ${ruleAcc.toFixed(2)}% (${ruleCorrect}/${sample.length})`
  );
  summaryResults.push({
    classifier: 'Rule-based',
    correct: ruleCorrect,
    total: sample.length,
    accuracy: ruleAcc,
  });

  // 2. Embedding-based
  try {
    console.log('Running KNN (embedding-based) classification...');
    const embPred = await categorizeWithML(sample);
    const embCorrect = embPred.filter(
      (tx, i) => tx.category === ground[i]
    ).length;
    const embAcc = (embCorrect / sample.length) * 100;
    console.log(
      `  Embedding-based: ${embAcc.toFixed(2)}% (${embCorrect}/${sample.length})`
    );
    summaryResults.push({
      classifier: 'Embedding-based',
      correct: embCorrect,
      total: sample.length,
      accuracy: embAcc,
    });
  } catch (err) {
    console.error('KNN classification failed:', err.message || err);
  }

  // 3. AI-based
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('Running AI-based classification...');
      const aiPred = await categorizeWithAI(sample);
      const aiCorrect = aiPred.filter(
        (tx, i) => tx.category === ground[i]
      ).length;
      const aiAcc = (aiCorrect / sample.length) * 100;
      console.log(
        `  AI-based: ${aiAcc.toFixed(2)}% (${aiCorrect}/${sample.length})`
      );
      summaryResults.push({
        classifier: 'AI-based',
        correct: aiCorrect,
        total: sample.length,
        accuracy: aiAcc,
      });
    } catch (err) {
      console.error('AI-based classification failed:', err.message || err);
    }
  } else {
    console.log('Skipping AI-based (no OPENAI_API_KEY)');
  }
  // Comparison summary
  console.log('\n=== Classifier Comparison ===');
  console.table(
    summaryResults.map((r) => ({
      Classifier: r.classifier,
      Accuracy: `${r.accuracy.toFixed(2)}%`,
      Correct: r.correct,
      Total: r.total,
    }))
  );
}

evaluate().catch((err) => {
  console.error('Error during evaluation:', err);
  process.exit(1);
});
