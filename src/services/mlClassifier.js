const fs = require('fs');
const path = require('path');
// Brute-force Embed+KNN classification without external kd-tree
const { pipeline } = require('@xenova/transformers');
const hnsw = require('hnswlib-node');

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
  // Convert raw Float32Array into array of normalized Float32Array vectors
  const trainEmb = [];
  for (let i = 0; i < raw.length; i += dim) {
    const vec = raw.subarray(i, i + dim);
    let sumSq = 0;
    for (let j = 0; j < dim; j++) sumSq += vec[j] * vec[j];
    const invNorm = 1 / (Math.sqrt(sumSq) + 1e-8);
    for (let j = 0; j < dim; j++) vec[j] *= invNorm;
    trainEmb.push(vec);
  }

  // Build an exact HNSW index for cosine (inner-product) search
  const index = new hnsw.Index('cosine', dim);
  index.initIndex(trainEmb.length);
  // Flatten embeddings into one Float32Array
  const flat = new Float32Array(trainEmb.length * dim);
  for (let i = 0; i < trainEmb.length; i++) {
    flat.set(trainEmb[i], i * dim);
  }
  const ids = Array.from({ length: trainEmb.length }, (_, i) => i);
  index.addItems(flat, ids);
  index.setEf(trainEmb.length);

  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
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
