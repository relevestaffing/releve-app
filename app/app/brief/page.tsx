import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { getPlacement, listPlacementsFor } from '@/lib/work';
import Shell from '@/components/Shell';
import Empty from '@/components/Empty';
import BriefEditor from '@/components/BriefEditor';
import { BRIEF_FIELDS, getBrief } from '@/lib/experience';
import { firstName, fmtDate } from '@/lib/words';
import '@/components/experience.css';

export const dynamic = 'force-dynamic';

/* The executive's briefing, for the person working with them: tools, access,
   how they like things done, and what to always ask first. Read here by the
   talent; written by the executive (on their placement page, or here) and by
   Relève. */
export default async function BriefPage({ searchParams }: { searchParams: Promise<{ placement?: string }> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  const sp = await searchParams;

  /* The console edits a placement's briefing here too, by id. */
  if (profile.role === 'admin') {
    const pl = sp.placement ? await getPlacement(sp.placement) : null;
    if (!pl) redirect('/console/placements');
    const b = await getBrief(pl.id);
    return (
      <Shell profile={profile} active="/console/placements" title={`Briefing for ${firstName(pl.talent_name)}`}
        crumb={`${pl.org_name ?? pl.client_name} · written with the executive`}
        action={<Link className="btn sm ghost" href={`/console/placements/${pl.id}`}>Back to the placement</Link>}>
        <BriefEditor placementId={pl.id} talentName={firstName(pl.talent_name)} initial={b} startOpen />
      </Shell>
    );
  }
  const placements = await listPlacementsFor(profile.id);

  if (!placements.length) return (
    <Shell profile={profile} active="/app/brief" title="Your briefing" crumb="How your executive works">
      <Empty of={{
        title: 'Your briefing arrives with your placement',
        body: 'Your executive writes down their tools, the access you will have and how they like things done. It appears here before your first day.',
        cta: { label: 'Back to your dashboard', href: '/app' }
      }} />
    </Shell>
  );

  const p = placements.find(x => x.id === sp.placement) ?? placements[0];
  const brief = await getBrief(p.id);

  if (profile.role === 'client') return (
    <Shell profile={profile} active="/app/brief" title={`The briefing for ${firstName(p.talent_name)}`} crumb="What they need to work the way you do">
      <BriefEditor placementId={p.id} talentName={firstName(p.talent_name)} initial={brief} startOpen />
    </Shell>
  );

  const exec = firstName(p.client_name);
  const filled = BRIEF_FIELDS.filter(f => (brief?.[f.key] ?? '').trim());

  return (
    <Shell profile={profile} active="/app/brief" title="Your briefing"
      crumb={`How ${p.org_name ?? p.client_name} works`}
      action={placements.length > 1 ? (
        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {placements.map(x => (
            <Link key={x.id} className={`btn sm ${x.id === p.id ? 'solid' : 'ghost'}`} href={`/app/brief?placement=${x.id}`}>
              {x.org_name ?? firstName(x.client_name)}
            </Link>
          ))}
        </span>
      ) : undefined}>
      <div className="card">
        <div className="card-head">
          <h3>From {exec}</h3>
          {brief?.updated_at && <span className="xs muted">Updated {fmtDate(brief.updated_at)}</span>}
        </div>
        {!filled.length ? (
          <p className="small muted" style={{ margin: 0 }}>
            {exec} has not written the briefing yet. Your Talent Success Manager can help fill it in with you;
            until then, ask anything on a task or in Messages.
          </p>
        ) : filled.map(f => (
          <div key={f.key} className="brief-block">
            <div className="eyebrow">{f.label}</div>
            <p>{brief![f.key]}</p>
          </div>
        ))}
        <div className="row" style={{ gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <Link className="btn sm ghost" href={`/app/messages?tab=${p.id}`}>Ask {exec} a question</Link>
          <Link className="btn sm ghost" href="/app/messages?tab=sm">Something missing? Tell your manager</Link>
        </div>
      </div>
    </Shell>
  );
}
