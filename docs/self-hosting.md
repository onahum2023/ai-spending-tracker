# Hosting your own copy

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
