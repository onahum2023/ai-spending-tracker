import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dataSpan, summarizeProviders, type DataSpan, type ProviderSummary } from './lib/analytics';
import { EMPTY_BUDGETS, normalizeBudgets, type Budgets } from './lib/budgets';
import { normalizeProviderCategories, withProviderCategory, type Category, type ProviderCategory } from './lib/categories';
import { buildProviderColors, categoryColor, typeColor, useColorScheme, type ProviderColors } from './lib/colors';
import { todayLocal } from './lib/dates';
import { normalizeTagRules, withTagRule, type TagRule } from './lib/tags';
import { DEMO_FLAG } from './lib/localPrefs';
import { normalizeLabels, withLabel, type Label } from './lib/labels';
import { deleteTransactions as storeDelete, loadAll, loadSetting, saveSetting, setTags as storeTags } from './lib/db';
import { generateDemo } from './lib/demoData';
import { analyze, type Analysis } from './lib/insights';
import {
  normalizeOverrides,
  withOverride,
  type ChargeKind,
  type Override,
  type OverrideKind,
} from './lib/overrides';
import type { ImportRecord, Period, Transaction } from './lib/types';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

/**
 * empty: nothing stored, no demo running (show the welcome screen)
 * demo:  invented data generated in memory; never written to storage
 * mine:  the user's own imported data, stored in this browser's IndexedDB
 */
export type DataMode = 'empty' | 'demo' | 'mine';

interface Ledger {
  load: LoadState;
  mode: DataMode;
  /** What the app displays: demo rows in demo mode, otherwise the stored rows. */
  transactions: Transaction[];
  /** Only what is saved in IndexedDB. Imports are checked for duplicates against this. */
  stored: Transaction[];
  imports: ImportRecord[];
  span: DataSpan | null;
  /** All-time provider summaries, largest first. */
  providers: ProviderSummary[];
  colors: ProviderColors;
  categoryColors: (c: Category) => string;
  typeColors: (k: ChargeKind) => string;
  /** Recurring patterns, subscriptions and categories, computed once for the displayed transactions. */
  analysis: Analysis<Transaction>;
  /** The user's corrections to automatic subscription detection, one per stream. */
  overrides: Override[];
  /** Sets the treatment of one stream (provider + merchant descriptor), or with null puts it back to automatic. */
  setOverride: (provider: string, merchant: string, kind: OverrideKind | null) => Promise<void>;
  /** Sets several charge types at once ("confirm all suggestions"), saved in one write. */
  setOverrides: (changes: { provider: string; merchant: string; kind: OverrideKind }[]) => Promise<void>;
  /** "Tag new charges from this provider as ...": applied when charges are imported, never to charges already stored. */
  tagRules: TagRule[];
  /** Sets the tag rule of one provider; an empty tag removes it. Saved in this browser; in demo mode kept in memory only. */
  setTagRule: (provider: string, tag: string | null) => Promise<void>;
  /** The category you chose for a provider; it beats the built-in mapping. */
  providerCategories: ProviderCategory[];
  /** Sets the category of one provider, or with null puts it back to the built-in mapping. */
  setProviderCategory: (provider: string, category: Category | null) => Promise<void>;
  /** Names you gave streams (provider + descriptor), such as "Claude Pro". Display only. */
  labels: Label[];
  /** Sets the label of one stream; an empty text removes it. Saved in this browser; in demo mode kept in memory only. */
  setLabel: (provider: string, merchant: string, text: string | null) => Promise<void>;
  budgets: Budgets;
  /** Saved in this browser; in demo mode kept in memory only. */
  setBudgets: (b: Budgets) => Promise<void>;
  /** Sets (or with null, clears) the tag on charges. Saved in this browser; in demo mode kept in memory only. */
  setTags: (ids: number[], tag: string | null) => Promise<void>;
  /** Deletes charges (for example one imported by mistake). Saved in this browser; in demo mode kept in memory only. */
  deleteTransactions: (ids: number[]) => Promise<void>;
  today: string;
  period: Period;
  setPeriod: (p: Period) => void;
  reload: () => Promise<void>;
  startDemo: () => void;
  exitDemo: () => void;
}

const LedgerContext = createContext<Ledger | null>(null);

// Remembers "I'm exploring the demo" across reloads. A per-viewer convenience only.
function readDemoFlag(): boolean {
  // The landing page links to "/app?demo=1": start the demo, then tidy the address.
  // The demo lives in memory, so it starts even when storage is blocked (it just won't survive a reload).
  let fromLink = false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      fromLink = true;
      params.delete('demo');
      const rest = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    }
  } catch {
    /* no address to read */
  }
  if (fromLink) {
    writeDemoFlag(true);
    return true;
  }
  try {
    return localStorage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
}
function writeDemoFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(DEMO_FLAG, '1');
    else localStorage.removeItem(DEMO_FLAG);
  } catch {
    /* storage unavailable: demo just won't survive a reload */
  }
}

