const fs = require('fs');
/**
 * Keyword-based classification: assigns category if any keyword matches description or originalCategory.
 * @param {Array} transactions
 * @param {Object} categories - mapping of category to keyword array
 * @returns {Array} categorized transactions
 */
function classifyWithRules(transactions, categories) {
  return transactions.map((tx) => {
    let assigned = 'other';
    for (const [cat, keywords] of Object.entries(categories)) {
      for (const kw of keywords) {
        if (
          (tx.description || '').toLowerCase().includes(kw.toLowerCase()) ||
          (tx.originalCategory || '').toLowerCase().includes(kw.toLowerCase())
        ) {
          assigned = cat;
          break;
        }
      }
      if (assigned !== 'other') break;
    }
    return { ...tx, category: assigned };
  });
}

module.exports = { classifyWithRules };