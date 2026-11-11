# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). The version shown in the app (**Data → About**) comes from `package.json`.

## [Unreleased]

### Changed
- Five pages, organised by question: Overview (how much), Providers (who), Insights (what it says), Transactions, Data. The ledger is shown plainly; anything the app worked out is marked **App's read** or **Estimate**, with the reasoning one click away.
- The Subscriptions page is gone. Per-provider details are on the provider page (each charge type opens to what the app reads about it), and price changes, stopped, overlap and savings are in Insights. `#/subscriptions` opens Overview.
- Trends is now **Insights**, grouped into Patterns, Shifts, Suggestions and Comparisons. `#/trends` opens Insights.
- The monthly run-rate, "per year if nothing changes" and the next-30-days list are removed.
- **Month-end estimate** is conservative: "At least €X" = recorded so far plus only recurring charges with strong evidence (confirmed by you, or found by the pattern rule with the latest charge last month), each at its last actual charge. The likely range is gone. Usage is not projected and shows on its own line; one-time charges never feed the estimate. Budgets use the same figure.
- The estimate card follows the period picker: the month in progress shows the estimate; a closed month shows its total split by commitment type (subscriptions, usage, one-time you confirmed, unclassified), each line opening the month's transactions of that type; Year and All time hide the card.
- Clicking a bar in the monthly chart opens a side sheet with that month's transactions, largest first, with a link to the filtered Transactions page. The "vs same point" and "Month over month" cards open it too, for the month they compare against.
- A comparison card gets one short line when either period holds one-time charges you confirmed (never a suggestion): "−€26.45 without one-time", with the sign never wrapping. The detail is in its tooltip and in the month drill-down.
- In the month drill-down, a confirmed type shows as it is, a suggestion shows muted as "Suggested: …", and a guess of one-time or an unknown type shows no pill.
- Charge types that carry the same label are read as one plan: grouped in the Charge types table and chained in pattern detection.
- Overview's monthly chart can be grouped by commitment type (subscription, usage, one-time).
- Providers shows a trend arrow per provider (last 3 complete months against the 3 before, one-time charges left out; an arrow only when the change is more than 5% and more than €5) and can be filtered by category and commitment type.
- The "charge types still to review" banner is replaced by a single link on Overview.

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
