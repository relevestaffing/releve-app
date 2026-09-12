import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listPeople, vettingQueue } from '@/lib/work';
import Shell from '@/components/Shell';
import VettingReview from '@/components/VettingReview';
import IssueAgreement from '@/components/IssueAgreement';
import { docusignReady } from '@/lib/docusign';

export const dynamic = 'force-dynamic';

export default async function ConsoleVetting() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const [rows, people] = await Promise.all([vettingQueue(), listPeople()]);
  const talent = people.filter(p => p.role === 'talent');
  return (
    <Shell profile={profile} active="/console/vetting" title="Verification"
      crumb="Documents waiting on a decision">
      <IssueAgreement talent={talent} docusignOn={docusignReady()} />
      <VettingReview rows={rows} />
    </Shell>
  );
}
