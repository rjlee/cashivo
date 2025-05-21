const fs = require('fs');
const csv = require('csv-parser');

/**
 * Importer module for Moneyhub CSV exports.
 * Detects CSVs with headers DATE, DESCRIPTION, and AMOUNT.
 * Parses each row into the standard transaction object.
 */
module.exports = {
  name: 'moneyhub',
  // Use pass-through classification by default for Moneyhub imports
  defaultClassifier: 'pass',
  detect: (headers) => {
    // Case-insensitive detection of Moneyhub CSV format
    const ups = headers.map((h) => (h || '').toString().toUpperCase());
    return (
      ups.includes('DATE') &&
      ups.includes('DESCRIPTION') &&
      ups.includes('AMOUNT')
    );
  },
  async parse(filePath) {
    return new Promise((resolve, reject) => {
      const transactions = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          transactions.push({
            date: data.DATE || data.Date || '',
            amount: parseFloat(data.AMOUNT || data.Amount || data.amount) || 0,
            description:
              data.DESCRIPTION || data.Description || data.description || '',
            notes: data.NOTES || data.Notes || data.notes || '',
            originalCategory:
              data.CATEGORY || data.Category || data.category || '',
            originalCategoryGroup:
              data['CATEGORY GROUP'] ||
              data['Category Group'] ||
              data.categoryGroup ||
              '',
          });
        })
        .on('end', () => resolve(transactions))
        .on('error', (err) => reject(err));
    });
  },
};
