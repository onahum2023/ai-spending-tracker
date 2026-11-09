import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dataSpan, summarizeProviders, type DataSpan, type ProviderSummary } from './lib/analytics';
import { buildProviderColors, useColorScheme, type ProviderColors } from './lib/colors';
import { todayLocal } from './lib/dates';
import { loadAll } from './lib/db';
import { generateDemo } from './lib/demoData';
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
  today: string;
  period: Period;
  setPeriod: (p: Period) => void;
  reload: () => Promise<void>;
  startDemo: () => void;
  exitDemo: () => void;
}

const LedgerContext = createContext<Ledger | null>(null);

// Remembers "I'm exploring the demo" across reloads. A per-viewer convenience only.
const DEMO_FLAG = 'ai-spending-tracker.demo';
function readDemoFlag(): boolean {
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
  const [demoOn, setDemoOn] = useState(readDemoFlag);
  const [period, setPeriodState] = useState<Period | null>(null);
  const scheme = useColorScheme();
  const today = todayLocal();

  const reload = useCallback(async () => {
    try {
      const data = await loadAll();
      setStored(data.transactions);
      setImports(data.imports);
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
  const demoRows = useMemo(() => (mode === 'demo' ? buildDemoTransactions(today) : []), [mode, today]);
  const transactions = mode === 'demo' ? demoRows : stored;

  const startDemo = useCallback(() => {
    setPeriodState(null);
    setDemoOn(true);
    writeDemoFlag(true);
  }, []);
  const exitDemo = useCallback(() => {
    setPeriodState(null);
    setDemoOn(false);
    writeDemoFlag(false);
  }, []);

  const span = useMemo(() => dataSpan(transactions), [transactions]);
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
