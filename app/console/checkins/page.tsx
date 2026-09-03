import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { allPlacements, listCheckins, weekEnding } from '@/lib/work';
import Shell from '@/components/Shell';
import { fmtDay, fmtDate } from '@/lib/words';

export const dynamic = 'force-dynamic';

export default async function ConsoleCheckins() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const week = weekEnding();
  const [checkins, placements] = await Promise.all([listCheckins({ limit: 120 }), allPlacements()]);
  const byPlacement = new Map(placements.map(p => [p.id, p]));
  const thisWeek = checkins.filter(c => c.week_ending === week);
  const missing = placements.filter(p => !thisWeek.some(c => c.placement_id === p.id));
  const attention = checkins.filter(c => c.needs_attention);

  return (
    <Shell profile={profile} active="/console/checkins" title="Check-ins"
      crumb={`Week ending ${fmtDay(week)}`}>

      <div className="grid-3">
        <div className="card stat"><div className="eyebrow">In this week</div>
          <div className="score">{thisWeek.length}<span className="of">/{placements.length}</span></div></div>
        <div className="card stat"><div className="eyebrow">Needs attention</div>
          <div className="score">{attention.filter(c => c.week_ending === week).length}</div></div>
        <div className="card stat"><div className="eyebrow">Still to come</div>
          <div className="score">{missing.length}</div></div>
      </div>

      {missing.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Not filed yet</h3><span className="pill">{missing.length}</span></div>
          <ul className="past-list">
            {missing.map(p => (
              <li key={p.id}>
                <span className="past-date">{p.talent_name}</span>
                <span className="small muted">with {p.client_name}{p.org_name ? ` · ${p.org_name}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>This week</h3></div>
        {thisWeek.length === 0 ? (
          <div className="empty"><span className="tick" /><p className="small">Nothing filed yet this week.</p></div>
        ) : thisWeek.map(c => {
          const p = byPlacement.get(c.placement_id);
          return (
            <div key={c.id} className={`checkin ${c.needs_attention ? 'flagged' : ''}`}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <b>{p?.talent_name ?? 'Talent'}</b>
                <span className="xs muted">
                  with {p?.client_name ?? '—'} · rapport {c.rapport ?? '—'}/5 · {c.workload ?? '—'}
                  {c.needs_attention && <span className="pill crit" style={{ marginLeft: 10 }}>Attention</span>}
                </span>
              </div>
              {c.shipped && <p className="small"><span className="muted">Shipped — </span>{c.shipped}</p>}
              {c.blocked && <p className="small"><span className="muted">Blocked — </span>{c.blocked}</p>}
              {c.note && <p className="small"><span className="muted">Private — </span>{c.note}</p>}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
