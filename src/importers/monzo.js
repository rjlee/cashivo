const fs = require('fs');
const csv = require('csv-parser');

/**
 * Importer for Monzo CSV exports (clean.csv format).
 * Detects CSVs with 'account_id' and 'local_amount' headers.
 * Parses each row into the standard transaction object.
 */
module.exports = {
  name: 'monzo',
  // Use pass-through classification: Monzo provides its own categories
  defaultClassifier: 'pass',
  detect: (headers) => {
    if (!Array.isArray(headers)) return false;
    const hs = headers.map((h) => (h || '').toLowerCase());
    return hs.includes('account_id') && hs.includes('local_amount');
  },
  async parse(filePath) {
    return new Promise((resolve, reject) => {
      const transactions = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          // data.date is like 'YYYY/MM/DD', data.time is 'HH:mm:ss'
          const rawDate = (data.date || '').toString().trim();
          const rawTime = (data.time || '').toString().trim();
          const datePart = rawDate.split(' ')[0] || rawDate;
          const isoDateBase = datePart.replace(/\//g, '-');
          // Construct ISO date string with time (append Z for UTC) or midnight UTC
          const date = rawTime
            ? `${isoDateBase}T${rawTime}Z`
            : `${isoDateBase}T00:00:00Z`;
          const amount = parseFloat(data.amount) || 0;
          // Prefer the detailed description, fallback to merchant
          const description = (data.description || data.merchant || '').toString();
          transactions.push({
            date,
            amount,
            description,
            notes: data.notes || '',
            originalCategory: data.category || '',
            originalCategoryGroup: '',
          });
        })
        .on('end', () => resolve(transactions))
        .on('error', (err) => reject(err));
    });
  },
};