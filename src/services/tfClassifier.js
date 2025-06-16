// Lazy-load TensorFlow and the Universal Sentence Encoder only when needed
const fs = require('fs');
const path = require('path');

/**
 * ML-based classification using a TensorFlow.js model and Universal Sentence Encoder
 * @param {Array} transactions
 * @param {string} modelDir - filesystem path to the saved model directory
 * @returns {Array} categorized transactions
 */
async function classifyWithTF(transactions, modelDir) {
  // Attempt to load ML libraries; skip ML if unavailable
  let tf, use;
  try {
    tf = require('@tensorflow/tfjs-node');
    use = require('@tensorflow-models/universal-sentence-encoder');
  } catch (e) {
    console.warn('ML classifier not available on this platform:', e.message);
    return [];
  }
  const classesPath = path.join(modelDir, 'classes.json');
  if (!fs.existsSync(classesPath)) {
    throw new Error('ML classifier classes.json not found at ' + classesPath);
  }
  const categoriesList = JSON.parse(fs.readFileSync(classesPath, 'utf8'));
  const model = await tf.loadLayersModel(
    'file://' + path.join(modelDir, 'model.json')
  );
  const encoder = await use.load();
  const BATCH_SIZE = parseInt(process.env.EMBED_BATCH_SIZE || '512', 10);
  const results = [];
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batchTx = transactions.slice(i, i + BATCH_SIZE);
    const texts = batchTx.map((tx) => tx.description || '');
    const embTensor = await encoder.embed(texts);
    const logits = model.predict(embTensor);
    const scores = await logits.array();
    if (logits.dispose) logits.dispose();
    embTensor.dispose();
    for (let j = 0; j < scores.length; ++j) {
      const row = scores[j];
      const maxIdx = row.indexOf(Math.max(...row));
      const category = categoriesList[maxIdx] || 'other';
      results.push({ ...batchTx[j], category });
    }
  }
  return results;
}

module.exports = { classifyWithTF };
