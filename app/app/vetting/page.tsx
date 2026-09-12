import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listVetting } from '@/lib/work';
import Shell from '@/components/Shell';
import NextStep from '@/components/NextStep';
import { setupFor } from '@/lib/setup';
import VettingUpload from '@/components/VettingUpload';
import { docusignReady } from '@/lib/docusign';

export const dynamic = 'force-dynamic';

export default async function VettingPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'talent') redirect('/app');
  const rows = await listVetting(profile.id);
  return (
    <Shell profile={profile} active="/app/vetting" title="Verification"
      crumb="Done once, and then never again">
      <VettingUpload rows={rows} docusignOn={docusignReady()} />
      <NextStep steps={await setupFor(profile)} current="vetting" />
    </Shell>
  );
}
