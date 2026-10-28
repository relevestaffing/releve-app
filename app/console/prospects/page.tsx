import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listProspects } from '@/lib/prospects';
import { teamRoles } from '@/lib/care';
import { calendarConfigured } from '@/lib/calendar';
import { todayInPacific } from '@/lib/money-public';
import Shell from '@/components/Shell';
import DirectoryTabs from '@/components/DirectoryTabs';
import LeadBoard from '@/components/LeadBoard';

export const metadata = { title: 'Leads' };

export const dynamic = 'force-dynamic';

export default async function Leads() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const [all, team] = await Promise.all([listProspects(), teamRoles().catch(() => [])]);

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/directory" title="Directory" crumb="Leads">
      <DirectoryTabs active="prospects" />
      <LeadBoard
        prospects={all}
        team={team.map(m => ({ user_id: m.user_id, name: m.name }))}
        calendarOn={calendarConfigured()}
        today={todayInPacific()}
      />
    </Shell>
  );
}
