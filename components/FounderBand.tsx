import Link from 'next/link';
import { money, monthLabel } from '@/lib/money-public';
import type { Trend } from '@/lib/founder';

/* The founder's first read of the morning: where the business is heading,
   above the day's work. Owner-only, rendered by the Overview. Everything
   here is a trend or a total, not a thing to do; the doing is below it. */

function Spark({ series }: { series: { month: string; cents: number }[] }) {
  const vals = series.map(s => s.cents);
  if (vals.length < 2 || vals.every(v => v === 0)) return null;
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const W = 132, H = 34, pad = 3;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (vals.length - 1);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(vals.length - 1).toFixed(1)} ${H - pad} L${x(0).toFixed(1)} ${H - pad} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <path d={area} fill="var(--sage)" opacity="0.12" />
      <path d={d} fill="none" stroke="var(--fern)" strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="2.6" fill="var(--fern)" />
    </svg>
  );
}

export default function FounderBand({ trend }: { trend: Trend }) {
  /* Derived from the run rate shown beside it so the two always agree. */
  const annualizedCents = trend.runRateNowCents * 12;
  const d = trend.runRateDelta;
  const dir = d == null ? null : d > 0.005 ? 'up' : d < -0.005 ? 'down' : 'flat';
  const net = trend.placedThisMonth - trend.endedThisMonth;
  const firstMonth = trend.runRate.length ? monthLabel(trend.runRate[0].month) : null;

  return (
    <div className="card founder-band">
      <div className="card-head">
        <h3>Where the business stands</h3>
        {trend.atRisk > 0
          ? <Link href="#today" className="pill crit"><span className="dot" />{trend.atRisk} at risk today</Link>
          : <span className="pill good"><span className="dot" />Nothing at risk</span>}
      </div>

      <div className="founder-grid">
        <div className="founder-rate">
          <div className="eyebrow">Monthly run rate</div>
          <div className="founder-n">{money(trend.runRateNowCents)}</div>
          <div className="founder-sub">
            {dir && d != null && dir !== 'flat' ? (
              <span className={dir === 'up' ? 'up' : 'down'}>
                {dir === 'up' ? '▲' : '▼'} {Math.abs(Math.round(d * 100))}%
              </span>
            ) : <span className="muted">Holding</span>}
            {firstMonth && <span className="muted"> since {firstMonth}</span>}
          </div>
          <Spark series={trend.runRate} />
        </div>

        <div className="founder-tiles">
          <div className="founder-tile">
            <div className="eyebrow">Annualized</div>
            <div className="founder-t-n">{money(annualizedCents)}</div>
          </div>
          <div className="founder-tile">
            <div className="eyebrow">Live placements</div>
            <div className="founder-t-n">{trend.placementsLive}</div>
            {(trend.placedThisMonth || trend.endedThisMonth) ? (
              <div className="founder-sub">
                {net >= 0 ? <span className="up">+{net}</span> : <span className="down">{net}</span>}
                <span className="muted"> this month</span>
              </div>
            ) : null}
          </div>
          <div className="founder-tile">
            <div className="eyebrow">Seats kept</div>
            <div className="founder-t-n">{trend.retentionPct == null ? '–' : `${trend.retentionPct}%`}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
