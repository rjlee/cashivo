const tf = require('@tensorflow/tfjs-node');
const use = require('@tensorflow-models/universal-sentence-encoder');
const fs = require('fs');
const path = require('path');

/**
 * ML-based classification using a TensorFlow.js model and Universal Sentence Encoder
 * @param {Array} transactions
 * @param {string} modelDir - filesystem path to the saved model directory
 * @returns {Array} categorized transactions
 */
async function classifyWithML(transactions, modelDir) {
  const classesPath = path.join(modelDir, 'classes.json');
  if (!fs.existsSync(classesPath)) {
    throw new Error('ML classifier classes.json not found at ' + classesPath);
  }
  const categoriesList = JSON.parse(fs.readFileSync(classesPath, 'utf8'));
  const model = await tf.loadLayersModel('file://' + path.join(modelDir, 'model.json'));
  const encoder = await use.load();
  const texts = transactions.map((tx) => tx.description || '');
  const embeddings = await encoder.embed(texts);
  const logits = model.predict(embeddings);
  const scores = await logits.array();
  embeddings.dispose();
  if (Array.isArray(logits.dispose)) logits.dispose();
  return transactions.map((tx, i) => {
    const row = scores[i];
    const maxIdx = row.indexOf(Math.max(...row));
    const category = categoriesList[maxIdx] || 'other';
    return { ...tx, category };
  });
}

module.exports = { classifyWithML };