# Cashivo

This Node.js application helps with financial budgeting by:

1. Ingesting banking transactions from CSV files
2. Categorizing transactions into defined categories
3. Providing a monthly overview summary of income, expenses, savings rate, and top spending categories

## Setup

1. Navigate to the `cashivo` directory (project root)
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the example environment file and configure variables:
   ```bash
   cp .env.example .env
   # Then edit .env with your settings
   ```

## Usage

Run the full pipeline (default currency is GBP). Place your CSV files into the `import/` directory in the `cashivo` project root:

```bash
npm run start
```

Or run individual steps (use --currency=XXX to override, e.g. --currency=USD):

- Ingest transactions:
  ```bash
  npm run ingest
  ```
  Place transaction files (CSV/QIF/QFX) in the `import/` directory.
  Supported formats include (auto-selects a default classifier per format):
- moneyhub (CSV exports with DATE, DESCRIPTION, AMOUNT columns) → uses pass-through classification by default
- qif (Quicken Interchange Format) → uses keyword-rules classification by default
- qfx (QuickBooks Financial Exchange / OFX) → uses keyword-rules classification by default

  - qif (Quicken Interchange Format)
  - qfx (QuickBooks Financial Exchange / OFX)
    Auto-detection will pick the right importer based on file content.
    You can also force a format using the `--format` flag or the
    `INGEST_FORMAT` environment variable. For example:

  ```bash
  # Force Moneyhub CSV import
  npm run ingest -- --format=moneyhub

  # Force QIF import
  npm run ingest -- --format=qif

  # Or via env var
  INGEST_FORMAT=qfx npm run ingest
  ```

- Categorize transactions (default pass-through: uses originalCategory for each transaction):
  ```bash
  npm run categorize
  ```
- Categorize transactions (keyword rules via categories.json):
  ```bash
  npm run categorize -- --rules
  ```
- Categorize transactions (AI-based, requires OPENAI_API_KEY; default 10 parallel requests, override with AI_CONCURRENCY):
  ```bash
  npm run categorize -- --ai
  ```
- Categorize transactions (Embedding-based, requires OPENAI_API_KEY; default 10 parallel embedding calls, override with AI_CONCURRENCY):
  ```bash
  npm run categorize -- --emb
  ```
- Pass-through classification (assigns each transaction to its originalCategory field):
  ```bash
  npm run categorize -- --pass
  ```
- Generate summary:
  ```bash
  npm run summary
  ```
- Evaluate classifier accuracy (optional):
  ```bash
  npm run evaluate
  ```
  **Serve HTML/JSON summary via a local web server:**

```bash
npm run serve
```

Available endpoints (protected by Basic Auth if USERNAME & PASSWORD are set):

- GET `/` → Redirect to `/years`
- GET `/manage` → Management page (upload files & reset data)
- POST `/manage` → Process uploaded files and show results
- GET `/api/summary` → Download raw summary JSON
- GET `/years` → Annual summaries index page
- GET `/years/:year` → Yearly summary page (HTML)
- GET `/years/:year/:month` → Monthly summary page (HTML)
- GET `/years/:year/:month/category/:category` → Category drill-down page (HTML)

Results are stored in the `data` directory:

- `transactions.json`: Raw ingested transactions
- `transactions_categorized.json`: Transactions with assigned category
- `summary.json`: Monthly overview summary (and more, see below)

## Docker / Deployment

You can containerize and run the app with Docker:

1. Build the Docker image:
   ```bash
   docker build -t cashivo .
   ```
2. Run the container (set USERNAME/PASSWORD for auth, DEFAULT_CURRENCY to override):
   ```bash
   docker run -p 3000:3000 \
     -e USERNAME=you -e PASSWORD=secret \
     -e DEFAULT_CURRENCY=USD \
     cashivo
   ```
3. Or start with Docker Compose:
   ```bash
   docker-compose up --build
   ```

## Advanced Configuration

You can enable additional reports by adding optional JSON files in the `cashivo` root, and configure AI categorization:

- `budgets.json`: Monthly budgets per category. Example:
  ```json
  {
    "groceries": 500,
    "utilities": 200
  }
  ```
- `goals.json`: Savings goals definitions. Example:
  ```json
  {
    "Emergency Fund": { "category": "transfers", "target": 5000 },
    "Vacation": { "category": "transfers", "target": 2000 }
  }
  ```
- `category-groups.json`: Custom grouping of categories (defaults provided).
- `deductible-categories.json`: List of tax-deductible categories. Example:
  ```json
  ["healthcare", "education", "charity"]
  ```

Environment variables and flags:

- `USE_AI=true` or `--ai` on the categorize command to enable AI chat-based classification
- `USE_EMBEDDINGS=true` or `--emb` to enable local embedding-based classification
- `USE_PASS=true` or `--pass` to explicitly use originalCategory (pass-through) for classification
- `START_MONTH=YYYY-MM` to include transactions from this month onward
- `END_MONTH=YYYY-MM` to include transactions up to and including this month
  (either or both may be set)
- `USE_RULES=true` or `--rules` to use keyword rules classifier (categories.json)
- `OPENAI_API_KEY` required when AI or embedding modes are enabled
- `--currency=XXX` to override default currency (GBP)
- `USERNAME` and `PASSWORD` environment variables enable HTTP Basic Auth (protects all HTML & API endpoints when both are set)
- `AI_CONCURRENCY=N` to change parallel request count for AI/embeddings (default 10)
- `OPENAI_MODEL` to customize chat model (default gpt-3.5-turbo)
- `OPENAI_EMBEDDING_MODEL` to customize embedding model (default text-embedding-ada-002)

After running `npm run start`, the file `data/summary.json` contains full reports:

- `monthlyOverview`
- `categoryBreakdown`
- `trends`
- `lifestyle`
- `merchantInsights`
- `budgetAdherence` _(if `budgets.json` is provided)_
- `savingsGoals` _(if `goals.json` is provided)_
- `anomalies`
- `yearlySummary`
