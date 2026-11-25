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

export type LandingMark = 'openai' | 'anthropic' | 'cursor' | 'lovable' | 'github' | 'supabase';

/** Inline SVG markup for the vendor marks shown on the landing page. */
export function landingMarks(): Record<LandingMark, string> {
  return {
    openai: lobe('openai'),
    anthropic: lobe('anthropic'),
    cursor: lobe('cursor'),
    lovable: lobe('lovable'),
    github: lobe('github'),
    supabase: simple(siSupabase.path),
  };
}
