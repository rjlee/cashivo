/**
 * Pass-through classification: uses the transaction's originalCategory as its category.
 * @param {Array} transactions
 * @returns {Array} categorized transactions
 */
function classifyPassThrough(transactions) {
  return transactions.map((tx) => ({
    ...tx,
    category: tx.originalCategory || 'other',
  }));
}

module.exports = { classifyPassThrough };