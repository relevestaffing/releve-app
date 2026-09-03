'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import {
  AREAS, LEVELS, APPETITES, type Appetite, type Level, type SkillsProfile
} from '@/lib/roles-public';

/* The talent's half of the same list. Two questions per area — how good are
   you, and do you actually want to do it — because the second one predicts
   whether a placement lasts at least as well as the first. */
export default function SkillsForm({ initial }: { initial: SkillsProfile | null }) {
  const router = useRouter();
  const [level, setLevel] = useState<Record<string, Level>>(initial?.level ?? {});
  const [appetite, setAppetite] = useState<Record<string, Appetite>>(initial?.appetite ?? {});
  const [tools, setTools] = useState(initial?.tools ?? '');
  const [best, setBest] = useState(initial?.best ?? '');
  const [growing, setGrowing] = useState(initial?.growing ?? '');
  const [busy, setBusy] = useState(false);

  const answered = AREAS.filter(a => level[a.key]).length;
  const strengths = AREAS.filter(a => level[a.key] === 'expert' || level[a.key] === 'strong');
  const loved = AREAS.filter(a => appetite[a.key] === 'love');

  async function save() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/roles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'skills', data: { level, appetite, tools, best, growing } })
    }), 'Skills profile saved');
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h3>What you are actually good at</h3>
          <span className={`pill ${answered === AREAS.length ? 'good' : ''}`}>
            {answered === AREAS.length && <span className="dot" />}
            {answered} of {AREAS.length}
          </span>
        </div>
        <p className="small muted" style={{ marginBottom: 6, maxWidth: 620 }}>
          Twelve areas of work. For each one, how strong you are and whether you
          want to do it. Both matter — we would rather place you somewhere you
          will still be happy in a year than somewhere you merely qualify for.
        </p>
        <p className="xs muted" style={{ marginBottom: 24 }}>
          Answer honestly, including the ones you are weak at. Nobody is strong
          everywhere, and a profile claiming otherwise is the one we cannot place.
        </p>

        {AREAS.map(a => (
          <div className="area" key={a.key}>
            <h4>{a.name}</h4>
            <p className="xs muted area-tasks">{a.tasks.join(' · ')}</p>

            <div className="skill-row">
              <div>
                <div className="eyebrow">How strong</div>
                <div className="pick-row">
                  {LEVELS.map(l => (
                    <button key={l.key} type="button"
                      className={`pick ${level[a.key] === l.key ? 'on' : ''}`}
                      onClick={() => setLevel({ ...level, [a.key]: l.key })}>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="eyebrow">Do you want it</div>
                <div className="pick-row">
                  {APPETITES.map(x => (
                    <button key={x.key} type="button"
                      className={`pick ${appetite[a.key] === x.key ? 'on' : ''}`}
                      onClick={() => setAppetite({ ...appetite, [a.key]: x.key })}>
                      <span>{x.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

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
            We use this when a role comes up that stretches you in the right direction.
          </p>
        </div>

        <div className="ff">
          <label>Tools you know well</label>
          <input value={tools} onChange={e => setTools(e.target.value)}
            placeholder="Notion, Slack, HubSpot, Xero, Canva" />
        </div>

        {(strengths.length > 0 || loved.length > 0) && (
          <p className="small" style={{ marginBottom: 18 }}>
            {strengths.length > 0 && <>
              <b>Your strengths:</b> {strengths.slice(0, 4).map(a => a.name.toLowerCase()).join(', ')}.
            </>}
            {loved.length > 0 && <> You said you most enjoy {loved.slice(0, 3).map(a => a.name.toLowerCase()).join(', ')}.</>}
          </p>
        )}

        <button className="btn solid" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save your skills profile'}
        </button>
      </div>
    </div>
  );
}
