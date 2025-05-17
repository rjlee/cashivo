// Load environment variables from .env
// Suppress TensorFlow C++ backend logs (Info, Warnings)
process.env.TF_CPP_MIN_LOG_LEVEL = '3';
// Suppress TensorFlow logs when embedding classification is used
process.env.TF_CPP_MIN_LOG_LEVEL = '3';
// Patch deprecated util methods to avoid DeprecationWarnings
{
  const util = require('util');
  util.isArray = Array.isArray;
  util.isNullOrUndefined = v => v === null || v === undefined;
}
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const categories = require('./categories.json');
// Concurrency limiter for AI requests
const pLimit = require('p-limit');
// Classification mode flags
// Legacy keyword rules flag
const rulesFlag = process.env.USE_RULES === 'true' || process.argv.includes('--rules');
// Pass-through flag: use originalCategory as category
const passFlag = process.env.USE_PASS === 'true' || process.argv.includes('--pass');
// Embedding-based classification flag
const embFlag = process.env.USE_EMBEDDINGS === 'true' || process.argv.includes('--emb');
// AI-based classification flag
const aiFlag = process.env.USE_AI === 'true' || process.argv.includes('--ai');
// Determine which classifier to use (precedence: rules > pass > embeddings > AI > default pass)
const useRules = rulesFlag;
const usePassThrough = !useRules && (passFlag || (!embFlag && !aiFlag));
const useEmbeddings = !useRules && !usePassThrough && embFlag;
const useAI = !useRules && !usePassThrough && !useEmbeddings && aiFlag;
// AI config: API key, concurrency, and model settings
const apiKey = process.env.OPENAI_API_KEY;
const aiConcurrency = parseInt(process.env.AI_CONCURRENCY || '10', 10);
const aiModel = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
// Embedding model for vector classification
const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002';
// Initialize OpenAI client if API key is provided
let openai;
if (apiKey) {
  const { OpenAI } = require('openai');
  openai = new OpenAI({ apiKey });
}

function categorizeTransactions(transactions) {
  return transactions.map(tx => {
    let assigned = 'other';
    for (const [cat, keywords] of Object.entries(categories)) {
      for (const kw of keywords) {
        if ((tx.description || '').toLowerCase().includes(kw.toLowerCase()) ||
            (tx.originalCategory || '').toLowerCase().includes(kw.toLowerCase())) {
          assigned = cat;
          break;
        }
      }
      if (assigned !== 'other') break;
    }
    return { ...tx, category: assigned };
  });
}

// AI-based categorization: calls OpenAI per transaction
async function categorizeWithAI(transactions) {
  const catKeys = Object.keys(categories);
  const total = transactions.length;
  let done = 0;
  // limit concurrency
  const limit = pLimit(aiConcurrency);
  const tasks = transactions.map(tx => limit(async () => {
    // progress indicator
    done++;
    process.stdout.write(`Categorizing using AI: ${done}/${total}\r`);
    const prompt = `Categories: ${catKeys.join(', ')}\n` +
      `Assign the best category to this transaction. ` +
      `Reply with exactly one category from the list.\n` +
      `Date: ${tx.date}\nAmount: ${tx.amount}\nDescription: ${tx.description}\nOriginal Category: ${tx.originalCategory}`;
    try {
      const resp = await openai.chat.completions.create({
        model: aiModel,
        messages: [
          { role: 'system', content: 'You are a financial assistant that classifies transactions into categories.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0
      });
      let cat = resp.choices[0].message.content.trim();
      if (!catKeys.includes(cat)) cat = 'other';
      return { ...tx, category: cat };
    } catch (err) {
      console.error('AI categorization error:', err);
      return { ...tx, category: 'other' };
    }
  }));
  const results = await Promise.all(tasks);
  // end progress line
  process.stdout.write('\n');
  return results;
}

// Embedding-based categorization: local Universal Sentence Encoder
async function categorizeWithEmbeddings(transactions) {
  // Lazy-load tfjs and USE only when embedding mode is active
  const tf = require('@tensorflow/tfjs-node');
  const use = require('@tensorflow-models/universal-sentence-encoder');
  console.log('Loading Universal Sentence Encoder model...');
  const model = await use.load();
  const catKeys = Object.keys(categories);
  console.log(`Embedding ${catKeys.length} category labels...`);
  const catTensor = await model.embed(catKeys);
  const catEmbArray = await catTensor.array();
  console.log(`Embedding ${transactions.length} transactions...`);
  const texts = transactions.map(tx => tx.description || '');
  const txTensor = await model.embed(texts);
  const txEmbArray = await txTensor.array();
  // Classify by nearest neighbor dot-product
  const results = transactions.map((tx, idx) => {
    const emb = txEmbArray[idx];
    let bestCat = 'other';
    let bestScore = -Infinity;
    for (let i = 0; i < catKeys.length; i++) {
      const catEmb = catEmbArray[i];
      const dot = emb.reduce((sum, v, j) => sum + v * catEmb[j], 0);
      if (dot > bestScore) {
        bestScore = dot;
        bestCat = catKeys[i];
      }
    }
    return { ...tx, category: bestCat };
  });
  return results;
}
/**
 * Pass-through classifier: use originalCategory field as the assigned category.
 */
function categorizePassThrough(transactions) {
  return transactions.map(tx => ({
    ...tx,
    category: tx.originalCategory || 'other'
  }));
}

async function run() {
  const inputFile = path.resolve(__dirname, '..', 'data', 'transactions.json');
  const outputFile = path.resolve(__dirname, '..', 'data', 'transactions_categorized.json');
  if (!fs.existsSync(inputFile)) {
    console.error('Input file not found:', inputFile);
    process.exit(1);
  }
  const transactions = JSON.parse(fs.readFileSync(inputFile));
  let categorized;
  // If AI mode requested without API key, error out
  if (useAI && !apiKey) {
    console.error('AI mode requested (--ai) but OPENAI_API_KEY is not set');
    process.exit(1);
  }
  // Dispatch classifier based on flags
  if (useRules) {
    console.log('Keyword rules classification: using defined categories.json patterns');
    categorized = categorizeTransactions(transactions);
  } else if (usePassThrough) {
    console.log('Pass-through classification: using originalCategory for each transaction');
    categorized = categorizePassThrough(transactions);
  } else if (useEmbeddings) {
    console.log('Categorizing transactions using local embedding model...');
    categorized = await categorizeWithEmbeddings(transactions);
  } else if (useAI) {
    console.log('Categorizing transactions using AI chat completions...');
    categorized = await categorizeWithAI(transactions);
  } else {
    // Fallback to pass-through
    console.log('Default pass-through classification: using originalCategory for each transaction');
    categorized = categorizePassThrough(transactions);
  }
  fs.writeFileSync(outputFile, JSON.stringify(categorized, null, 2));
  console.log(`Categorized ${categorized.length} transactions. Output to ${outputFile}`);
}
// If run directly, execute classification
if (require.main === module) {
  run().catch(err => {
    console.error('Error during categorization:', err);
    process.exit(1);
  });
}
// Export functions for evaluation
module.exports = {
  categorizeTransactions,
  categorizeWithAI,
  categorizeWithEmbeddings,
  categorizePassThrough,
};