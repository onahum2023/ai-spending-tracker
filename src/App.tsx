import { useEffect, useState, type ReactNode } from 'react';
import { ImportPanel } from './components/ImportPanel';
import { PeriodPicker } from './components/PeriodPicker';
import { dateLabel } from './lib/dates';
import { formatEUR, sumCents } from './lib/money';
import { DataPage } from './pages/DataPage';
import { exportCsv } from './lib/download';
import { StatementImport } from './components/StatementImport';
import { ProviderDot, Segmented } from './components/ui';
import { generateDemo } from './lib/demoData';
import { Overview } from './pages/Overview';
import { ProviderDetail } from './pages/ProviderDetail';
import { Subscriptions } from './pages/Subscriptions';
import { Providers } from './pages/Providers';
import { Transactions } from './pages/Transactions';
import { Insights } from './pages/Insights';
import { PRIVACY_PATH, PRIVACY_SENTENCE } from './content/privacy';
import { COPYRIGHT } from './content/site';
import { href, navigate, useRoute } from './router';
import { LedgerProvider, useLedger } from './store';

const icons: Record<string, ReactNode> = {
  overview: <path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z" />,
  subscriptions: <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />,
  providers: <path d="M4 6h16M4 12h16M4 18h10" />,
  transactions: <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />,
  insights: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  data: <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
};

const NAV = [
  { key: 'overview', label: 'Overview', path: [] as string[] },
  { key: 'subscriptions', label: 'Subscriptions', path: ['subscriptions'] },
  { key: 'providers', label: 'Providers', path: ['providers'] },
  { key: 'transactions', label: 'Transactions', path: ['transactions'] },
  { key: 'insights', label: 'Insights', path: ['insights'] },
  { key: 'data', label: 'Data', path: ['data'] },
];

function Icon({ name }: { name: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
        <path d="M6 18v-6M12 18V6M18 18v-4" />
      </svg>
    </span>
  );
}

/** Pages that moved. Old links and bookmarks land on the page that took over. */
const MOVED: Record<string, string[]> = { trends: ['insights'] };

function Shell() {
  const route = useRoute();
  const { transactions, span, mode } = useLedger();
  const section = route.path[0] ?? 'overview';
  const providerName = section === 'providers' ? route.path[1] : undefined;
  useEffect(() => {
    if (section in MOVED) navigate(MOVED[section], undefined, true);
  }, [section]);

  let title: ReactNode = 'Overview';
  let page: ReactNode = <Overview />;
  let crumb: ReactNode = null;
  let showPeriod = true;
  switch (section) {
    case 'providers':
      if (providerName) {
        title = (
          <span className="row" style={{ gap: 10 }}>
            <ProviderDot provider={providerName} />
            {providerName}
          </span>
        );
        crumb = <a href={href(['providers'])}>← Providers</a>;
        page = <ProviderDetail provider={providerName} />;
      } else {
        title = 'Providers';
        page = <Providers />;
      }
      break;
    case 'subscriptions':
      title = 'Subscriptions';
      page = <Subscriptions />;
      showPeriod = false;
      break;
    case 'transactions':
      title = 'Transactions';
      page = <Transactions route={route} />;
      showPeriod = false;
      break;
    case 'insights':
      title = 'Insights';
      page = <Insights />;
      showPeriod = false;
      break;
    case 'data':
      title = 'Data';
      page = <DataPage />;
      showPeriod = false;
      break;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#/">
          <BrandMark />
          <span>AI Spending</span>
        </a>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.key} href={href(n.path)} className={section === n.key ? 'active' : ''} aria-current={section === n.key ? 'page' : undefined}>
              <Icon name={n.key} />
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div><strong>{transactions.length}</strong> transactions</div>
          <div><strong>{formatEUR(sumCents(transactions))}</strong> recorded</div>
          {span && <div>Latest: {dateLabel(span.lastDate)}</div>}
          <div style={{ marginTop: 6 }}>{mode === 'demo' ? 'Demo data, not stored' : 'Stored locally in this browser'}</div>
        </div>
      </aside>
      <main className="main">
        {mode === 'demo' && <DemoBanner onData={section === 'data'} />}
        <div className="topbar">
          <div className="topbar-title">
            {crumb && <div className="crumb">{crumb}</div>}
            <h1>{title}</h1>
          </div>
          {showPeriod && <PeriodPicker />}
        </div>
        {page}
        <footer className="app-foot">
          <a href={PRIVACY_PATH}>Privacy</a>
          <a href={href(['data'])}>About</a>
          <span className="app-foot-owner">{COPYRIGHT}</span>
        </footer>
      </main>
    </div>
  );
}

