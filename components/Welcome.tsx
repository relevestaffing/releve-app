'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';

type Panel = { h: string; lede: string; points?: string[]; note?: string };

const TALENT: Panel[] = [
  { h: 'Welcome to Relève',
    lede: 'You have been invited because someone here thinks you are worth placing well. This account is where that happens.',
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
    lede: 'Three things, in this order. Your dashboard tracks them until they are done.',
    points: [
      'Take the Signature — nothing is matched until it exists.',
      'Set your availability — without it, no executive can book you, however good your profile is.',
      'Complete your profile — skills, experience, and a photo. This is what an executive reads first.'
    ],
    note: 'Once those are done, we do the work. You will hear from your Talent Success Manager when a role fits.' }
];

const CLIENT: Panel[] = [
  { h: 'Welcome to Relève',
    lede: 'This is your account. Everything about your search runs through here.',
    points: [
      'We find, vet and manage world-class virtual staff — and match the working relationship, not just the role.',
      'A qualified candidate within fourteen days, and a replacement if a hire does not work out.',
      'Every placement comes with a Client Success Manager and a Talent Success Manager.'
    ] },
  { h: 'Why we ask you to do anything at all',
    lede: 'Because the match is built on how you work, and only you can tell us that.',
    points: [
      'The Executive Signature takes fifteen to twenty minutes, and saves as you go.',
      'It measures how you delegate, how you communicate, and what your world demands of the person beside you.',
      'Every candidate you see has been scored against it before their name reaches you.'
    ],
    note: 'It is the difference between sending you someone who can do the job and sending you someone who can work with you.' },
  { h: 'What happens next',
    lede: 'Three things from you, about twenty-five minutes in total. The rest is ours.',
    points: [
      'Take the Executive Signature — fifteen to twenty minutes, in as many sittings as you like.',
      'Break down the role — ten minutes. What the person will own, and what they must be good at.',
      'Set the hours you are open to meeting candidates — we never offer anyone a slot outside them.'
    ],
    /* The fourth line used to sit with the three above it, under a lede that
       says "three things from you" — and it is not a thing they do, it is what
       happens once they have. Moving it here makes the count true and gives
       the panel an ending rather than a list that stops. */
    note: 'Then we put forward one vetted professional. You approve them and we book the introduction, or decline and we bring the next. Your Client Success Manager will be in touch either way.' }
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
