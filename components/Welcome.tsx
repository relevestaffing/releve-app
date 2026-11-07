'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import PushSetup from '@/components/PushSetup';
import SunWall from '@/components/SunWall';

type Panel = { h: string; lede: string; points?: string[]; note?: string };

const TALENT: Panel[] = [
  { h: 'Welcome to Relève',
    lede: 'You have been invited to join the Relève roster, the professionals we assess, verify and introduce to executives. Everything from here happens in this account.',
    points: [
      'We place virtual professionals with executives who want a trusted right hand.',
      'Each introduction is to one executive, chosen for the fit. We never put people forward on volume.',
      'What you share here stays between you, Relève and, once you are placed, your executive.'
    ] },
  { h: 'How we match',
    lede: 'We match on how you work as well as your resume, because that is what decides whether a placement lasts.',
    points: [
      'The Talent Signature™ is our assessment of how you work, and how you handle pressure, across eighteen facets.',
      'It takes twenty to twenty-five minutes and saves as you go, so you can stop and return later.',
      'There are no right answers. Honest ones lead to a role that lasts.'
    ],
    note: 'Executives never see your pay or how you compare with other candidates.' },
  { h: 'What happens next',
    /* This used to list Signature, availability and profile as the whole of
       it — true when it was written, wrong since Vetting, Skills and the
       Watch joined the checklist. A first-time talent reading "three things"
       here and then meeting a nine-item dashboard is exactly the kind of
       first impression that costs trust nobody gets back. */
    lede: 'Your dashboard shows each step until it is done. These four come first.',
    points: [
      'Verify your identity and sign your contractor agreement. We check your document once, and no executive ever sees it.',
      'Take the Talent Signature™. Every match starts from it.',
      'Break down your skills. Each discipline you choose has its own short breakdown.',
      'Complete Taking The Watch™, a real day of work in each discipline you choose. You take it once, and it clears you to be put forward.'
    ],
    note: 'Set your availability too, so executives can book time with you. Once you are cleared, your Talent Success Manager will be in touch when a role fits.' }
];

const CLIENT: Panel[] = [
  { h: 'Welcome to Relève',
    lede: 'This is your account. Your search, your candidates and your messages are all here.',
    points: [
      'Every candidate is vetted on six fronts and matched to how you work before you meet them.',
      'Your first vetted candidate within fourteen days, and a replacement if the fit is not right.',
      'Your Client Success Manager looks after you. A Talent Success Manager supports your assistant.'
    ] },
  { h: 'How this begins',
    lede: 'A short tour, then your deposit.',
    points: [
      'See how Relève works, what you can hand off, and the time it gives back.',
      'Open your search with the $500 deposit. It is credited in full once your assistant is placed with you, and sourcing begins as soon as it is paid.',
      'Skip ahead to the deposit whenever you are ready.'
    ],
    note: 'If you arranged the deposit on your call, that step is already done.' },
  { h: 'Once your search is open',
    lede: 'Next, we learn how you work.',
    points: [
      'Take the Executive Signature™, about fifteen minutes and saved as you go. Every candidate is scored against it before you see their name.',
      'Break down the role: what your assistant will own, and the skills it calls for.',
      'Set the hours you are free to meet candidates. We only offer times inside them.'
    ],
    note: 'We then put forward one vetted professional. Approve them and we arrange the introduction, or decline and we bring you the next. Your Client Success Manager is with you throughout.' }
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
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ onboarded: true })
      });
      /* Go through either way — a failed flag must not trap anyone on the
         tour — but say so, because they will see it again next time. */
      if (!r.ok) toast.bad('We could not save your progress, so this tour may show again next time.');
    } catch {
      toast.bad('We could not save your progress, so this tour may show again next time.');
    }
    router.push('/app');
    router.refresh();
  }

  return (
    <div className="welcome">
      <SunWall room />
      <div className="welcome-inner">
        <img className="logo" src="/logo-fern.png" alt="Relève Executive Staffing" />

        <div className="welcome-card tour" ref={cardRef}>
          <div className={`panel${shown ? ' in' : ''}`} key={i}>
            <div className="welcome-step">{i + 1} of {panels.length}</div>
            <h1>{p.h}</h1>
            <p className="lede">{p.lede}</p>
            {p.points && <ul>{p.points.map(x => <li key={x}>{x}</li>)}</ul>}
            {p.note && <p className="welcome-note">{p.note}</p>}
            {last && <div style={{ marginTop: 18 }}><PushSetup /></div>}
          </div>

          <div className="welcome-foot">
            <div className="dots" aria-hidden>
              {panels.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}
            </div>
            <div className="welcome-acts">
              {!last && (
                <button className="welcome-skip" disabled={busy} onClick={finish}>Skip</button>
              )}
              {i > 0 && (
                <button className="btn sm ghost" onClick={() => setI(i - 1)}>Back</button>
              )}
              {last
                ? <button className="btn sm solid" disabled={busy} onClick={finish}>
                    {busy ? 'One moment…' : 'Open your account'}
                  </button>
                : <button className="btn sm solid" onClick={() => setI(i + 1)}>Continue</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
