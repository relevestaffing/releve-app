import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getSelfProfile } from '@/lib/store';
import Shell from '@/components/Shell';
import ExecProfileEditor from '@/components/ExecProfileEditor';
import { Portrait } from '@/components/Viz';

export const dynamic = 'force-dynamic';

export default async function ExecProfile() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'client') redirect('/app');
  const self = await getSelfProfile(profile.id);
  const initial = {
    full_name: profile.full_name, headline: profile.headline, org_name: profile.org_name, ...self
  };

  return (
    <Shell profile={profile} active="/app/profile" title="Your profile" crumb="What a candidate sees before meeting you">
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 16 }}>How this reads to a candidate</div>
        <div className="row" style={{ gap: 18 }}>
          <Portrait id={profile.id} name={initial.full_name ?? ''} cls="lg" url={initial.photo_url} />
          <div>
            <h2 style={{ fontSize: 24, color: 'var(--cream)', marginBottom: 6 }}>{initial.full_name || 'Your name'}</h2>
            <p style={{ fontFamily: 'Marcellus,serif', fontSize: 16, color: 'var(--pale)' }}>
              {[initial.headline, initial.org_name].filter(Boolean).join(' · ') || 'Your title and company'}
            </p>
          </div>
        </div>
        {initial.bio && <p className="small" style={{ maxWidth: 620, marginTop: 18 }}>{initial.bio}</p>}
      </div>

      <ExecProfileEditor initial={initial} />
    </Shell>
  );
}
