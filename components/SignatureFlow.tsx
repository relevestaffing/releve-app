'use client';
import { useEffect, useRef, useState } from 'react';
import { SCALE, COND_PUBLIC, TOOLS } from '@/lib/signature/public';
import { toast } from '@/components/Toast';

type Screen = { i: number; kind: 'likert'; tag: string; text: string };
type Pair = { i: number; kind: 'pair'; a: string; b: string };
type Section = { from: number; to: number; name: string; note: string };
type Started = {
  total: number; itemCount: number; screens: Screen[]; pairs: Pair[];
  sections: Section[];
  saved: { answers: (number | null)[]; pairs: ('a' | 'b' | null)[];
           conditions?: Record<string, any> } | null;
};
type Conds = Record<string, any>;

export default function SignatureFlow({ side, existing, fresh = false }: {
  side: 'client' | 'talent'; existing: boolean;
  /* start over rather than resume — a retake, or an Invalid result */
  fresh?: boolean;
}) {
  const [data, setData] = useState<Started | null>(null);
  const [qi, setQi] = useState(-2);                       // -2 loading, -1 intro
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [pairs, setPairs] = useState<('a' | 'b' | null)[]>([]);
  const [timings, setTimings] = useState<(number | null)[]>([]);
  const [interlude, setInterlude] = useState<Section | null>(null);
  const [chip, setChip] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [conds, setConds] = useState<Conds>({});
  /* The load can fail. It used to have no catch and no ok check, so a phone on
     patchy internet sat on "Preparing your assessment" forever, with no error
     and no way to retry — on the one screen the whole product depends on. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const shown = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadFailed(false);
      try {
        const r = await fetch('/api/signature/start', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ side, fresh })
        });
        if (!r.ok) throw new Error(String(r.status));
        const d: Started = await r.json();
        if (!alive) return;
        setData(d);
        setAnswers(d.saved?.answers ?? new Array(d.itemCount).fill(null));
        setPairs(d.saved?.pairs ?? new Array(d.pairs.length).fill(null));
        setConds(d.saved?.conditions ?? {});
        setTimings(new Array(d.itemCount).fill(null));
        setQi(-1);
      } catch {
        if (alive) setLoadFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [side, attempt]);

  useEffect(() => { shown.current = Date.now(); }, [qi]);

  function note(msg: string) { setChip(msg); setTimeout(() => setChip(null), 2000); }

  /* The autosave behind a twenty-minute assessment. It used to swallow every
     failure silently, which meant someone could answer ninety items, lose the
     connection, and find out only when they came back to an empty form.

     Now it tells them — once, quietly, and only after a second attempt has
     also failed, so a momentary blip does not interrupt anyone mid-question. */
  const saveWarned = useRef(false);
  /* Each save is a full snapshot, upserted whole rather than merged — so
     whichever request the server finishes last wins, not whichever was
     truest. Firing these un-awaited (the caller never waited on the last
     one before starting the next) let a slower earlier request land after
     a faster later one and quietly overwrite the newest answer with a
     stale one, on the one screen where losing an answer no one saw fail
     matters most. Chaining every call onto the tail of the one before it
     keeps them leaving in the order they were made. */
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  function persist(a: (number | null)[], p: ('a' | 'b' | null)[], t: (number | null)[], c: Conds = conds) {
    const body = JSON.stringify({ side, answers: a, pairs: p, timings: t, conditions: c });
    const send = () => fetch('/api/signature/save', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body
    });
    const run = async () => {
      try {
        const r = await send();
        if (r.ok) { if (saveWarned.current) { saveWarned.current = false; toast.saved('Saved again'); } return; }
        throw new Error(String(r.status));
      } catch {
        try {
          const again = await send();
          if (again.ok) { if (saveWarned.current) { saveWarned.current = false; toast.saved('Saved again'); } return; }
        } catch { /* fall through to the warning */ }
        if (!saveWarned.current) {
          saveWarned.current = true;
          toast.bad('Your answers have stopped saving. Stay on this page — we will keep trying.');
        }
      }
    };
    saveChain.current = saveChain.current.then(run);
    return saveChain.current;
  }

  function advance(next: number) {
    if (!data) return;
    const secOf = (n: number) => data.sections.findIndex(s => n >= s.from && n <= s.to);
    const pct = Math.round((next / data.total) * 100), was = Math.round(((next - 1) / data.total) * 100);
    [25, 50, 75].forEach(m => { if (was < m && pct >= m) note(`${m}% complete`); });
    if (next < data.total && secOf(next) !== secOf(next - 1)) {
      setInterlude(data.sections[secOf(next)]);
      setQi(next);
      setTimeout(() => setInterlude(null), 1900);
      return;
    }
    setQi(next);
  }

  function answer(v: number) {
    const i = qi;
    const a = [...answers]; a[i] = v;
    const t = [...timings]; t[i] = Math.min(120, (Date.now() - shown.current) / 1000);
    setAnswers(a); setTimings(t);
    persist(a, pairs, t);
    setTimeout(() => advance(i + 1), 150);
  }
  function choose(side_: 'a' | 'b') {
    if (!data) return;
    const n = qi - data.itemCount;
    const p = [...pairs]; p[n] = side_;
    setPairs(p); persist(answers, p, timings);
    if (n === data.pairs.length - 1) note('Last section next');
    setTimeout(() => advance(qi + 1), 260);
  }
  /* Every condition change is saved the moment it is made, like every other
     answer in the assessment. */
  function setCond(key: string, value: any) {
    const next = { ...conds, [key]: value };
    setConds(next);
    persist(answers, pairs, timings, next);
  }
  function toggleTool(t: string) {
    const have: string[] = conds.tools ?? [];
    setCond('tools', have.includes(t) ? have.filter(x => x !== t) : [...have, t]);
  }

  const condsMissing = COND_PUBLIC.filter(c => !conds[c.key]).length;

  async function submit() {
    if (!data) return;
    setBusy(true);
    const conditions: Conds = { ...conds, tools: conds.tools ?? [] };
    try {
      const r = await fetch('/api/signature/submit', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ side, answers, pairs, timings, conditions })
      });
      const out = await r.json().catch(() => ({}));
      /* Never show a result page over a failed save — the person would
         believe they were finished and close the tab. */
      if (!r.ok) {
        toast.bad(out.error ?? 'That did not send. Stay on this page and try again.');
        setBusy(false);
        return;
      }
      setResult(out);
    } catch {
      toast.bad('No connection. Stay on this page — your answers are still here.');
    }
    setBusy(false);
  }

  if (loadFailed) return (
    <div className="card empty-card">
      <div className="empty-mark" aria-hidden="true" />
      <h3>We could not load your assessment</h3>
      <p className="small">
        That is almost always the connection rather than anything you did. Nothing you
        have already answered is lost — it is saved on our side.
      </p>
      <button className="btn sm solid" style={{ marginTop: 16 }}
        onClick={() => { setQi(-2); setAttempt(n => n + 1); }}>Try again</button>
    </div>
  );
  if (!data || qi === -2) return <div className="empty"><span className="tick" /><p className="small">Preparing your assessment</p></div>;
  if (result) return <Results result={result} side={side} />;
  if (interlude) return <Interlude sec={interlude} n={data.sections.findIndex(s => s.name === interlude.name) + 1} />;

  const answeredCount = answers.filter(x => x != null).length + pairs.filter(x => x != null).length;

  if (qi === -1) return (
    <div className="assess-wrap">
      <span className="tick" />
      <div className="eyebrow" style={{ margin: '20px 0 10px' }}>The Relève Signature</div>
      <h2 style={{ fontSize: 32, margin: '0 0 16px' }}>{side === 'client' ? 'Executive Signature' : 'Talent Signature'}</h2>
      <p style={{ maxWidth: 680, marginBottom: 14 }}>
        {side === 'talent'
          ? 'This is the instrument the whole match is built on. It measures how you work and who you are under pressure across eighteen facets, with controls that detect answers given to impress rather than to describe. Answer honestly — a flattering profile in the wrong role is a failed placement, and the controls will find it anyway.'
          : 'This measures how you actually run your day and what your environment demands of the person beside you — across the same eighteen facets every candidate is measured on, not a rougher version of it — plus the practical conditions of the role. It is what every candidate is scored against before you ever see a name.'}
      </p>
      <p className="small muted" style={{ marginBottom: 30 }}>
        {data.total} screens, about {side === 'talent' ? 'twenty to twenty-five' : 'twelve to sixteen'} minutes.
      </p>
      {/* Answering everything and stopping on the Conditions screen — the
          likeliest place to stop, since it is the only one with typing — used
          to send people back to question one with the button reading "Begin".
          A finished set of answers now resumes at the last screen. */}
      <button className="btn solid" onClick={() => setQi(
        answeredCount >= data.total ? data.total
          : answeredCount ? answeredCount : 0)}>
        {answeredCount >= data.total && !existing ? 'Resume — one section left'
          : answeredCount && answeredCount < data.total ? `Resume — ${answeredCount} of ${data.total} answered`
          : existing ? 'Retake the assessment' : 'Begin the assessment'}
      </button>
      {chip && <div className="chip-note"><span className="tick" />{chip}</div>}
    </div>
  );

  /* conditions */
  if (qi >= data.itemCount + data.pairs.length) return (
    <div className="assess-wrap">
      <div className="row between"><span className="eyebrow">Final section</span><span className="xs muted">Conditions</span></div>
      <div className="progress-rail"><span style={{ width: '97%' }} /></div>
      <h2 style={{ fontSize: 24, marginBottom: 12 }}>Conditions</h2>
      <p className="small muted" style={{ marginBottom: 30 }}>
        Not scored — checked. A match that clears every axis and fails on hours or discretion is not a match.
      </p>
      {/* Controlled and saved on change. These used to be read out of the DOM
          at submit time only, with the middle option pre-selected — so Back
          wiped them, and a distracted person could submit an answer they had
          never actually chosen. */}
      {COND_PUBLIC.map(c => (
        <div className="ff" key={c.key}>
          <label>{c.label} — {side === 'client' ? c.cQ : c.tQ}</label>
          <select value={conds[c.key] ?? ''} onChange={e => setCond(c.key, e.target.value)}>
            <option value="" disabled>Choose one…</option>
            {c.ord.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      ))}
      <div className="ff">
        <label>Tools — {side === 'client' ? 'what the work runs on' : 'what you are fluent in'}</label>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          {TOOLS.map(t => (
            <label className="pill" style={{ cursor: 'pointer', gap: 9 }} key={t}>
              <input type="checkbox" checked={(conds.tools ?? []).includes(t)}
                onChange={() => toggleTool(t)} style={{ width: 'auto', margin: 0 }} /> {t}
            </label>
          ))}
        </div>
        {/* The list is never going to be complete. The first person to use it
            worked in Wix, Gmail and a social scheduler and had nowhere to say so. */}
        <div className="ff" style={{ marginTop: 14 }}>
          <label>{side === 'client' ? 'Anything else the work runs on' : 'Anything else you are fluent in'}</label>
          <input value={conds.tools_other ?? ''}
            onChange={e => setConds({ ...conds, tools_other: e.target.value })}
            onBlur={e => setCond('tools_other', e.target.value.trim())}
            placeholder="Wix, Mailchimp, a booking system — whatever it actually is" />
        </div>
      </div>
      <div className="assess-foot">
        <button className="btn ghost sm" onClick={() => setQi(qi - 1)}>← Back</button>
        <div className="row" style={{ gap: 12 }}>
          {condsMissing > 0 && <span className="xs muted">
            {condsMissing} still to answer
          </span>}
          <button className="btn solid" onClick={submit} disabled={busy || condsMissing > 0}>
            {busy ? 'Scoring…' : 'Complete my Signature'}
          </button>
        </div>
      </div>
      <p className="xs muted" style={{ marginTop: 14 }}>
        These save as you go, the same as your answers. You can leave this page and come back.
      </p>
    </div>
  );

  /* forced choice */
  if (qi >= data.itemCount) {
    const n = qi - data.itemCount, p = data.pairs[n], cur = pairs[n];
    return (
      <div className="assess-wrap">
        <div className="row between"><span className="eyebrow">Two at a time</span>
          <span className="xs muted">{n + 1} of {data.pairs.length}</span></div>
        <div className="progress-rail"><span style={{ width: `${(qi / data.total) * 100}%` }} /></div>
        <div className="q-num">BOTH SOUND GOOD. WHICH IS MORE LIKE YOU?</div>
        <div className="grid-2" style={{ gap: 18, marginBottom: 20 }}>
          {(['a', 'b'] as const).map(k => (
            <button key={k} className={`card pair-card ${cur === k ? 'picked' : ''} ${cur && cur !== k ? 'dimmed' : ''}`}
              onClick={() => choose(k)}
              style={{ textAlign: 'left', cursor: 'pointer', position: 'relative', overflow: 'hidden',
                borderColor: cur === k ? 'var(--fern)' : 'var(--line)',
                background: cur === k ? 'var(--fern)' : '#fff', color: cur === k ? 'var(--cream)' : 'var(--body)' }}>
              <div className="eyebrow" style={{ marginBottom: 12, color: cur === k ? 'var(--pale)' : 'var(--sage)' }}>{k.toUpperCase()}</div>
              <div style={{ fontFamily: 'Marcellus,serif', fontSize: 20, lineHeight: 1.35, color: cur === k ? 'var(--cream)' : 'var(--fern)' }}>{p[k]}</div>
            </button>
          ))}
        </div>
        <div className="assess-foot">
          <button className="btn ghost sm" onClick={() => setQi(qi - 1)}>← Back</button>
          <span className="xs muted">Neither answer is the right one</span>
        </div>
        {chip && <div className="chip-note"><span className="tick" />{chip}</div>}
      </div>
    );
  }

  /* a statement */
  const it = data.screens[qi], cur = answers[qi];
  const sec = data.sections.find(s => qi >= s.from && qi <= s.to) ?? data.sections[0];
  return (
    <div className="assess-wrap">
      <div className="row between">
        <span className="eyebrow">Section {data.sections.indexOf(sec) + 1} · {sec.name}</span>
        <span className="xs muted">{qi - sec.from + 1} of {sec.to - sec.from + 1} · {qi + 1}/{data.total} overall</span>
      </div>
      <div className="progress-rail"><span style={{ width: `${(qi / data.total) * 100}%` }} /></div>
      <div className="q-num">STATEMENT {qi + 1}</div>
      <div className="q-text">{it.text}</div>
      <div className="scale">
        {SCALE.map((s, n) => (
          <button key={s} className={cur === n + 1 ? 'chosen' : ''} onClick={() => answer(n + 1)}>
            <span className="key">{['A', 'B', 'C', 'D', 'E'][n]}</span>{s}
          </button>
        ))}
      </div>
      <div className="assess-foot">
        <button className="btn ghost sm" disabled={qi === 0} onClick={() => setQi(qi - 1)}>← Back</button>
        <span className="xs muted">Saved as you go</span>
        <button className="btn ghost sm" disabled={cur == null} onClick={() => advance(qi + 1)}>Next →</button>
      </div>
      {chip && <div className="chip-note"><span className="tick" />{chip}</div>}
    </div>
  );
}

