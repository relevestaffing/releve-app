import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { listClients, getSearch } from '@/lib/store';
import Shell from '@/components/Shell';
import AddPerson from '@/components/AddPerson';
import RoleBriefEditor from '@/components/RoleBriefEditor';

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
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/people" title="Clients" crumb="Accounts and open roles">
      <AddPerson role="client" />

      {missing > 0 && (
        <div className="card" style={{ borderColor: 'var(--pale)' }}>
          <div className="card-head"><h3>No role brief yet</h3>
            <span className="pill warn"><span className="dot" />{missing}</span></div>
          <p className="small muted">
            The Signature tells you how someone works. The brief tells you what the job is.
            Matching runs without it, but nobody on your team can sanity-check a shortlist against a role that was never written down.
          </p>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>Client accounts</h3>
          <span className="pill">{clients.length} on file</span></div>
        <p className="small muted" style={{ marginBottom: 20 }}>
          Add a client here and they can sign in immediately with the email on file — no invitation, no password.
          The role brief is yours to fill in from the intro call; clients are never asked to write their own.
        </p>

        {rows.length === 0 && (
          <p className="small muted" style={{ padding: 30, textAlign: 'center' }}>No clients added yet.</p>
        )}

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
    </Shell>
  );
}
