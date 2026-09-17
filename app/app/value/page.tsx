import { redirect } from 'next/navigation';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import ValueContent from '@/components/vision/ValueContent';

export const dynamic = 'force-dynamic';

/* The value view. Body shared with the first-run tour (ValueContent); the page
   supplies the executive's real retainer when they have a live placement. */
export default async function ValuePage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console');

  let retainerMonthlyCents: number | null = null;
  if (configured()) {
    const sb = await supabaseServer();
    const { data } = await sb
      .from('placements')
      .select('id, terms:placement_terms(rate_month_cents)')
      .eq('client_id', profile.id)
      .is('ended_on', null)
      .order('started_on', { ascending: false })
      .limit(1)
      .maybeSingle();
    const cents = (data as any)?.terms?.rate_month_cents
      ?? (Array.isArray((data as any)?.terms) ? (data as any)?.terms?.[0]?.rate_month_cents : null);
    if (typeof cents === 'number' && cents > 0) retainerMonthlyCents = cents;
  }

  return (
    <Shell profile={profile} active="/app/value" title="The value, in plain terms"
      crumb="What Relève replaces, and what it saves">
      <ValueContent retainerMonthlyCents={retainerMonthlyCents} placed={retainerMonthlyCents != null} />
    </Shell>
  );
}
