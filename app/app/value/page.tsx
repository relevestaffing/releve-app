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
  /* Executive-facing pricing ($130k/yr vs. under $55k here) is not for a
     talent account to see — nothing in the talent nav links here, but
     nothing server-side blocked a direct hit either (talent-experience
     audit, P1). */
  if (profile.role !== 'client') redirect('/app');

  let retainerMonthlyCents: number | null = null;
  if (configured()) {
    const sb = await supabaseServer();
    const { data: pl } = await sb
      .from('placements')
      .select('id')
      .eq('client_id', profile.id)
      .is('ended_on', null)
      .order('started_on', { ascending: false })
      .limit(1)
      .maybeSingle();
    /* my_placement_terms (PART 33 RLS fix), not placement_terms directly —
       the base table's client policy no longer exists, because it used to
       hand over talent_pay_cents on the same row. */
    if (pl?.id) {
      const { data: term } = await sb.from('my_placement_terms')
        .select('rate_month_cents').eq('placement_id', pl.id).maybeSingle();
      const cents = (term as any)?.rate_month_cents;
      if (typeof cents === 'number' && cents > 0) retainerMonthlyCents = cents;
    }
  }

  return (
    <Shell profile={profile} active="/app/value" title="The value, in plain terms"
      crumb="What Relève replaces, and what it saves">
      <ValueContent retainerMonthlyCents={retainerMonthlyCents} placed={retainerMonthlyCents != null} />
    </Shell>
  );
}
