'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from '@/components/Toast';
import {
  DISCIPLINES, DISCIPLINE, PROFS, key, skillsComplete, skillsShape,
  type Prof, type SkillsProfile
} from '@/lib/roles-public';

/* The talent's half. Pick every discipline you are genuinely strong in — as
   many as apply — and each one opens its own breakdown. Someone good at both
   social media and bookkeeping is rare and valuable, and a single dropdown
   would have thrown that away. */
export default function SkillsForm({ initial }: { initial: SkillsProfile | null }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(initial?.disciplines ?? []);
  const [primary, setPrimary] = useState(initial?.primary ?? '');
  const [levels, setLevels] = useState<Record<string, Prof>>(initial?.levels ?? {});
  const [details, setDetails] = useState<Record<string, string>>(initial?.details ?? {});
  const [years, setYears] = useState<Record<string, number>>(initial?.years ?? {});
  const [best, setBest] = useState(initial?.best ?? '');
  const [growing, setGrowing] = useState(initial?.growing ?? '');
  const [tools, setTools] = useState(initial?.tools ?? '');
  const [busy, setBusy] = useState(false);

  function toggle(d: string) {
    const next = picked.includes(d) ? picked.filter(x => x !== d) : [...picked, d];
    setPicked(next);
    if (!next.includes(primary)) setPrimary(next[0] ?? '');
    else if (!primary && next.length) setPrimary(next[0]);
  }

  const draft: SkillsProfile = { disciplines: picked, levels, details, years, primary, best, growing, tools };
  const done = skillsComplete(draft);

  async function save() {
    if (!picked.length) { toast.bad('Pick at least one kind of work you are good at.'); return; }
    setBusy(true);
    const ok = await saving(() => fetch('/api/roles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'skills', data: draft })
    }), done ? 'Skills profile saved' : 'Saved — you can finish the rest later');
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h3>What are you genuinely good at?</h3>
          {picked.length > 0 && <span className="pill">{picked.length} chosen</span>}
        </div>
        <p className="small muted" style={{ marginBottom: 20, maxWidth: 620 }}>
          Pick every kind of work you can actually do well — as many as apply.
          Each one opens its own set of questions, because &ldquo;good at social
          media&rdquo; could mean five different jobs and we would rather know
          which one you are.
        </p>
        <p className="xs muted" style={{ marginBottom: 20 }}>
          Only pick what you could be dropped into on Monday. Breadth is worth
          a lot here, but a claim you cannot back is the fastest way to a
          placement that does not last.
        </p>

        <div className="disc-grid">
          {DISCIPLINES.map(d => {
            const on = picked.includes(d.key);
            return (
              <button key={d.key} type="button"
                className={`disc ${on ? 'on' : ''}`} onClick={() => toggle(d.key)}>
                <b>{d.name}</b>
                <span className="xs">{d.blurb}</span>
                <span className="xs disc-aka">{d.aka.join(' · ')}</span>
              </button>
            );
          })}
        </div>

        {picked.length > 1 && (
          <div className="ff" style={{ marginTop: 22 }}>
            <label>Which of these is your home ground?</label>
            <div className="pick-row">
              {picked.map(d => (
                <button key={d} type="button"
                  className={`pick wide ${primary === d ? 'on' : ''}`}
                  onClick={() => setPrimary(d)}>
                  <span>{DISCIPLINE[d]?.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {picked.map(dk => {
        const d = DISCIPLINE[dk];
        if (!d) return null;
        const answered = d.comps.filter(c => levels[key(dk, c.key)]).length;
        const strong = d.comps.filter(c =>
          levels[key(dk, c.key)] === 'deep' || levels[key(dk, c.key)] === 'solid').length;
        return (
          <div className="card" key={dk}>
            <div className="card-head">
              <h3>{d.name}</h3>
              <div className="row" style={{ gap: 8 }}>
                {primary === dk && <span className="pill">Home ground</span>}
                <span className={`pill ${answered === d.comps.length ? 'good' : ''}`}>
                  {answered === d.comps.length && <span className="dot" />}
                  {answered} of {d.comps.length}
                </span>
              </div>
            </div>

            <div className="ff" style={{ maxWidth: 240 }}>
              <label>Years doing this</label>
              <input type="number" min="0" max="40" value={years[dk] ?? ''}
                onChange={e => setYears({ ...years, [dk]: Number(e.target.value) })} />
            </div>

            <p className="small muted" style={{ margin: '6px 0 20px' }}>
              Honestly, for each one. <b>Never done it</b> is a perfectly good answer —
              nobody is strong across all twelve, and a profile claiming otherwise
              is the one we cannot place.
            </p>

            {d.comps.map(c => (
              <div className="comp" key={c.key}>
                <div className="comp-label">
                  <b>{c.label}</b>
                  <span className="xs muted">{c.hint}</span>
                </div>
                <div className="pick-row">
                  {PROFS.map(pr => (
                    <button key={pr.key} type="button"
                      className={`pick ${levels[key(dk, c.key)] === pr.key ? 'on' : ''}`}
                      title={pr.hint}
                      onClick={() => setLevels({ ...levels, [key(dk, c.key)]: pr.key })}>
                      <span>{pr.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {d.details.length > 0 && (
              <div className="detail-block">
                <div className="eyebrow" style={{ marginBottom: 14 }}>A little more about your experience</div>
                {d.details.map(q => (
                  <div className="ff" key={q.key}>
                    <label>{q.askTalent}</label>
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

            {answered === d.comps.length && (
              <p className="xs muted" style={{ marginTop: 4 }}>
                {strong} of {d.comps.length} at &ldquo;can run it&rdquo; or better.
              </p>
            )}
          </div>
        );
      })}

      {picked.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>In your own words</h3></div>

          <div className="ff">
            <label>What are you best at?</label>
            <textarea rows={2} value={best} onChange={e => setBest(e.target.value)}
              placeholder="Taking a messy inbox and a chaotic calendar and making both boring within a fortnight." />
          </div>

          <div className="ff">
            <label>What would you like to grow into?</label>
            <textarea rows={2} value={growing} onChange={e => setGrowing(e.target.value)}
              placeholder="More project ownership — I want to run the process, not just keep it tidy." />
            <p className="xs muted" style={{ marginTop: 6 }}>
              We use this when a role comes up that stretches you the right way.
            </p>
          </div>

          <div className="ff">
            <label>Tools you know well</label>
            <input value={tools} onChange={e => setTools(e.target.value)}
              placeholder="Notion, Slack, HubSpot, Xero, Canva" />
          </div>

          {picked.length > 0 && (
            <p className="small" style={{ marginBottom: 18 }}>
              <b>Your profile reads as:</b> {skillsShape(draft)}
            </p>
          )}

          <button className="btn solid" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : done ? 'Save your skills profile' : 'Save what I have so far'}
          </button>
        </div>
      )}
    </div>
  );
}
