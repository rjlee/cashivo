const fs = require('fs');
const path = require('path');
// Brute-force Embed+KNN classification without external kd-tree
const { pipeline } = require('@xenova/transformers');

/**
 * Embed+KNN classification using a WASM-backed transformer embedder
 * @param {Array} transactions
 * @param {string} modelDir - filesystem path to the saved KNN model directory
 * @returns {Array} categorized transactions
 */
async function classifyWithML(transactions, modelDir) {
  // Load the JSON KNN model (k, embeddings, labels)
  const knnPath = path.join(modelDir, 'knn.json');
  if (!fs.existsSync(knnPath)) {
    throw new Error(`Embed+KNN model not found at ${knnPath}`);
  }
  const { k, embeddings: trainEmb, labels: trainLabels } =
    JSON.parse(fs.readFileSync(knnPath, 'utf8'));
  // Pre-normalize train embeddings (L2-norm = 1) so cosine reduces to dot product
  for (let i = 0; i < trainEmb.length; i++) {
    const vec = trainEmb[i];
    let sumSq = 0;
    for (let j = 0; j < vec.length; j++) sumSq += vec[j] * vec[j];
    const invNorm = 1 / (Math.sqrt(sumSq) + 1e-8);
    for (let j = 0; j < vec.length; j++) vec[j] *= invNorm;
  }

  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const texts = transactions.map((tx) => tx.description || '');
  const BATCH_SIZE = parseInt(process.env.EMBED_BATCH_SIZE || '512', 10);
  const preds = [];
  console.log(`Embedding & classifying ${transactions.length} txns in batches of ${BATCH_SIZE}...`);
  // Brute-force nearest-neighbor with cosine similarity
  function cosine(a, b) {
    // Both vectors are pre-normalized, so cosine similarity reduces to dot product
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }
  function classifyOne(vec) {
    // compute similarities
    const sims = trainEmb.map((te, i) => ({ sim: cosine(te, vec), lbl: trainLabels[i] }));
    sims.sort((a, b) => b.sim - a.sim);
    const counts = Object.create(null);
    for (let i = 0; i < k && i < sims.length; i++) {
      counts[sims[i].lbl] = (counts[sims[i].lbl] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || 'other';
  }
  console.log(`Embedding & classifying ${transactions.length} txns in batches of ${BATCH_SIZE}...`);
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batchTexts = texts.slice(start, start + BATCH_SIZE);
    console.log(`  batch ${start}-${Math.min(start + batchTexts.length, texts.length) - 1}`);
    const rawEmb = await embedder(batchTexts);
    for (const vec of rawEmb) {
      preds.push(classifyOne(Array.from(vec)));
    }
  }
  return transactions.map((tx, i) => ({ ...tx, category: preds[i] || 'other' }));
}

module.exports = { classifyWithML };
