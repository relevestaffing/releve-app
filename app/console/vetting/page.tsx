import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listPeople, vettingQueue } from '@/lib/work';
import Shell from '@/components/Shell';
import VettingReview from '@/components/VettingReview';
import IssueAgreement from '@/components/IssueAgreement';
import { docusignReady, manualSendUrl } from '@/lib/docusign';
import { pendingTalentCountersigns } from '@/lib/countersign';

export const metadata = { title: 'Verification' };

export const dynamic = 'force-dynamic';

export default async function ConsoleVetting() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const [rows, people, pendingCountersign] = await Promise.all([
    vettingQueue(), listPeople(), pendingTalentCountersigns()
  ]);
  const talent = people.filter(p => p.role === 'talent');
  return (
    <Shell profile={profile} active="/console/directory" title="Verification"
      crumb="To review"
      action={<Link className="btn sm ghost" href="/console/directory">← Directory</Link>}>
      <IssueAgreement talent={talent} docusignOn={docusignReady()} pendingCountersign={pendingCountersign}
        manualSendUrl={manualSendUrl('talent')} />
      <VettingReview rows={rows} />
    </Shell>
  );
}
