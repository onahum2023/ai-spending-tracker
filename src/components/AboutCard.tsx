import { BUILD_INFO, THIRD_PARTY_NOTICES_URL } from '../buildInfo';
import { PRIVACY_PATH } from '../content/privacy';
import { BRAND, BRAND_URL, COPYRIGHT, OWNER, OWNER_URL } from '../content/site';
import { dateLabel } from '../lib/dates';
import { Button, Card } from './ui';

/** Version, build and licensing of the app itself. */
export function AboutCard() {
  const { version, commit, date, license } = BUILD_INFO;
  return (
    <Card title="About" subtitle="This version of the app">
      <dl className="about-list small">
        <dt className="muted">Version</dt>
        <dd className="num">{version}</dd>
        <dt className="muted">Build</dt>
        <dd className="num">
          {commit ? `${commit} · ` : ''}
          {dateLabel(date)}
        </dd>
        <dt className="muted">Owner</dt>
        <dd>
          {COPYRIGHT} ·{' '}
          <Button variant="text" href={BRAND_URL} target="_blank" rel="noopener noreferrer">
            {BRAND}
          </Button>{' '}
          is a brand of{' '}
          <Button variant="text" href={OWNER_URL} target="_blank" rel="noopener noreferrer">
            {OWNER}
          </Button>
        </dd>
        {license && (
          <>
            <dt className="muted">License</dt>
            <dd>{license}</dd>
          </>
        )}
        <dt className="muted">Privacy</dt>
        <dd>
          <Button variant="text" href={PRIVACY_PATH}>
            Privacy statement
          </Button>
        </dd>
        <dt className="muted">Third-party software</dt>
        <dd>
          <Button variant="text" href={THIRD_PARTY_NOTICES_URL} target="_blank" rel="noreferrer">
            Licenses of the libraries this app includes
          </Button>
        </dd>
      </dl>
    </Card>
  );
}
