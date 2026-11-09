import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import vercel from './vercel.json';

// `npm run preview` sends the same security headers as Vercel, so a local check is faithful.
const deployHeaders = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Recharts makes up most of the bundle; fine for a local app.
  build: { chunkSizeWarningLimit: 800 },
  preview: { port: 4173, headers: deployHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
