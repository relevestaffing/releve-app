'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import { APPLICATION_STATE, APPLY_QUESTIONS, whoseTurn, type JobApplication } from '@/lib/jobs-public';
import Linkify from './Linkify';
import CallBooker from './CallBooker';
import { fmtDate } from '@/lib/words';

/* One applicant. A stranger until Relève invites them — at which point they
   become a talent record and get the assessment. Everything they typed is on
   this card so nobody has to open an inbox to make the decision. */
export default function ApplicationCard({ app, role }: { app: JobApplication; role?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [booking, setBooking] = useState(false);
  const [result, setResult] = useState(false);
  const [more, setMore] = useState(false);
  const first = app.full_name.split(' ')[0];
  const callWhen = app.call_at
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short',
        hour: 'numeric', minute: '2-digit' }).format(new Date(app.call_at))
    : null;
  const s = APPLICATION_STATE.find(x => x.key === app.state)!;

  async function act(body: Record<string, unknown>, word: string) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/applications', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: app.id, ...body })
    }), word);
    setBusy(false); setDeclining(false);
    if (ok) router.refresh();
  }

  async function openResume() {
    const r = await fetch(`/api/admin/applications?path=${encodeURIComponent(app.resume_path!)}`);
    const j = await r.json();
    if (j.url) window.open(j.url, '_blank', 'noopener');
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="row" style={{ gap: 10, marginBottom: 2 }}>
            <h3 style={{ margin: 0 }}>{app.full_name}</h3>
            <span className={`pill ${s.tone}`}>{s.tone && <span className="dot" />}{s.label}</span>
          </div>
          {role && <div className="xs muted" style={{ marginBottom: 4 }}>{role}</div>}
          <div className="small muted">
            <a href={`mailto:${app.email}`}>{app.email}</a>
            {app.phone && ` · ${app.phone}`}
            {app.location && ` · ${app.location}`}
            {app.years != null && ` · ${app.years} years`}
            {(app.english_speaking || app.english_writing) &&
              ` · English (speak/write): ${app.english_speaking ?? '—'} / ${app.english_writing ?? '—'}`}
          </div>
          <div className="xs muted" style={{ marginTop: 3 }}>
            Applied {fmtDate(app.created_at)}
            {app.heard_via && ` · found us via ${app.heard_via.toLowerCase()}`}
          </div>
          {/* Whose move it is, said plainly, so a pile of applications never
              becomes a pile of things you have to work out again. */}
          <div className="xs" style={{ marginTop: 6, color: 'var(--sage)' }}>{whoseTurn(app)}</div>
          {callWhen && app.call_state !== 'held' && (
            <div className="xs muted" style={{ marginTop: 3 }}>
              Call {app.call_state === 'no_show' ? 'was' : 'at'} {callWhen}
              {app.call_url && <> · <a href={app.call_url} target="_blank" rel="noreferrer">joining link</a></>}
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {app.resume_path && (
            <button className="btn sm ghost" onClick={openResume}>
              {app.resume_name?.slice(0, 24) ?? 'Resume'}
            </button>
          )}
          <button className="btn sm ghost" onClick={() => setMore(m => !m)}>
            {more ? 'Less' : 'Read it'}
          </button>
        </div>
      </div>

      {more && (
        <div className="inner" style={{ marginTop: 18 }}>
          {APPLY_QUESTIONS.map(q => app.answers?.[q.key] && (
            <div key={q.key} style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{q.label}</div>
              <Linkify text={app.answers[q.key]} className="small pre" />
            </div>
          ))}
          {app.note && <div style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Anything else</div>
            <Linkify text={app.note} className="small pre" />
          </div>}
          {app.links && <div style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Links</div>
            <Linkify text={app.links} />
          </div>}
          {app.call_notes && <div style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>From the call</div>
            <p className="small pre" style={{ margin: 0 }}>{app.call_notes}</p>
          </div>}
          {app.team_note && <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Your note</div>
            <p className="small pre" style={{ margin: 0 }}>{app.team_note}</p>
          </div>}
        </div>
      )}

      {booking ? <CallBooker app={app} onDone={() => setBooking(false)} />
       : result ? (
        <form className="decide-form" style={{ marginTop: 16 }}
          onSubmit={e => { e.preventDefault();
            const fd = new FormData(e.currentTarget);
            act({ action: 'call_result', result: String(fd.get('result')),
                  notes: String(fd.get('notes') ?? '') },
                String(fd.get('result')) === 'held' ? 'Call recorded' : 'Marked as missed'); }}>
          <div className="ff"><label>How did the call go?</label>
            <select name="result" defaultValue="held">
              <option value="held">We spoke</option>
              <option value="no_show">They did not come</option>
            </select></div>
          <div className="ff"><label>Notes <span className="muted">— yours only</span></label>
            <textarea name="notes" rows={3} defaultValue={app.call_notes ?? ''}
              placeholder="How they came across, what they asked, anything you want to remember before deciding." /></div>
          <p className="xs muted" style={{ marginBottom: 12 }}>
            Never shown to {first}, and never shown to an executive.
          </p>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn ghost sm" onClick={() => setResult(false)}>Cancel</button>
          </div>
        </form>
      ) : declining ? (
        <form className="decide-form" style={{ marginTop: 16 }}
          onSubmit={e => { e.preventDefault();
            const fd = new FormData(e.currentTarget);
            act({ state: 'declined', team_note: String(fd.get('team_note') ?? '') },
                'Declined — they are not emailed'); }}>
          <div className="ff"><label>Why, for your own records <span className="muted">— optional</span></label>
            <input name="team_note" placeholder="A few words is plenty." /></div>
          <p className="xs muted" style={{ marginBottom: 12 }}>
            Nothing is sent to {app.full_name.split(' ')[0]}. Write to them yourself when you are ready.
          </p>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Decline'}</button>
            <button type="button" className="btn ghost sm" onClick={() => setDeclining(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="decide-bar" style={{ marginTop: 16 }}>
          <div className="decide">
            {/* The order of these matters: the call comes before the platform,
                so the call is the prominent button until it has happened. */}
            {app.state !== 'invited' && app.call_state === 'none' && (
              <button className="btn sm solid" disabled={busy} onClick={() => setBooking(true)}>
                Book a call with {first}
              </button>
            )}
            {app.call_state === 'invited' && (
              <>
                <button className="btn sm solid" disabled={busy} onClick={() => setResult(true)}>
                  Record how it went
                </button>
                <button className="btn sm ghost" disabled={busy} onClick={() => setBooking(true)}>
                  Move the call
                </button>
              </>
            )}
            {app.call_state === 'no_show' && (
              <button className="btn sm solid" disabled={busy} onClick={() => setBooking(true)}>
                Book another time
              </button>
            )}
            {app.state !== 'invited' && app.call_state === 'held' && (
              <button className="btn sm solid" disabled={busy}
                onClick={() => act({ action: 'invite' }, `${first} is in — they have the invitation`)}>
                Bring {first} into the platform
              </button>
            )}
            {app.state === 'new' && (
              <button className="btn sm ghost" disabled={busy}
                onClick={() => act({ state: 'reviewing' }, 'Marked as reading it')}>
                I am reading it
              </button>
            )}
            {app.state !== 'declined' && app.state !== 'invited' && (
              <button className="btn sm ghost" disabled={busy} onClick={() => setDeclining(true)}>
                Decline
              </button>
            )}
            {app.state === 'invited' && (
              <span className="xs muted">
                Their talent record exists and the invitation is sent. They appear in your
                Talent list once they sign in.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
