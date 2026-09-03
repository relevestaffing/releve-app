'use client';
import { useState } from 'react';
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
      'It takes about twenty minutes. It saves as you go, so you can stop and come back.',
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
      'We find, vet and manage world-class virtual staff — you approve who you meet.',
      'A qualified shortlist within fourteen days, and a replacement if a hire does not work out.',
      'Every placement comes with a Client Success Manager and a Talent Success Manager.'
    ] },
  { h: 'Why we ask you to do anything at all',
    lede: 'Because the match is built on how you work, and only you can tell us that.',
    points: [
      'The Executive Signature takes about thirteen minutes.',
      'It measures how you delegate, how you communicate, and what your world demands of the person beside you.',
      'Every candidate you see has been scored against it before their name reaches you.'
    ],
    note: 'It is the difference between a shortlist of people who can do the job and a shortlist of people who can work with you.' },
  { h: 'What happens next',
    lede: 'Two things from you. The rest is ours.',
    points: [
      'Take the Signature.',
      'Set the hours you are open to meeting candidates — we never offer anyone a slot outside them.',
      'We release a shortlist. You review, and book whoever you would like to meet.'
    ],
    note: 'Your Client Success Manager will be in touch either way.' }
];

export default function Welcome({ role }: { role: 'client' | 'talent' }) {
  const panels = role === 'client' ? CLIENT : TALENT;
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const last = i === panels.length - 1;
  const p = panels[i];

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
        <div className="welcome-card" key={i}>
          <h1>{p.h}</h1>
          <p className="lede">{p.lede}</p>
          {p.points && <ul>{p.points.map(x => <li key={x}>{x}</li>)}</ul>}
          {p.note && <p className="small muted" style={{ marginTop: 20 }}>{p.note}</p>}
        </div>
        <div className="dots">{panels.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
        <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
          {i > 0 && <button className="btn ghost" onClick={() => setI(i - 1)}>Back</button>}
          {last
            ? <button className="btn solid" disabled={busy} onClick={finish}>{busy ? 'One moment…' : 'Take me to my account'}</button>
            : <button className="btn solid" onClick={() => setI(i + 1)}>Continue</button>}
        </div>
        {!last && <button className="btn ghost sm" style={{ marginTop: 18, border: 'none' }} onClick={finish}>Skip</button>}
      </div>
    </div>
  );
}
