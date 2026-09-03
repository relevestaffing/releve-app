import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listCheckins, listPlacementsFor, weekEnding } from '@/lib/work';
import Shell from '@/components/Shell';
import CheckinForm from '@/components/CheckinForm';
import { EMPTY, WORDS, fmtDate } from '@/lib/words';
import Empty from '@/components/Empty';

export const dynamic = 'force-dynamic';

export default async function CheckinPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'talent') redirect('/app');

  const placements = await listPlacementsFor(profile.id);
  const week = weekEnding();
  const past = await listCheckins({ talentId: profile.id, limit: 12 });

  return (
    <Shell profile={profile} active="/app/checkin" title="Weekly check-in"
      crumb={`Every Friday, to ${WORDS.tsmShort}`}>
      {placements.length === 0 ? (
        <Empty of={EMPTY.checkinUnplaced} />
      ) : placements.map(p => (
        <CheckinForm key={p.id} placement={p} week={week}
          existing={past.find(c => c.placement_id === p.id && c.week_ending === week) ?? null} />
      ))}

      {past.filter(c => c.week_ending !== week).length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Earlier weeks</h3></div>
          <ul className="past-list">
            {past.filter(c => c.week_ending !== week).map(c => (
              <li key={c.id}>
                <span className="past-date">{fmtDate(c.week_ending)}</span>
                <span className="small">{c.shipped || <span className="muted">No note</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}
