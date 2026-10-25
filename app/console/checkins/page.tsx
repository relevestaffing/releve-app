import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { allPlacements, listCheckins, weekEnding } from '@/lib/work';
import Shell from '@/components/Shell';
import ConsoleTabs from '@/components/ConsoleTabs';
import { fmtDay, DASH } from '@/lib/words';
import { mineFor } from '@/lib/experience';
import Link from 'next/link';

export const metadata = { title: 'End of week' };

export const dynamic = 'force-dynamic';

export default async function ConsoleCheckins({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const mine = (await searchParams).mine === '1';

  const week = weekEnding();
  const [allCheckins, allRows, scope] = await Promise.all([
    listCheckins({ limit: 120 }), allPlacements(), mine ? mineFor(profile.id) : Promise.resolve(null)
  ]);
  /* "Mine": the same Everyone/Mine pair Placements and Care carry, so the
     three tabs of one section keep one header. */
  const placements = scope ? allRows.filter(p => scope.placements.has(p.id)) : allRows;
  const checkins = scope ? allCheckins.filter(c => scope.placements.has(c.placement_id)) : allCheckins;
  const byPlacement = new Map(placements.map(p => [p.id, p]));
  const thisWeek = checkins.filter(c => c.week_ending === week);
  const missing = placements.filter(p => !thisWeek.some(c => c.placement_id === p.id));
  const attention = checkins.filter(c => c.needs_attention);

  return (
    <Shell profile={profile} active="/console/placements" title="Placements"
      crumb={`Week ending ${fmtDay(week)}`}
      action={
        <span className="row" role="group" aria-label="Whose placements" style={{ gap: 6 }}>
          <Link className={`btn sm ${mine ? 'ghost' : 'solid'}`} href="/console/checkins">Everyone</Link>
          <Link className={`btn sm ${mine ? 'solid' : 'ghost'}`} href="/console/checkins?mine=1">Mine</Link>
        </span>
      }>
      <ConsoleTabs active="/console/checkins" items={[
        { href: '/console/placements', label: 'Placements' },
        { href: '/console/checkins', label: 'End of week' },
        { href: '/console/care', label: 'Care' }
      ]} />

      <div className="grid-3">
        <div className="card stat"><div className="eyebrow">Filed this week</div>
          <div className="score">{placements.length
            ? <>{thisWeek.length}<span className="of">/{placements.length}</span></>
            : DASH}</div></div>
        <div className="card stat"><div className="eyebrow">With a concern</div>
          <div className="score">{attention.filter(c => c.week_ending === week).length}</div></div>
        <div className="card stat"><div className="eyebrow">Still to come</div>
          <div className="score">{missing.length}</div></div>
      </div>

      {missing.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Not filed yet</h3><span className="pill">{missing.length} outstanding</span></div>
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
                  with {p?.client_name ?? DASH}{c.hours != null ? ` · ${c.hours}h` : ''}
                  {c.needs_attention && <span className="pill crit" style={{ marginLeft: 10 }}>Needs a look</span>}
                </span>
              </div>
              {c.shipped && <p className="small"><span className="muted">Accomplished: </span>{c.shipped}</p>}
              {c.win && <p className="small"><span className="muted">Win: </span>{c.win}</p>}
              {c.blocked && <p className="small"><span className="muted">Concerns: </span>{c.blocked}</p>}
              {c.note && <p className="small"><span className="muted">Private: </span>{c.note}</p>}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
