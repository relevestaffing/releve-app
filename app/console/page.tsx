import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { getBench } from '@/lib/data';
import { L1, L2 } from '@/lib/signature/model';
import Shell from '@/components/Shell';
import { Stat } from '@/components/Viz';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function Console() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin' && configured()) redirect('/app');
  const bench = await getBench();
  const flagged = bench.filter(p => p.validity.verdict !== 'Valid');

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console" title="Overview" crumb="Relève console">
      <div className="grid-4">
        <Stat label="Talent on the bench" value={bench.length} sub={`${bench.filter(p => p.stage === 'Vetted').length} vetted and available`} />
        <Stat label="Profiles verified" value={bench.length - flagged.length} sub={`${flagged.length} flagged for review`} />
        <Stat label="Placed" value={bench.filter(p => p.stage === 'Placed').length} sub="Currently in seat" />
        <Stat label="Instrument" value="12" sub="Axes · 18 facets on the talent side" />
      </div>
      <div className="card">
        <div className="card-head"><h3>Signature coverage on the bench</h3>
          <Link className="btn sm ghost" href="/console/bench">Open the bench</Link></div>
        <p className="small muted" style={{ marginBottom: 18 }}>
          Where the bench sits on each axis. Thin coverage on an axis is a sourcing brief.
        </p>
        {[...L1, ...L2.filter(a => a.type !== 'flag')].map(ax => {
          const avg = Math.round(bench.reduce((s, t) => s + (t.scores[ax.key] ?? 50), 0) / bench.length);
          return (
            <div className="axis-row" key={ax.key}>
              <div className="axis-labels"><span>{ax.lo}</span><b>{ax.name} · avg {avg}</b><span>{ax.hi}</span></div>
              <div className="axis-track">
                {bench.map(t => (
                  <span key={t.id} className="axis-marker"
                    style={{ left: `calc(${t.scores[ax.key]}% - 1.5px)`, background: 'var(--pale)' }} title={t.name} />
                ))}
                <span className="axis-marker" style={{ left: `calc(${avg}% - 1.5px)`, background: 'var(--fern)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
