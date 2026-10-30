'use client';
import { useState } from 'react';

/* What an assistant gives back, in the executive's own numbers.
   Two sliders: the hours a week their assistant carries, and what one hour of
   their focus is worth. Out come hours, working days, weeks and dollars back
   each year. Same arithmetic as the website calculator (48 working weeks, an
   eight-hour day, a forty-hour week), so the two always agree. Deliberately no
   Relève pricing on this screen: the deposit is the only number the first-run
   tour asks for, and it says so elsewhere. */
const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function TimeBackCalculator() {
  const [hours, setHours] = useState(15);
  const [worth, setWorth] = useState(250);

  const hoursYear = hours * 48;
  const days = Math.round(hoursYear / 8);
  const weeks = Math.round(hoursYear / 40);
  const dollars = hoursYear * worth;

  return (
    <div className="card">
      <div className="card-head"><h3>What is your time worth?</h3></div>

      <div className="tb-in">
        <label className="tb-rng">
          <span className="tb-lab">Hours a week your assistant carries <output>{hours}</output></span>
          <input type="range" min={2} max={40} step={1} value={hours}
            onChange={e => setHours(Number(e.target.value))} aria-label="Hours a week your assistant carries" />
        </label>
        <label className="tb-rng">
          <span className="tb-lab">What one hour of your focus is worth <output>{fmt(worth)}</output></span>
          <input type="range" min={50} max={1000} step={25} value={worth}
            onChange={e => setWorth(Number(e.target.value))} aria-label="What one hour of your focus is worth" />
        </label>
        <p className="xs muted" style={{ margin: 0 }}>
          Think of what an hour of selling, leading or building returns to the business, not what you would pay yourself.
        </p>
      </div>

      <div className="money-strip">
        <div className="money-stat">
          <div className="n">{hoursYear.toLocaleString('en-US')}</div>
          <div className="k">Hours back every year</div>
        </div>
        <div className="money-stat">
          <div className="n">{days}</div>
          <div className="k">Working days back</div>
        </div>
        <div className="money-stat">
          <div className="n">{weeks}</div>
          <div className="k">Weeks back</div>
        </div>
        <div className="money-stat" style={{ boxShadow: 'inset 3px 0 0 var(--fern)' }}>
          <div className="n" style={{ color: 'var(--fern)' }}>{fmt(dollars)}</div>
          <div className="k">Of your focus, returned every year</div>
        </div>
      </div>

      <p className="verdict" style={{ marginTop: 4 }}>
        {hours} hours a week is <b>{weeks} working weeks</b> a year that go back to the work only you can do.
      </p>
    </div>
  );
}
