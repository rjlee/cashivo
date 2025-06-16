const fs = require('fs');
const path = require('path');
// Brute-force Embed+KNN classification without external kd-tree
const { pipeline } = require('@xenova/transformers');
const { HierarchicalNSW } = require('hnswlib-node');

/**
 * Embed+KNN classification using a WASM-backed transformer embedder
 * @param {Array} transactions
 * @param {string} modelDir - filesystem path to the saved KNN model directory
 * @returns {Array} categorized transactions
 */
async function classifyWithML(transactions, modelDir) {
  // Load the binary KNN model (meta.json + embeddings.bin)
  const metaPath = path.join(modelDir, 'meta.json');
  const embPath  = path.join(modelDir, 'embeddings.bin');
  if (!fs.existsSync(metaPath) || !fs.existsSync(embPath)) {
    throw new Error(`Embed+KNN model files not found in ${modelDir}`);
  }
  const { k, labels: trainLabels, dim } =
    JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  // Read raw Float32 array for embeddings
  const buf = fs.readFileSync(embPath);
  const raw = new Float32Array(
    buf.buffer,
    buf.byteOffset,
    buf.length / Float32Array.BYTES_PER_ELEMENT
  );
  // Convert raw Float32Array into array of normalized JS arrays (L2 = 1)
  const trainEmb = [];
  for (let i = 0; i < raw.length; i += dim) {
    // Extract subarray and convert to plain JS array
    const arr = Array.from(raw.subarray(i, i + dim));
    // Normalize to unit length
    let sumSq = 0;
    for (let j = 0; j < dim; j++) sumSq += arr[j] * arr[j];
    const invNorm = 1 / (Math.sqrt(sumSq) + 1e-8);
    for (let j = 0; j < dim; j++) arr[j] *= invNorm;
    trainEmb.push(arr);
  }

  // Build an exact HNSW index for cosine (inner-product) search
  // Build an exact HNSW index for inner-product (cosine) search
  const index = new HierarchicalNSW('cosine', dim);
  index.initIndex(trainEmb.length);
  // Insert every normalized train vector
  for (let i = 0; i < trainEmb.length; i++) {
    index.addPoint(trainEmb[i], i);
  }
  // ef should be set >= trainEmb.length for exact search
  index.setEf(trainEmb.length);

  // Pool to mean-pooled sentence embeddings rather than token-level features
  const embedder = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
    { pooling: 'mean' }
  );
  const texts = transactions.map((tx) => tx.description || '');
  const BATCH_SIZE = parseInt(process.env.EMBED_BATCH_SIZE || '512', 10);
  const results = [];
  console.log(`Embedding & classifying ${transactions.length} txns in batches of ${BATCH_SIZE}...`);
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batchTexts = texts.slice(start, start + BATCH_SIZE);
    console.log(`  embedding batch ${start}-${Math.min(start + batchTexts.length, texts.length) - 1}`);
    const rawEmb = await embedder(batchTexts);
    for (const vecTA of rawEmb) {
      // normalize query vector
      const vec = Array.from(vecTA);
      let sumSq = 0;
      for (let j = 0; j < vec.length; j++) sumSq += vec[j] * vec[j];
      const invNorm = 1 / (Math.sqrt(sumSq) + 1e-8);
      for (let j = 0; j < vec.length; j++) vec[j] *= invNorm;
      // search HNSW
      const { neighbors } = index.searchKnn(vec, k);
      // majority vote
      const counts = {};
      for (const idx of neighbors) {
        const lbl = trainLabels[idx];
        counts[lbl] = (counts[lbl] || 0) + 1;
      }
      results.push(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || 'other');
    }
  }
  return transactions.map((tx, i) => ({ ...tx, category: results[i] || 'other' }));
}

module.exports = { classifyWithML };
