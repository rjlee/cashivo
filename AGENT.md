# AGENT Overview

This document provides a high-level overview of the Cashivo application—its purpose, architecture, data flow, commands, and key conventions. Refer to `CONVENTIONS.md` for detailed coding and naming guidelines, and `ROADMAP.md` for upcoming features.

## 1. Purpose

Cashivo is a Node.js financial budgeting tool that:

- Ingests raw banking transactions from CSV, QIF, or QFX files.
- Categorizes transactions via pass-through, rules, AI chat, or embedding-based classifiers.
- Generates monthly and annual summaries, including charts and statistics.
- Serves interactive HTML and JSON reports via an Express web server.

## 2. Project Structure

```
├── import/               # Drop CSV/QIF/QFX files here for ingestion
├── data/                 # Generated JSON outputs (transactions.json, transactions_categorized.json, summary.json, etc.)
├── categories/           # Default/pass-through category rules & groups
├── src/
│   ├── ingest.js         # CLI: ingest raw transactions
│   ├── categorize.js     # CLI: classify transactions
│   ├── summary.js        # CLI: generate summary JSON & console report
│   ├── server.js         # Express web server serving HTML/JSON
│   ├── routes/           # Express routers for manage & insights endpoints
│   ├── controllers/      # View rendering logic using EJS templates
│   └── services/         # Summary data loader & QIF export
├── public/               # Static assets (JS, CSS)
│   ├── charts.js         # Chart.js initialization scripts
│   ├── insights.js       # Browser interactivity scripts
│   └── styles.css        # Stylesheet
├── views/                # EJS templates for HTML pages
├── evaluate.js           # Optional CLI: evaluate classifier accuracy
├── CONVENTIONS.md        # Coding/variable/chart naming conventions
├── ROADMAP.md            # Remaining PR roadmap for future enhancements
├── AGENT.md              # This overview file
├── README.md             # User-facing documentation & usage
├── package.json          # Dependencies & scripts
├── Dockerfile            # Docker build file (optional)
└── docker-compose.yml    # Docker Compose config (optional)
```

## 3. Data Flow

1. **Ingest** (`npm run ingest`) → parses files in `import/` to `data/transactions.json`.
2. **Categorize** (`npm run categorize [--rules|--pass|--ai|--emb]`) → assigns categories (legacy rules, pass-through, embeddings, or AI).
3. **Summarize** (`npm run summary`) → builds `data/summary.json` and prints console report.
4. **Serve** (`npm run serve`) → serves HTML/JSON via Express endpoints:
   - `/years`, `/years/:year`, `/years/:year/:month`, `/years/:year/:month/category/:category`, `/api/summary`

## 4. Key Commands

- `npm run ingest` – Ingest raw files into JSON.
- `npm run categorize [--rules|--pass|--ai|--emb]` – Classify transactions (keyword rules, pass-through, embeddings, or AI).
- `npm run summary [--currency=USD]` – Generate summary JSON & console output.
- `npm run evaluate` – Evaluate classification accuracy.
- `npm run serve` – Launch web server on port 3000 (Basic Auth optional).
- `npm test` – Run unit and integration tests via Jest.
- `npm run lint` – Check code quality with ESLint.
- `npm run format` – Auto-format code with Prettier.
- `npm run format:check` – Verify code formatting matches Prettier rules.
- `npm run prepare` – Install Husky Git hooks (run once after clone).

## 5. Configuration

- Copy `.env.example` to `.env` and set:
  - `DEFAULT_CURRENCY`, `OPENAI_API_KEY`, `USERNAME`, `PASSWORD`, `START_MONTH`, `END_MONTH`.

## 6. Conventions & Roadmap

- Chart & variable naming: see `CONVENTIONS.md`.
- Upcoming features: see `ROADMAP.md` (PRs #5–#9).
 
## 7. Testing & CI/CD

- **Tests**
  - Run `npm test` to execute all Jest tests (unit & integration).
- **Linting & Formatting**
  - Run `npm run lint` to check code with ESLint.
  - Run `npm run format` to auto-format code with Prettier.
  - Run `npm run format:check` to verify formatting without modifying files.
- **Pre-commit Hooks**
  - Husky is configured via `npm run prepare` and runs `lint-staged` on staged files to enforce linting and formatting before commits.
- **CI Pipeline**
  - GitHub Actions workflow (`.github/workflows/ci.yml`) automatically installs dependencies, lints, and runs tests on pushes and pull requests to `main`.

---

_Generated to provide a quick entry point for new contributors._
