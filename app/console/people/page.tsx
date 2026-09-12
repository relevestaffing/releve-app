import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { listClients, getSearch } from '@/lib/store';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import OnboardingSender from '@/components/OnboardingSender';
import RoleBriefEditor from '@/components/RoleBriefEditor';
import TableSearch from '@/components/TableSearch';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function People() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin' && configured()) redirect('/app');

  const clients = await listClients();
  const briefs = await Promise.all(clients.map(c => getSearch(c.key)));
  const rows = clients.map((c, i) => ({ client: c, brief: briefs[i] }));
  const missing = rows.filter(r => !r.brief?.role_title).length;

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/people" title="Executives" crumb="Accounts and open roles">
      <OnboardingSender />

      {missing > 0 && (
        <div className="card" style={{ borderColor: 'var(--pale)' }}>
          <div className="card-head"><h3>No role brief yet</h3>
            <span className="pill warn"><span className="dot" />{missing}</span></div>
          <Explain>
            The Signature tells you how someone works. The brief tells you what the job is.
            Matching runs without it, but nobody on your team can sanity-check a candidate against a role that was never written down.
          </Explain>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>Executive accounts</h3>
          <div className="row" style={{ gap: 10 }}>
            {clients.length > 5 &&
              <TableSearch scope="exec-list" rows=".client-row" placeholder="Search executives…" />}
            <span className="pill">{clients.length} on file</span>
          </div></div>
        <div style={{ marginBottom: 20 }}>
          <Explain>
            Send the onboarding email right after the discovery call and the record is made for you —
            no separate add step. They can sign in any time with the email on file, no password.
            The role brief is yours to fill in from the intro call; clients are never asked to write their own.
          </Explain>
        </div>

        {rows.length === 0 && (
          <div className="empty-card" style={{ padding: '34px 24px' }}>
            <div className="empty-mark" aria-hidden="true" />
            <h3>No executives yet</h3>
            <p className="small">
              Send the onboarding email above once you have had the discovery call. It opens their
              search, and they can sign in any time with the email you put on file — no invitation
              to chase and no password to set.
            </p>
          </div>
        )}

        <div id="exec-list">
        {rows.map(({ client, brief }) => (
          <div className="client-row" key={client.key}>
            <div className="row between" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <b>{client.full_name}</b>
                <div className="small muted">
                  {[client.org_name, client.email, client.timezone].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className={`pill ${client.signed_in ? 'good' : 'warn'}`}>
                <span className="dot" />{client.signed_in ? 'Signed in' : 'Not yet signed in'}
              </span>
            </div>
            <RoleBriefEditor clientKey={client.key} pending={!client.signed_in}
              initial={brief ?? {}} name={client.full_name} />
          </div>
        ))}
        </div>
      </div>
    </Shell>
  );
}
