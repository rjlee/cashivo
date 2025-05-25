const pLimit = require('p-limit');
const { OpenAI } = require('openai');
const fs = require('fs');

const apiKey = process.env.OPENAI_API_KEY;
const aiConcurrency = parseInt(process.env.AI_CONCURRENCY || '10', 10);
const aiModel = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const openai = apiKey ? new OpenAI({ apiKey }) : null;

/**
 * AI-based classification: uses OpenAI chat completions to map originalCategory to allowed categories
 * @param {Array} transactions
 * @param {Object} categories - mapping of category to keyword array
 * @returns {Array} categorized transactions
 */
async function classifyWithAI(transactions, categories) {
  if (!openai) {
    throw new Error('AI API key is not set (OPENAI_API_KEY)');
  }
  const catKeys = Object.keys(categories);
  const limit = pLimit(aiConcurrency);
  const tasks = transactions.map((tx) =>
    limit(async () => {
      const prompt =
        `Allowed Categories: ${catKeys.join(', ')}\n` +
        `Select the best category (one only) for this original category: ` +
        `${tx.originalCategory}`;
      try {
        const resp = await openai.chat.completions.create({
          model: aiModel,
          messages: [
            { role: 'system', content: 'Select exactly one category from the allowed list.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
        });
        const cat = resp.choices[0].message.content.trim();
        const assigned = catKeys.includes(cat) ? cat : 'other';
        return { ...tx, category: assigned };
      } catch (err) {
        console.error('AI categorization error:', err);
        return { ...tx, category: 'other' };
      }
    })
  );
  const results = await Promise.all(tasks);
  process.stdout.write('\n');
  return results;
}

module.exports = { classifyWithAI };