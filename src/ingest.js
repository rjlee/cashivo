// Load environment variables from .env
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
async function ingest() {
  // Directory to scan for CSV imports (rename existing "transactions" folder to "import")
  const transactionsDir = path.resolve(__dirname, '..', 'import');
  if (!fs.existsSync(transactionsDir)) {
    console.error('Import directory not found:', transactionsDir);
    process.exit(1);
  }
  const outputDir = path.resolve(__dirname, '..', 'data');
  const outputFile = path.join(outputDir, 'transactions.json');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  // Load existing transactions for incremental merge
  let existingTx = [];
  if (fs.existsSync(outputFile)) {
    existingTx = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    console.log(`Loaded ${existingTx.length} existing transactions`);
  }
  // Pick up any files in import/ (multer may rename without .csv extension)
  const files = fs.readdirSync(transactionsDir).filter((f) => {
    const fp = path.join(transactionsDir, f);
    // include regular files only
    return fs.statSync(fp).isFile() && !f.startsWith('.');
  });
  if (files.length === 0) {
    console.warn(
      'No CSV files found in',
      transactionsDir,
      '- skipping ingestion'
    );
  }
  // Collect newly parsed transactions using pluggable importers
  const newTx = [];
  const fileCounts = {};

  // Dynamically load importer modules from src/importers
  const importersDir = path.resolve(__dirname, 'importers');
  let importers = [];
  if (fs.existsSync(importersDir)) {
    importers = fs
      .readdirSync(importersDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => require(path.join(importersDir, f)));
  }

  // Allow overriding the format via ENV or CLI, e.g. --format=moneyhub
  const overrideFormat =
    process.env.INGEST_FORMAT ||
    process.argv.find((arg) => arg.startsWith('--format='))?.split('=')[1];

  // Helper to read first line (headers) of a CSV file
  async function peekCsvHeaders(fp) {
    return new Promise((resolve, reject) => {
      const rs = fs.createReadStream(fp);
      let data = '';
      rs.on('data', (chunk) => {
        data += chunk.toString();
        const idx = data.indexOf('\n');
        if (idx !== -1) {
          rs.destroy();
          const headers = data
            .slice(0, idx)
            .split(',')
            .map((h) => h.trim());
          resolve(headers);
        }
      });
      rs.on('error', reject);
      rs.on('end', () => {
        const headers = data
          .split('\n')[0]
          .split(',')
          .map((h) => h.trim());
        resolve(headers);
      });
    });
  }

  for (const file of files) {
    const filePath = path.join(transactionsDir, file);
    let importer;
    let headers;
    try {
      headers = await peekCsvHeaders(filePath);
    } catch (err) {
      console.error(`Error reading headers of ${file}:`, err);
      continue;
    }
    if (overrideFormat) {
      importer = importers.find((i) => i.name === overrideFormat);
      if (!importer) {
        console.warn(
          `No importer found for format "${overrideFormat}", skipping ${file}`
        );
        continue;
      }
    } else {
      importer = importers.find((i) => i.detect(headers));
      if (!importer) {
        console.warn(`No importer detected for file "${file}", skipping`);
        continue;
      }
    }
    let parsed;
    try {
      parsed = await importer.parse(filePath);
      fileCounts[file] = parsed.length;
      console.log(
        `Processed ${file}: ${parsed.length} rows using "${importer.name}" importer`
      );
      newTx.push(...parsed);
    } catch (err) {
      console.error(
        `Error parsing ${file} with importer "${importer.name}":`,
        err
      );
      continue;
    }
    try {
      fs.unlinkSync(filePath);
      console.log(`Deleted ingested file: ${file}`);
    } catch (err) {
      console.warn(`Failed to delete file ${file}:`, err.message);
    }
  }
  // Combine existing and new, then quality-check & dedupe
  console.log(`New rows parsed: ${newTx.length}`);
  const combined = existingTx.concat(newTx);
  console.log(`Total before QC: ${combined.length}`);
  let invalidDates = 0;
  const validTx = combined.filter((tx) => {
    const dt = new Date(tx.date);
    if (!tx.date || isNaN(dt.getTime())) {
      invalidDates++;
      return false;
    }
    return true;
  });
  const seen = new Set();
  let duplicates = 0;
  const uniqueTx = validTx.filter((tx) => {
    // Use original transaction id (origId) if present, else fallback to date|amount|description
    const key = tx.origId
      ? `origId:${tx.origId}`
      : JSON.stringify([tx.date, tx.amount, tx.description]);
    if (seen.has(key)) {
      duplicates++;
      return false;
    }
    seen.add(key);
    return true;
  });
  // Logs
  console.log(`Ingestion summary:`);
  Object.entries(fileCounts).forEach(([f, c]) =>
    console.log(`  ${f}: ${c} rows`)
  );
  if (invalidDates)
    console.log(`  Removed ${invalidDates} rows with invalid dates`);
  if (duplicates) console.log(`  Removed ${duplicates} duplicate transactions`);
  console.log(`  After dedupe: ${uniqueTx.length} total valid transactions`);
  // Write output
  // Exclude months with insufficient day coverage
  const monthToDays = {};
  uniqueTx.forEach((tx) => {
    const ym = tx.date.slice(0, 7);
    const day = parseInt(tx.date.slice(8, 10), 10);
    if (!monthToDays[ym]) monthToDays[ym] = new Set();
    monthToDays[ym].add(day);
  });
  // Determine threshold for inclusion (fraction of days present; default 80% unless overridden by env)
  const coverageThreshold =
    process.env.MONTH_COVERAGE != null
      ? parseFloat(process.env.MONTH_COVERAGE)
      : 0.8;
  const completeMonths = [];
  const incompleteMonths = [];
  Object.entries(monthToDays).forEach(([ym, daysSet]) => {
    const [year, mon] = ym.split('-').map((v) => parseInt(v, 10));
    const daysInMonth = new Date(year, mon, 0).getDate();
    const coverage = daysSet.size / daysInMonth;
    if (coverage >= coverageThreshold) {
      completeMonths.push(ym);
    } else {
      incompleteMonths.push(ym);
    }
  });
  if (incompleteMonths.length) {
    console.log(
      `Excluding months with <${(coverageThreshold * 100).toFixed(0)}% coverage:`,
      incompleteMonths.join(', ')
    );
  }
  const filteredTx = uniqueTx.filter((tx) =>
    completeMonths.includes(tx.date.slice(0, 7))
  );
  const finalCount = filteredTx.length;
  console.log(`Transactions after filtering incomplete months: ${finalCount}`);
  // Write merged output
  fs.writeFileSync(outputFile, JSON.stringify(filteredTx, null, 2));
  console.log(`Saved ${finalCount} transactions to ${outputFile}`);
}
ingest().catch((err) => {
  console.error('Error during ingestion:', err);
  process.exit(1);
});
