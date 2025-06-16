#!/usr/bin/env node
// Simple Embed+KNN trainer: store embeddings and labels for a brute-force KNN classifier
const fs = require('fs');
const path = require('path');
const { pipeline } = require('@xenova/transformers');

(async function train() {
  // Load labeled transactions
  const dataPath = path.resolve(__dirname, '../data/transactions_categorized.json');
  if (!fs.existsSync(dataPath)) {
    console.error('Input transactions_categorized.json not found at', dataPath);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!data.length) {
    console.error('No labeled transactions found to train on.');
    process.exit(1);
  }

  // Prepare texts and labels
  const texts = data.map((tx) => tx.description || '');
  const labels = data.map((tx) => tx.category);

  console.log('Loading embedder (WASM BERT model)...');
  // Pool to mean-pooled sentence embeddings instead of token-level features
  const embedder = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
    { pooling: 'mean' }
  );

  // Embed in batches to avoid OOM on large datasets
  const BATCH_SIZE = parseInt(process.env.EMBED_BATCH_SIZE || '512', 10);
  console.log(`Embedding ${texts.length} transactions in batches of ${BATCH_SIZE}...`);
  const embeddings = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    console.log(`  embedding batch ${start}-${Math.min(start + batch.length, texts.length) - 1}`);
    // embedder returns an array of vectors for this batch
    const batchEmb = await embedder(batch);
    // Convert each embedding to a plain JS array (TypedArrays may not behave as Array)
    for (const vec of batchEmb) {
      embeddings.push(Array.from(vec));
    }
  }

  console.log('Saving Embed+KNN model to disk...');
  // Prepare output directory
  const outDir = path.resolve(__dirname, '../data/tx-classifier-knn');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Write Embed+KNN model to disk: meta.json + embeddings.bin (binary Float32)
  const k = 5;
  const dim = embeddings[0]?.length || 0;
  // meta.json holds k, labels, and dimension
  fs.writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify({ k, labels, dim }, null, 2)
  );
  // embeddings.bin holds all embeddings as flat Float32LE
  const buf = Buffer.allocUnsafe(embeddings.length * dim * 4);
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = 0; j < dim; j++) {
      buf.writeFloatLE(embeddings[i][j], 4 * (i * dim + j));
    }
  }
  fs.writeFileSync(path.join(outDir, 'embeddings.bin'), buf);
  console.log('✅ Embed+KNN model saved to', outDir);
})();