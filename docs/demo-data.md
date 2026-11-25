# Demo mode and the demo data pack

## Demo mode

**Explore demo data** runs the app on invented data, generated in the browser each time with today as the last day, so the month-end estimate always works. Demo data lives only in memory: it is never written to IndexedDB, and a small "Demo data" pill in the top bar says so on every page. Reloading keeps you in the demo (a single flag in `localStorage`).

When a visitor imports their own CSV (from the **Demo data** pill's **Use my own data** or the Data page), duplicates are checked against stored data only, the demo is discarded, and only their rows are saved. Demo and real data never mix. **Exit demo** (in the same menu) returns to the Welcome page. The demo also works when browser storage is blocked (some private windows).

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
