'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import { DISCIPLINES } from '@/lib/disciplines';
import { slugify, postReady, type JobPost, type PostState } from '@/lib/jobs-public';

const SITE = 'https://relevestaffing.com';

/* Writing a role. Two states worth keeping apart: a draft can be as unfinished
   as you like, but publishing puts it on the internet, so publishing is the
   moment the form insists on being complete. */
export default function PostingEditor({ post, onDone }: {
  post?: JobPost | null; onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    title: post?.title ?? '', discipline: post?.discipline ?? '',
    summary: post?.summary ?? '', about: post?.about ?? '',
    owns: post?.owns ?? '', needs: post?.needs ?? '',
    hours: post?.hours ?? '', location: post?.location ?? 'Remote',
    pay_note: post?.pay_note ?? '', sort: String(post?.sort ?? 0)
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const missing = postReady(f as any);
  const slug = post?.opened_at ? post.slug : (slugify(f.title) || 'role');

  async function save(state: PostState) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/postings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...f, id: post?.id, state })
    }), state === 'open' ? 'Live on the careers page'
      : state === 'closed' ? 'Closed — off the site' : 'Draft saved');
    setBusy(false);
    if (ok) { onDone?.(); router.refresh(); }
  }

  return (
    <div>
      <div className="grid-2">
        <div className="ff"><label>Role title</label>
          <input value={f.title} onChange={set('title')} placeholder="Executive Assistant" /></div>
        <div className="ff"><label>Discipline <span className="muted">— optional</span></label>
          <select value={f.discipline} onChange={set('discipline')}>
            <option value="">Not tied to one</option>
            {DISCIPLINES.map(d => <option key={d.key} value={d.key}>{d.name}</option>)}
          </select></div>
      </div>

      <div className="ff"><label>The one line on the card</label>
        <input value={f.summary} onChange={set('summary')}
          placeholder="Run the diary, the inbox and the follow-through for a founder in the US." />
        <span className="xs muted">This is all most people read before deciding whether to click.</span></div>

      <div className="ff"><label>Opening paragraph <span className="muted">— optional</span></label>
        <textarea rows={3} value={f.about} onChange={set('about')}
          placeholder="Who they would be working with, and what the work is really like." /></div>

      <div className="grid-2">
        <div className="ff"><label>What this person owns</label>
          <textarea rows={6} value={f.owns} onChange={set('owns')}
            placeholder={'One per line.\nThe calendar, end to end\nInbox triage and first replies\nTravel and expenses'} /></div>
        <div className="ff"><label>What we are looking for</label>
          <textarea rows={6} value={f.needs} onChange={set('needs')}
            placeholder={'One per line.\nThree years supporting a senior leader\nWritten English a client would never question\nA quiet place to take calls'} /></div>
      </div>

      <div className="grid-2">
        <div className="ff"><label>Hours</label>
          <input value={f.hours} onChange={set('hours')} placeholder="Full time · 9–5 Pacific overlap" /></div>
        <div className="ff"><label>Location</label>
          <input value={f.location} onChange={set('location')} placeholder="Remote · Philippines" /></div>
      </div>

      <div className="grid-2">
        <div className="ff"><label>Pay, if you want it public <span className="muted">— optional</span></label>
          <input value={f.pay_note} onChange={set('pay_note')} placeholder="Leave blank to show nothing" /></div>
        <div className="ff"><label>Order on the page</label>
          <input value={f.sort} onChange={set('sort')} inputMode="numeric" placeholder="0" />
          <span className="xs muted">Lower shows first.</span></div>
      </div>

      <p className="xs muted">
        Web address: <code>{SITE}/careers/{slug}</code>
        {post?.opened_at && ' — fixed, because this role has already been live and the link may be out there.'}
      </p>

      {missing.length > 0 && (
        <p className="small" style={{ color: 'var(--warn, #9A7B3F)' }}>
          Before it can go live — {missing.join(' ')}
        </p>
      )}

      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <button className="btn sm solid" disabled={busy || missing.length > 0}
          onClick={() => save('open')}>
          {post?.state === 'open' ? 'Save & keep it live' : 'Publish to the careers page'}
        </button>
        <button className="btn sm ghost" disabled={busy} onClick={() => save('draft')}>
          Save as draft
        </button>
        {post?.state === 'open' && (
          <button className="btn sm ghost" disabled={busy} onClick={() => save('closed')}>
            Close this role
          </button>
        )}
        {onDone && <button className="btn sm ghost" disabled={busy} onClick={onDone}>Cancel</button>}
      </div>
    </div>
  );
}
