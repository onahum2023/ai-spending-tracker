import { AboutCard } from '../components/AboutCard';
import { Button, Card, CardAction, Disclosure } from '../components/ui';
import { FAQ, FEATURES, HEADLINE, OVERVIEW_SHOT, PRIVACY_SENTENCE, STEPS, SUBHEAD } from '../content/welcome';
import { PRIVACY_PATH } from '../content/privacy';
import { href, navigate } from '../router';
import { useLedger } from '../store';

/**
 * The one Welcome page. The app opens on it when the browser has no data, and "About" in the top bar opens it at any time.
 * It replaces the separate landing page and the welcome screen: what the app does, the two ways to start, how it works, privacy
 * and the questions people ask.
 *
 * The two buttons follow the data: with none they are "Explore demo data" and "Import your own data". While the demo runs or
 * your data is stored, the first one takes you back into the app instead (starting the demo would do nothing then).
 */
export function Welcome() {
  const { mode, startDemo } = useLedger();
  const explore = () => {
    startDemo();
    navigate([]);
  };
  return (
    <div className="welcome stack">
      <Card className="welcome-hero">
        <h1 className="welcome-title">{HEADLINE}</h1>
        <p className="welcome-lead">{SUBHEAD}</p>
        <div className="row wrap welcome-actions">
          {mode === 'empty' ? (
            <Button variant="primary" onClick={explore}>
              Explore demo data
            </Button>
          ) : (
            <Button variant="primary" href={href([])}>
              {mode === 'demo' ? 'Back to the demo' : 'Open Overview'}
            </Button>
          )}
          <Button href={href(['data'])}>{mode === 'mine' ? 'Import more data' : 'Import your own data'}</Button>
        </div>
        <p className="meta">
          {mode === 'empty' ? 'The demo uses invented data for 24 providers and saves nothing.' : mode === 'demo' ? 'Every transaction in the demo is invented. Nothing is saved.' : 'Your data is stored in this browser.'}
        </p>
        <picture className="welcome-shot">
          <source media="(prefers-color-scheme: dark)" srcSet={OVERVIEW_SHOT.dark} />
          <img src={OVERVIEW_SHOT.light} alt={OVERVIEW_SHOT.alt} width={OVERVIEW_SHOT.width} height={OVERVIEW_SHOT.height} />
        </picture>
      </Card>

      <Card title="What it does">
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <h3 className="section-label">{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid cols-2-even">
        <Card title="How it works">
          <ol className="steps">
            {STEPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </Card>
        <Card title="Privacy" action={<CardAction href={PRIVACY_PATH}>Privacy statement</CardAction>}>
          <p>{PRIVACY_SENTENCE}</p>
        </Card>
      </div>

      <Card title="Questions">
        <div className="faq">
          {FAQ.map((f) => (
            <Disclosure key={f.q} label={f.q}>
              <p className="meta">{f.a}</p>
            </Disclosure>
          ))}
        </div>
      </Card>

      <AboutCard />
    </div>
  );
}
