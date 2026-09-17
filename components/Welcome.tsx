'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';

type Panel = { h: string; lede: string; points?: string[]; note?: string };

const TALENT: Panel[] = [
  { h: 'Welcome to Relève',
    lede: 'You have been invited to join the roster — the assessed, verified group Relève puts in front of executives. This account is where that happens.',
    points: [
      'We place virtual staff with executives who need a right hand, not a task-taker.',
      'You are never sent to a role on volume. You are matched to one person, deliberately.',
      'Everything you do here is between you, us, and eventually one executive.'
    ] },
  { h: 'The part that matters',
    lede: 'Most agencies match on a CV. We match on how you actually work — because that is what decides whether a placement lasts.',
    points: [
      'The Signature asks how you work and who you are under pressure, across eighteen facets.',
      'It takes twenty to twenty-five minutes. It saves as you go, so you can stop and come back.',
      'There is no right answer. A flattering profile in the wrong seat is a failed placement — for you more than anyone.'
    ],
    note: 'Executives never see your pay, and never see how you rank against other candidates.' },
  { h: 'What happens next',
    /* This used to list Signature, availability and profile as the whole of
       it — true when it was written, wrong since Vetting, Skills and the
       Watch joined the checklist. A first-time talent reading "three things"
       here and then meeting a nine-item dashboard is exactly the kind of
       first impression that costs trust nobody gets back. */
    lede: 'Your dashboard tracks all of it until it is done. Four things carry your account itself:',
    points: [
      'Verify who you are, and sign your agreement — a document check we run once, never shown to an executive.',
      'Take the Signature — twenty to twenty-five minutes, saved as you go. Nothing is matched until it exists.',
      'Break down your skills — every discipline you claim opens its own quick breakdown.',
      'Take the Watch for each discipline you claimed — a real day of work, done once, that clears you to be put forward.'
    ],
    note: 'Set your availability along the way, so an executive can actually book you. Once everything is cleared, we do the work — you will hear from your Talent Success Manager when a role fits.' }
];

const CLIENT: Panel[] = [
  { h: 'Welcome to Relève',
    lede: 'This is your account. Everything about your search runs through here.',
    points: [
      'We find, vet and manage world-class virtual staff — and match the working relationship, not just the role.',
      'A qualified candidate within fourteen days, and a replacement if a hire does not work out.',
      'Every placement comes with a Client Success Manager and a Talent Success Manager.'
    ] },
  { h: 'How this begins',
    lede: 'Three short screens, then the one step that starts everything.',
    points: [
      'See how Relève works, what a placement can take off your plate, and what it is worth against a full-time hire.',
      'Open your search with your $500 deposit — credited in full to your first month, and the moment sourcing begins.',
      'Read as much or as little as you like. A decided executive can pay straight away.'
    ],
    note: 'If you already arranged the deposit on your call, that step is done and you move straight on.' },
  { h: 'Once your search is open',
    lede: 'Then the part only you can give us: how you actually work.',
    points: [
      'Build your Executive Signature — fifteen to twenty minutes, saved as you go. Every candidate is scored against it before their name reaches you.',
      'Break down the role — what the person will own, and what they must be good at.',
      'Set the hours you are open to meeting candidates — we never offer anyone a slot outside them.'
    ],
    note: 'Then we put forward one vetted professional. You approve them and we book the introduction, or decline and we bring the next. Your Client Success Manager is with you throughout.' }
];

export default function Welcome({ role }: { role: 'client' | 'talent' }) {
  const panels = role === 'client' ? CLIENT : TALENT;
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  /* Held one frame behind the panel index so the entrance transition runs
     from its starting state. Setting the class in the same render as the
     content means the browser has nothing to animate from and the panel
     simply appears. */
  const [shown, setShown] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  /* The height the card had before this panel replaced the last one. It has
     to be remembered rather than measured: by the time a layout effect runs,
     React has already swapped the content in, so measuring at that point
     returns the new height and there is nothing to animate from. */
  const lastHeight = useRef<number | null>(null);
  const router = useRouter();
  const last = i === panels.length - 1;
  const p = panels[i];

  useEffect(() => {
    setShown(false);
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, [i]);

  /* The panels are genuinely different lengths — three points on one, four
     and a note on another — so forcing them to a single height would mean
     either a wall of empty space or clipped copy. Instead the card glides
     between the two heights, which reads as deliberate where a jump reads as
     unfinished.

     Layout effect, not effect: this has to measure and set the starting
     height before the browser paints the new panel, or the jump happens
     anyway and then animates from the wrong place. */
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const to = el.getBoundingClientRect().height;
    const from = lastHeight.current;
    lastHeight.current = to;

    /* First panel, no change worth animating, or somebody who has asked for
       less motion: leave the card to lay itself out. */
    if (from === null || Math.abs(to - from) < 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    el.style.height = `${from}px`;
    const raf = requestAnimationFrame(() => { el.style.height = `${to}px`; });
    /* Back to auto once it lands, so the card can still grow if the window
       narrows and the copy rewraps. */
    const settle = () => { el.style.height = ''; };
    el.addEventListener('transitionend', settle, { once: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('transitionend', settle);
    };
  }, [i]);

  async function finish() {
    setBusy(true);
    try {
      const r = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ onboarded: true })
      });
      /* Go through either way — a failed flag must not trap anyone on the
         tour — but say so, because they will see it again next time. */
      if (!r.ok) toast.bad('Taking you through, though we could not save that you have seen this.');
    } catch {
      toast.bad('Taking you through, though we could not save that you have seen this.');
    }
    router.push('/app');
    router.refresh();
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <img className="logo" src="/logo-fern.png" alt="Relève Executive Staffing" />

        <div className="welcome-card tour" ref={cardRef}>
          <div className={`panel${shown ? ' in' : ''}`} key={i}>
            <div className="welcome-step">{i + 1} of {panels.length}</div>
            <h1>{p.h}</h1>
            <p className="lede">{p.lede}</p>
            {p.points && <ul>{p.points.map(x => <li key={x}>{x}</li>)}</ul>}
            {p.note && <p className="welcome-note">{p.note}</p>}
          </div>

          <div className="welcome-foot">
            <div className="dots" aria-hidden>
              {panels.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}
            </div>
            <div className="welcome-acts">
              {!last && (
                <button className="welcome-skip" onClick={finish}>Skip</button>
              )}
              {i > 0 && (
                <button className="btn sm ghost" onClick={() => setI(i - 1)}>Back</button>
              )}
              {last
                ? <button className="btn sm solid" disabled={busy} onClick={finish}>
                    {busy ? 'One moment…' : 'Take me to my account'}
                  </button>
                : <button className="btn sm solid" onClick={() => setI(i + 1)}>Continue</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
