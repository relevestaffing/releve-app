'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import { COURSES, COURSE_KEYS, IN_APP_COURSES, checksOf, lessonsOf, learnStatus, minutesOf, type CourseKey } from '@/lib/learn-courses';

/* Courses the console sends as a link. The talent training opens from the talent's own account instead. */
const SENDABLE = COURSE_KEYS.filter(k => !IN_APP_COURSES.includes(k));

/* The team trainings, in the console (The business, Training). Send a
   private link, see how far each person has come, resend or withdraw a link,
   add a further course for someone once it is approved for them, and set the
   lesson videos. */

export type LearnRow = {
  id: string; course: CourseKey; name: string; email: string;
  sent_at: string | null; opened_at: string | null; last_seen_at: string | null;
  lessons_done: number; checks_passed: number; completed_at: string | null;
  signed_name: string | null; revoked_at: string | null; created_at: string;
};

const day = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'America/Los_Angeles' })
  : '';
const hours = (m: number) => {
  const h = Math.round(m / 30) / 2;
  return h <= 1 ? 'about an hour' : `about ${String(h).replace('.5', '½')} hours`;
};

async function call(method: string, body: unknown) {
  const res = await fetch('/api/admin/learn', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  return { ok: res.ok, out };
}

function SendForm({ onDone, preset }: { onDone: () => void; preset?: { name: string; email: string; course: CourseKey } }) {
  const [form, setForm] = useState(preset ?? { name: '', email: '', course: 'inside' as CourseKey });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const { ok, out } = await call('POST', form);
      if (!ok) { toast.bad(out?.error ?? 'That did not send. Please try again.'); return; }
      toast.ok(out?.warning ?? `${COURSES[form.course].title} sent to ${form.name.split(' ')[0]}.`);
      onDone();
    } catch { toast.bad('No connection, so nothing was sent.'); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="stack" style={{ gap: 10, marginTop: 14, maxWidth: 460 }}>
      <div className="ff"><label htmlFor="learn-name">Name</label>
        <input id="learn-name" required value={form.name} placeholder="Their full name"
          onChange={e => setForm({ ...form, name: e.target.value })} /></div>
      <div className="ff"><label htmlFor="learn-email">Email</label>
        <input id="learn-email" type="email" required value={form.email} placeholder="name@relevestaffing.com"
          onChange={e => setForm({ ...form, email: e.target.value })} /></div>
      {SENDABLE.length > 1 && (
        <div className="ff"><label htmlFor="learn-course">Training</label>
          <select id="learn-course" value={form.course} onChange={e => setForm({ ...form, course: e.target.value as CourseKey })}>
            {SENDABLE.map(k => <option key={k} value={k}>{COURSES[k].title}</option>)}
          </select></div>
      )}
      <p className="xs muted" style={{ margin: 0 }}>
        They get an email from Relève with a private link. It opens the training only: no account, and nothing else in the app.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm solid" disabled={busy}>{busy ? 'Sending…' : 'Send the training'}</button>
        <button type="button" className="btn sm ghost" disabled={busy} onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

function RowActions({ r, others }: { r: LearnRow; others: CourseKey[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState<CourseKey | null>(null);
  async function act(action: 'resend' | 'withdraw') {
    setBusy(true);
    try {
      const { ok, out } = await call('PATCH', { id: r.id, action });
      if (!ok) { toast.bad(out?.error ?? 'That did not go through.'); return; }
      toast.ok(action === 'resend' ? `Link sent again to ${r.name.split(' ')[0]}.` : 'Link withdrawn. It no longer opens.');
      setConfirm(false); router.refresh();
    } catch { toast.bad('No connection, so nothing changed.'); }
    finally { setBusy(false); }
  }
  if (adding) return <SendForm preset={{ name: r.name, email: r.email, course: adding }} onDone={() => { setAdding(null); router.refresh(); }} />;
  if (r.revoked_at) return <span className="xs muted">Withdrawn {day(r.revoked_at)}</span>;
  if (confirm) return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      <span className="xs">Withdraw this link? It stops opening at once.</span>
      <button className="btn sm solid" disabled={busy} onClick={() => act('withdraw')}>{busy ? 'Working…' : 'Withdraw'}</button>
      <button className="btn sm ghost" disabled={busy} onClick={() => setConfirm(false)}>Keep it</button>
    </div>
  );
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {others.map(k => (
        <button key={k} className="btn sm ghost" onClick={() => setAdding(k)}>Add {COURSES[k].title}</button>
      ))}
      {!r.completed_at && <button className="btn sm ghost" disabled={busy} onClick={() => act('resend')}>Resend</button>}
      <button className="btn sm ghost" disabled={busy} onClick={() => setConfirm(true)}>Withdraw</button>
    </div>
  );
}

function Videos({ course, initial }: { course: CourseKey; initial: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const { ok, out } = await call('PUT', { course, videos: v });
      if (!ok) { toast.bad(out?.error ?? 'Not saved. Please try again.'); return; }
      toast.saved('Videos saved. They show at the top of each lesson.');
      router.refresh();
    } catch { toast.bad('No connection, so nothing was saved.'); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="stack" style={{ gap: 8, marginTop: 12 }}>
      {lessonsOf(course).map((s, i) => (
        <div className="ff" key={s[0]}>
          <label htmlFor={`v-${course}-${s[0]}`}>{String(i + 1).padStart(2, '0')} · {s[2]}</label>
          <input id={`v-${course}-${s[0]}`} value={v[s[0]] ?? ''} placeholder="A YouTube, Vimeo or Loom link"
            onChange={e => setV({ ...v, [s[0]]: e.target.value })} />
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 6 }}>
        <button className="btn sm solid" disabled={busy}>{busy ? 'Saving…' : 'Save the videos'}</button>
      </div>
    </form>
  );
}

export default function LearnPanel({ rows, videos }: { rows: LearnRow[]; videos: Record<string, Record<string, string>> }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const has = new Map<string, Set<CourseKey>>();
  for (const r of rows) if (!r.revoked_at) {
    const k = r.email.toLowerCase();
    if (!has.has(k)) has.set(k, new Set());
    has.get(k)!.add(r.course);
  }
  const live = rows.filter(r => !r.revoked_at);
  const finished = live.filter(r => r.completed_at).length;

  return (
    <>
      <div className="card">
        <div className="card-head"><h3>Team training</h3></div>
        <p className="small" style={{ marginTop: 0, maxWidth: '62ch' }}>
          Every new hire gets Inside Relève as a private link from here, and Selling Relève once you approve it. Placed professionals find Working with Relève on their own checklist in the app, and their progress shows here too.
        </p>
        <table className="data" style={{ marginTop: 10 }}>
          <thead><tr><th>Training</th><th>For</th><th>Length</th></tr></thead>
          <tbody>
            {COURSE_KEYS.map(k => (
              <tr key={k}>
                <td><b>{COURSES[k].title}</b><div className="xs muted wrap">{COURSES[k].blurb}</div></td>
                <td className="small">{COURSES[k].audience}</td>
                <td className="small">{lessonsOf(k).length} lessons · {checksOf(k).length} checks · {hours(minutesOf(k))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sending
          ? <SendForm onDone={() => { setSending(false); router.refresh(); }} />
          : <div style={{ marginTop: 14 }}><button className="btn sm solid" onClick={() => setSending(true)}>Send a training</button></div>}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Who has it</h3>
          {live.length > 0 && <span className="small muted">{finished} of {live.length} signed off</span>}
        </div>
        {!rows.length ? <p className="small muted">Nobody yet. Send the first link above.</p> : (
          <table className="data">
            <thead><tr><th>Person</th><th>Training</th><th>Where they are</th><th>Last seen</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {rows.map(r => {
                const others = SENDABLE.filter(k => k !== r.course && !has.get(r.email.toLowerCase())?.has(k) && r.course === 'inside');
                const status = learnStatus(r, r.course);
                return (
                  <tr key={r.id} style={r.revoked_at ? { opacity: .55 } : undefined}>
                    <td>{r.name}<div className="xs muted">{r.email}</div></td>
                    <td className="small">{COURSES[r.course]?.title ?? r.course}<div className="xs muted">Sent {day(r.sent_at ?? r.created_at)}</div></td>
                    <td>
                      {r.completed_at
                        ? <span className="pill good"><span className="dot" />Signed off {day(r.completed_at)}</span>
                        : <span className="small">{status}</span>}
                      {r.completed_at && r.signed_name && <div className="xs muted" style={{ marginTop: 4 }}>Signed as {r.signed_name}</div>}
                      {IN_APP_COURSES.includes(r.course) && <div className="xs muted" style={{ marginTop: 4 }}>Opened from their app</div>}
                    </td>
                    <td className="small">{r.last_seen_at ? day(r.last_seen_at) : <span className="muted">Not yet</span>}</td>
                    <td><RowActions r={r} others={others} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Lesson videos</h3></div>
        <p className="small" style={{ marginTop: 0, maxWidth: '62ch' }}>
          Paste a YouTube, Vimeo or Loom link next to a lesson and it plays at the top of that lesson for everyone. Leave a lesson blank and it stays text only.
        </p>
        {COURSE_KEYS.map(k => (
          <details key={k} style={{ marginTop: 10 }}>
            <summary className="small" style={{ cursor: 'pointer' }}><b>{COURSES[k].title}</b> · {Object.keys(videos[k] ?? {}).length} of {lessonsOf(k).length} lessons have a video</summary>
            <Videos course={k} initial={videos[k] ?? {}} />
          </details>
        ))}
      </div>
    </>
  );
}
