import type { ReactNode } from 'react';
import { ImportPanel } from './components/ImportPanel';
import { PeriodPicker } from './components/PeriodPicker';
import { ProviderDot } from './components/ui';
import { dateLabel } from './lib/dates';
import { formatEUR, sumCents } from './lib/money';
import { DataPage, exportCsv } from './pages/DataPage';
import { generateDemo } from './lib/demoData';
import { Overview } from './pages/Overview';
import { ProviderDetail } from './pages/ProviderDetail';
import { Providers } from './pages/Providers';
import { Transactions } from './pages/Transactions';
import { Trends } from './pages/Trends';
import { href, useRoute } from './router';
import { LedgerProvider, useLedger } from './store';

const icons: Record<string, ReactNode> = {
  overview: <path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z" />,
  providers: <path d="M4 6h16M4 12h16M4 18h10" />,
  transactions: <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />,
  trends: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  data: <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
};

const NAV = [
  { key: 'overview', label: 'Overview', path: [] as string[] },
  { key: 'providers', label: 'Providers', path: ['providers'] },
  { key: 'transactions', label: 'Transactions', path: ['transactions'] },
  { key: 'trends', label: 'Trends', path: ['trends'] },
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

function Shell() {
  const route = useRoute();
  const { transactions, span, mode } = useLedger();
  const section = route.path[0] ?? 'overview';
  const providerName = section === 'providers' ? route.path[1] : undefined;

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
    case 'transactions':
      title = 'Transactions';
      page = <Transactions route={route} />;
      showPeriod = false;
      break;
    case 'trends':
      title = 'Trends';
      page = <Trends />;
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
  return (
    <div className="welcome">
      <div className="card card-pad welcome-card stack" style={{ gap: 16, padding: 28 }}>
        <div className="row" style={{ gap: 12 }}>
          <BrandMark />
          <h1>AI Spending Tracker</h1>
        </div>
        <p className="secondary">
          See what you spend on AI tools and services, which providers it goes to, and how it changes month to month.
          Everything runs in your browser: your data is never uploaded.
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
        <div className="stack" style={{ gap: 8 }}>
          <strong>Use your own data</strong>
          <ImportPanel
            extraActions={
              <button className="btn" onClick={() => exportCsv(generateDemo({ end: today }), 'ai-spending-example.csv')}>
                Download example CSV
              </button>
            }
          />
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
