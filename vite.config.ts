import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { renderNoscript, renderWelcomeMeta } from './src/content/welcome.ts';
import { PRIVACY_IS_DRAFT, renderPrivacyBody } from './src/content/privacy.ts';
import { PRODUCTION_URL } from './src/content/site.ts';
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

// The public address, for canonical and social-card URLs (they must be absolute). Always the production domain, so a
// preview deployment never names its own temporary address as canonical. Set SITE_URL to override it (for example
// for a staging domain).
function siteUrl(): string {
  return (process.env.SITE_URL || PRODUCTION_URL).replace(/\/+$/, '');
}

// Fills the privacy page, and the tags and no-script text of index.html, from src/content, so the wording lives in one place.
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
            .replace('<!--WELCOME_META-->', renderWelcomeMeta(siteUrl()))
            .replace('<!--WELCOME_NOSCRIPT-->', renderNoscript());
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
    // From package.json (Apache-2.0).
    __APP_LICENSE__: JSON.stringify((pkg as { license?: string }).license ?? ''),
  },
  server: { port: 5173 },
  // Recharts makes up most of the bundle; fine for a local app.
  build: {
    chunkSizeWarningLimit: 900,
    // The app (which opens on the Welcome page), the old /app address that forwards to it, and the static privacy page.
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        legacyApp: resolve(import.meta.dirname, 'app.html'),
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
