# Contributing

Thanks for helping. The app is a local-first dashboard: keep it that way (no backend, no analytics, nothing uploaded).

## Setup

Requires Node.js 20+ (tested on Node 24).

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run typecheck
npm test
npm run licenses:check
```

CI runs the same checks plus a production build. After changing dependencies, run `npm run licenses` to refresh `public/third-party-notices.txt`; the check fails on a non-permissive license or an out-of-date notices file.

## Ground rules

- **Never commit real financial data.** Tests use the synthetic fixture and demo pack. `private/` and `inbox/` are git-ignored for your own local checks; keep them that way.
- **The privacy statement must stay true.** `src/content/privacy.ts` is checked against the code by tests. If you change what the app stores or sends over the network, update it in the same pull request.
- Money is handled in integer cents; add a test with your change, and keep expected values independent of the code under test.
- Keep pull requests focused. Small ones are squash-merged; larger ones that hold one commit per change may be merged with a merge commit.

## License

By contributing you agree that your contribution is released under the Apache License 2.0, like the rest of the project.
