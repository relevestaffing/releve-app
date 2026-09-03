import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getMySignature } from '@/lib/data';
import Shell from '@/components/Shell';
import SignatureFlow from '@/components/SignatureFlow';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function SignaturePage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  const side = profile.role === 'client' ? 'client' : 'talent';
  const existing = await getMySignature(profile, side);
  return (
    <Shell profile={profile} active="/app/signature"
      title={side === 'client' ? 'Executive Signature' : 'Talent Signature'} crumb="The Relève Signature">
      <SignatureFlow side={side} existing={!!existing} />
    </Shell>
  );
}
