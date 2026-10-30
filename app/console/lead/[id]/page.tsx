import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { getProspect, listTouches } from '@/lib/prospects';
import { listDocuments } from '@/lib/documents';
import { listAudits } from '@/lib/audits';
import { teamRoles, teamMemberName } from '@/lib/care';
import { aiReady } from '@/lib/ai';
import { SITE } from '@/lib/stripe';
import { stageLabel, stageColor, sourceLabel, TOUCH_KINDS } from '@/lib/prospects-public';
import { fmtWhen } from '@/lib/words';
import Shell from '@/components/Shell';
import Files from '@/components/Files';
import LeadContact from '@/components/LeadContact';
import AuditDesk from '@/components/AuditDesk';

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

  const [touches, docs, audits, team] = await Promise.all([
    listTouches(id).catch(() => []),
    listDocuments('prospect', id).catch(() => []),
    listAudits(id).catch(() => []),
    teamRoles().catch(() => [])
  ]);

  const ownerMember = team.find(m => m.user_id === lead.owner_id);
  const ownerName = ownerMember ? teamMemberName(ownerMember.name, ownerMember.email) : null;
  const isElivate = false; // the member discount is confirmed per audit; default off

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/directory" title={lead.full_name} crumb="Lead">
      <div className="row between" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="status-pill" style={{ background: stageColor(lead.stage), cursor: 'default' }}>{stageLabel(lead.stage)}</span>
          <span className="small muted">{sourceLabel(lead.source)}{ownerName ? ` · ${ownerName}` : ''}</span>
        </div>
        <Link className="btn sm ghost" href="/console/prospects">← All leads</Link>
      </div>

      <LeadContact lead={lead} />

      {lead.note && (
        <div className="card">
          <div className="card-head"><h3>What they told us</h3></div>
          <p className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{lead.note}</p>
        </div>
      )}

      <AuditDesk
        prospectId={lead.id}
        email={lead.email}
        website={lead.website}
        elivateMember={isElivate}
        audits={audits}
        aiOn={aiReady()}
        siteUrl={SITE}
      />

      <div className="card">
        <div className="card-head"><h3>Follow-up history</h3><span className="pill">{touches.length}</span></div>
        {touches.length === 0
          ? <p className="small muted" style={{ marginBottom: 0 }}>No touches logged yet. Log one from the board, or the Follow up today list.</p>
          : (
            <div className="touch-log">
              {touches.map(t => (
                <div key={t.id} className="touch-item">
                  <div className="row between" style={{ gap: 10 }}>
                    <b>{TOUCH_KINDS.find(k => k.key === t.kind)?.label ?? t.kind}</b>
                    <span className="xs muted">{fmtWhen(t.at)}</span>
                  </div>
                  {t.note && <p className="small" style={{ marginTop: 4 }}>{t.note}</p>}
                  {t.next_follow_up && <p className="xs muted" style={{ marginTop: 2 }}>Next follow-up set to {t.next_follow_up}</p>}
                </div>
              ))}
            </div>
          )}
      </div>

      <Files kind="prospect" ownerId={id} docs={docs} />
    </Shell>
  );
}
