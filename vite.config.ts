import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
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

// Fills privacy.html from src/content/privacy.ts, so the statement lives in one file and the page needs no script.
function privacyPage(): Plugin {
  return {
    name: 'privacy-page',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.filename.endsWith('privacy.html')) return html;
        return html
          .replace('<!--PRIVACY_BODY-->', renderPrivacyBody())
          .replace('<!--PRIVACY_ROBOTS-->', PRIVACY_IS_DRAFT ? '<meta name="robots" content="noindex" />' : '');
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), privacyPage()],
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
    // The app, plus the static privacy page (no scripts).
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), privacy: resolve(import.meta.dirname, 'privacy.html') } },
  },
  preview: { port: 4173, headers: deployHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
