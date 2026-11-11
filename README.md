# AI Spending Tracker

A local, single-user dashboard for understanding what you spend on AI products and services: how much, on which providers, and how it changes over time.

Everything runs in your browser and your data is never uploaded, unless you choose to ask Claude about statement lines with your own Anthropic API key. Data is stored in IndexedDB on your device. There is no backend, account, cookie or analytics. See the [privacy statement](src/content/privacy.ts) (served as `/privacy.html`).

The app is meant to be **run locally** (see below). A hosted copy at <https://ai-spend-tracker.neotixhq.com> works as a demo, and you can use it with your own data too if you prefer not to run it yourself: it behaves the same, and your data stays in your browser either way.

![Overview](docs/screenshots/01-overview-month.jpg)

## Run it locally

Requires Node.js 20+ (tested on Node 24).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 for the landing page, then **Explore demo data** or **Import your own data**, or go straight to the app at http://localhost:5173/app.html (on Vercel: `/app`). Old links such as `/#/subscriptions` and `/#/trends` still work: the landing page sends them to the app, which opens Overview and Insights. On first visit the app shows the welcome screen:

- **Explore demo data** generates invented data in memory (see [Demo mode](#demo-mode)). Nothing is saved.
- **Bank or card statements**: drop the exports you already download from your bank or card; the app picks out the AI charges (see [Statement extractor](#statement-extractor)).
- **Ledger CSV**: import a file that is already in the ledger format. **Download example CSV** saves one to look at.

On later visits your stored data loads automatically. To start over, use **Data → Clear local data**.

Other commands:

```bash
npm test            # financial calculation and data integrity tests
npm run build       # type-check + production build into dist/
npm run preview     # serve the production build
npm run demo:data   # regenerate the synthetic demo pack (see below)
npm run licenses    # rewrite public/third-party-notices.txt from the lockfile (run after changing dependencies)
npm run licenses:check  # fail on a non-permissive dependency license or an out-of-date notices file
```

## What it does

| Page | What you get |
|---|---|
| **Overview** (how much) | Spending for the selected month (default: latest recorded month), previous month, month-over-month change (like-for-like when the month is still in progress; when either period holds one-time charges, a second line names them and shows the comparison without them), year total, number of providers, a monthly chart stacked by provider, category or commitment type (subscription / usage / one-time; click a bar to open that month), largest contributors, the month's charges, a current-month estimate ("at least", from recorded charges plus recurring ones still due), and an optional monthly budget shown against it. A small link says how many charge types still follow the app's suggestion and leads to Providers. Switch between Month / Year / All time in the header. |
| **Providers** (who) | All providers with all-time total, spending in the selected period, a **trend arrow** (the last 3 complete months against the 3 before, one-time charges left out; an arrow only when the change is more than 5% and more than €5, otherwise flat), share, transaction count, and first / most recent charge. Search, sort any column, and filter by category and commitment type. Click a provider for its detail page: monthly chart, its **subscriptions** (what the app reads as recurring there, each row opening to schedule, next charge, price history, overlap, type status and the raw descriptor, plus stopped ones and whether anything still charges), its **charge types** (the one place to say what each is, with a label, category and tag rule), and its full transaction history. A "To review" column shows how many charge types you have not confirmed yet. |
| **Transactions** | Searchable, sortable table with original merchant descriptors and amounts. Filter by provider and date range (or "Use selected period"). Filters live in the URL, so provider pages and the overview link straight into a filtered view. Click a row to jump to its provider. Each charge can carry a tag (Personal, Business, a client), singly or for everything shown at once, and a charge imported by mistake can be deleted (with a confirmation). The type of a charge is shown but not changed here: it links to the provider page. |
| **Insights** | What the data says, in four groups. **Patterns**: monthly spending with a 3-month average, subscription, usage and one-time over time ("more tools or more usage?"), and recurring-looking patterns. **Shifts**: price changes ("went from €22.49 to €109.38 in Jun") and stopped subscriptions with a check that nothing still charges. **Suggestions**: overlapping tools ("2 chat assistants · €130/month combined") and what ending each would save. **Comparisons**: year-over-year by calendar month, yearly totals with like-for-like comparison, biggest increases and decreases by provider (last 3 months vs the 3 before, or year to date vs last year), and provider concentration. Anything the app worked out is marked **App's read**, with the reasoning behind a "How are these found?" toggle. See [Insights](#insights). |
| **Data** | Import more CSVs (with a review step), export all transactions as CSV (budgets, corrections, labels, categories and tag rules are not in the file), export one quarter (optionally one tag) for expense claims, clear local data (requires typing `DELETE`), import history, and the duplicate policy in plain language. |

**The ledger is fact, everything else is inference.** Amounts, dates and providers are shown plainly. Anything the app worked out (a subscription, a next charge, a stopped one, an estimate, a charge's type) is marked as the app's read or an estimate, and the reasoning is one click away.

Works on desktop and mobile, in light and dark mode. Provider colours are assigned once by all-time spend and stay the same across every chart; the 7 largest providers get their own colour and the rest share a grey "Other".

## Statement extractor

Most people do not have a clean ledger; they have bank and card statements. The extractor turns those into ledger rows, in the browser:

1. **Read.** Drop one or more files on the welcome screen or the Data page.
   - **Excel (.xlsx) or CSV** exports: the header row and columns are found by name (English, Dutch, German, French), including the American Express transaction export and common bank CSVs (Revolut, ING-style "Af/Bij"). Day/month order and whether charges are positive or negative are worked out from the data.
   - **Revolut PDF statements**: only settled *Account transactions* are used; Pending, Reverted, Pockets and Deposit sections are skipped.
   - Lines that appear in two overlapping files are counted once. Old `.xls`, scanned PDFs and other banks' PDFs are refused with a clear message (export CSV instead).
2. **Decide.** Each line is matched against a vendor catalog (`src/lib/extract/vendors.ts`, about 60 AI vendors plus the hosting, domain and dev-tool services AI projects run on). Every decision carries its reasons:
   - **Provider and type** come from the descriptor where it says so: `CLAUDE.AI SUBSCRIPTION` / `ANTHROPIC* CLAUDE SUB` → subscription, `CLAUDE CERT` → certification, plain `Anthropic` → API usage, `CHATGPT SUBSCR` → subscription, `CHATGPT CREDIT` → usage.
   - **When the descriptor can't tell** (e.g. Lovable sells plans and credit top-ups under one name), the charge pattern decides: repeating monthly at a similar amount → subscription, otherwise usage.
   - **Look-alikes are caught**: Amazon shop purchases are not AWS; `Bck*gamma Utrecht` could be the Gamma DIY store rather than the Gamma AI app; Google One is usually storage. These go to **Needs review** or **Not AI** with the reason shown.
   - Unknown names that look like AI products (`.ai`, `GPT`, ...) go to review. Card repayments, transfers and savings movements are excluded.
   - Hosting, domains and dev tools can be switched off with one checkbox.
3. **Review.** Three tabs (AI charges, Needs review, Not AI). Change any provider or type, or move a line between tabs. Then **Add to the ledger** (duplicates already stored are skipped) or **Download as CSV**.

The statement extractor records a finer type per charge (Subscription, Usage / credits, Certification, Domains, Hosting / infra, Other). It is stored with each transaction and exported as an optional `Type` column. The app itself reads every charge as one of three types, [Subscription, Usage or One-time / Other](#charge-types): Certification, Domains, Hosting and Other count as One-time / Other.

### Ask Claude (optional)

Not needed: without an Anthropic API key, review each **Needs review** line yourself with Include / Exclude. Everything else works the same. Only Anthropic is supported for this step.

For lines still in **Needs review**, **Ask Claude** sends them to Claude (`claude-opus-5-5`, with Anthropic's server-side refusal fallback) using the user's **own** Anthropic API key, straight from the browser to `api.anthropic.com`. Only the review lines are sent, and only: date, amount, the line's description exactly as the bank wrote it (it can include a city or a payment reference), the bank's short name, foreign amount, country and the rules' note. No file names, other columns or other lines. Check the preview and leave out any line you would rather not send. **Show exactly what is sent** displays the payload before anything goes out. Answers come back as structured data; low-confidence answers stay in review. The key stays in memory unless "Remember on this device" is ticked. Nothing is sent unless the button is pressed.

### Adding a vendor

Append an entry to `VENDORS` in `src/lib/extract/vendors.ts`: the provider name, `group` (`ai` or `infra`), a `match` pattern for the upper-cased descriptor, optional `services` for descriptors that name the charge type, and a default `type` (or `'auto'` to decide from the charge pattern). Add a case to `src/lib/extract/extract.test.ts` and run `npm test`. Keep patterns specific: a bare word like `GAMMA` also matches unrelated shops.

## CSV format

```
Merchant,Provider,Amount,Date
OPENAI *CHATGPT SUBSCR  SAN FRANCISCO,OpenAI,22.99,2026-01-14
```

- Column order and header case don't matter. Optional columns: `Type` (Subscription, Usage, ...) and `Tag` (free text, up to 40 characters). Other extra columns are ignored with a warning.
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

Export writes the same 4-column format with CRLF line endings (plus `Type` and `Tag` columns when any charge has one). Exporting a file in this format reproduces it byte for byte.

## Current-month estimate

Shown on the Overview. It is deliberately conservative: a floor for the month, not a forecast.

1. **Recorded so far**: everything dated in the current month, exactly as recorded.
2. **Still to come**: only recurring charges with strong evidence that are due later this month. Strong evidence is a subscription you **confirmed** on its provider's page, or one the pattern rule found (the same provider on a similar day and amount for 3+ months in a row) whose latest charge was in the **previous month**. A new price seen only once or twice does not count. Each counts at its charge type's **last actual charge**, never an average.
3. **At least** = recorded + still to come. That is the headline ("At least €X"). There is no range.
4. **Usage** (pay as you go) is not projected and not in the headline. One line, "Usage so far this month", shows what has been spent on it. **One-time** charges never feed the estimate.

The card shows the three figures, the recurring charges still due (each with its date and amount), and the method in plain language. If there is no data, or the latest transaction is more than 45 days old, it shows why instead of a number. Budgets use the same figure: a budget is "at risk" only when recorded plus what is still due already passes it.

## Recurring-looking patterns

These are observations, not confirmed subscriptions. A pattern is a chain of charges from one provider where each charge is in the next calendar month, within 4 days of the previous charge's day of month (or both at month-end), and within 30% of its amount. Charges with the exact same descriptor are chained first, so a subscription isn't interrupted by other charges from the same provider; leftovers are then chained per provider (for descriptors that change every time, like Namecheap's). Descriptors charged 3+ times in one month are treated as usage top-ups and ignored. Chains of 3+ consecutive months are shown, marked **Still appearing** or **Stopped** depending on whether the next charge is due yet.

This separates plan changes cleanly. In the demo data, for example, Claude Pro (€21.78 on the 6th), Max (€108.90 on the 19th) and Pro again (€21.78 on the 19th) show up as three separate patterns.

## Charge types

Every charge is one of three things, by how it is billed:

| Type | Meaning |
|---|---|
| **Subscription** | A fixed amount on a schedule, **monthly** or **yearly**. |
| **Usage** | Pay as you go: API credits, top-ups, overages. Amounts and timing vary. |
| **One-time / Other** | Everything else. |

The app guesses, and you confirm. In order, a charge is:

1. whatever you set for its **charge type** (see below), else
2. a **monthly subscription** if it is part of a detected pattern (monthly, similar day and amount, 3+ months in a row, or a new price straight after a pattern ended: see [Plan switches](#insights)), else
3. what the statement import or a `Type` column said (Subscription, Usage; Certification, Domains, Hosting and Other count as One-time / Other), else
4. **Usage** if the same charge type has been charged 3 or more times without a monthly rhythm, else
5. **One-time / Other**.

**Yearly subscriptions are never detected.** One renewal a year cannot be told from a one-off charge, so a yearly subscription is always something you set. The amount is the last charge, and the next renewal is estimated a year after it and labelled "estimated" until a real renewal has been seen. If the date passes, it shows as "renewal not seen yet" and is still counted for 60 days. After that it moves to Stopped. In the run-rate it counts as a twelfth per month; in the 30-day calendar it appears, at its full amount, when a renewal is near.

**Charge types.** A charge always belongs to a provider. Under a provider, the statement description tells the kinds of charge apart: Anthropic's `CLAUDE SUB` is a subscription, plain `Anthropic` is API usage. Each kind is a **charge type**. The description is cleaned first, so reference codes (Namecheap's `NAME-CHEAP.COM* PTOOH4`), the padded city, "INC." and capitals do not split one charge type into many: in the test ledger 49 raw descriptions become 31 charge types, and 18 of Namecheap's 19 coded descriptions become one. Only codes that mix letters and digits are removed: a code made only of letters (the 19th) looks like a word, so it stays and splits a charge type. That is visible and you can confirm each, whereas guessing wrongly would silently merge different products (`PADDLE.NET* CURSOR` and `PADDLE.NET* NOTION` are different things). When a service bills a plan and its usage in one charge (Vercel, for example) the data cannot separate them: set it to Subscription and accept that the amounts will vary.

**Reviewing charge types.** A provider's page lists its charge types with the number of charges, the total, the last charge and what the app suggests. Choose Subscription · monthly, Subscription · yearly, Usage or One-time / Other: the setting applies to every charge of that type, past and future (a file imported later is matched the same way). A charge type you have not set is marked **To review** and shows the app's suggestion, and why on hover; **Confirm** accepts it, **Confirm all** does the whole provider. The Providers page counts what is still to review, and the Subscriptions page says so too. Confirming a monthly Subscription never disagrees with what the app already counted. Detection runs once, on everything that could be a monthly subscription (charge types you confirmed and ones you have not touched, together), so confirming only some of a chain's charge types cannot cut it in two, two plans that share a charge type are both counted, and one subscription whose description alternates between two charge types is counted once. A charge detection could not place joins a pattern that has the same charge type and keeps its billing day: it revives a *stopped* one at any price (a subscription that returned after a long gap), and follows an active one only as its next monthly renewal at a plausible amount (within 60% of the last one, so a price change or discount passes and a stray €3 charge does not), which keeps the dates and amount moving on after a revival. A charge in the same month near an active pattern's day is noise. Matching is by best fit across all the leftover charges of all confirmed types at once, never in date order. In order of weight: a reference the pattern has already shown (a changed or missing reference counts for nothing, neither for nor against), then an amount within the plausible range, then the closest billing day, then the closest amount. A pattern a plan switch already continued is revived only by a charge the plan that replaced it cannot take as its own next renewal and that is closer to the old billing day, and the two are then no longer counted as a switch. A stopped pattern that a later pattern of the same charge type picked up at the same price (within 2%) is never revived: a billing day that drifts, or a missed month, looks exactly like that, and automatic detection counts the pair once, so Confirm does too (the cost: a twin schedule at the identical price that starts after the first stopped cannot be told apart from it). One case cannot be told apart: a charge a few days from a schedule's billing day, at a plausible amount, in the following month looks like a discounted renewal, so if it is really another schedule's charge Confirm will show the lower amount. What is left of a charge type that no active pattern covers is one subscription counted from its latest charge. A yearly Subscription is always one per charge type, because a single renewal a year cannot be detected. A test generates thousands of ledgers (partial confirms, schedules a few days apart, missed months, returns with and without their reference, stray charges, refunds, alternating descriptions) to check that confirming never splits, drops or swaps a schedule already counted and keeps its latest charge a plausible renewal. Settings are stored in this browser (removed by **Clear local data**; in demo mode kept in memory only) and never change a charge or a total. Settings saved by earlier versions under a raw description still match, and "subscription" becomes Subscription · monthly, "ignore" becomes One-time / Other.

**One plan under two names.** If two or more charge types of the same provider carry the same label ("Claude Pro" on both `CLAUDE.AI SUBSCRIPTION` and `ANTHROPIC* CLAUDE SUB`), the app reads them as one plan: they sit together under the plan's name in the Charge types table, charges of the plan are chained across the descriptors when detecting patterns, its usage counts and "still charging" checks look at the whole plan, and a plan is shown as stopped only when none of its descriptors is still running. Each descriptor keeps its own type and status, and the ledger keeps every original descriptor. Remove a label to separate them again.

**Where things are changed.** The provider page changes how charges are interpreted: type, label, category and tag rule. The Transactions page changes nothing about interpretation: it only holds the facts and notes on a single charge (tags, and deleting a charge). Overview and Insights are derived and read-only. A **label** such as "Claude Pro" is shown instead of the description (which stays on hover); a **category** set on a provider is used by charts, budgets and overlap instead of the built-in mapping.

## Insights

A charge only has a merchant, provider, amount and date: no plan name, no usage figure. So every insight is derived from the pattern of charges and worded as an observation, never as a fact about a plan. They all build on the [recurring-looking patterns](#recurring-looking-patterns) above (monthly, similar day and amount, 3+ months in a row) and on the [charge types](#charge-types) you set, which is the only way a yearly subscription gets counted.

- **Plan switches.** A new charge on the same charge type in the month after a monthly pattern ended (or the one after), landing at or near the day the old one was next expected, is counted straight away as the same subscription at the new price, marked as seen once or twice, instead of waiting for three charges. The old pattern shows as replaced, not stopped. A lone charge that nothing followed stays a one-off. Descriptors whose charges mostly do not line up (credit top-ups that match for three months by chance) are not read as a subscription at all.
- **Price changes.** (Insights, Shifts; also on the provider page.) Two cases: one pattern ends and another starts at a different amount within a month (a plan switch, "likely a plan change" at 25%+), or the amount inside one pattern moves by 10% or more and stays there. Small month-to-month wobble (for instance a USD price converted to EUR) and a single odd charge that goes straight back are ignored.
- **Stopped.** (Insights, Shifts; also on the provider page.) Patterns that ran and are no longer appearing, unless a newer pattern at the same provider replaced them (that is a plan change). Each is checked for later charges from the same merchant: none means the cancellation looks clean; some are listed ("Still charging"), which often means the stream was usage top-ups rather than a subscription.
- **Overlap.** (Insights, Suggestions.) Two or more active recurring charges from different providers in the same category: chat assistants, coding tools, media tools, writing and meeting tools. Hosting and domains are normally plural, so they are not flagged.
- **Subscription, usage and one-time.** Every charge has one of three types, and Insights shows all three over time and answers "more tools or more usage?" by comparing the last 3 complete months with the 3 before. A tool started in the last two months counts as one-time or usage until it has appeared monthly three months in a row.
- **Categories.** From the provider (`src/lib/categories.ts`): chat assistants, coding and app builders, API and inference, image/video/audio, writing and meetings, hosting and infra, domains, other. For providers that sell both a chat plan and an API (Anthropic, OpenAI, ...) a recurring charge is the plan and anything else is API usage, unless the charge has a Type. A test checks that every vendor in the extractor catalog has a category. Overview can group its monthly chart by category.
- **Budgets.** A monthly budget in total and/or per category, shown against what is spent so far and the month-end "at least" figure ("Expected to exceed by at least €40", "Over budget by €20"). A category uses the same method as the total, applied to that category's charges. Saved in this browser (IndexedDB), not exported, and removed by **Clear local data**.
- **Tags.** One optional label per charge. Edit it in the Transactions table, or tag everything currently shown (existing different tags are only replaced after a confirmation). **Data → Export a quarter** downloads one quarter, optionally one tag, as a CSV with a `Tag` column that can be re-imported. **Tag rules:** on a provider's page, "Tag new charges" sets a tag that charges from that provider get when they are imported without one (a tag in the file always wins, and charges already stored are not changed; use the bulk tag for those). The import message says how many charges a rule tagged, and each rule is listed in **Your corrections** with a **Remove rule** button. The ledger has no VAT figures, so amounts are as charged and VAT is not split out.

- **Charge types.** See [Charge types](#charge-types). What you set flows through price changes, overlap, the type split, the month-end estimate and the recurring-patterns tables.

In demo mode budgets, tags, tag rules and corrections live in memory only, like the demo data.

## Verification

Automated tests (`npm test`) run against a synthetic fixture (`src/lib/__fixtures__/ledger.csv`, 296 invented rows, 24 providers). Expected totals per month, provider and year were computed independently in Python with decimal arithmetic. The tests cover amount parsing and formatting, date maths, CSV validation, export round-trip, the duplicate policy, aggregation against the reference figures, concentration, recurring detection, the forecast (including insufficient-data cases), IndexedDB persistence via `fake-indexeddb`, the subscription insights, categories, fixed/variable split, budgets, tags, quarter reports and the three charge types and user corrections (usage, one-time / other, monthly and yearly subscriptions, including yearly renewals that are estimated, shown as overdue and never reported as stopped, and a plan switch that detection alone drops from the run-rate; including storing tags, tag rules, budgets, corrections, labels and categories in IndexedDB), the demo pack (determinism, validity, part 1 + part 2 rebuilding the full file), the statement extractor on invented statements (date and amount formats, Amex/ING/Revolut layouts, Revolut PDF sections, vendor rules and look-alikes, pattern-based types, the exact payload Ask Claude would send), and a guard that `public/` contains no CSV except the synthetic pack.

Checked by hand in the browser: opening a database saved by the previous version (schema v1) and upgrading it with all rows intact, setting a budget and tagging charges and finding both after a reload, import with validation errors and duplicates, persistence after reload, export → re-import (adds nothing), clear data, demo → own data switch, mobile and dark layouts, and a production build served with the Vercel security headers.

### Checking your own data locally

Two git-ignored folders let `npm test` check real data without any of it, or any figure from it, ending up in the repo:

- `private/`: real ledger CSVs. Each is checked: every row valid, export round-trip, exact total after storing, re-import adds nothing.
- `inbox/`: raw bank and card statements (`.pdf`, `.xlsx`, `.csv`). Each must read without errors, and every included line must have a provider, a type and reasons. Run `SHOW_EXTRACT=1 npm test` to print a per-provider summary and the lines sent to review.

PDF and Excel files are git-ignored anywhere in the repo as a second safety net. With empty or missing folders, these checks are skipped.

## Demo mode

**Explore demo data** runs the app on invented data, generated in the browser each time with today as the last day, so the month-end estimate always works. Demo data lives only in memory: it is never written to IndexedDB, and a banner says so on every page. Reloading keeps you in the demo (a single flag in `localStorage`).

When a visitor imports their own CSV (from the banner's **Use my own data** or the Data page), duplicates are checked against stored data only, the demo is discarded, and only their rows are saved. Demo and real data never mix. **Exit demo** returns to the welcome screen. The demo also works when browser storage is blocked (some private windows).

## Hosting your own copy

The app is a static site, so any static host works. The repo is set up for Vercel, which only serves the files in `dist/`. There are no server functions, and no data is sent anywhere.

1. Import the GitHub repo in Vercel. `vercel.json` sets the Vite framework, `npm run build` and the `dist` output, so no other settings are needed.
2. Deploy. The hash-based routes (`#/providers`) need no rewrites.

`src/content/site.ts` holds the production address, the owner and the contact. To host your own copy, change those and set `SITE_URL` when building (the canonical link, social card, `robots.txt` and `sitemap.xml` follow it). `vercel.json` also redirects the `www` host of the project's own domain to the apex: remove or edit that rule for your domain.

What stays private:

- A visitor's CSV is read with the browser's file API and saved in that browser's IndexedDB on their device. It is never uploaded, and nobody else can see it, including whoever runs the site. It is not synced across devices, and it is lost if the visitor clears site data.
- Page filters live after the `#`, which browsers never send to the server.
- `vercel.json` sends a strict **Content-Security-Policy**: the page can only load scripts and workers from its own origin, and can only make requests to its own origin plus `api.anthropic.com` (used solely by the opt-in Ask Claude button), so even a bug or injected script can't send data anywhere else. It also sends `Referrer-Policy: no-referrer` and related headers. `npm run preview` uses the same headers, so you can check a production build locally. Vercel itself sends `Strict-Transport-Security`, so `vercel.json` does not set it.
- After a successful import the app asks the browser to keep its storage (`navigator.storage.persist()`). Browsers may decline; Safari can still clear storage for sites not visited in a while.
- Vercel keeps normal request logs (IP address, requested file) for one day on the Pro plan, its default (1 hour on Hobby, 3 days on Enterprise, 30 days with Observability Plus). Those never include CSV contents. Don't add analytics or session-replay tools that record page content.
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

## Ownership

AI Spending Tracker is a product of **[NeotixHQ](https://neotixhq.com/)**, a brand legally owned by **[NuCielo ICT B.V.](https://nucielo.io/)** © 2026 NuCielo ICT B.V. The wording is set once in `src/content/site.ts` and shown in the landing page footer, the app footer and the About card (not in the privacy statement). NuCielo ICT B.V. is the only legal entity; NeotixHQ is a brand of it, not a separate legal entity, so the privacy statement names "NuCielo ICT B.V., trading as NeotixHQ" as the operator, with `info@neotixhq.com` as the contact. Ownership and licence are separate: the copyright holder is NuCielo ICT B.V., and the code is released under the Apache License 2.0 (see Version and licenses).

## Version and licenses

The **Data** page ends with an **About** card: the version from `package.json`, the commit and date of the build (from `VERCEL_GIT_COMMIT_SHA` on Vercel, otherwise from git), the license (from `package.json`), and a link to `/third-party-notices.txt`. That file lists every production dependency with its license text and is generated by `npm run licenses`; a test fails if a dependency is added without regenerating it or carries a license that is not permissive (MIT, ISC, Apache-2.0, BSD, Unlicense and similar). The app itself is released under the **Apache License 2.0** (`LICENSE`, with `NOTICE` for the copyright line): anyone may use, copy, modify and distribute it, commercially too, under those terms. The licence covers the code, not the NeotixHQ or AI Spending Tracker names and logo (Apache section 6). Contributions are licensed under the same terms (Apache section 5), so no separate agreement is needed to accept them. Third-party libraries keep their own licenses (`public/third-party-notices.txt`).

Versions follow Semantic Versioning. Changes are listed in [CHANGELOG.md](CHANGELOG.md) and releases are published on the repository's Releases page; see [CONTRIBUTING.md](CONTRIBUTING.md#releasing) for how a release is made.

## Screenshots

| | |
|---|---|
| ![Welcome](docs/screenshots/00-welcome.jpg) Welcome screen | ![Year](docs/screenshots/02-overview-year.jpg) Overview, year view |
| ![Providers](docs/screenshots/03-providers.jpg) Providers: trend and filters | ![Provider](docs/screenshots/04-provider-detail.jpg) Provider detail: subscriptions and charge types |
| ![Transactions](docs/screenshots/05-transactions-filtered.jpg) Filtered transactions | ![Insights](docs/screenshots/06-insights.jpg) Insights: patterns |
| ![Comparisons](docs/screenshots/07-insights-comparisons.jpg) Insights: comparisons | ![Import review](docs/screenshots/08-import-review-errors.jpg) Import review with errors |
| ![Data](docs/screenshots/09-data.jpg) Data management | ![Dark](docs/screenshots/13-overview-dark.jpg) Dark mode |
| ![Mobile](docs/screenshots/10-mobile-overview.jpg) Mobile overview | ![Mobile forecast](docs/screenshots/11-mobile-forecast.jpg) Mobile estimate |
| ![Mobile transactions](docs/screenshots/12-mobile-transactions.jpg) Mobile transactions | |
| ![Shifts and suggestions](docs/screenshots/16-insights-shifts-suggestions.jpg) Insights: price changes, stopped, overlap | ![Charge types](docs/screenshots/14-provider-charge-types.jpg) Provider charge types: type, label, category, to review |
| ![Types](docs/screenshots/17-insights-types.jpg) Insights: subscription, usage and one-time | ![Budget](docs/screenshots/18-budget.jpg) Monthly budget against the estimate |
| ![Quarter export](docs/screenshots/19-quarter-export.jpg) Export a quarter | |

All screenshots show the synthetic demo data.

## Pages

| Address | What | Source |
|---|---|---|
| `/` | Landing page: what it is, privacy up front, screenshots, FAQ. Static HTML, no scripts except a tiny redirect for old `/#/…` links. | `index.html`, `src/content/landing.ts` |
| `/app` (`app.html`) | The tracker. `/app?demo=1` starts the demo. | `app.html`, `src/` |
| `/privacy` (`privacy.html`) | The privacy statement (published 2026-11-10; set `PRIVACY_IS_DRAFT` back to true to show a draft notice and `noindex` again). Static HTML. | `privacy.html`, `src/content/privacy.ts` |

The landing page and the privacy page are generated at build time from `src/content/`, so the wording lives in one file. The privacy statement is checked against the code by `src/content/privacy.test.ts`. The production address is `https://ai-spend-tracker.neotixhq.com`, set once in `src/content/site.ts`: the landing page's canonical link and social card, `robots.txt` and `sitemap.xml` use it (a test keeps them in step). The sitemap lists only the landing page: the app is `noindex`, and so is the privacy page whenever it is marked as a draft. Set `SITE_URL` to build with another address.

## Project layout

```
src/
  content/        landing page and privacy statement text, with tests
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
    extract/        statement extractor: readers (table, Revolut PDF), vendor catalog, classifier, Ask Claude
    *.test.ts       Vitest suites
    __fixtures__/   synthetic test ledger
  components/     charts, tables, import panel, shared UI
  pages/          Overview, Providers, ProviderDetail, Insights, Transactions, DataPage
  store.tsx       loads data from IndexedDB, shared state
  router.ts       tiny hash router
  lib/demoData.ts   synthetic demo generator (runs in the browser and in the CLI)
scripts/          generate-demo-data.ts (writes the demo pack to disk)
public/demo/      synthetic demo pack (the only data files that get deployed)
vercel.json       Vercel build settings and security headers
.github/workflows/ci.yml  typecheck, tests, license check and build on every push and pull request
CONTRIBUTING.md   how to contribute and release; SECURITY.md  how to report a vulnerability
CHANGELOG.md      release notes
private/          your real ledgers for local checks (git-ignored, never committed)
inbox/            raw bank/card statements for local checks (git-ignored, never committed)
```

Stack: React 19, TypeScript, Vite, Recharts, PapaParse, idb, pdf.js and read-excel-file (statements), Anthropic SDK + zod (Ask Claude, loaded only when used). Dev: Vitest, fake-indexeddb.
