require('dotenv').config();

// Required environment variables
const required = ['DEFAULT_CURRENCY', 'USERNAME', 'PASSWORD'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  process.exit(1);
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  defaultCurrency: process.env.DEFAULT_CURRENCY,
  auth: {
    user: process.env.USERNAME,
    pass: process.env.PASSWORD,
  },
  openaiApiKey: process.env.OPENAI_API_KEY || null,
};
