'use client';
import Link from 'next/link';
import { useState } from 'react';

/* The stack of things that need this person, on Home (approved on the design
   canvas, 10 November 2026). Real paper cards in real depth on the wall: the
   front one is the next thing to do, Next sends it to the back of the stack.
   The angle is fixed; nothing follows the finger or the cursor (her rule: text
   that moves on its own hurts). Every card's button goes to the real screen. */
export type DeckCard = { eyebrow?: string; title: string; meta?: string; href: string; cta?: string; flag?: string; urgent?: boolean };

export default function Deck({ cards, label = 'Needs you' }: { cards: DeckCard[]; label?: string }) {
  const [at, setAt] = useState(0);
  const n = cards.length;
  if (!n) return null;
  return (
    <section className="cx-deck" aria-label={label}>
      <div className="cx-deck-head">
        <span>{label}</span>
        {n > 1 && <b aria-live="polite">{at + 1} of {n}</b>}
      </div>
      <div className="cx-deck-stage" data-n={Math.min(n, 3)}>
        <div className="cx-deck-tilt">
          {cards.map((c, i) => {
            const k = (i - at + n) % n;
            return (
              <article key={i} className="cx-card" data-k={Math.min(k, 3)} aria-hidden={k !== 0}
                style={{ zIndex: n - k }}>
                <div className="cx-card-top">
                  <span className="cx-card-k">{c.eyebrow ?? 'Today'}</span>
                  {c.flag && <span className={`cx-card-flag${c.urgent ? ' urgent' : ''}`}>{c.flag}</span>}
                </div>
                <h2>{c.title}</h2>
                {c.meta && <p>{c.meta}</p>}
                <div className="cx-card-go">
                  <Link href={c.href} className="cx-card-do" data-title={c.title} tabIndex={k === 0 ? 0 : -1}>{c.cta ?? 'Open'}</Link>
                  {n > 1 && <button type="button" className="cx-card-next" tabIndex={k === 0 ? 0 : -1}
                    onClick={() => setAt(a => (a + 1) % n)}>Next</button>}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
