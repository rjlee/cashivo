#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
// TensorFlow and Universal Sentence Encoder are loaded lazily inside train()

async function train() {
  let tf, use;
  try {
    tf = require('@tensorflow/tfjs-node');
    use = require('@tensorflow-models/universal-sentence-encoder');
  } catch (e) {
    console.error(
      'ML training is not supported on this platform or tfjs failed to load:',
      e.message
    );
    process.exit(0);
  }
  const dataDir = path.resolve(__dirname, '../data');
  const inputFile = path.join(dataDir, 'transactions_categorized.json');
  const modelDir = path.join(dataDir, 'tx-classifier');

  if (!fs.existsSync(inputFile)) {
    console.error('Input transactions_not_found:', inputFile);
    process.exit(1);
  }
  const transactions = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  if (!transactions.length) {
    console.error('No transactions to train on.');
    process.exit(1);
  }
  // Extract unique categories
  const categories = Array.from(new Set(transactions.map((tx) => tx.category)));
  const labelIndex = Object.fromEntries(categories.map((c, i) => [c, i]));

  console.log('Loading Universal Sentence Encoder model...');
  const encoder = await use.load();
  const texts = transactions.map((tx) => tx.description || '');
  const ysArr = transactions.map((tx) => labelIndex[tx.category]);
  // Determine embedding dimension without loading all data
  const emb0 = await encoder.embed([texts[0]]);
  const embeddingDim = emb0.shape[1];
  emb0.dispose();

  const model = tf.sequential();
  model.add(
    tf.layers.dense({
      inputShape: [embeddingDim],
      units: 128,
      activation: 'relu',
    })
  );
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(
    tf.layers.dense({ units: categories.length, activation: 'softmax' })
  );
  model.compile({
    optimizer: tf.train.adam(),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  console.log('Training classifier model...');
  const NUM_EPOCHS = 20;
  const TRAIN_BATCH_SIZE = 32;
  const EMBED_BATCH_SIZE = 512;
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
  const numExamples = texts.length;
  let indices = Array.from({ length: numExamples }, (_, i) => i);
  for (let epoch = 0; epoch < NUM_EPOCHS; ++epoch) {
    console.log(`Epoch ${epoch + 1}/${NUM_EPOCHS}`);
    shuffle(indices);
    for (let start = 0; start < numExamples; start += EMBED_BATCH_SIZE) {
      const embedBatchIndices = indices.slice(start, start + EMBED_BATCH_SIZE);
      const batchTexts = embedBatchIndices.map((idx) => texts[idx]);
      const embedBatch = await encoder.embed(batchTexts);
      for (let j = 0; j < embedBatchIndices.length; j += TRAIN_BATCH_SIZE) {
        const trainBatchIndices = embedBatchIndices.slice(
          j,
          j + TRAIN_BATCH_SIZE
        );
        const batchSize = trainBatchIndices.length;
        const xBatch = embedBatch.slice([j, 0], [batchSize, embeddingDim]);
        const yBatchArr = trainBatchIndices.map((idx) => ysArr[idx]);
        const yBatch = tf.oneHot(
          tf.tensor1d(yBatchArr, 'int32'),
          categories.length
        );
        await model.trainOnBatch(xBatch, yBatch);
        xBatch.dispose();
        yBatch.dispose();
      }
      embedBatch.dispose();
    }
  }

  // Save model and classes
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
  await model.save('file://' + modelDir);
  fs.writeFileSync(
    path.join(modelDir, 'classes.json'),
    JSON.stringify(categories, null, 2)
  );
  console.log(`Trained model saved to ${modelDir}`);
}

train().catch((err) => {
  console.error('Training failed:', err);
  process.exit(1);
});
