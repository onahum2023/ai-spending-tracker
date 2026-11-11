# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). The version shown in the app (**Data → About**) comes from `package.json`.

## [Unreleased]

## [0.1.0] - 2026-11-11

First public release. Versions before 1.0.0 may still change how the app behaves or what it stores; the project is usable, but not yet declared stable.

### Added
- Local dashboard for AI spending: Overview (month, quarter, year), Providers, Provider detail, Transactions and Trends, with a current-month estimate.
- In-browser statement extractor: drop bank or card exports (Excel, CSV, Revolut PDF) and the app picks out the AI charges, with a review step and an optional **Ask Claude** helper that uses your own Anthropic API key.
- Ledger CSV import and export with a documented duplicate policy and exact integer-cent arithmetic.
- Subscriptions page: run-rate, 30-day calendar, price changes, stopped subscriptions, overlap and savings, derived from charge types.
- Charge types set once per provider (Subscription monthly or yearly, Usage, One-time), with labels, categories and tag rules.
- Budgets, tags, a quarterly export and deleting a charge imported by mistake.
- Demo mode on invented data, and a synthetic demo pack.
- Landing page, privacy statement checked against the code by tests, and an About card with version, build and third-party licenses.
- Strict Content-Security-Policy and security headers for the Vercel deployment.

### Notes
- All data stays in the browser (IndexedDB). There is no backend, account, cookie or analytics.
- Released under the Apache License 2.0.

[Unreleased]: https://github.com/onahum2023/ai-spending-tracker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/onahum2023/ai-spending-tracker/releases/tag/v0.1.0