function Interlude({ sec, n }: { sec: Section; n: number }) {
  return (
    <div className="assess-wrap"><div className="interlude">
      <span className="tick" />
      <div className="n" style={{ marginTop: 22 }}>SECTION {n}</div>
      <h2>{sec.name}</h2>
      <p className="small">{sec.note}</p>
      <div className="rail"><span /></div>
    </div></div>
  );
}

function Results({ result, side }: { result: any; side: 'client' | 'talent' }) {
  const a = result.archetype;
  return (
    <div className="stack">
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 14 }}>
          Profile {a.r} · {side === 'client' ? 'Executive' : 'Talent'} Signature
        </div>
        <h2 style={{ fontSize: 32, color: 'var(--cream)', marginBottom: 8 }}>{a.n}</h2>
        <div className="row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span className="pill" style={{ borderColor: 'var(--pale)', color: 'var(--pale)', background: 'transparent' }}>{result.disposition}</span>
          <span className={`pill ${result.validity.verdict === 'Valid' ? 'good' : result.validity.verdict === 'Review' ? 'warn' : 'crit'}`}>
            <span className="dot" />{result.validity.verdict === 'Valid' ? 'Profile verified' : result.validity.verdict === 'Review' ? 'Up for review' : 'Needs taking again'}
          </span>
        </div>
        <p style={{ fontFamily: 'Marcellus,serif', fontSize: 19, color: 'var(--pale)', marginBottom: 18 }}>{a.tag}</p>
        <p className="small">{a.d}</p>
      </div>

      {/* The twenty minutes used to end here — a name and one paragraph,
          with the same depth already written for every archetype (what to
          look for, what stands out, where the growth edge is) sitting
          unused in the data. This is that depth, finally shown. */}
      {(a.seek || a.friction) && (
        <div className="grid-2">
          {a.seek && (
            <div className="card">
              <div className="card-head"><h3>{side === 'talent' ? 'Where you thrive' : 'What to look for'}</h3></div>
              <p className="small">{a.seek}</p>
            </div>
          )}
          {a.friction && (
            <div className="card">
              <div className="card-head"><h3>What to watch for</h3></div>
              <p className="small">{a.friction}</p>
            </div>
          )}
        </div>
      )}
      {a.strengths?.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>What stands out</h3></div>
          <ul className="plain">{a.strengths.map((s: string) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      {a.growth && (
        <div className="card">
          <div className="card-head"><h3>The growth edge</h3></div>
          <p className="small">{a.growth}</p>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>Scored and saved</h3>
          <span className="pill">{result.saved ? 'Stored to your account' : 'Demo — not stored'}</span></div>

      {result.validity.verdict !== 'Valid' && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head">
            <h3>{result.validity.verdict === 'Invalid'
              ? 'This one did not come out usable'
              : 'One note on how we read this'}</h3>
          </div>
          <p className="small" style={{ marginBottom: 14 }}>
            {result.validity.verdict === 'Invalid'
              ? 'The answers did not hold together well enough to build a match on. That is almost always the assessment\u2019s fault rather than yours \u2014 usually a reading check missed, or a run of answers that contradict each other. Nothing is held against you.'
              : 'Your profile is good and it is being used. This is only a note on how we weigh it, and it reflects the questions rather than you.'}
          </p>
          {result.validity.flags?.length > 0 && (
            <ul className="plain" style={{ marginBottom: 16 }}>
              {result.validity.flags.map((f: any, i: number) => (
                <li key={i}><b>{f.k}</b> — {f.d}</li>
              ))}
            </ul>
          )}
          {result.validity.verdict === 'Invalid' && (
            <>
              <p className="small muted" style={{ marginBottom: 16 }}>
                Take it again when you have twenty uninterrupted minutes. Read each statement, and
                answer as you actually are rather than as you would like to be — a couple of
                statements ask you to pick one specific answer rather than rate yourself, so read
                each one carefully before responding.
              </p>
              <a className="btn solid" href="/app/signature?retake=1">Take it again</a>
            </>
          )}
        </div>
      )}
        <p className="small">Your Signature has been scored on the server and every match in your account has been recalculated.</p>
        {/* Thirteen to twenty minutes of work used to end at an underlined
            phrase inside a sentence, with no mention of what came next. */}
        <div className="row" style={{ gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <a className="btn solid" href="/app">See what is left to do</a>
        </div>
      </div>
    </div>
  );
}
