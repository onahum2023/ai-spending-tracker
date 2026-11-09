import { useRef, useState } from 'react';
import { mergeSignups, parseEvidence, type Signup } from '../lib/signups';
import { useLedger } from '../store';
import { Card } from './ui';

const MAX_BYTES = 25 * 1024 * 1024;

interface Preview {
  fileName: string;
  signups: Signup[];
  observationsRead: number;
  added: number;
}

/** Reads sign-up and trial-start events from an email-evidence JSON file, in the browser. Nothing is uploaded. */
export function SignupImport() {
  const { signups, setSignups } = useLedger();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    setError(null);
    setMessage(null);
    setPreview(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setError('This file is larger than 25 MB, which is not an email-evidence file this app can read.');
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return setError('This file is not valid JSON.');
    }
    const r = parseEvidence(json);
    if (r.error) return setError(r.error);
    setPreview({
      fileName: file.name,
      signups: r.signups,
      observationsRead: r.observationsRead,
      added: mergeSignups(signups, r.signups).added,
    });
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const { merged, added } = mergeSignups(signups, preview.signups);
      await setSignups(merged);
      setMessage(`Added ${added} sign-up${added === 1 ? '' : 's'}${added < preview.signups.length ? `; ${preview.signups.length - added} were already stored` : ''}.`);
      setPreview(null);
      if (input.current) input.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the sign-ups.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Import sign-ups from email"
      subtitle="Welcome and trial-start emails, to see which sign-ups turned into charges"
    >
      <div className="stack" style={{ gap: 10 }}>
        <p className="small secondary">
          Choose an email-evidence JSON file. It is read in this browser. Only clear sign-up and trial-start events are kept, and of
          those only the provider, service, date and type: message IDs, links, addresses and everything else in the file are discarded.
        </p>
        <div className="row wrap">
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            aria-label="Email-evidence file"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          {signups.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => void setSignups([])}>
              Remove all {signups.length} stored sign-ups
            </button>
          )}
        </div>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {message && <div className="notice notice-ok" role="status">{message}</div>}
        {preview && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="notice notice-info">
              {preview.fileName}: found {preview.signups.length} sign-up or trial-start event{preview.signups.length === 1 ? '' : 's'} among{' '}
              {preview.observationsRead} observations ({preview.added} new).
            </div>
            <div className="row">
              <button className="btn btn-primary" onClick={() => void save()} disabled={busy || preview.added === 0}>
                Save {preview.added} sign-up{preview.added === 1 ? '' : 's'}
              </button>
              <button className="btn" onClick={() => setPreview(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
