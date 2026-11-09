# AI Spending Tracker

A local, single-user dashboard for understanding what you spend on AI products and services: how much, on which providers, and how it changes over time.

It runs entirely in your browser. Data is stored in IndexedDB on your device. There is no backend, account, or network call beyond loading the app itself.

![Overview](docs/screenshots/01-overview-month.jpg)

## Run it locally

Requires Node.js 20+ (tested on Node 24).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. On first visit you'll see the welcome screen:

- **Explore demo data** generates invented data in memory (see [Demo mode](#demo-mode)). Nothing is saved.
- **Choose CSV file** imports your own data, which is then stored in this browser.
- **Download example CSV** saves a file in the expected format.

On later visits your stored data loads automatically. To start over, use **Data → Clear local data**.

Other commands:

```bash
npm test            # financial calculation and data integrity tests
npm run build       # type-check + production build into dist/
npm run preview     # serve the production build
npm run demo:data   # regenerate the synthetic demo pack (see below)
```

## What it does

| Page | What you get |
|---|---|
| **Overview** | Spending for the selected month (default: latest recorded month), previous month, month-over-month change (like-for-like when the month is still in progress), year total, number of providers, a monthly chart stacked by provider (click a bar to open that month), largest contributors, the month's charges, and a current-month estimate. Switch between Month / Year / All time in the header. |
| **Providers** | All providers with all-time total, spending in the selected period, share, transaction count, and first / most recent charge. Search and sort any column. Click a provider for its detail page: monthly chart, recurring-looking patterns, full transaction history, and the merchant descriptors it appears under. |
| **Transactions** | Searchable, sortable table with original merchant descriptors and amounts. Filter by provider and date range (or "Use selected period"). Filters live in the URL, so provider pages and the overview link straight into a filtered view. Click a row to jump to its provider. |
| **Trends** | Monthly spending with a 3-month average, year-over-year by calendar month, yearly totals with like-for-like comparison, biggest increases and decreases by provider (last 3 months vs the 3 before, or year to date vs last year), provider concentration (top-1 / top-3 share, providers making up 80%), and recurring-looking patterns. |
| **Data** | Import more CSVs (with a review step), export everything as CSV, clear local data (requires typing `DELETE`), import history, and the duplicate policy in plain language. |

Works on desktop and mobile, in light and dark mode. Provider colours are assigned once by all-time spend and stay the same across every chart; the 7 largest providers get their own colour and the rest share a grey "Other".

## CSV format

```
Merchant,Provider,Amount,Date
OPENAI *CHATGPT SUBSCR  SAN FRANCISCO,OpenAI,22.99,2026-01-14
```

- Column order and header case don't matter; extra columns are ignored with a warning.
- **Amount** is treated as EUR. Dot decimal, up to 2 decimals, no currency symbol or thousands separator. Negative values (refunds) are accepted.
- **Date** must be a real calendar date in `YYYY-MM-DD`.
- Surrounding whitespace is trimmed; whitespace inside merchant descriptors is kept exactly.

Before anything is saved, the import review shows rows in the file, new rows, rows already stored, and every invalid row with its row number and the reason. Valid rows can be imported while invalid ones are left out.

## Duplicate policy

The source has no transaction IDs, so a record is identified by all four values: **date, provider, merchant descriptor, amount** (exact match).

Identical charges on the same day can be legitimate, so identical rows are never collapsed. Instead counts are compared:

> If a file contains a record **N** times and it's already stored **M** times, **max(0, N − M)** copies are added.

- Re-importing the same file, or an export, adds nothing.
- A newer statement that overlaps an older one adds only the rows that are new.
- A file with two genuinely identical charges keeps both (the review notes it).
- Every skipped row is listed in the review. Nothing is dropped silently.

The duplicate check runs again inside the same IndexedDB transaction that writes the rows, so the result is authoritative.

## Money and precision

Amounts are parsed from text straight into **integer euro cents** (`"12.34"` → `1234`) without going through floating point, and every sum is an integer sum. Floats only appear when drawing chart geometry. Dates are kept as `YYYY-MM-DD` strings and month maths is done in UTC, so time zones can't shift a transaction into another month.

Export writes the same 4-column format with CRLF line endings. Exporting a file in this format reproduces it byte for byte.

## Current-month estimate

Shown on the Overview. It's deliberately simple and deterministic:

1. **Recorded**: everything dated in the current month so far.
2. For each of the previous 3 full months, add up what was spent *after today's day of the month* (e.g. the 10th–31st when today is the 9th).
3. **Estimated additional**: the median of those three amounts. The likely range uses the lowest and highest.
4. **Projected total** = recorded + estimated additional.

The card shows all three inputs, the method in plain language, and which recurring-looking charges usually land later in the month. If there's less than 3 months of history before the current month, or the latest transaction is more than 45 days old, it shows why instead of a number.

For the demo data on 9 Nov 2026: recorded €199.02, estimated additional €394.86, projected €593.88, likely €524.07–€604.83.

## Recurring-looking patterns

These are observations, not confirmed subscriptions. A pattern is a chain of charges from one provider where each charge is in the next calendar month, within 4 days of the previous charge's day of month (or both at month-end), and within 30% of its amount. Charges with the exact same descriptor are chained first, so a subscription isn't interrupted by other charges from the same provider; leftovers are then chained per provider (for descriptors that change every time, like Namecheap's). Descriptors charged 3+ times in one month are treated as usage top-ups and ignored. Chains of 3+ consecutive months are shown, marked **Still appearing** or **Stopped** depending on whether the next charge is due yet.

This separates plan changes cleanly. In the demo data, for example, Claude Pro (€21.78 on the 6th), Max (€108.90 on the 19th) and Pro again (€21.78 on the 19th) show up as three separate patterns.

## Verification

Automated tests (`npm test`) run against a synthetic fixture (`src/lib/__fixtures__/ledger.csv`, 296 invented rows, 24 providers). Expected totals per month, provider and year were computed independently in Python with decimal arithmetic. The tests cover amount parsing and formatting, date maths, CSV validation, export round-trip, the duplicate policy, aggregation against the reference figures, concentration, recurring detection, the forecast (including insufficient-data cases), IndexedDB persistence via `fake-indexeddb`, the demo pack (determinism, validity, part 1 + part 2 rebuilding the full file), and a guard that `public/` contains no CSV except the synthetic pack.

Checked by hand in the browser: import with validation errors and duplicates, persistence after reload, export → re-import (adds nothing), clear data, demo → own data switch, mobile and dark layouts, and a production build served with the Vercel security headers.

### Checking your own data locally

Put real ledgers in `private/`, which git ignores. If any CSV is there, `npm test` also checks each one (every row valid, export round-trip, exact total after storing, re-import adds nothing) without hardcoding any figures. With an empty or missing folder, those checks are skipped.

## Demo mode

**Explore demo data** runs the app on invented data, generated in the browser each time with today as the last day, so the month-end estimate always works. Demo data lives only in memory: it is never written to IndexedDB, and a banner says so on every page. Reloading keeps you in the demo (a single flag in `localStorage`).

When a visitor imports their own CSV (from the banner's **Use my own data** or the Data page), duplicates are checked against stored data only, the demo is discarded, and only their rows are saved. Demo and real data never mix. **Exit demo** returns to the welcome screen. The demo also works when browser storage is blocked (some private windows).

## Hosting on Vercel

The app is a static site: Vercel only serves the files in `dist/`. There are no server functions, and no data is sent anywhere.

1. Import the GitHub repo in Vercel. `vercel.json` sets the Vite framework, `npm run build` and the `dist` output, so no other settings are needed.
2. Deploy. The hash-based routes (`#/providers`) need no rewrites.

What stays private:

- A visitor's CSV is read with the browser's file API and saved in that browser's IndexedDB on their device. It is never uploaded, and nobody else can see it, including you. It is not synced across devices, and it is lost if the visitor clears site data.
- Page filters live after the `#`, which browsers never send to the server.
- `vercel.json` sends a strict **Content-Security-Policy**: the page can only load scripts and make requests to its own origin, so even a bug or injected script can't send data elsewhere. It also sends `Referrer-Policy: no-referrer` and related headers. `npm run preview` uses the same headers, so you can check a production build locally.
- After a successful import the app asks the browser to keep its storage (`navigator.storage.persist()`). Browsers may decline; Safari can still clear storage for sites not visited in a while.
- Vercel keeps normal request logs (IP address, requested file). Those never include CSV contents. Don't add analytics or session-replay tools that record page content.
- Only `public/` and the built app are deployed. The repo holds no real financial data; tests use a synthetic fixture. A test fails if any CSV other than the synthetic pack appears in `public/`.

## Synthetic demo data pack

`public/demo/` holds an invented dataset in the same 4-column format, for demos without showing real spending. **Every transaction in it is made up**: amounts, dates and the plan timeline are not taken from any real ledger.

| File | Use it to show |
|---|---|
| `ai-spending-demo.csv` | The full story: 24 providers, Jan 2025 → the generation date |
| `ai-spending-demo-part1.csv` + `-part2.csv` | Incremental imports: part 2 overlaps part 1 by one month, so the review shows new rows vs "already stored" |
| `ai-spending-demo-errors.csv` | Validation: 6 broken rows (currency symbol, thousands separator, impossible date, wrong date format, missing provider, extra field) plus 2 rows already stored; it adds nothing |
| `manifest.json` | Seed, end date, row count, providers and total for the current files |

It covers 24 providers, including **OpenAI, Anthropic, Cursor, Midjourney, ElevenLabs, Mistral AI, Hugging Face, Replicate, Runway, Groq, Vercel and Supabase**. The data tells a story that exercises every view:

- 2025: a few consumer subscriptions (ChatGPT Plus, GitHub Copilot, Midjourney, Perplexity, Cursor, then Claude Pro) with small monthly FX-style variation, plus annual domain renewals in June and July.
- Plan changes: Midjourney Basic → Standard → cancelled; Claude Pro → Max → Pro; ChatGPT Plus → Pro; Perplexity cancelled after 8 months.
- 2026: building with AI. API usage grows (Anthropic auto-reloads, OpenAI, Mistral, Groq, Replicate), and hosting and tools arrive (Vercel, Supabase, Lovable, AWS, Google Cloud).
- One pair of identical same-day charges (Anthropic €10.00 on 14 Apr 2026), to show that the duplicate policy keeps both.

The in-app demo is generated on the fly and is always current. These files are for presenters, for example to show an import step by step. **Regenerate them before a demo** if you use them, so their dates are recent:

```bash
npm run demo:data
```

Options: `--end YYYY-MM-DD` (default today), `--seed N` (default 2026), `--out DIR` (default `public/demo`). For example, `node scripts/generate-demo-data.ts --end 2026-12-15 --seed 7`. The generator is deterministic: each month's charges depend only on the seed, so moving `--end` adds or removes months at the end without changing the history. Run `npm test` afterwards; one test checks that the committed files match the manifest.

## Screenshots

| | |
|---|---|
| ![Welcome](docs/screenshots/00-welcome.jpg) Welcome screen | ![Year](docs/screenshots/02-overview-year.jpg) Overview, year view |
| ![Providers](docs/screenshots/03-providers.jpg) Providers | ![Provider](docs/screenshots/04-provider-detail.jpg) Provider detail |
| ![Transactions](docs/screenshots/05-transactions-filtered.jpg) Filtered transactions | ![Trends](docs/screenshots/06-trends.jpg) Trends |
| ![Changes](docs/screenshots/07-trends-changes-recurring.jpg) Changes, concentration, recurring | ![Import review](docs/screenshots/08-import-review-errors.jpg) Import review with errors |
| ![Data](docs/screenshots/09-data.jpg) Data management | ![Dark](docs/screenshots/13-overview-dark.jpg) Dark mode |
| ![Mobile](docs/screenshots/10-mobile-overview.jpg) Mobile overview | ![Mobile forecast](docs/screenshots/11-mobile-forecast.jpg) Mobile estimate |
| ![Mobile transactions](docs/screenshots/12-mobile-transactions.jpg) Mobile transactions | |

All screenshots show the synthetic demo data.

## Project layout

```
src/
  lib/            pure logic, no React
    money.ts        cents parsing/formatting
    dates.ts        YYYY-MM-DD / YYYY-MM helpers
    csv.ts          parse + validate, export
    dedupe.ts       duplicate policy
    db.ts           IndexedDB (idb)
    analytics.ts    aggregation, periods, comparisons, concentration
    recurring.ts    recurring-looking pattern detection
    forecast.ts     current-month estimate
    colors.ts       provider colour assignment
    *.test.ts       Vitest suites
    __fixtures__/   synthetic test ledger
  components/     charts, tables, import panel, shared UI
  pages/          Overview, Providers, ProviderDetail, Transactions, Trends, DataPage
  store.tsx       loads data from IndexedDB, shared state
  router.ts       tiny hash router
  lib/demoData.ts   synthetic demo generator (runs in the browser and in the CLI)
scripts/          generate-demo-data.ts (writes the demo pack to disk)
public/demo/      synthetic demo pack (the only data files that get deployed)
vercel.json       Vercel build settings and security headers
private/          your real ledgers for local checks (git-ignored, never committed)
```

Stack: React 19, TypeScript, Vite, Recharts, PapaParse, idb. Dev: Vitest, fake-indexeddb.
