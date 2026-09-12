import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { listPlacementsFor } from '@/lib/work';
import { getSelfProfile } from '@/lib/store';
import { getSkills, DISCIPLINE, compsOf, PROFS } from '@/lib/roles';
import Shell from '@/components/Shell';
import { Portrait } from '@/components/Viz';

export const dynamic = 'force-dynamic';

/* The talent behind the placement, for the executive who hired them.
   -------------------------------------------------------------------
   Looked up inside the executive's own placements rather than fetched by id
   and checked afterwards — the same idiom as /app/care/[id] — so a talent id
   that is not theirs is simply not found, the same answer as one that does
   not exist. Everything shown here (profile row, skills_profile, and the
   avatars/intros storage buckets) is already readable by an executive who
   shares a placement with this person, via share_work() — this page is a
   dedicated place to see it, not a new grant. */
export default async function TalentProfileForClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'client') redirect('/app');

  const placements = await listPlacementsFor(profile.id);
  const placement = placements.find(p => p.talent_id === id);
  if (!placement) notFound();

  const [self, skills] = await Promise.all([getSelfProfile(id), getSkills(id)]);
  const disciplines = skills?.disciplines ?? [];
  const backHref = placements.length === 1 ? '/app/care' : `/app/care/${placement.id}`;

  return (
    <Shell profile={profile} active="/app/care" title={placement.talent_name}
      crumb="Their profile, as they wrote it"
      action={<Link className="btn sm ghost" href={backHref}>Back to the placement</Link>}>

      <div className="card dark">
        <div className="row" style={{ gap: 18 }}>
          <Portrait id={id} name={placement.talent_name} cls="lg" url={self.photo_url} />
          <div>
            <h2 style={{ fontSize: 24, color: 'var(--cream)', marginBottom: 6 }}>{placement.talent_name}</h2>
            <p style={{ fontFamily: 'Marcellus,serif', fontSize: 16, color: 'var(--pale)' }}>
              {[self.headline, self.years_exp ? `${self.years_exp} years` : null, self.location, self.english]
                .filter(Boolean).join(' · ') || 'Their profile'}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>In their own words</h3></div>
        {self.bio
          ? <p className="small" style={{ maxWidth: 640 }}>{self.bio}</p>
          : <p className="small muted">Nothing written yet.</p>}
        {self.intro_video_url && (
          <video src={self.intro_video_url} controls playsInline preload="metadata"
            style={{ width: '100%', maxWidth: 420, borderRadius: 8, background: 'var(--ink)', display: 'block', marginTop: 18 }} />
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Their skills breakdown</h3></div>
        {!disciplines.length ? (
          <p className="small muted">Nothing filled in yet.</p>
        ) : disciplines.map(d => {
          const comps = compsOf(d);
          const years = skills?.years?.[d];
          return (
            <div key={d} style={{ marginBottom: 22 }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)', fontSize: 15 }}>
                  {DISCIPLINE[d]?.name ?? d}
                </b>
                {years ? <span className="xs muted">{years} years</span> : null}
              </div>
              {comps.map(c => {
                const level = skills?.levels?.[`${d}.${c.key}`] ?? 'none';
                const label = PROFS.find(p => p.key === level)?.label ?? 'Never done it';
                return (
                  <div className="row between" key={c.key}
                    style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', gap: 14 }}>
                    <span className="small">{c.label}</span>
                    <span className={`pill ${level === 'deep' || level === 'solid' ? 'good' : ''}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