function DemoBanner({ onData }: { onData: boolean }) {
  const { exitDemo } = useLedger();
  return (
    <div className="demo-banner" role="status">
      <span>
        <strong>Demo mode.</strong> Every transaction here is invented. Nothing is saved.
      </span>
      <span className="row wrap" style={{ gap: 6 }}>
        {!onData && (
          <a className="btn btn-sm btn-primary" href={href(['data'])}>
            Use my own data
          </a>
        )}
        <button className="btn btn-sm" onClick={exitDemo}>
          Exit demo
        </button>
      </span>
    </div>
  );
}

function Welcome() {
  const { startDemo, today } = useLedger();
  const [source, setSource] = useState<'statements' | 'ledger'>('statements');
  return (
    <div className="welcome">
      <div className={`card card-pad welcome-card stack${source === 'statements' ? ' welcome-wide' : ''}`} style={{ gap: 16, padding: 28 }}>
        <div className="row" style={{ gap: 12 }}>
          <BrandMark />
          <h1>AI Spending Tracker</h1>
        </div>
        <p className="secondary">
          See what you spend on AI tools and services, which providers it goes to, and how it changes month to month.{' '}
          {PRIVACY_SENTENCE} <a href={PRIVACY_PATH} style={{ textDecoration: 'underline' }}>Privacy statement</a>
        </p>
        <div className="welcome-demo">
          <div>
            <strong>Just looking?</strong>
            <p className="small secondary">Explore the app with invented data for 24 AI providers. Nothing is saved.</p>
          </div>
          <button className="btn btn-primary" onClick={startDemo}>
            Explore demo data
          </button>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row-between wrap">
            <strong>Use your own data</strong>
            <Segmented<'statements' | 'ledger'>
              label="Data source"
              value={source}
              onChange={setSource}
              options={[
                { value: 'statements', label: 'Bank or card statements' },
                { value: 'ledger', label: 'Ledger CSV' },
              ]}
            />
          </div>
          {source === 'statements' ? (
            <StatementImport
              intro={
                <p className="small secondary">
                  Drop the statements you already download from your bank or card. The app finds the AI charges, explains each
                  decision, and lets you review anything it is unsure about before saving.
                </p>
              }
            />
          ) : (
            <ImportPanel
              extraActions={
                <button className="btn" onClick={() => exportCsv(generateDemo({ end: today }), 'ai-spending-example.csv')}>
                  Download example CSV
                </button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Root() {
  const { load, mode, reload, startDemo } = useLedger();
  // The demo lives in memory, so it works even when browser storage is blocked.
  if (mode === 'demo') return <Shell />;
  if (load.status === 'loading') {
    return (
      <div className="center-screen">
        <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
          <div className="spinner" />
          <span>Opening your local data…</span>
        </div>
      </div>
    );
  }
  if (load.status === 'error') {
    return (
      <div className="center-screen">
        <div className="card card-pad" style={{ maxWidth: 460 }}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>Can't open local storage</h2>
          <p className="secondary" style={{ marginBottom: 12 }}>
            This app keeps your data in the browser's IndexedDB, which isn't available right now. Private browsing
            windows and some privacy settings block it.
          </p>
          <p className="small muted" style={{ marginBottom: 14 }}>Details: {load.message}</p>
          <div className="row wrap">
            <button className="btn btn-primary" onClick={() => void reload()}>Try again</button>
            <button className="btn" onClick={startDemo}>Explore demo data instead</button>
          </div>
        </div>
      </div>
    );
  }
  return mode === 'empty' ? <Welcome /> : <Shell />;
}

export default function App() {
  return (
    <LedgerProvider>
      <Root />
    </LedgerProvider>
  );
}
