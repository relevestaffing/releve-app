'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from '@/components/Toast';
import {
  DISCIPLINES, DISCIPLINE, NEEDS, key, roleComplete, roleShape,
  type Need, type RoleBreakdown
} from '@/lib/roles-public';

/* Two stages. First: what is this role. Then: questions specific to it.
   A generic form gets a generic answer, and a generic answer is the reason
   most agencies place the wrong person. */
export default function RoleBreakdownForm({ initial }: { initial: RoleBreakdown | null }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(initial?.disciplines ?? []);
  const [needs, setNeeds] = useState<Record<string, Need>>(initial?.needs ?? {});
  const [details, setDetails] = useState<Record<string, string>>(initial?.details ?? {});
  const [priorities, setPriorities] = useState(initial?.priorities ?? '');
  const [never, setNever] = useState(initial?.never ?? '');
  const [tools, setTools] = useState(initial?.tools ?? '');
  const [success, setSuccess] = useState(initial?.success ?? '');
  const [hours, setHours] = useState(initial?.hours ?? '');
  const [busy, setBusy] = useState(false);

  const toggle = (d: string) =>
    setPicked(picked.includes(d) ? picked.filter(x => x !== d) : [...picked, d]);

  const draft: RoleBreakdown = { disciplines: picked, needs, details, priorities, never, tools, success, hours };
  const done = roleComplete(draft);

  async function save() {
    if (!picked.length) { toast.bad('Pick at least one kind of work first.'); return; }
    setBusy(true);
    const ok = await saving(() => fetch('/api/roles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'role', data: draft })
    }), done ? 'Role breakdown saved' : 'Saved — you can finish the rest later');
    setBusy(false);
    /* Refreshing in place left the same editable form on screen after a
       successful save, so there was nothing to tell someone it had actually
       gone through — it just looked like they were still mid-edit. Saving
       now leaves the page; the checklist link back to /app/role is what
       gives them a deliberate way to reopen it and add more, rather than
       the form defaulting to open every time. */
    if (ok) router.push('/app');
  }

  return (
    <div className="stack">
      {/* ---------- stage one ---------- */}
      <div className="card">
        <div className="card-head">
          <h3>What kind of work is this?</h3>
          {picked.length > 0 && <span className="pill">{picked.length} chosen</span>}
        </div>
        <p className="small muted" style={{ marginBottom: 20, maxWidth: 620 }}>
          Pick everything the role genuinely covers. Each one you choose opens a
          set of questions specific to it — that is how we tell the difference
          between someone who schedules posts and someone who runs a paid
          strategy. Put the most important one first.
        </p>

        <div className="disc-grid">
          {DISCIPLINES.map(d => {
            const on = picked.includes(d.key);
            const order = picked.indexOf(d.key);
            return (
              <button key={d.key} type="button"
                className={`disc ${on ? 'on' : ''}`} onClick={() => toggle(d.key)}>
                {on && <span className="disc-n">{order + 1}</span>}
                <b>{d.name}</b>
                <span className="xs">{d.blurb}</span>
                <span className="xs disc-aka">{d.aka.join(' · ')}</span>
              </button>
            );
          })}
        </div>
        {picked.length > 0 && (
          <p className="xs muted" style={{ marginTop: 16 }}>
            This role is <b>{roleShape(draft)}</b>. The first one you picked carries
            the most weight when we rank candidates.
          </p>
        )}
      </div>

      {/* ---------- stage two, one block per discipline ---------- */}
      {picked.map((dk, i) => {
        const d = DISCIPLINE[dk];
        if (!d) return null;
        const answered = d.comps.filter(c => needs[key(dk, c.key)]).length;
        return (
          <div className="card" key={dk}>
            <div className="card-head">
              <h3>{d.name}</h3>
              <div className="row" style={{ gap: 8 }}>
                {i === 0 && <span className="pill">Primary</span>}
                <span className={`pill ${answered === d.comps.length ? 'good' : ''}`}>
                  {answered === d.comps.length && <span className="dot" />}
                  {answered} of {d.comps.length}
                </span>
              </div>
            </div>
            <p className="small muted" style={{ marginBottom: 20 }}>
              Which of these does the role actually need? Be strict with
              <b> must have</b> — we will not put anyone forward who cannot do those.
            </p>

            {d.comps.map(c => (
              <div className="comp" key={c.key}>
                <div className="comp-label">
                  <b>{c.label}</b>
                  <span className="xs muted">{c.hint}</span>
                </div>
                <div className="pick-row">
                  {NEEDS.map(n => (
                    <button key={n.key} type="button"
                      className={`pick ${needs[key(dk, c.key)] === n.key ? 'on' : ''}`}
                      onClick={() => setNeeds({ ...needs, [key(dk, c.key)]: n.key })}>
                      <span>{n.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {d.details.length > 0 && (
              <div className="detail-block">
                <div className="eyebrow" style={{ marginBottom: 14 }}>A little more about this</div>
                {d.details.map(q => (
                  <div className="ff" key={q.key}>
                    <label>{q.ask}</label>
                    {q.kind === 'choice' ? (
                      <div className="pick-row">
                        {(q.options ?? []).map(o => (
                          <button key={o} type="button"
                            className={`pick wide ${details[key(dk, q.key)] === o ? 'on' : ''}`}
                            onClick={() => setDetails({ ...details, [key(dk, q.key)]: o })}>
                            <span>{o}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input value={details[key(dk, q.key)] ?? ''}
                        placeholder={q.placeholder}
                        onChange={e => setDetails({ ...details, [key(dk, q.key)]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ---------- the part that is the same for every role ---------- */}
      {picked.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>However the role is made up</h3></div>

          <div className="ff">
            <label>The three or four things that matter most</label>
            <textarea rows={3} value={priorities} onChange={e => setPriorities(e.target.value)}
              placeholder="Inbox at zero by 9am. Board pack ready two days before. Nobody books over Thursday mornings." />
          </div>

          <div className="grid-2" style={{ gap: 14 }}>
            <div className="ff">
              <label>Tools they must know on day one</label>
              <input value={tools} onChange={e => setTools(e.target.value)}
                placeholder="Superhuman, Notion, Ramp, HubSpot" />
            </div>
            <div className="ff">
              <label>Hours and overlap</label>
              <input value={hours} onChange={e => setHours(e.target.value)}
                placeholder="40 a week, four hours overlapping 8am Pacific" />
            </div>
          </div>

          <div className="ff">
            <label>What a good week looks like</label>
            <textarea rows={2} value={success} onChange={e => setSuccess(e.target.value)}
              placeholder="I didn't think about my calendar once, and Monday's follow-ups were all out by Tuesday." />
            <p className="xs muted" style={{ marginTop: 6 }}>
              This becomes the first thing we measure the placement against.
            </p>
          </div>

          <button className="btn solid" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : done ? 'Save the role breakdown' : 'Save what I have so far'}
          </button>
          {!done && <p className="xs muted" style={{ marginTop: 12 }}>
            Some competencies are still unanswered. You can come back — nothing is lost.
          </p>}
        </div>
      )}
    </div>
  );
}
