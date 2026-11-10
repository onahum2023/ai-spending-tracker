import { BUILD_INFO, THIRD_PARTY_NOTICES_URL } from '../buildInfo';
import { PRIVACY_PATH } from '../content/privacy';
import { BRAND, BRAND_URL, COPYRIGHT, OWNER, OWNER_URL } from '../content/site';
import { dateLabel } from '../lib/dates';
import { Card } from './ui';

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
          <a href={BRAND_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
            {BRAND}
          </a>{' '}
          is a brand of{' '}
          <a href={OWNER_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
            {OWNER}
          </a>
        </dd>
        {license && (
          <>
            <dt className="muted">License</dt>
            <dd>{license}</dd>
          </>
        )}
        <dt className="muted">Privacy</dt>
        <dd>
          <a href={PRIVACY_PATH} style={{ textDecoration: 'underline' }}>
            Privacy statement
          </a>
        </dd>
        <dt className="muted">Third-party software</dt>
        <dd>
          <a href={THIRD_PARTY_NOTICES_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
            Licenses of the libraries this app includes
          </a>
        </dd>
      </dl>
    </Card>
  );
}
