import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { renderLandingBody, renderLandingMeta } from './src/content/landing.ts';
import { PRIVACY_IS_DRAFT, renderPrivacyBody } from './src/content/privacy.ts';
import pkg from './package.json' with { type: 'json' };
import vercel from './vercel.json' with { type: 'json' };

// What the About section shows: the version from package.json plus the commit and date of this build.
// On Vercel the commit comes from VERCEL_GIT_COMMIT_SHA; elsewhere from git, or empty if there is no git.
function buildCommit(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// `npm run preview` sends the same security headers as Vercel, so a local check is faithful.
const deployHeaders = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));

// The public address, for canonical and social-card URLs (they must be absolute). Set SITE_URL, or on Vercel the
// production domain is used. Empty until a domain exists: the page then leaves those tags out.
function siteUrl(): string {
  const explicit = process.env.SITE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = explicit || (vercel ? `https://${vercel}` : '');
  return url.replace(/\/+$/, '');
}

// Fills the static pages from src/content, so the wording lives in one place and the pages need no script.
function staticPages(): Plugin {
  return {
    name: 'static-pages',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.filename.endsWith('privacy.html')) {
          return html
            .replace('<!--PRIVACY_BODY-->', renderPrivacyBody())
            .replace('<!--PRIVACY_ROBOTS-->', PRIVACY_IS_DRAFT ? '<meta name="robots" content="noindex" />' : '');
        }
        if (ctx.filename.endsWith('index.html')) {
          return html
            .replace('<!--LANDING_META-->', renderLandingMeta(siteUrl()))
            .replace('<!--LANDING_BODY-->', renderLandingBody({ version: pkg.version, commit: buildCommit(), license: (pkg as { license?: string }).license ?? '' }));
        }
        return html;
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), staticPages()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(buildCommit()),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    // Empty until a license has been chosen and added to package.json.
    __APP_LICENSE__: JSON.stringify((pkg as { license?: string }).license ?? ''),
  },
  server: { port: 5173 },
  // Recharts makes up most of the bundle; fine for a local app.
  build: {
    chunkSizeWarningLimit: 900,
    // The landing page, the app and the static privacy page.
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app.html'),
        privacy: resolve(import.meta.dirname, 'privacy.html'),
      },
    },
  },
  preview: { port: 4173, headers: deployHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