function buildDemoTransactions(today: string): Transaction[] {
  return generateDemo({ end: today }).map((r, i) => ({ ...r, id: i + 1, importId: 0, sourceRow: i + 2 }));
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [stored, setStored] = useState<Transaction[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [storedBudgets, setStoredBudgets] = useState<Budgets>(EMPTY_BUDGETS);
  // Demo edits live in memory only ("nothing is saved") and are dropped when the demo starts or ends.
  const [demoBudgets, setDemoBudgets] = useState<Budgets>(EMPTY_BUDGETS);
  const [demoTags, setDemoTags] = useState<Record<number, string>>({});
  const [demoDeleted, setDemoDeleted] = useState<Set<number>>(new Set());
  const [storedOverrides, setStoredOverrides] = useState<Override[]>([]);
  const [demoOverrides, setDemoOverrides] = useState<Override[]>([]);
  const [storedLabels, setStoredLabels] = useState<Label[]>([]);
  const [demoLabels, setDemoLabels] = useState<Label[]>([]);
  const [storedCategories, setStoredCategories] = useState<ProviderCategory[]>([]);
  const [demoCategories, setDemoCategories] = useState<ProviderCategory[]>([]);
  const [storedTagRules, setStoredTagRules] = useState<TagRule[]>([]);
  const [demoTagRules, setDemoTagRules] = useState<TagRule[]>([]);
  const [demoOn, setDemoOn] = useState(readDemoFlag);
  const [period, setPeriodState] = useState<Period | null>(null);
  const scheme = useColorScheme();
  const today = todayLocal();

  const reload = useCallback(async () => {
    try {
      const [data, budgets, overrides, labels, categories, tagRules] = await Promise.all([
        loadAll(),
        loadSetting('budgets'),
        loadSetting('overrides'),
        loadSetting('labels'),
        loadSetting('providerCategories'),
        loadSetting('tagRules'),
      ]);
      setStored(data.transactions);
      setImports(data.imports);
      setStoredBudgets(normalizeBudgets(budgets));
      setStoredOverrides(normalizeOverrides(overrides));
      setStoredLabels(normalizeLabels(labels));
      setStoredCategories(normalizeProviderCategories(categories));
      setStoredTagRules(normalizeTagRules(tagRules));
      // Once the user has their own data, the demo is over.
      if (data.transactions.length > 0) {
        setDemoOn(false);
        writeDemoFlag(false);
      }
      setLoad({ status: 'ready' });
    } catch (e) {
      setLoad({
        status: 'error',
        message:
          e instanceof Error
            ? e.message
            : 'The browser refused access to local storage (IndexedDB).',
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mode: DataMode = stored.length > 0 ? 'mine' : demoOn ? 'demo' : 'empty';
  const demoBase = useMemo(() => (mode === 'demo' ? buildDemoTransactions(today) : []), [mode, today]);
  const demoRows = useMemo(() => {
    const kept = demoDeleted.size ? demoBase.filter((t) => !demoDeleted.has(t.id)) : demoBase;
    return Object.keys(demoTags).length ? kept.map((t) => (demoTags[t.id] ? { ...t, tag: demoTags[t.id] } : t)) : kept;
  }, [demoBase, demoTags, demoDeleted]);
  const transactions = mode === 'demo' ? demoRows : stored;
  const budgets = mode === 'demo' ? demoBudgets : storedBudgets;
  const overrides = mode === 'demo' ? demoOverrides : storedOverrides;
  const labels = mode === 'demo' ? demoLabels : storedLabels;
  const providerCategories = mode === 'demo' ? demoCategories : storedCategories;
  const tagRules = mode === 'demo' ? demoTagRules : storedTagRules;

  const setOverride = useCallback(
    async (provider: string, merchant: string, kind: OverrideKind | null) => {
      const next = normalizeOverrides(withOverride(overrides, provider, merchant, kind));
      if (mode === 'demo') return setDemoOverrides(next);
      await saveSetting('overrides', next);
      setStoredOverrides(next);
    },
    [mode, overrides],
  );

  const setOverrides = useCallback(
    async (changes: { provider: string; merchant: string; kind: OverrideKind }[]) => {
      let next = overrides;
      for (const c of changes) next = withOverride(next, c.provider, c.merchant, c.kind);
      next = normalizeOverrides(next);
      if (mode === 'demo') return setDemoOverrides(next);
      await saveSetting('overrides', next);
      setStoredOverrides(next);
    },
    [mode, overrides],
  );

  const setLabel = useCallback(
    async (provider: string, merchant: string, text: string | null) => {
      const next = normalizeLabels(withLabel(labels, provider, merchant, text));
      if (mode === 'demo') return setDemoLabels(next);
      await saveSetting('labels', next);
      setStoredLabels(next);
    },
    [mode, labels],
  );

  const setProviderCategory = useCallback(
    async (provider: string, category: Category | null) => {
      const next = normalizeProviderCategories(withProviderCategory(providerCategories, provider, category));
      if (mode === 'demo') return setDemoCategories(next);
      await saveSetting('providerCategories', next);
      setStoredCategories(next);
    },
    [mode, providerCategories],
  );

  const setTagRule = useCallback(
    async (provider: string, tag: string | null) => {
      const next = normalizeTagRules(withTagRule(tagRules, provider, tag));
      if (mode === 'demo') return setDemoTagRules(next);
      await saveSetting('tagRules', next);
      setStoredTagRules(next);
    },
    [mode, tagRules],
  );

  const setBudgets = useCallback(
    async (b: Budgets) => {
      const clean = normalizeBudgets(b);
      if (mode === 'demo') return setDemoBudgets(clean);
      await saveSetting('budgets', clean);
      setStoredBudgets(clean);
    },
    [mode],
  );

  const setTags = useCallback(
    async (ids: number[], tag: string | null) => {
      const set = new Set(ids);
      if (mode === 'demo') {
        return setDemoTags((prev) => {
          const next = { ...prev };
          for (const id of ids) {
            if (tag) next[id] = tag;
            else delete next[id];
          }
          return next;
        });
      }
      await storeTags(ids, tag);
      setStored((prev) =>
        prev.map((t) => {
          if (!set.has(t.id)) return t;
          const { tag: _old, ...rest } = t;
          return tag ? { ...rest, tag } : rest;
        }),
      );
    },
    [mode],
  );

  const deleteTransactions = useCallback(
    async (ids: number[]) => {
      const gone = new Set(ids);
      if (mode === 'demo') return setDemoDeleted((prev) => new Set([...prev, ...gone]));
      await storeDelete(ids);
      setStored((prev) => prev.filter((t) => !gone.has(t.id)));
    },
    [mode],
  );

  const startDemo = useCallback(() => {
    setDemoBudgets(EMPTY_BUDGETS);
    setDemoTags({});
    setDemoDeleted(new Set());
    setDemoOverrides([]);
    setDemoLabels([]);
    setDemoCategories([]);
    setDemoTagRules([]);
    setPeriodState(null);
    setDemoOn(true);
    writeDemoFlag(true);
  }, []);
  const exitDemo = useCallback(() => {
    setDemoBudgets(EMPTY_BUDGETS);
    setDemoTags({});
    setDemoDeleted(new Set());
    setDemoOverrides([]);
    setDemoLabels([]);
    setDemoCategories([]);
    setDemoTagRules([]);
    setPeriodState(null);
    setDemoOn(false);
    writeDemoFlag(false);
  }, []);

  const span = useMemo(() => dataSpan(transactions), [transactions]);
  const analysis = useMemo(() => analyze(transactions, today, overrides, providerCategories, labels),
    [transactions, today, overrides, providerCategories, labels]);
  const providers = useMemo(() => summarizeProviders(transactions), [transactions]);
  const colors = useMemo(
    () => buildProviderColors(providers.map((p) => p.provider), scheme),
    [providers, scheme],
  );

  // Default period: the latest recorded month. Fall back to it if the chosen period no longer has data.
  const effectivePeriod: Period = useMemo(() => {
    if (!span) return { kind: 'all' };
    if (period) {
      if (period.kind === 'all') return period;
      if (period.kind === 'year' && span.years.includes(period.year)) return period;
      if (period.kind === 'month' && period.month >= span.firstMonth && period.month <= span.lastMonth)
        return period;
    }
    return { kind: 'month', month: span.lastMonth };
  }, [period, span]);

  const value: Ledger = {
    load,
    mode,
    transactions,
    stored,
    imports,
    span,
    providers,
    colors,
    categoryColors: (c: Category) => categoryColor(c, scheme),
    typeColors: (k: ChargeKind) => typeColor(k, scheme),
    analysis,
    overrides,
    setOverride,
    setOverrides,
    tagRules,
    setTagRule,
    providerCategories,
    setProviderCategory,
    labels,
    setLabel,
    budgets,
    setBudgets,
    setTags,
    deleteTransactions,
    today,
    period: effectivePeriod,
    setPeriod: setPeriodState,
    reload,
    startDemo,
    exitDemo,
  };
  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): Ledger {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error('useLedger must be used inside LedgerProvider');
  return ctx;
}
