'use client';

import { useEffect, useState } from 'react';

/* Full-page, once-only celebration — the first thing a talent sees the next
   time they sign in after a placement is confirmed. Shown by
   /placement-confirmed, which is the only route that ever renders this; see
   PlacementRevealScreen for the click handler that marks it seen. */

type PlacementRevealProps = {
  /* 'CLIENT' on the talent's screen, 'TALENT' on the client's — the other
     party in this placement. */
  counterpartLabel: string;
  counterpartName: string;
  roleTitle: string;
  startDate: string;
  onViewPlacement: () => void;
};

export default function PlacementReveal({
  counterpartLabel,
  counterpartName,
  roleTitle,
  startDate,
  onViewPlacement,
}: PlacementRevealProps) {
  const [ticks, setTicks] = useState<
    { id: number; left: number; size: number; delay: number; duration: number; alt: boolean }[]
  >([]);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const generated = Array.from({ length: 16 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 8 + Math.random() * 10,
      delay: Math.random() * 1.4,
      duration: 2.6 + Math.random() * 1.6,
      alt: i % 3 === 0,
    }));
    setTicks(generated);
  }, []);

  return (
    <div className="rv-screen">
      <div className="rv-mark">
        <div className="rv-mark-tick" />
        <div className="rv-mark-word">RELÈVE</div>
      </div>

      <div className="rv-ticks" aria-hidden="true">
        {ticks.map((t) => (
          <div
            key={t.id}
            className={`rv-tick${t.alt ? ' rv-tick-alt' : ''}`}
            style={{
              left: `${t.left}vw`,
              width: `${t.size}px`,
              height: `${t.size}px`,
              animationDelay: `${t.delay}s`,
              animationDuration: `${t.duration}s`,
            }}
          />
        ))}
      </div>

      <div className="rv-content">
        <div className="rv-eyebrow">YOUR PLACEMENT HAS ARRIVED</div>
        <h1 className="rv-h1">Consider it handled!</h1>

        <div className="rv-card">
          <div className="rv-row">
            <span className="rv-label">{counterpartLabel}</span>
            <span className="rv-value">{counterpartName}</span>
          </div>
          <div className="rv-row">
            <span className="rv-label">ROLE</span>
            <span className="rv-value">{roleTitle}</span>
          </div>
          <div className="rv-row">
            <span className="rv-label">START DATE</span>
            <span className="rv-value">{startDate}</span>
          </div>
        </div>

        <button className="rv-cta" onClick={onViewPlacement}>
          View Your Placement
        </button>
      </div>

      <style jsx>{`
        .rv-screen {
          position: relative;
          min-height: 100vh;
          background: var(--fern);
          color: var(--cream);
          font-family: 'Tenor Sans', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          overflow: hidden;
        }
        .rv-mark {
          position: absolute;
          top: 32px;
          left: 32px;
          display: flex;
          align-items: center;
          gap: 10px;
          opacity: 0.7;
        }
        .rv-mark-tick {
          width: 12px;
          height: 12px;
          background: var(--cream);
          transform: rotate(18deg);
          border-radius: 2px;
        }
        .rv-mark-word {
          font-family: 'Marcellus', serif;
          letter-spacing: 0.14em;
          font-size: 14px;
        }
        .rv-ticks {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .rv-tick {
          position: absolute;
          top: -40px;
          background: var(--cream);
          border-radius: 3px;
          opacity: 0;
          animation-name: rv-fall;
          animation-timing-function: ease-in;
          animation-fill-mode: forwards;
        }
        .rv-tick-alt {
          background: var(--pale);
        }
        @keyframes rv-fall {
          0% {
            transform: translateY(0) rotate(18deg);
            opacity: 0;
          }
          8% {
            opacity: 0.9;
          }
          100% {
            transform: translateY(112vh) rotate(140deg);
            opacity: 0;
          }
        }
        .rv-content {
          position: relative;
          z-index: 2;
          text-align: center;
          max-width: 520px;
        }
        .rv-eyebrow {
          font-size: 13px;
          letter-spacing: 0.14em;
          color: var(--pale);
          margin-bottom: 18px;
          opacity: 0;
          animation: rv-rise 0.7s ease-out 0.2s forwards;
        }
        .rv-h1 {
          font-family: 'Marcellus', serif;
          font-weight: 400;
          font-size: 46px;
          line-height: 1.18;
          margin-bottom: 36px;
          opacity: 0;
          animation: rv-rise 0.8s ease-out 0.45s forwards;
        }
        .rv-card {
          background: rgba(240, 242, 238, 0.06);
          border: 1px solid rgba(240, 242, 238, 0.18);
          border-radius: 3px;
          padding: 28px 30px;
          margin-bottom: 36px;
          opacity: 0;
          animation: rv-rise 0.8s ease-out 0.75s forwards;
        }
        .rv-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 11px 0;
          border-bottom: 1px solid rgba(240, 242, 238, 0.14);
          text-align: left;
        }
        .rv-row:last-child {
          border-bottom: none;
        }
        .rv-label {
          font-size: 12.5px;
          letter-spacing: 0.06em;
          color: var(--pale);
        }
        .rv-value {
          font-family: 'Marcellus', serif;
          font-size: 17px;
        }
        .rv-cta {
          display: inline-block;
          background: var(--cream);
          color: var(--fern);
          font-family: 'Tenor Sans', sans-serif;
          font-size: 14.5px;
          letter-spacing: 0.03em;
          padding: 15px 34px;
          border-radius: 2px;
          border: none;
          cursor: pointer;
          opacity: 0;
          animation: rv-rise 0.8s ease-out 1.05s forwards;
        }
        @keyframes rv-rise {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rv-tick {
            display: none;
          }
          .rv-eyebrow,
          .rv-h1,
          .rv-card,
          .rv-cta {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
        @media (max-width: 480px) {
          .rv-h1 {
            font-size: 32px;
          }
          .rv-card {
            padding: 22px 20px;
          }
        }
      `}</style>
    </div>
  );
}
