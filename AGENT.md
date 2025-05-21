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
├── data/                 # Generated JSON outputs (transactions.json, summary.json, etc.)
├── categories/           # Default/pass-through category rules & groups
├── src/
│   ├── ingest.js         # CLI: ingest raw transactions
│   ├── categorize.js     # CLI: classify transactions
│   ├── summary.js        # CLI: generate summary JSON & console report
│   ├── summaryModule.js  # Shared: load summary & render HTML pages
│   └── server.js         # Express web server serving HTML/JSON
├── evaluate.js           # Optional CLI: evaluate classifier accuracy
├── CONVENTIONS.md        # Coding/variable/chart naming conventions
├── ROADMAP.md            # Remaining PR roadmap for future enhancements
├── AGENT.md              # This overview file
├── README.md             # User-facing documentation & usage
├── package.json          # Dependencies & scripts
└── Dockerfile/docker-compose.yml (optional)
```

## 3. Data Flow

1. **Ingest** (`npm run ingest`) → parses files in `import/` to `data/transactions.json`.
2. **Categorize** (`npm run categorize [--rules|--ai|--emb]`) → assigns categories.
3. **Summarize** (`npm run summary`) → builds `data/summary.json` and prints console report.
4. **Serve** (`npm run serve`) → serves HTML/JSON via Express endpoints:
   - `/years`, `/years/:year`, `/years/:year/:month`, `/years/:year/:month/category/:category`, `/api/summary`

## 4. Key Commands

- `npm run ingest` – Ingest raw files into JSON.
- `npm run categorize [--rules|--ai|--emb]` – Classify transactions.
- `npm run summary [--currency=USD]` – Generate summary JSON & console output.
- `npm run evaluate` – Evaluate classification accuracy.
- `npm run serve` – Launch web server on port 3000 (Basic Auth optional).

## 5. Configuration

- Copy `.env.example` to `.env` and set:
  - `DEFAULT_CURRENCY`, `OPENAI_API_KEY`, `USERNAME`, `PASSWORD`, `START_MONTH`, `END_MONTH`.

## 6. Conventions & Roadmap

- Chart & variable naming: see `CONVENTIONS.md`.
- Upcoming features: see `ROADMAP.md` (PRs #5–#9).

---

_Generated to provide a quick entry point for new contributors._
