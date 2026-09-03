import { redirect } from 'next/navigation';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { auditTrail, teamRoles, TEAM_ROLES } from '@/lib/care';
import Shell from '@/components/Shell';
import { RolePicker } from '@/components/CareControls';

export const dynamic = 'force-dynamic';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
});

/* What each entry in the log actually means, in words rather than table names. */
const SAYS: Record<string, string> = {
  release: 'released a candidate to a client',
  vetting_verified: 'verified a document',
  vetting_rejected: 'rejected a document',
  vetting_submitted: 'received a document',
  invoice_draft: 'drafted an invoice',
  invoice_sent: 'sent an invoice',
  invoice_paid: 'marked an invoice paid',
  invoice_void: 'voided an invoice'
};

export default async function ConsoleTeam() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  let owner = true;
  if (configured()) {
    const sb = await supabaseServer();
    const { data } = await sb.rpc('is_owner');
    owner = data !== false;
  }

  const [team, log] = await Promise.all([teamRoles(), auditTrail(150)]);

  return (
    <Shell profile={profile} active="/console/team" title="Team"
      crumb="Who can do what, and what has been done">

      <div className="card" style={{ marginBottom: 26 }}>
        <div className="card-head"><h3>The Relève team</h3></div>
        <p className="small muted" style={{ marginBottom: 18 }}>
          Everyone here can see client and talent records. The role decides who
          manages the team itself — only an owner can change these.
        </p>
        {!team.length ? <p className="small muted">Just you so far.</p> : (
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {team.map(t => (
                <tr key={t.user_id}>
                  <td>{t.name}{t.user_id === profile.id && <span className="xs muted"> · you</span>}</td>
                  <td className="xs">{t.email}</td>
                  <td><RolePicker userId={t.user_id} role={t.team_role}
                        canEdit={owner && t.user_id !== profile.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 18 }}>
          {TEAM_ROLES.map(r => (
            <p key={r.key} className="xs muted" style={{ marginBottom: 4 }}>
              <b>{r.label}</b> — {r.what}
            </p>
          ))}
        </div>
        <p className="xs muted" style={{ marginTop: 16 }}>
          To add a manager, create their account and ask Relève to grant console access. They appear here once it is granted.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>What has been done</h3>
          <span className="xs muted">Newest first</span>
        </div>
        <p className="small muted" style={{ marginBottom: 18 }}>
          Releases, verifications and invoices, with who did them. This log is
          append-only — nothing here can be edited or removed through the app,
          including by an owner.
        </p>
        {!log.length ? (
          <p className="small muted">Nothing recorded yet. It starts filling the moment anyone acts.</p>
        ) : (
          <table className="data">
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>
              {log.map((r: any) => (
                <tr key={r.id}>
                  <td className="xs" style={{ whiteSpace: 'nowrap' }}>{when(r.at)}</td>
                  <td className="xs">{r.actor_email ?? 'system'}</td>
                  <td className="xs">
                    {SAYS[r.action] ?? r.action.replace(/_/g, ' ')}
                    {r.detail?.amount_cents != null &&
                      <> · ${(r.detail.amount_cents / 100).toLocaleString('en-US')}</>}
                    {r.detail?.kind && <> · {String(r.detail.kind).replace(/_/g, ' ')}</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
