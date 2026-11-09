import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
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

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(buildCommit()),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    // Empty until a license has been chosen and added to package.json.
    __APP_LICENSE__: JSON.stringify((pkg as { license?: string }).license ?? ''),
  },
  server: { port: 5173 },
  // Recharts makes up most of the bundle; fine for a local app.
  build: { chunkSizeWarningLimit: 800 },
  preview: { port: 4173, headers: deployHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
