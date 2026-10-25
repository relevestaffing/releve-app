'use client';
import { useRouter } from 'next/navigation';
import { useState, useId } from 'react';
import { saving } from '@/components/Toast';

/* Nothing reaches an executive on one click.
   ------------------------------------------
   Release used to be a single button that silently made a person visible in
   somebody's account. It is now an approval: the panel names who is being sent
   to whom, takes the note the executive will read, and only then sends. The
   API refuses a release that does not carry the confirmation flag this panel
   sets, so no stray call can put a candidate in front of a client. */
export default function MatchControls({ clientId, talentId, talentName, clientName, matched, released, manual, note, blocked }: {
  clientId: string; talentId: string; talentName: string; clientName: string;
  matched: boolean; released: boolean; manual: boolean; note?: string | null;
  /* Why this person cannot be sent yet (not verified, Watch not cleared).
     The database would refuse anyway; this says so before the click. */
  blocked?: string | null;
}) {
  const fid = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  /* Pulling back or unmatching a released candidate takes someone out of
     the executive's account without warning, so those two arm a confirm. */
  const [armed, setArmed] = useState<null | 'unrelease' | 'remove'>(null);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setArmed(null);
    const word: Record<string, string> = {
      add: 'Matched. Not sent yet', remove: 'Unmatched',
      release: `Approved: ${talentName} is now with ${clientName}`,
      unrelease: 'Pulled back. No longer visible to them'
    };
    const ok = await saving(() => fetch('/api/admin/matches', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, talentId, action, ...extra })
    }), word[action] ?? 'Saved');
    setBusy(false); setApproving(false);
    if (ok) router.refresh();
  }

  async function approve(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await act('release', { confirm: true, note: String(f.get('note') ?? '').trim() });
  }

  if (approving) {
    return (
      <form onSubmit={approve} className="decide-form" style={{ textAlign: 'left', minWidth: 280 }}>
        <p className="small" style={{ marginBottom: 12 }}>
          Send <b>{talentName}</b> to <b>{clientName}</b>? They will see this person
          in their account and get an email. Nobody else you have released will be
          visible while this decision is open.
        </p>
        <div className="ff">
          <label htmlFor={`${fid}-1`}>Why this person <span className="muted">(they read this)</span></label>
          <textarea id={`${fid}-1`} name="note" rows={3} defaultValue={note ?? ''}
            placeholder="One or two sentences in your own words. What made you choose them for this role, and for this executive." />
        </div>
        <p className="xs muted" style={{ marginBottom: 12 }}>
          Optional, but it is the only place we tell them why in our own words.
          Your name and the time are recorded against this release.
        </p>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn solid" disabled={busy}>{busy ? 'Sending…' : `Approve & send to ${clientName}`}</button>
          <button type="button" className="btn ghost sm" onClick={() => setApproving(false)}>Cancel</button>
        </div>
      </form>
    );
  }

  if (armed) {
    return (
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="xs muted">
          {armed === 'unrelease'
            ? `Pull ${talentName} back from ${clientName}? They disappear from the executive's account.`
            : `Unmatch ${talentName} from ${clientName}? They disappear from the executive's account and the match is gone.`}
        </span>
        <button className="btn sm solid" disabled={busy} onClick={() => act(armed)}>
          {busy ? 'Working…' : armed === 'unrelease' ? 'Yes, pull back' : 'Yes, unmatch'}
        </button>
        <button className="btn sm ghost" disabled={busy} onClick={() => setArmed(null)}>Keep it</button>
      </div>
    );
  }

  return (
    <div className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      {manual && <span className="pill" title="Added by hand, not by the engine">Manual</span>}
      {!matched
        ? <button className="btn sm ghost" disabled={busy} onClick={() => act('add')}>Match</button>
        : (
          <>
            {released
              ? <>
                  <button className="btn sm ghost" disabled={busy} onClick={() => setApproving(true)}>Edit note</button>
                  <button className="btn sm ghost" disabled={busy} onClick={() => setArmed('unrelease')}>Pull back</button>
                </>
              : <button className="btn sm solid" disabled={busy || !!blocked} title={blocked ?? undefined}
                  onClick={() => setApproving(true)}>Approve &amp; send…</button>}
            <button className="btn sm ghost" disabled={busy}
              onClick={() => { if (released) setArmed('remove'); else act('remove'); }}>Unmatch</button>
          </>
        )}
    </div>
  );
}
