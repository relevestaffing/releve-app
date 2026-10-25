import { zoneLabel } from '@/lib/words';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { listClients, getSearch, getAvailability, getSelfProfile } from '@/lib/store';
import { signatureOf } from '@/lib/data';
import { getRoleBreakdown, roleComplete } from '@/lib/roles';
import { clientSteps } from '@/lib/onboarding';
import Shell from '@/components/Shell';
import DirectoryTabs from '@/components/DirectoryTabs';
import OnboardingSender from '@/components/OnboardingSender';
import RoleBriefEditor from '@/components/RoleBriefEditor';
import TableSearch from '@/components/TableSearch';
import DeletePerson from '@/components/DeletePerson';
import WaiveDeposit from '@/components/WaiveDeposit';
import ClientAgreementAdmin from '@/components/ClientAgreementAdmin';
import OnboardingStatus from '@/components/OnboardingStatus';
import { docusignClientReady, manualSendUrl } from '@/lib/docusign';
import { getClientAgreements } from '@/lib/agreement';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

/* The same four steps clientSteps() always has — their own checklist on
   /app walks them through exactly these, in this order (lib/onboarding.ts).
   Reading them here, per executive, is what backs the Onboarding chip on
   each row below. */
async function clientOnboarding(clientId: string) {
  const [sig, avail, self, role] = await Promise.all([
    signatureOf(clientId, 'client'),
    getAvailability(clientId, ''),
    getSelfProfile(clientId),
    getRoleBreakdown(clientId)
  ]);
  return clientSteps({
    hasSignature: !!sig,
    hasAvailability: !!avail.timezone?.trim() && (avail.windows?.length ?? 0) > 0,
    hasIntro: !!(self.bio && self.photo_url),
    hasRole: roleComplete(role)
  });
}

export default async function People() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const clients = await listClients();
  const briefs = await Promise.all(clients.map(c => getSearch(c.key)));
  const agreements = await getClientAgreements(clients.map(c => c.key));
  const onboarding = await Promise.all(clients.map(c => clientOnboarding(c.key)));
  const rows = clients.map((c, i) => ({ client: c, brief: briefs[i], steps: onboarding[i] }));
  const missing = rows.filter(r => !r.brief?.role_title).length;
  const docusignOn = docusignClientReady();

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/directory" title="Directory" crumb="Executives">
      <DirectoryTabs active="executives" />
      <OnboardingSender />

      <div className="card">
        <div className="card-head"><h3>Executive accounts</h3>
          <div className="row" style={{ gap: 10 }}>
            {clients.length > 5 &&
              <TableSearch scope="exec-list" rows=".client-row" placeholder="Search executives…" />}
            {missing > 0 && <span className="pill warn"><span className="dot" />{missing} without a brief</span>}
            <span className="pill">{clients.length} on file</span>
          </div></div>

        {rows.length === 0 && (
          <div className="empty-card" style={{ padding: '34px 24px' }}>
            <div className="empty-mark" aria-hidden="true" />
            <h3>No executives yet</h3>
            <p className="small">Send the onboarding email above after a discovery call.</p>
          </div>
        )}

        <div id="exec-list">
        {rows.map(({ client, brief, steps }) => (
          <div className="client-row" key={client.key}>
            <div className="row between" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                {client.signed_in
                  ? <Link href={`/console/executive/${client.key}`}><b>{client.full_name}</b></Link>
                  : <b>{client.full_name}</b>}
                <div className="small muted">
                  {[client.org_name, client.email, zoneLabel(client.timezone)].filter(Boolean).join(' · ')}
                </div>
              </div>
              {/* Status only. Every row used to carry five controls and two
                  chips side by side, so nothing read as the thing to do and
                  the page was a wall of identical outlined buttons. What is
                  true about this person stays visible; what you might do to
                  them moves below. (12 October.) */}
              <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <OnboardingStatus steps={steps} compact />
                <span className={`pill ${client.signed_in ? 'good' : 'warn'}`}>
                  <span className="dot" />{client.signed_in ? 'Signed in' : 'Not yet signed in'}
                </span>
              </div>
            </div>

            {/* The brief is the actual work on this page — it is what opens
                the search — so it sits in the row proper rather than
                competing with the admin plumbing. */}
            <RoleBriefEditor clientKey={client.key} pending={!client.signed_in}
              initial={brief ?? {}} name={client.full_name} />

            {/* Everything occasional, behind one disclosure: the agreement,
                waiving the deposit, removing the record. Each is a real
                action and none of them is the daily one. */}
            <details className="row-more">
              <summary>More</summary>
              <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingTop: 16 }}>
                {/* The search opens on the deposit; waiving it here opens the
                    search without the $500. Shown only while a search is
                    actually open. */}
                {brief && !brief.closed_at && (brief as any).id && (
                  <WaiveDeposit searchId={(brief as any).id}
                    cents={(brief as any).deposit_cents ?? 50000}
                    status={((brief as any).deposit_status ?? 'due') as 'due' | 'paid' | 'waived'} />
                )}
                <ClientAgreementAdmin clientId={client.key} docusignOn={docusignOn}
                  state={(agreements[client.key]?.state ?? 'not_started')}
                  rejectReason={agreements[client.key]?.reject_reason ?? null}
                  manualSendUrl={manualSendUrl('client')} />
                <DeletePerson id={client.key} name={client.full_name} pending={!client.signed_in} />
              </div>
            </details>
          </div>
        ))}
        </div>
      </div>
    </Shell>
  );
}
