# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). The version shown in the app (**Data → About**) comes from `package.json`.

## [Unreleased]

### Changed
- Overview is chart first. The five summary cards, the "In progress" pill and the "charge types still follow the app's suggestion" line are gone. A header over the chart gives the total ("November 2026 so far", "October 2026 total", "2026 so far", "All time") and, for the month in progress, "at least €X by month end" with a hatched swatch. The "so far" estimate card and the Monthly budget card are replaced by plain rows beside the chart: Compared with, Still due this month, and Budget.
- The chart fills its card. The selected month is solid and the others faded; for the month in progress the charges still due are stacked on its bar as hatched segments in each series' colour, with a "≥ €X" label. The y-axis ends just above the tallest bar, projection included.
- Clicking a bar now changes the period, like the date selector does (Year view switches to Month view for that month). This reverses the previous release, where a bar opened a side sheet of that month's transactions. The side sheet is removed; the way into a month's transactions is the "Charges in <month>" card (top 5, Show all, Open in Transactions). The closed-month card (a month's total split by commitment type) is removed with it; the Commitment grouping of the chart shows the same split.
- Changes in the side column use an arrow in the accent colour, not red.
- One "as of" date everywhere on the Overview: the last import. The same-point-in-previous-month comparison now counts the days up to that date, not up to today.
- One card standard, applied to every page: a shared `Card` (20px padding, 12px radius, 1px border, no shadow, 16px between cards) with a header (15px title, one-line 13px subtitle, an accent text action top right with a trailing arrow, and the "Estimate" / "App's read" pill after the title), sections separated by dividers, and one type scale for body, meta, key figures (20px) and the hero amount (32px). Amounts use tabular numerals; changes are an arrow in the accent colour, never red or green.
- Three kinds of pill only: neutral (a fact about state), inferred (the app's read) and attention (worth a look). Tables, buttons, inputs, segmented controls and the page header follow one style each; page padding is 32px on desktop, 16px on mobile.
- Provider page follows the Overview: a chart card (the provider's months for the selected year, bar click picks the month, hatched still-due charges on the current month, x-axis from its first charge) and an "At a glance" card (all-time figures, tag for new charges, category), then Charge types full width. The five stat cards are gone.
- Charge types are read by default: label or statement description, type as text, charges, total, last charge and pills. The label box, type menu and helper text moved into the row that opens, with the pattern details. The "Confirmed" pill is gone; "App's guess" shows only while a type is not confirmed. The "Confirm all" button counts guesses.
- Provider colours: the dark-green slot is no longer used, so the six providers with their own colour (blue, orange, aqua, yellow, pink, violet) are easier to tell apart, including when faded; the rest are "Other".

## [0.2.0] - 2026-11-11

### Changed
- Five pages, organised by question: Overview (how much), Providers (who), Insights (what it says), Transactions, Data. The ledger is shown plainly; anything the app worked out is marked **App's read** or **Estimate**, with the reasoning one click away.
- The Subscriptions page is gone. Per-provider details are on the provider page (each charge type opens to what the app reads about it), and price changes, stopped, overlap and savings are in Insights. `#/subscriptions` opens Overview.
- Trends is now **Insights**, grouped into Patterns, Shifts, Suggestions and Comparisons. `#/trends` opens Insights.
- The monthly run-rate, "per year if nothing changes" and the next-30-days list are removed.
- **Month-end estimate** is conservative: "At least €X" = recorded so far plus only recurring charges with strong evidence (confirmed by you, or found by the pattern rule with the latest charge last month), each at its last actual charge. The likely range is gone. "Still to come" is counted from the latest recorded charge, not from today, and the card says "As of last import" (with a note and a link to Data when the data is more than 7 days old). Usage is not projected and shows on its own line; one-time charges never feed the estimate. Budgets use the same figure.
- The estimate card follows the period picker: the month in progress shows the estimate; a closed month shows its total split by commitment type (subscriptions, usage, one-time you confirmed, unclassified), each line opening the month's transactions of that type; Year and All time hide the card.
- Clicking a bar in the monthly chart opens a side sheet with that month's transactions, largest first, with a link to the filtered Transactions page. The "vs same point" and "Month over month" cards open it too, for the month they compare against.
- A comparison card gets one short line when either period holds one-time charges you confirmed (never a suggestion): "−€26.45 without one-time", with the sign never wrapping. The detail is in its tooltip and in the month drill-down.
- In the month drill-down, a confirmed type shows as it is, a suggestion shows muted as "Suggested: …", and a guess of one-time or an unknown type shows no pill.
- Charge types that carry the same label are read as one plan: grouped in the Charge types table and chained in pattern detection.
- Overview's monthly chart can be grouped by commitment type (subscription, usage, one-time).
- Providers shows a trend arrow per provider (last 3 complete months against the 3 before, one-time charges left out; an arrow only when the change is more than 5% and more than €5) and can be filtered by category and commitment type.
- The period picker has a Today button: the current month in Month mode, the current year in Year mode, hidden for All time, disabled while it is already selected, and it closes the month drill-down.
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

[Unreleased]: https://github.com/onahum2023/ai-spending-tracker/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/onahum2023/ai-spending-tracker/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/onahum2023/ai-spending-tracker/releases/tag/v0.1.0
