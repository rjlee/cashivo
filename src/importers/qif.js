const fs = require('fs');

/**
 * Importer for QIF (Quicken Interchange Format) files.
 * Detects files with a first line starting with "!Type:".
 * Parses each transaction block delimited by ^ into a standard transaction object.
 */
module.exports = {
  name: 'qif',
  // Use keyword rules classification by default for QIF imports
  defaultClassifier: 'rules',
  detect: (headers) =>
    Array.isArray(headers) &&
    headers.length > 0 &&
    headers[0].trim().startsWith('!Type:'),
  async parse(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const transactions = [];
    let current = {};
    for (let raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const code = line.charAt(0);
      const value = line.slice(1).trim();
      switch (code) {
        case 'D':
          // Date line
          // Attempt to parse to ISO YYYY-MM-DD
          const d = new Date(value);
          if (!isNaN(d)) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            current.date = `${yyyy}-${mm}-${dd}`;
          } else {
            current.date = value;
          }
          break;
        case 'T':
          // Amount
          current.amount = parseFloat(value) || 0;
          break;
        case 'P':
          // Payee / description
          current.description = value;
          break;
        case 'M':
          // Memo / notes
          current.notes = value;
          break;
        case 'L':
          // Category
          current.originalCategory = value;
          break;
        case '^':
          // End of record
          transactions.push({
            date: current.date || '',
            amount: current.amount || 0,
            description: current.description || '',
            notes: current.notes || '',
            originalCategory: current.originalCategory || '',
            originalCategoryGroup: '',
          });
          current = {};
          break;
        default:
          // ignore other codes
          break;
      }
    }
    return transactions;
  },
};
