const fs = require('fs');

/**
 * Importer for QFX (QuickBooks Financial Exchange) / OFX files.
 * Detects files whose first line is XML declaration or starts with <OFX>.
 * Parses <STMTTRN> blocks for transactions.
 */
module.exports = {
  name: 'qfx',
  // Use keyword rules classification by default for QFX/OFX imports
  defaultClassifier: 'rules',
  detect: headers => Array.isArray(headers)
    && headers.length > 0
    && (headers[0].trim().startsWith('<?xml') || headers[0].trim().startsWith('<OFX')),
  async parse(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const transactions = [];
    let inTrn = false;
    let current = {};
    for (let raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('<STMTTRN>')) {
        inTrn = true;
        current = {};
      } else if (line.startsWith('</STMTTRN>') || line.startsWith('ENDTRN>')) {
        inTrn = false;
        transactions.push({
          date: current.date || '',
          amount: current.amount || 0,
          description: current.description || '',
          notes: current.notes || '',
          originalCategory: current.originalCategory || '',
          originalCategoryGroup: ''
        });
      } else if (inTrn) {
        if (line.startsWith('<DTPOSTED>')) {
          const rawDate = line.slice(10).split('.')[0];
          // Expect YYYYMMDD or YYYYMMDDHHMMSS
          const yyyy = rawDate.slice(0, 4);
          const mm = rawDate.slice(4, 6);
          const dd = rawDate.slice(6, 8);
          current.date = `${yyyy}-${mm}-${dd}`;
        } else if (line.startsWith('<TRNAMT>')) {
          current.amount = parseFloat(line.slice(8)) || 0;
        } else if (line.startsWith('<NAME>')) {
          current.description = line.slice(6);
        } else if (line.startsWith('<MEMO>')) {
          current.notes = line.slice(6);
        } else if (line.startsWith('<CATEGORY>')) {
          current.originalCategory = line.slice(10);
        }
      }
    }
    return transactions;
  }
};