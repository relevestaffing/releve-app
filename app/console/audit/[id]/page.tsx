import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { getStudioDoc, ownerOf } from '@/lib/studio';
import { aiReady } from '@/lib/ai';
import { SITE } from '@/lib/stripe';
import Shell from '@/components/Shell';
import StudioDesk from '@/components/StudioDesk';

export const metadata = { title: 'Audit Studio' };
export const dynamic = 'force-dynamic';

/* The Audit Studio (7 November 2026): where a lead's business audit is built
   after the discovery call. Claude interviews, the audit writes itself beside
   the chat, changes are asked for in the same chat, and the email that carries
   it (with the PDF attached) is prepared here, ready to send. */
export default async function AuditStudio({ params }: { params: Promise<{ id: string }> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const { id } = await params;
  const doc = await getStudioDoc('audit', id);
  if (!doc) redirect('/console/prospects');
  const who = await ownerOf('audit', doc.owner_id);

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/directory" title={who?.name ?? 'Lead'} crumb="Audit Studio"
      action={<Link className="btn sm ghost" href={`/console/lead/${doc.owner_id}`}>← Back to the lead</Link>}>
      {!aiReady() && (
        <p className="small muted" style={{ marginTop: 0 }}>
          The interview needs your Anthropic API key (ANTHROPIC_API_KEY) in Netlify. You can still edit and send by hand.
        </p>
      )}
      <StudioDesk kind="audit" ownerName={who?.name ?? ''} ownerEmail={who?.email ?? null} company={who?.company ?? null}
        viewUrl={`${SITE}/audit/${doc.view_token}`}
        initial={{ id: doc.id, title: doc.title, content: doc.content, chat: doc.chat, state: doc.state, error: doc.error, status: doc.status, email: doc.email, done_at: doc.done_at }} />
    </Shell>
  );
}
