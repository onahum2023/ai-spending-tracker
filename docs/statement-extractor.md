# Statement extractor

Most people do not have a clean ledger; they have bank and card statements. The extractor turns those into ledger rows, in the browser:

1. **Read.** Drop one or more files on the Data page.
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

The statement extractor records a finer type per charge (Subscription, Usage / credits, Certification, Domains, Hosting / infra, Other). It is stored with each transaction and exported as an optional `Type` column. The app itself reads every charge as one of three types, [Subscription, Usage or One-time / Other](how-it-works.md#charge-types): Certification, Domains, Hosting and Other count as One-time / Other.

## Ask Claude (optional)

Not needed: without an Anthropic API key, review each **Needs review** line yourself with Include / Exclude. Everything else works the same. Only Anthropic is supported for this step.

For lines still in **Needs review**, **Ask Claude** sends them to Claude (`claude-opus-5-5`, with Anthropic's server-side refusal fallback) using the user's **own** Anthropic API key, straight from the browser to `api.anthropic.com`. Only the review lines are sent, and only: date, amount, the line's description exactly as the bank wrote it (it can include a city or a payment reference), the bank's short name, foreign amount, country and the rules' note. No file names, other columns or other lines. Check the preview and leave out any line you would rather not send. **Show exactly what is sent** displays the payload before anything goes out. Answers come back as structured data; low-confidence answers stay in review. The key stays in memory unless "Remember on this device" is ticked. Nothing is sent unless the button is pressed.

## Adding a vendor

Append an entry to `VENDORS` in `src/lib/extract/vendors.ts`: the provider name, `group` (`ai` or `infra`), a `match` pattern for the upper-cased descriptor, optional `services` for descriptors that name the charge type, and a default `type` (or `'auto'` to decide from the charge pattern). Add a case to `src/lib/extract/extract.test.ts` and run `npm test`. Keep patterns specific: a bare word like `GAMMA` also matches unrelated shops.
