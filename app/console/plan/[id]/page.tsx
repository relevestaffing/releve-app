import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { getStudioDoc, ownerOf } from '@/lib/studio';
import { aiReady } from '@/lib/ai';
import { SITE } from '@/lib/stripe';
import Shell from '@/components/Shell';
import StudioDesk from '@/components/StudioDesk';

export const metadata = { title: '90-Day Plan Studio' };
export const dynamic = 'force-dynamic';

/* The 90-Day Plan Studio (7 November 2026): where an executive's plan is built
   once they have signed, paid and finished onboarding. Same screen as the
   audit: Claude interviews from what is already known, the plan writes itself
   beside the chat, and it stays an internal draft until it is published to
   the client. */
export default async function PlanStudio({ params }: { params: Promise<{ id: string }> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const { id } = await params;
  const doc = await getStudioDoc('plan', id);
  if (!doc) redirect('/console/people');
  const who = await ownerOf('plan', doc.owner_id);

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/directory" title={who?.name ?? 'Executive'} crumb="90-Day Plan Studio"
      action={<Link className="btn sm ghost" href={`/console/executive/${doc.owner_id}`}>← Back to the executive</Link>}>
      {!aiReady() && (
        <p className="small muted" style={{ marginTop: 0 }}>
          The interview needs your Anthropic API key (ANTHROPIC_API_KEY) in Netlify. You can still edit and publish by hand.
        </p>
      )}
      <StudioDesk kind="plan" ownerName={who?.name ?? ''} ownerEmail={who?.email ?? null} company={who?.company ?? null}
        viewUrl={`${SITE}/plan/${doc.view_token}`}
        initial={{ id: doc.id, title: doc.title, content: doc.content, chat: doc.chat, state: doc.state, error: doc.error, status: doc.status, email: doc.email, done_at: doc.done_at }} />
    </Shell>
  );
}
