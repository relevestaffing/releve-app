import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { getProspect } from '@/lib/prospects';
import { listDocuments } from '@/lib/documents';
import { listStudioDocs } from '@/lib/studio';
import { teamRoles } from '@/lib/care';
import { aiReady } from '@/lib/ai';
import Shell from '@/components/Shell';
import Files from '@/components/Files';
import LeadRecord from '@/components/LeadRecord';
import { todayInPacific } from '@/lib/money-public';
import AuditDesk from '@/components/AuditDesk';
import LeadOnboarding from '@/components/LeadOnboarding';

export const metadata = { title: 'Lead' };
export const dynamic = 'force-dynamic';

/* One lead, in full: contact and call, the follow-up history, documents, and
   the business audits written for them. Reached from a name on the board. */
export default async function LeadFile({ params }: { params: Promise<{ id: string }> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const { id } = await params;

  const lead = await getProspect(id);
  if (!lead) redirect('/console/prospects');

  const [docs, audits, team] = await Promise.all([
    listDocuments('prospect', id).catch(() => []),
    listStudioDocs('audit', id).catch(() => []),
    teamRoles().catch(() => [])
  ]);

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/directory" title={lead.full_name} crumb="Lead"
      action={<Link className="btn sm ghost" href={`/console/prospects?open=${lead.id}`}>← All leads</Link>}>
      {/* The lead in full (2 November 2026): the same record as the panel on
          the Leads list, with the business audits and the files below the
          details and above the history. */}
      <LeadRecord lead={lead} team={team.map(m => ({ user_id: m.user_id, name: m.name }))} today={todayInPacific()}>
        <div className="detail-slot" style={{ marginTop: 26 }}>
          <AuditDesk
            prospectId={lead.id}
            audits={audits.map(a => ({ id: a.id, title: a.title, status: a.status === 'sent' ? 'sent' as const : 'draft' as const, created_at: a.created_at, done_at: a.done_at }))}
            aiOn={aiReady()}
          />
          <LeadOnboarding lead={{ id: lead.id, full_name: lead.full_name, email: lead.email, stage: lead.stage, pending_id: lead.pending_id }} />
          <Files kind="prospect" ownerId={id} docs={docs} />
        </div>
      </LeadRecord>
    </Shell>
  );
}
