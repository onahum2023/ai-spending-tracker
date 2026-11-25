/*
 * Vendor marks for the static landing page, read from the same icon packages the app bundles.
 * This module runs only at build time (vite.config.ts) and in tests, so it may read files.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { siSupabase } from 'simple-icons';

const lobe = (name: string) =>
  readFileSync(resolve(process.cwd(), 'node_modules/@lobehub/icons-static-svg/icons', `${name}.svg`), 'utf8')
    .replace(/<title>.*?<\/title>/, '')
    .replace(/\s(height|width|style)="[^"]*"/g, '')
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');

const simple = (path: string) =>
  `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="${path}"/></svg>`;

/** Inline SVG markup for the marks shown in the landing page's statement example. */
export function landingMarks(): Record<'openai' | 'cursor' | 'github' | 'supabase', string> {
  return { openai: lobe('openai'), cursor: lobe('cursor'), github: lobe('github'), supabase: simple(siSupabase.path) };
}
