import type { ReactNode } from 'react';
import { AboutCard } from '../components/AboutCard';
import { heroLabel, OverviewHero, OverviewTiles } from '../components/OverviewHero';
import { OverviewChartCard, useOverviewData } from '../components/OverviewParts';
import { Button, Disclosure } from '../components/ui';
import { WelcomeExamples } from '../components/WelcomeExamples';
import { PRIVACY_PATH } from '../content/privacy';
import { CLOSING_TITLE, EYEBROW, FAMILIAR, FAQ, HEADLINE, PRIVACY_LINES, PRIVACY_TITLE, STEPS, SUBHEAD, TRUST_LINE } from '../content/welcome';
import { href, navigate } from '../router';
import { LedgerProvider, useLedger, type DataMode } from '../store';
import { sumCents } from '../lib/money';

/**
 * The Welcome page, written to sell: a landing-page composition of full-width sections (no boxes around them) for people who try
 * many AI tools and lose track of what they pay for. The app opens on it when the browser has no data, and "About" in the top bar
 * opens it at any time.
 *
 * The hero visual and the example insights are the app's real components, rendered from the demo data in a read-only, demo-only
 * ledger, so they never go stale and never touch what is stored in this browser.
 *
 * The buttons follow the data: with none they are "Try it with demo data" and "Import your statements". While the demo runs or
 * your data is stored, the first one takes you back into the app instead (starting the demo would do nothing then).
 */
export function Welcome() {
  const { mode, startDemo } = useLedger();
  const explore = () => {
    startDemo();
    navigate([]);
  };
  return (
    <LedgerProvider demoOnly>
      <WelcomePage mode={mode} onExplore={explore} />
    </LedgerProvider>
  );
}

function PrimaryAction({ mode, onExplore }: { mode: DataMode; onExplore: () => void }) {
  return mode === 'empty' ? (
    <Button variant="primary" large onClick={onExplore}>
      Try it with demo data
    </Button>
  ) : (
    <Button variant="primary" large href={href([])}>
      {mode === 'demo' ? 'Back to the demo' : 'Open Overview'}
    </Button>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section className="w-section" aria-labelledby={id}>
      <div className="w-inner">
        <h2 className="w-h2" id={id}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

function WelcomePage({ mode, onExplore }: { mode: DataMode; onExplore: () => void }) {
  return (
    <div className="welcome">
      <section className="w-hero">
        <div className="w-inner">
          <p className="w-eyebrow">{EYEBROW}</p>
          <h1 className="w-display">{HEADLINE}</h1>
          <p className="w-lead">{SUBHEAD}</p>
          <div className="row wrap w-actions">
            <PrimaryAction mode={mode} onExplore={onExplore} />
            <Button large href={href(['data'])}>
              {mode === 'mine' ? 'Import more data' : 'Import your statements'}
            </Button>
          </div>
          <p className="w-trust">{TRUST_LINE}</p>
          <HeroPreview />
        </div>
      </section>

      <Section title="Sound familiar?" id="w-familiar">
        <div className="w-familiar">
          {FAMILIAR.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </Section>

      <Section title="What you'll find out" id="w-find-out">
        <WelcomeExamples />
      </Section>

      <Section title="How it works" id="w-how">
        <ol className="w-steps">
          {STEPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </Section>

      <section className="w-band" aria-labelledby="w-privacy">
        <div className="w-inner">
          <h2 className="w-h2" id="w-privacy">
            {PRIVACY_TITLE}
          </h2>
          {PRIVACY_LINES.map((line) => (
            <p key={line} className="w-body">
              {line}
            </p>
          ))}
          <p>
            <Button variant="text" arrow href={PRIVACY_PATH}>
              Privacy statement
            </Button>
          </p>
        </div>
      </section>

      <Section title="Questions" id="w-faq">
        <div className="w-faq">
          {FAQ.map((f) => (
            <Disclosure key={f.q} label={f.q}>
              <p className="w-body">{f.a}</p>
            </Disclosure>
          ))}
        </div>
      </Section>

      <section className="w-section w-closing" aria-labelledby="w-closing">
        <div className="w-inner">
          <h2 className="w-h2" id="w-closing">
            {CLOSING_TITLE}
          </h2>
          <div className="row wrap w-actions">
            <PrimaryAction mode={mode} onExplore={onExplore} />
          </div>
        </div>
      </section>

      <div className="w-inner w-about">
        <AboutCard />
      </div>
    </div>
  );
}

/**
 * The Overview's hero row and chart, as they look with the demo data. Static: nothing in it can be clicked, focused or read out
 * (it is a picture of the app, and the text around it says what the app does).
 */
function HeroPreview() {
  const data = useOverviewData();
  if (!data) return null;
  const { period, inProgress, yearInProgress, asOf, periodRows, forecast } = data;
  return (
    <figure className="w-preview">
      <div className="w-preview-frame" inert aria-hidden="true">
        <div className="stack">
          <div className="overview-hero">
            <OverviewHero label={heroLabel(period, inProgress, yearInProgress, asOf)} totalCents={sumCents(periodRows)} inProgress={inProgress} forecast={forecast} />
            <OverviewTiles period={period} inProgress={inProgress} asOf={asOf} />
          </div>
          <OverviewChartCard data={data} />
        </div>
      </div>
      <figcaption className="meta">A live preview of the Overview, with invented demo data.</figcaption>
    </figure>
  );
}
