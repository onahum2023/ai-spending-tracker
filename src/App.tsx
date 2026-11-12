import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PeriodPicker } from './components/PeriodPicker';
import { dateLabel } from './lib/dates';
import { DataPage } from './pages/DataPage';
import { Button, Card, ProviderAvatar } from './components/ui';
import { Overview } from './pages/Overview';
import { ProviderDetail } from './pages/ProviderDetail';
import { Providers } from './pages/Providers';
import { Transactions } from './pages/Transactions';
import { Insights } from './pages/Insights';
import { Welcome } from './pages/Welcome';
import { PRIVACY_PATH } from './content/privacy';
import { COPYRIGHT } from './content/site';
import { href, navigate, useRoute } from './router';
import { LedgerProvider, useLedger } from './store';

const icons: Record<string, ReactNode> = {
  overview: <path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z" />,
  providers: <path d="M4 6h16M4 12h16M4 18h10" />,
  transactions: <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />,
  insights: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  data: <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
};

/** The five pages, in the order of the top bar and the mobile tab bar. */
const NAV = [
  { key: 'overview', label: 'Overview', path: [] as string[] },
  { key: 'providers', label: 'Providers', path: ['providers'] },
  { key: 'insights', label: 'Insights', path: ['insights'] },
  { key: 'transactions', label: 'Transactions', path: ['transactions'] },
  { key: 'data', label: 'Data', path: ['data'] },
];

/** The pages that need data. With none, they show the Welcome page instead. */
const NEEDS_DATA = new Set(['overview', 'providers', 'insights', 'transactions']);

function Icon({ name }: { name: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
const MOVED: Record<string, string[]> = { trends: ['insights'], subscriptions: [] };

function Shell() {
  const route = useRoute();
  const { span, mode } = useLedger();
  const hasData = mode !== 'empty';
  const rawSection = route.path[0] ?? 'overview';
  const section = rawSection in MOVED ? 'overview' : rawSection;
  const providerName = section === 'providers' ? route.path[1] : undefined;
  useEffect(() => {
    if (rawSection in MOVED) navigate(MOVED[rawSection], undefined, true);
  }, [rawSection]);

  // About is the Welcome page. So is every page that needs data, while there is none.
  const welcome = section === 'about' || (!hasData && NEEDS_DATA.has(section));

  let title: ReactNode = 'Overview';
  let page: ReactNode = <Overview />;
  let crumb: ReactNode = null;
  let meta: ReactNode = null;
  let showPeriod = true;
  switch (section) {
    case 'providers':
      if (providerName) {
        title = (
          <span className="row" style={{ gap: 12 }}>
            <ProviderAvatar provider={providerName} size={28} />
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
    default:
      if (span) meta = `Data through ${dateLabel(span.lastDate)}`;
  }

  return (
    <div className="app">
      <header className="topnav">
        <div className="topnav-inner">
          <a className="brand" href={href(hasData ? [] : ['about'])}>
            <BrandMark />
            <span>AI Spending</span>
          </a>
          <nav className="topnav-links" aria-label="Main">
            {NAV.map((n) => (
              <a key={n.key} href={href(n.path)} className={!welcome && section === n.key ? 'active' : ''} aria-current={!welcome && section === n.key ? 'page' : undefined}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="topnav-right">
            {mode === 'demo' && <DemoPill />}
            <a className={`topnav-about${section === 'about' ? ' active' : ''}`} href={href(['about'])} aria-current={section === 'about' ? 'page' : undefined}>
              About
            </a>
          </div>
        </div>
      </header>
      <main className="main">
        {welcome ? (
          <Welcome />
        ) : (
          <>
            <div className="page-head">
              <div className="page-head-title">
                {crumb && <div className="crumb">{crumb}</div>}
                <h1>{title}</h1>
                {meta && <div className="meta">{meta}</div>}
              </div>
              {showPeriod && <PeriodPicker />}
            </div>
            {page}
          </>
        )}
        <footer className="app-foot">
          <a href={PRIVACY_PATH}>Privacy</a>
          <span className="app-foot-owner">{COPYRIGHT}</span>
        </footer>
      </main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.key} href={href(n.path)} className={!welcome && section === n.key ? 'active' : ''} aria-current={!welcome && section === n.key ? 'page' : undefined}>
            <Icon name={n.key} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

/**
 * Shown in the top bar, on every page, while the demo runs: a small neutral pill. It opens a menu with the two ways out: go and use
 * your own data, or leave the demo. It replaces the full-width banner.
 */
function DemoPill() {
  const { exitDemo } = useLedger();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="demo-menu" ref={box}>
      <button
        type="button"
        className="pill pill-neutral demo-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Every transaction here is invented. Nothing is saved."
        onClick={() => setOpen((o) => !o)}
      >
        Demo data <span aria-hidden="true" className="demo-caret">▾</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <a role="menuitem" href={href(['data'])} onClick={() => setOpen(false)}>
            Use my own data
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              exitDemo();
            }}
          >
            Exit demo
          </button>
        </div>
      )}
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
        <Card title="Can't open local storage" className="error-card">
          <p className="secondary" style={{ marginBottom: 12 }}>
            This app keeps your data in the browser's IndexedDB, which isn't available right now. Private browsing
            windows and some privacy settings block it.
          </p>
          <p className="meta" style={{ marginBottom: 16 }}>Details: {load.message}</p>
          <div className="row wrap">
            <Button variant="primary" onClick={() => void reload()}>Try again</Button>
            <Button onClick={startDemo}>Explore demo data instead</Button>
          </div>
        </Card>
      </div>
    );
  }
  return <Shell />;
}

export default function App() {
  return (
    <LedgerProvider>
      <Root />
    </LedgerProvider>
  );
}
