import { redirect } from 'next/navigation';
import ConsoleTabs from '@/components/ConsoleTabs';
import Shell from '@/components/Shell';
import LearnPanel, { type LearnRow } from '@/components/LearnPanel';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { COURSE_KEYS } from '@/lib/learn-courses';

export const metadata = { title: 'Training' };
export const dynamic = 'force-dynamic';

/* The team trainings (10 November 2026): Inside Relève for every new hire,
   and further courses added per person once approved. */
export default async function ConsoleTraining() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  let rows: LearnRow[] = [];
  const videos: Record<string, Record<string, string>> = {};
  if (configured()) {
    const sb = await supabaseServer();
    /* A database one migration behind reads as an empty list, not a broken page. */
    const [{ data }, { data: vids }] = await Promise.all([
      sb.from('team_trainings')
        .select('id, course, name, email, sent_at, opened_at, last_seen_at, lessons_done, checks_passed, completed_at, signed_name, revoked_at, created_at')
        .order('created_at', { ascending: false }).limit(300),
      sb.from('content_settings').select('key, value').in('key', COURSE_KEYS.map(k => `learn:videos:${k}`))
    ]);
    rows = ((data ?? []) as LearnRow[]).filter(r => COURSE_KEYS.includes(r.course));
    for (const v of (vids ?? []) as { key: string; value: Record<string, string> }[])
      videos[v.key.replace('learn:videos:', '')] = v.value ?? {};
  }

  return (
    <Shell profile={profile} active="/console/business" title="The business" crumb="Training">
      <ConsoleTabs active="/console/training" items={[
        { href: '/console/reports', label: 'Reports' },
        { href: '/console/signals', label: 'Match accuracy' },
        { href: '/console/calendar', label: 'Calendar' },
        { href: '/console/booking', label: 'Booking page' },
        { href: '/console/team', label: 'Team' },
        { href: '/console/training', label: 'Training' }
      ]} />
      <LearnPanel rows={rows} videos={videos} />
    </Shell>
  );
}
