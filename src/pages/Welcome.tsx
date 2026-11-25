import type { ReactNode } from 'react';
import { AboutCard } from '../components/AboutCard';
import { Button, Icon, Pill, ProviderAvatar } from '../components/ui';
import { WelcomeExamples } from '../components/WelcomeExamples';
import { PRIVACY_PATH } from '../content/privacy';
import { CLOSING_TITLE, EYEBROW, FAMILIAR, FAQ, FEATURES, HEADLINE, PRIVACY_FLOW, PRIVACY_LINES, PRIVACY_TITLE, STATEMENT_EXAMPLE, STEPS, SUBHEAD, TRUST_PILLS } from '../content/welcome';
import { href, navigate } from '../router';
import { LedgerProvider, useLedger, type DataMode } from '../store';

/**
 * The Welcome page, written to sell: a landing-page composition of full-width sections (no boxes around them) for people who try
 * many AI tools and lose track of what they pay for. The app opens on it when the browser has no data, and "About" in the top bar
 * opens it at any time.
 *
 * The hero shows a card statement the way the app reads it: price jumps, overlaps and guesses marked in the app's own colours.
 * The example insights are the app's real components, rendered from the demo data in a read-only, demo-only ledger, so they never
 * go stale and never touch what is stored in this browser.
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

function Section({ title, id, children, className = '' }: { title: string; id: string; children: ReactNode; className?: string }) {
  return (
    <section className={`w-section ${className}`.trim()} aria-labelledby={id}>
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
        <div className="w-inner w-hero-grid">
          <div>
            <p className="w-eyebrow">{EYEBROW}</p>
            <h1 className="w-display">{HEADLINE}</h1>
            <p className="w-lead">{SUBHEAD}</p>
            <div className="row wrap w-actions">
              <PrimaryAction mode={mode} onExplore={onExplore} />
              <Button large href={href(['data'])}>
                {mode === 'mine' ? 'Import more data' : 'Import your statements'}
              </Button>
            </div>
            <ul className="w-pills" aria-label="At a glance">
              {TRUST_PILLS.map((p) => (
                <li key={p.text}>
                  <Icon name={p.icon} size={16} />
                  {p.href ? (
                    <a href={p.href} target="_blank" rel="noopener noreferrer">
                      {p.text}
                    </a>
                  ) : (
                    p.text
                  )}
                </li>
              ))}
            </ul>
          </div>
          <StatementExample />
        </div>
      </section>

      <Section title="Sound familiar?" id="w-familiar">
        <div className="w-familiar">
          {FAMILIAR.map((line, i) => (
            <p key={line} className={`tone-${(['rise', 'overlap', 'rise'] as const)[i % 3]}`}>
              {line}
            </p>
          ))}
        </div>
      </Section>

      <Section title="What you'll find out" id="w-find-out">
        <WelcomeExamples />
      </Section>

      <Section title="What you get" id="w-what" className="w-soft">
        <ul className="w-features">
          {FEATURES.map((f) => (
            <li key={f.title} className={`w-feature tone-${f.tone}`}>
              <span className="w-feature-icon">
                <Icon name={f.icon} size={24} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
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
          <ol className="w-flow">
            {PRIVACY_FLOW.map((f) => (
              <li key={f.title} className={f.none ? 'w-flow-none' : undefined}>
                <span className="w-flow-icon">
                  <Icon name={f.icon} size={22} />
                </span>
                <strong>{f.title}</strong>
                <span>{f.text}</span>
              </li>
            ))}
          </ol>
          <p>
            <Button variant="text" arrow href={PRIVACY_PATH}>
              Privacy statement
            </Button>
          </p>
        </div>
      </section>

      <section className="w-section" aria-label="How it works, and questions">
        <div className="w-inner w-how">
          <div>
            <h2 className="w-h2" id="w-how">
              How it works
            </h2>
            <ol className="w-steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="w-step-n">{i + 1}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="w-h2" id="w-faq">
              Questions
            </h2>
            <dl className="w-faq">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt>{f.q}</dt>
                  <dd>{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="w-section w-closing" aria-labelledby="w-closing">
        <div className="w-inner">
          <div className="w-closing-panel">
            <h2 className="w-h2" id="w-closing">
              {CLOSING_TITLE}
            </h2>
            <div className="row wrap w-actions">
              <PrimaryAction mode={mode} onExplore={onExplore} />
            </div>
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
 * Four lines of a card statement as the bank prints them, each with what the app reads in it: a price jump, an overlap, a guess.
 * Invented, and marked so. The vendor marks are the app's own (bundled, never fetched).
 */
function StatementExample() {
  return (
    <figure className="w-statement" aria-label="An example card statement, annotated the way the app reads it">
      <figcaption>
        <span>Card statement, November</span>
        <span className="w-found">4 AI charges found</span>
      </figcaption>
      <ol>
        {STATEMENT_EXAMPLE.map((l) => (
          <li key={l.text}>
            <div className="w-st-row">
              <span className="w-st-date">{l.date}</span>
              <span className="w-st-text">
                <ProviderAvatar provider={l.provider} size={24} />
                {l.text}
              </span>
              <span className="w-st-amt">{l.amount}</span>
            </div>
            <div className="w-st-note">
              <Pill kind={l.note.kind}>{l.note.pill}</Pill>
              {l.note.was && (
                <>
                  was <s className="w-was">{l.note.was}</s>
                </>
              )}
              <span>{l.note.text}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="w-st-foot">Invented example</p>
    </figure>
  );
}
