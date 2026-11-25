import { useMemo, useState, type ReactNode } from 'react';
import { ImportPanel } from './components/ImportPanel';
import { PeriodPicker } from './components/PeriodPicker';
import { dateLabel } from './lib/dates';
import { formatEUR, sumCents } from './lib/money';
import { DataPage } from './pages/DataPage';
import { exportCsv } from './lib/download';
import { StatementImport } from './components/StatementImport';
import { Notice, ProviderDot, Segmented } from './components/ui';
import { generateDemo } from './lib/demoData';
import { Overview } from './pages/Overview';
import { ProviderDetail } from './pages/ProviderDetail';
import { Subscriptions } from './pages/Subscriptions';
import { Providers } from './pages/Providers';
import { Transactions } from './pages/Transactions';
import { Trends } from './pages/Trends';
import { PRIVACY_PATH, PRIVACY_SENTENCE } from './content/privacy';
import { COPYRIGHT } from './content/site';
import { href, useRoute } from './router';
import { LedgerProvider, useLedger } from './store';
import { reviewCounts } from './lib/providerChargeTypes';

const icons: Record<string, ReactNode> = {
  overview: <path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z" />,
  subscriptions: <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />,
  providers: <path d="M4 6h16M4 12h16M4 18h10" />,
  transactions: <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />,
  trends: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  data: <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
};

const NAV = [
  { key: 'overview', label: 'Overview', path: [] as string[] },
  { key: 'subscriptions', label: 'Subscriptions', path: ['subscriptions'] },
  { key: 'providers', label: 'Providers', path: ['providers'] },
  { key: 'transactions', label: 'Charges', path: ['transactions'] },
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
  const { transactions, span, mode, overrides } = useLedger();
  const toReview = useMemo(() => [...reviewCounts(transactions, overrides).values()].reduce((a, b) => a + b, 0), [transactions, overrides]);
  const section = route.path[0] ?? 'overview';
  const providerName = section === 'providers' ? route.path[1] : undefined;

  let title: ReactNode = 'Overview';
  let page: ReactNode = <Overview />;
  let crumb: ReactNode = null;
  let showPeriod = true;
  // Every page says what it is for, and what time it covers. A page without its own period says so.
  let desc = 'What you spent on AI tools, where it went, and where this month is heading.';
  let scope: ReactNode = null;
  const through = span ? dateLabel(span.lastDate) : null;
  switch (section) {
    case 'providers':
      if (providerName) {
        title = (
          <span className="row gap-3">
            <ProviderDot provider={providerName} />
            {providerName}
          </span>
        );
        crumb = <a href={href(['providers'])}>← Providers</a>;
        desc = 'Charges, subscription patterns and how each charge type is read for this provider.';
        page = <ProviderDetail provider={providerName} />;
        showPeriod = false;
      } else {
        title = 'Providers';
        desc = 'Every provider you pay, ranked by spend. Open one to confirm how its charges are read.';
        page = <Providers />;
      }
      break;
    case 'subscriptions':
      title = 'Subscriptions';
      desc = 'Recurring charges the app found in your data, and what they add up to.';
      scope = through && `Based on charges through ${through}`;
      page = <Subscriptions />;
      showPeriod = false;
      break;
    case 'transactions':
      title = 'Charges';
      desc = 'Every recorded charge. Filter, tag Personal or Business, or correct them here.';
      scope = through && `All dates, through ${through}`;
      page = <Transactions route={route} />;
      showPeriod = false;
      break;
    case 'trends':
      title = 'Trends';
      desc = 'How spending changes over time, and what drives the change.';
      scope = through && `All months, through ${through}`;
      page = <Trends />;
      showPeriod = false;
      break;
    case 'data':
      title = 'Data';
      desc = 'Import statements, export your data and manage what is stored.';
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
              {n.key === 'providers' && toReview > 0 && (
                <span className="nav-count" title={`${toReview} charge types to confirm`}>{toReview}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="device-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            {mode === 'demo' ? 'Demo, not stored' : 'On this device'}
          </div>
          <div>
            <strong>{transactions.length}</strong> charges, <strong>{formatEUR(sumCents(transactions))}</strong>
          </div>
          {span && <div>Latest {dateLabel(span.lastDate)}</div>}
          <div className="mt-2">{mode === 'demo' ? 'Invented data. Nothing is saved.' : 'Stored in this browser only. Nothing is uploaded.'}</div>
        </div>
      </aside>
      <main className="main">
        {mode === 'demo' && <DemoBanner onData={section === 'data'} />}
        <div className="topbar">
          <div className="topbar-title">
            {crumb && <div className="crumb">{crumb}</div>}
            <h1>{title}</h1>
            <p className="page-desc">{desc}</p>
          </div>
          {showPeriod ? <PeriodPicker /> : scope && <span className="page-scope">{scope}</span>}
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
    <Notice
      tone="info"
      role="status"
      className="notice-slot"
      actions={
        <>
          {!onData && (
            <a className="btn btn-sm btn-primary" href={href(['data'])}>
              Use my own data
            </a>
          )}
          <button className="btn btn-sm" onClick={exitDemo}>
            Exit demo
          </button>
        </>
      }
    >
      <strong>Demo mode.</strong> Every transaction here is invented. Nothing is saved.
    </Notice>
  );
}

function Welcome() {
  const { startDemo, today } = useLedger();
  const [source, setSource] = useState<'statements' | 'ledger'>('statements');
  return (
    <div className="welcome">
      <div className={`card card-pad welcome-card stack${source === 'statements' ? ' welcome-wide' : ''}`}>
        <div className="row gap-3">
          <BrandMark />
          <h1>AI Spending Tracker</h1>
        </div>
        <p className="secondary">
          See what you spend on AI tools and services, which providers it goes to, and how it changes month to month.{' '}
          {PRIVACY_SENTENCE} <a href={PRIVACY_PATH} className="link">Privacy statement</a>
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
        <div className="stack gap-3">
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
        <div className="center-stack">
          <div className="spinner" />
          <span>Opening your local data…</span>
        </div>
      </div>
    );
  }
  if (load.status === 'error') {
    return (
      <div className="center-screen">
        <div className="card card-pad card-narrow">
          <h2 className="title-lg">Can't open local storage</h2>
          <p className="secondary mt-2 mb-3">
            This app keeps your data in the browser's IndexedDB, which isn't available right now. Private browsing
            windows and some privacy settings block it.
          </p>
          <p className="small muted mb-3">Details: {load.message}</p>
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
