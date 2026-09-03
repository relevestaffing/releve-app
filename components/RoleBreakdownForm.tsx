'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { AREAS, OWNERSHIP, roleShape, type Ownership, type RoleBreakdown } from '@/lib/roles-public';

/* What the TALENT will own — not what the executive owns.
   Area by area, so "what does this role actually consist of" is answered
   concretely instead of as a job title nobody agrees on. */
export default function RoleBreakdownForm({ initial }: { initial: RoleBreakdown | null }) {
  const router = useRouter();
  const [own, setOwn] = useState<Record<string, Ownership>>(initial?.ownership ?? {});
  const [priorities, setPriorities] = useState(initial?.priorities ?? '');
  const [never, setNever] = useState(initial?.never ?? '');
  const [tools, setTools] = useState(initial?.tools ?? '');
  const [success, setSuccess] = useState(initial?.success ?? '');
  const [busy, setBusy] = useState(false);

  const answered = AREAS.filter(a => own[a.key]).length;
  const theirs = AREAS.filter(a => own[a.key] === 'all').length;
  const shape = roleShape({ ownership: own, priorities, never, tools, success });

  async function save() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/roles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'role',
        data: { ownership: own, priorities, never, tools, success }
      })
    }), 'Role breakdown saved');
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h3>What the role actually is</h3>
          <span className={`pill ${answered === AREAS.length ? 'good' : ''}`}>
            {answered === AREAS.length && <span className="dot" />}
            {answered} of {AREAS.length}
          </span>
        </div>
        <p className="small muted" style={{ marginBottom: 6, maxWidth: 620 }}>
          Go through each area of work and say how much of it belongs to them.
          Be blunt — the areas you mark <b>entirely theirs</b> are the ones we
          match hardest on, and the ones we hold them to.
        </p>
        <p className="xs muted" style={{ marginBottom: 24 }}>
          Most roles have three or four areas that are genuinely theirs and a
          few that are shared. Marking everything &ldquo;entirely theirs&rdquo;
          describes a chief of staff, not an assistant, and we will price it
          that way.
        </p>

        {AREAS.map(a => (
          <div className="area" key={a.key}>
            <div className="area-head">
              <div>
                <h4>{a.name}</h4>
                <p className="xs muted">{a.covers}</p>
              </div>
            </div>
            <p className="xs muted area-tasks">{a.tasks.join(' · ')}</p>
            <div className="pick-row">
              {OWNERSHIP.map(o => (
                <button key={o.key} type="button"
                  className={`pick wide ${own[a.key] === o.key ? 'on' : ''}`}
                  onClick={() => setOwn({ ...own, [a.key]: o.key })}>
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h3>The detail around it</h3></div>

        <div className="ff">
          <label>The three or four things that matter most</label>
          <textarea rows={3} value={priorities} onChange={e => setPriorities(e.target.value)}
            placeholder="Inbox at zero by 9am. Board pack ready two days before. Nobody books over my Thursday mornings." />
        </div>

        <div className="ff">
          <label>What is never delegated, however well it goes</label>
          <textarea rows={2} value={never} onChange={e => setNever(e.target.value)}
            placeholder="Anything to the board. Hiring decisions. My family calendar." />
          <p className="xs muted" style={{ marginTop: 6 }}>
            Saying this once saves a month of hesitation on both sides.
          </p>
        </div>

        <div className="ff">
          <label>Tools they must know on day one</label>
          <input value={tools} onChange={e => setTools(e.target.value)}
            placeholder="Superhuman, Notion, Ramp, HubSpot" />
        </div>

        <div className="ff">
          <label>What a good week looks like</label>
          <textarea rows={2} value={success} onChange={e => setSuccess(e.target.value)}
            placeholder="I didn't think about my calendar once, and the follow-ups from Monday's calls were all sent by Tuesday." />
          <p className="xs muted" style={{ marginTop: 6 }}>
            This becomes the first thing we measure the placement against.
          </p>
        </div>

        {shape && (
          <p className="small" style={{ marginBottom: 18 }}>
            <b>As it stands:</b> {shape}. {theirs === 0 &&
              'Nothing is fully theirs yet — worth marking at least a couple, or the role has no centre.'}
          </p>
        )}

        <button className="btn solid" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save the role breakdown'}
        </button>
      </div>
    </div>
  );
}
