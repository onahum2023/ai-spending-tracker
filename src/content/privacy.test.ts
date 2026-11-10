import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { payloadFor } from '../lib/extract/review';
import { clearLocalPrefs, DEMO_FLAG, forgetApiKey, KEY_STORE } from '../lib/localPrefs';
import {
  ASK_CLAUDE_SENT,
  CONTACT,
  CONTROLLER,
  LOG_RETENTION,
  LINK_LIST,
  PRIVACY_IS_DRAFT,
  PRIVACY_SENTENCE,
  renderPrivacyBody,
  SECTIONS,
  SUMMARY,
} from './privacy';

/*
 * The privacy statement says what the app does. These tests check the claims that can be checked
 * against the code, so the text and the app cannot drift apart unnoticed. If one fails, either the
 * code changed in a way the statement does not cover (update src/content/privacy.ts, and have it
 * reviewed again), or the statement is wrong.
 */

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}
const app = sourceFiles(join(root, 'src')).map((p) => ({ file: relative(root, p), text: readFileSync(p, 'utf8') }));

describe('privacy statement matches the app', () => {
  it('has no network calls except the optional Ask Claude request', () => {
    const forbidden = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource|navigator\.serviceWorker|importScripts/;
    expect(app.filter((f) => forbidden.test(f.text)).map((f) => f.file)).toEqual([]);
    // the only place that talks to the Anthropic API
    expect(app.filter((f) => /@anthropic-ai\/sdk/.test(f.text)).map((f) => f.file)).toEqual(['src/lib/extract/claude.ts']);
    // and it is loaded on demand, only when the user presses Ask Claude
    expect(read('src/components/AskClaude.tsx')).toMatch(/await import\('\.\.\/lib\/extract\/claude'\)/);
  });

  it('sets no cookies and loads nothing from other sites', () => {
    expect(app.filter((f) => /document\.cookie/.test(f.text)).map((f) => f.file)).toEqual([]);
    for (const html of ['index.html', 'privacy.html']) {
      expect(read(html)).not.toMatch(/(?:src|href)="https?:\/\//);
      expect(read(html)).not.toMatch(/<script[^>]*src="https?:/);
    }
    expect(read('src/styles.css')).not.toMatch(/url\(\s*['"]?https?:|@import\s+url\(\s*['"]?https?:/);
    // no tracking or analytics vendors (src/lib/analytics.ts is the app's own spending maths)
    // real vendor signatures (domains, packages, calls), not bare words: "plausible" is also an ordinary English word
    const trackers = /plausible\.io|googletagmanager|google-analytics|\bgtag\s*\(|posthog|mixpanel|hotjar|sentry\.io|@sentry\/|segment\.(?:com|io)|@vercel\/(?:analytics|speed-insights)|_vercel\/(?:insights|speed-insights)/i;
    expect(app.filter((f) => trackers.test(f.text.replace(/\/\/.*$/gm, ''))).map((f) => f.file)).toEqual([]);
    expect(read('package.json')).not.toMatch(trackers);
  });

  it('keeps exactly two things in localStorage, and nothing in sessionStorage', () => {
    expect(app.filter((f) => /sessionStorage/.test(f.text)).map((f) => f.file)).toEqual([]);
    const calls = app.flatMap((f) => [...f.text.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*([A-Za-z_]+)/g)].map((m) => m[1]));
    expect([...new Set(calls)].sort()).toEqual(['DEMO_FLAG', 'KEY_STORE']);
    expect(app.filter((f) => /localStorage\.(clear|key)\b|Object\.keys\(localStorage/.test(f.text))).toEqual([]);
  });

  it('forgets a remembered API key and the demo flag when asked', () => {
    const store = new Map<string, string>([[KEY_STORE, 'sk-ant-test'], [DEMO_FLAG, '1'], ['other', 'x']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    forgetApiKey();
    expect([...store.keys()].sort()).toEqual([DEMO_FLAG, 'other']);
    clearLocalPrefs();
    expect([...store.keys()]).toEqual(['other']);
    // blocked storage never throws
    vi.stubGlobal('localStorage', { removeItem: () => { throw new Error('blocked'); } });
    expect(() => clearLocalPrefs()).not.toThrow();
    expect(() => forgetApiKey()).not.toThrow();
  });

  it('allows only itself and the Anthropic API in the content security policy', () => {
    const csp = (JSON.parse(read('vercel.json')).headers[0].headers as { key: string; value: string }[]).find((h) => h.key === 'Content-Security-Policy')!.value;
    const directives = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['connect-src']).toEqual(["'self'", 'https://api.anthropic.com']);
    for (const k of ['script-src', 'font-src', 'worker-src']) expect(directives[k]).toEqual(["'self'"]);
    expect([...csp.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0])).toEqual(['https://api.anthropic.com']);
  });

  it('sends to Claude exactly the fields the statement lists', () => {
    const sample = {
      row: { id: 'x', date: '2026-01-02', amountCents: 1234, merchant: 'ACME', label: 'Acme', details: 'USD 13.00', country: 'US', fileName: 'secret.pdf', reference: 'REF123' },
      reasons: ['unsure'],
    } as unknown as Parameters<typeof payloadFor>[0];
    const sent = payloadFor(sample, 'r1');
    expect(Object.keys(sent).sort()).toEqual(['amount_eur', 'bank_label', 'country', 'date', 'foreign_amount', 'id', 'merchant', 'rule_note']);
    expect(JSON.stringify(sent)).not.toMatch(/secret\.pdf|REF123/);
    expect(ASK_CLAUDE_SENT).toHaveLength(5); // date+amount, merchant, bank label, foreign amount+country, rule note
  });

  it('does not claim that references or addresses are never sent, anywhere', () => {
    const claim = /no file names,? (?:or )?(?:references|other columns)[^.]*addresses|references,? (?:and|or) addresses/i;
    for (const f of ['src/components/AskClaude.tsx', 'src/content/privacy.ts', 'README.md', 'src/lib/extract/review.ts']) expect(read(f)).not.toMatch(claim);
    expect(read('src/components/AskClaude.tsx')).toMatch(/exactly as your bank wrote it/);
  });

  it('does not say the CSV export holds everything', () => {
    const body = renderPrivacyBody();
    expect(body).not.toMatch(/export everything/i);
    expect(body).toMatch(/does not include budgets, corrections, labels, categories, tag rules/);
    expect(read('src/content/landing.ts')).not.toMatch(/export a backup now/);
    expect(read('src/pages/DataPage.tsx')).toMatch(/transactions only/);
  });

  it('states the runtime-log retention without promising more than Vercel documents, in step with the README', () => {
    const body = renderPrivacyBody();
    expect(LOG_RETENTION).toBe('one day');
    expect(body).toContain('Vercel documents one day of retention');
    // it is a period for the runtime logs only: other Vercel data is said to follow other periods
    expect(body).toMatch(/not a promise about everything Vercel keeps/);
    expect(body).not.toMatch(/period to be confirmed|kept by Vercel for one day/);
    expect(read('README.md')).toMatch(/for one day on the Pro plan/);
  });

  it('keeps the API key in memory unless "Remember on this device" is ticked, and never in a URL', () => {
    const ask = read('src/components/AskClaude.tsx');
    // not ticked by default: it starts ticked only when a key is already stored
    expect(ask).toMatch(/const \[remember, setRemember\] = useState\(\(\) => readKey\(\) !== ''\)/);
    // the key is saved at the moment Ask Claude runs, and only when the box is ticked
    expect(ask).toMatch(/saveKey\(apiKey\.trim\(\), remember\)/);
    expect(ask).toMatch(/if \(keep && key\) localStorage\.setItem\(KEY_STORE, key\)/);
    // unticking forgets it at once
    expect(ask).toMatch(/if \(!e\.target\.checked\) forgetApiKey\(\)/);
    // the key only ever goes into the SDK client (a request header), never into a URL, the history or the router
    expect(app.filter((f) => /apiKey|KEY_STORE/.test(f.text)).map((f) => f.file).sort()).toEqual([
      'src/components/AskClaude.tsx',
      'src/lib/extract/claude.ts',
      'src/lib/localPrefs.ts',
    ]);
    expect(read('src/lib/extract/claude.ts')).toMatch(/new Anthropic\(\{ apiKey, dangerouslyAllowBrowser: true/);
  });

  it('has no logging or error reporting that could carry a key or a statement line', () => {
    const forbidden = /\bconsole\.|window\.onerror|addEventListener\(\s*['"](?:error|unhandledrejection)|reportError|ErrorBoundary|componentDidCatch/;
    expect(app.filter((f) => forbidden.test(f.text)).map((f) => f.file)).toEqual([]);
  });

  it('describes deletion and storage the way the app behaves', () => {
    const data = read('src/pages/DataPage.tsx');
    // "Clear local data" is only available once there are stored transactions (the text says so)
    expect(data).toMatch(/className="btn btn-danger"[\s\S]{0,120}disabled=\{!transactions\.length\}/);
    // and it wipes the three stores plus the two localStorage keys
    expect(read('src/lib/db.ts')).toMatch(/\['transactions', 'imports', 'settings'\]/);
    expect(data).toMatch(/clearLocalPrefs\(\)/);
    // the app asks the browser to keep the data when something is imported
    for (const f of ['src/components/StatementImport.tsx', 'src/components/ImportPanel.tsx']) expect(read(f)).toMatch(/navigator\.storage\?\.persist\?\.\(\)/);
    // both exports are CSV in the ledger format: transactions only
    expect(read('src/components/QuarterExport.tsx')).toMatch(/exportCsv\(report\.rows/);
    expect(read('src/lib/csv.ts')).toMatch(/\[\.\.\.REQUIRED_COLUMNS, \.\.\.\(withType \? \[TYPE_COLUMN\] : \[\]\), \.\.\.\(withTag \? \[TAG_COLUMN\] : \[\]\)\]/);
    const body = renderPrivacyBody();
    expect(body).toContain('There is no full backup or restore');
    expect(body).toContain('does not remove anything already sent to Anthropic');
  });

  it('explains the stored-key risk and the difference from session use', () => {
    const body = renderPrivacyBody();
    expect(body).toContain('kept in memory only');
    expect(body).toContain('saved as plain text in this browser’s localStorage');
    expect(body).toMatch(/malicious extension/);
    expect(body).toMatch(/Anthropic’s privacy policy says it does not cover content processed for its business and API customers/);
  });

  it('keeps ownership and licensing out of the privacy statement', () => {
    const text = renderPrivacyBody().replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/property of|©|Who owns|licen[cs]e/i);
    expect(SECTIONS.map((s) => s.id)).not.toContain('ownership');
  });

  it('says the same sentence everywhere it is repeated', () => {
    expect(read('README.md')).toContain(PRIVACY_SENTENCE);
    expect(read('src/App.tsx')).toContain('PRIVACY_SENTENCE');
    expect(renderPrivacyBody()).toContain(PRIVACY_SENTENCE.replace(/&/g, '&amp;'));
  });

  it('links to the privacy page from every page of the app', () => {
    expect(read('src/App.tsx')).toMatch(/<footer className="app-foot">[\s\S]*PRIVACY_PATH/);
    expect(read('src/components/AboutCard.tsx')).toContain('PRIVACY_PATH');
  });
});

describe('privacy page', () => {
  const body = renderPrivacyBody();

  it('has no scripts and renders every section and link, escaped', () => {
    expect(read('privacy.html')).not.toMatch(/<script/i);
    expect(body).not.toMatch(/<script/i);
    for (const s of SECTIONS) expect(body).toContain(`id="${s.id}"`);
    for (const s of SUMMARY) expect(body).toContain(s);
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
    for (const l of LINK_LIST) expect(l.href).toMatch(/^https:\/\//);
    expect(body.replace(/<[^>]+>/g, '')).not.toMatch(/[<>]/);
  });

  it('is marked as a draft until the open points are settled and a review has happened', () => {
    const placeholders = /\[[^\]]*(to be decided|to be confirmed)[^\]]*\]/i;
    const text = body + CONTROLLER + CONTACT;
    if (PRIVACY_IS_DRAFT) {
      expect(body).toContain('not legal advice');
      expect(read('vite.config.ts')).toContain('noindex');
    } else {
      expect(text).not.toMatch(placeholders);
      expect(body).not.toContain('Draft.');
    }
  });
});
