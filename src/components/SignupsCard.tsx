import { useMemo, useState } from 'react';
import { dateLabel } from '../lib/dates';
import { formatEUR } from '../lib/money';
import { correlateSignups, setSignupHidden, summarizeOutcomes, type SignupOutcome } from '../lib/signups';
import { href } from '../router';
import { useLedger } from '../store';
import { Card, EmptyState, ProviderLink, Segmented } from './ui';

type Filter = 'all' | 'charged' | 'none' | 'trials';

function Status({ o }: { o: SignupOutcome }) {
  const plural = (n: number) => `${n} charge${n === 1 ? '' : 's'}`;
  if (o.status === 'charged' && o.firstCharge) {
    return (
      <>
        <span className={`chip ${o.signup.kind === 'trial' ? 'chip-warn' : 'chip-accent'}`}>
          {o.signup.kind === 'trial' ? 'Trial, then charges' : 'Charging'}
        </span>
        <div className="small muted num">
          First charge {o.firstCharge.daysAfter === 0 ? 'the same day' : `${o.firstCharge.daysAfter} day${o.firstCharge.daysAfter === 1 ? '' : 's'} later`} (
          {dateLabel(o.firstCharge.date)}, {formatEUR(o.firstCharge.cents)}) · {plural(o.chargesSince)}, {formatEUR(o.centsSince)} so far
        </div>
      </>
    );
  }
  if (o.status === 'existing') {
    return (
      <>
        <span className="chip">Already a customer</span>
        <div className="small muted">
          Charged before this sign-up too, so the {o.chargesSince ? plural(o.chargesSince) : 'charges'} since can't be tied to it.
        </div>
      </>
    );
  }
  if (o.status === 'unknown') return <span className="small muted">Your ledger ends before this date</span>;
  return <span className="chip chip-ended">No charges since</span>;
}

function SignupTable({ list, action, title, onAction }: { list: SignupOutcome[]; action: string; title: string; onAction: (o: SignupOutcome) => void }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Provider</th>
            <th className="hide-sm">Service</th>
            <th>Signed up</th>
            <th>Since then</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((o) => (
            <tr key={o.signup.provider + o.signup.date}>
              <td>
                {o.ledgerProvider ? <ProviderLink provider={o.ledgerProvider} /> : <span style={{ fontWeight: 500 }}>{o.signup.provider}</span>}
              </td>
              <td className="hide-sm secondary">{o.signup.service ?? ''}</td>
              <td className="nowrap">
                <span className="date" style={{ whiteSpace: 'nowrap' }}>{dateLabel(o.signup.date)}</span>
                <div className="small muted">{o.signup.kind === 'trial' ? 'Trial started' : 'Sign-up'}</div>
              </td>
              <td><Status o={o} /></td>
              <td className="amount">
                <button className="btn btn-sm btn-ghost" onClick={() => onAction(o)} title={title}>
                  {action}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Sign-up and trial-start events from email, with what the ledger shows from the same provider afterwards. */
export function SignupsCard() {
  const { signups, setSignups, transactions } = useLedger();
  const [filter, setFilter] = useState<Filter>('all');
  const [showHidden, setShowHidden] = useState(false);
  const everything = useMemo(() => correlateSignups(signups, transactions), [signups, transactions]);
  const outcomes = useMemo(() => everything.filter((o) => !o.signup.hidden), [everything]);
  const hidden = useMemo(() => everything.filter((o) => o.signup.hidden), [everything]);
  const sum = useMemo(() => summarizeOutcomes(outcomes), [outcomes]);
  const toggle = (o: SignupOutcome, hide: boolean) => void setSignups(setSignupHidden(signups, o.signup, hide));
  const shown = outcomes.filter((o) =>
    filter === 'all' ? true : filter === 'charged' ? o.status === 'charged' : filter === 'none' ? o.status === 'no-charge' : o.signup.kind === 'trial',
  );

  return (
    <Card
      title="Sign-ups and trials"
      subtitle="Welcome and trial-start emails, and whether the same provider has charged you since"
      actions={
        outcomes.length > 0 ? (
          <Segmented<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${sum.total}` },
              { value: 'charged', label: `Charged ${sum.charged}` },
              { value: 'none', label: `No charge ${sum.noCharge}` },
              { value: 'trials', label: `Trials ${sum.trials}` },
            ]}
          />
        ) : undefined
      }
    >
      {everything.length === 0 ? (
        <EmptyState>
          No sign-ups yet. <a href={href(['data'])} style={{ textDecoration: 'underline' }}>Import them from an email file on the Data page.</a>
        </EmptyState>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {outcomes.length === 0 ? (
            <p className="small secondary">All {hidden.length} sign-ups are hidden.</p>
          ) : (
            <>
              <p className="small secondary">
                {sum.charged} of {sum.total} sign-ups were followed by a charge from the same provider
                {sum.trials > 0 && <> ({sum.trialsCharged} of {sum.trials} trials)</>}; {sum.noCharge} had no charge since
                {sum.existing > 0 && <>; {sum.existing} {sum.existing === 1 ? 'was an existing customer' : 'were existing customers'}</>}.
              </p>
              <SignupTable list={shown} action="Hide" title="Hide this entry. Importing the file again will not bring it back." onAction={(o) => toggle(o, true)} />
            </>
          )}
          {hidden.length > 0 && (
            <div>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? 'Hide the list of' : 'Show'} {hidden.length} hidden sign-up{hidden.length === 1 ? '' : 's'}
              </button>
            </div>
          )}
          {showHidden && hidden.length > 0 && (
            <SignupTable list={hidden} action="Restore" title="Show this entry again" onAction={(o) => toggle(o, false)} />
          )}
          <p className="small muted">
            Matched by provider name. A charge under a different name, or on a card you have not imported, will not show here, and a
            sign-up alone does not mean a paid plan.
          </p>
        </div>
      )}
    </Card>
  );
}
