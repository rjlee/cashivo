require('dotenv').config();
const fs = require('fs');
const path = require('path');
// Load JSON helper: attempts to read file, returns null if missing or parse error
function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}
// Load category definitions: user-provided or default
const userCategoriesPath = path.resolve(
  __dirname,
  '..',
  'data',
  'categories.json'
);
const defaultCategories = require('../categories/default_categories.json');
const categories = loadJSON(userCategoriesPath) || defaultCategories;
// Concurrency limiter for AI requests
const pLimit = require('p-limit');
// Classification mode flags
// Legacy keyword rules flag
const rulesFlag =
  process.env.USE_RULES === 'true' || process.argv.includes('--rules');
// Pass-through flag: use originalCategory as category
const passFlag =
  process.env.USE_PASS === 'true' || process.argv.includes('--pass');
// AI-based classification flag
const aiFlag = process.env.USE_AI === 'true' || process.argv.includes('--ai');
// Determine which classifier to use (precedence: rules > pass | AI > default pass)
const useRules = rulesFlag;
const usePassThrough = !useRules && passFlag;
const useAI = !useRules && !usePassThrough && aiFlag;
// AI config: API key, concurrency, and model settings
const apiKey = process.env.OPENAI_API_KEY;
const aiConcurrency = parseInt(process.env.AI_CONCURRENCY || '10', 10);
const aiModel = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
// Initialize OpenAI client if API key is provided
let openai;
if (apiKey) {
  const { OpenAI } = require('openai');
  openai = new OpenAI({ apiKey });
}

function categorizeTransactions(transactions) {
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
/**
 * Pass-through classification: use the transaction's originalCategory field
 */
function categorizePassThrough(transactions) {
  return transactions.map((tx) => ({
    ...tx,
    category: tx.originalCategory || 'other',
  }));
}

// AI-based categorization: calls OpenAI per category
async function categorizeWithAI(transactions) {
  const catKeys = Object.keys(categories);
  const total = transactions.length;
  let done = 0;
  // limit concurrency
  const limit = pLimit(aiConcurrency);
  const tasks = transactions.map((tx) =>
    limit(async () => {
      // progress indicator
      done++;
      const prompt =
        `Allowed Categories: ${catKeys.join(', ')}\n` +
        `Given the original category, select the best match from the allowed categories.\n` +
        `Return only one category name from the list exactly as written, with no additional text.\n\n` +
        `Original Category: ${tx.originalCategory}`;

      try {
        const resp = await openai.chat.completions.create({
          model: aiModel,
          messages: [
            {
              role: 'system',
              content:
                'You are an expert at mapping category labels. Given one original category, your ' +
                'task is to select the most appropriate category from a fixed list. Always reply with ' + 
                'exactly one category name from the list, matching it exactly — no extra text, no ' +
                'formatting changes, no explanations.'
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
        });
        const cat = resp.choices[0].message.content.trim();
        // Assign 'other' if AI response not in allowed categories
        const assigned = catKeys.includes(cat) ? cat : 'other';
        return { ...tx, category: assigned };
      } catch (err) {
        console.error('AI categorization error:', err);
        // On error, assign 'other'
        return { ...tx, category: 'other' };
      }
    })
  );
  // Execute all tasks
  const results = await Promise.all(tasks);
  // end progress line
  process.stdout.write('\n');
  return results;
}

async function run() {
  const inputFile = path.resolve(__dirname, '..', 'data', 'transactions.json');
  const outputFile = path.resolve(
    __dirname,
    '..',
    'data',
    'transactions_categorized.json'
  );
  if (!fs.existsSync(inputFile)) {
    console.error('Input file not found:', inputFile);
    process.exit(1);
  }
  const transactions = JSON.parse(fs.readFileSync(inputFile));
  const totalTransactions = transactions.length;
  let categorized;
  // If AI mode requested without API key, error out
  if (useAI && !apiKey) {
    console.error('AI mode requested (--ai) but OPENAI_API_KEY is not set');
    process.exit(1);
  }
  // Dispatch classifier based on flags
  if (useRules) {
    console.log(
      'Keyword rules classification: using defined categories.json patterns'
    );
    categorized = categorizeTransactions(transactions);
  } else if (usePassThrough) {
    console.log(
      'Pass-through classification: using originalCategory for each transaction'
    );
    categorized = categorizePassThrough(transactions);
  } else if (useAI) {
    console.log('Categorizing transactions using AI chat completions...');
    categorized = await categorizeWithAI(transactions);
  } else {
    // Fallback to pass-through
    console.log(
      'Default pass-through classification: using originalCategory for each transaction'
    );
    categorized = categorizePassThrough(transactions);
  }
  fs.writeFileSync(outputFile, JSON.stringify(categorized, null, 2));
  console.log(
    `Categorized ${categorized.length}/${totalTransactions} transactions. Output to ${outputFile}`
  );
}
// If run directly, execute classification
if (require.main === module) {
  run().catch((err) => {
    console.error('Error during categorization:', err);
    process.exit(1);
  });
}
// Export functions for evaluation
module.exports = {
  categorizeTransactions,
  categorizeWithAI,
  categorizePassThrough,
};
