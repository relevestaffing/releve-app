import { redirect } from 'next/navigation';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { auditTrail, TEAM_ROLES } from '@/lib/care';
import type { TeamRole } from '@/lib/care-public';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import EmailCheck from '@/components/EmailCheck';
import RolePicker from '@/components/RolePicker';
import TeamMemberRemove from '@/components/TeamMemberRemove';
import AddAdmin from '@/components/AddAdmin';

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
  invoice_void: 'voided an invoice',
  rate_set: 'changed what a client is charged',
  talent_pay_set: 'changed what a talent is paid',
  payout_details_set: 'added payout details',
  payout_details_changed: 'changed payout details',
  team_added: 'gave someone console access',
  team_role_set: 'changed a team role',
  team_removed: 'removed someone\u2019s console access'
};

type Member = { user_id: string; name: string; email: string; team_role: TeamRole };
type Invite = { id: string; name: string; email: string; team_role: TeamRole };

/* Everyone with console access, read from profiles (role = admin) rather than
   from team_roles alone: an admin with no team_roles row is still an admin,
   and is_owner() treats them as an owner, so they belong on this list. */
async function loadTeam(): Promise<{ members: Member[]; invites: Invite[] }> {
  if (!configured()) return { members: [], invites: [] };
  const sb = await supabaseServer();
  const [{ data: admins }, { data: roles }, { data: pending }] = await Promise.all([
    sb.from('profiles').select('id, full_name, email').eq('role', 'admin'),
    sb.from('team_roles').select('user_id, team_role'),
    sb.from('pending_people').select('id, full_name, email, team_role')
      .eq('role', 'admin').is('claimed_by', null)
  ]);
  const roleOf = new Map(((roles ?? []) as any[]).map(r => [r.user_id, r.team_role as TeamRole]));
  const members = ((admins ?? []) as any[]).map(p => ({
    user_id: p.id as string,
    name: (p.full_name ?? p.email ?? 'Someone') as string,
    email: (p.email ?? '') as string,
    team_role: roleOf.get(p.id) ?? 'owner'
  })).sort((a, b) => a.name.localeCompare(b.name));
  const invites = ((pending ?? []) as any[]).map(p => ({
    id: p.id as string, name: (p.full_name ?? p.email) as string,
    email: p.email as string, team_role: (p.team_role ?? 'manager') as TeamRole
  }));
  return { members, invites };
}

export default async function ConsoleTeam() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  /* Fails closed (S14): only a clear yes from is_owner() shows the controls.
     Demo mode has no database, so the walkthrough shows them. */
  let owner = !configured();
  if (configured()) {
    const sb = await supabaseServer();
    const { data, error } = await sb.rpc('is_owner');
    owner = !error && data === true;
  }

  const [{ members: team, invites }, log] = await Promise.all([loadTeam(), auditTrail(150)]);
  const owners = team.filter(t => t.team_role === 'owner').length;
  const label = (k: TeamRole) => TEAM_ROLES.find(r => r.key === k)?.label ?? k;

  /* Every send attempt, worst first. Reading this used to be impossible:
     send() caught its own failure and almost every caller ignored the result,
     so a page said "Sent" whether or not anything left the building. */
  let mail: { kind: string; to_addr: string; subject: string; ok: boolean;
              detail: string | null; sent_at: string }[] = [];
  let mailEverWorked = false;
  let backup: { last_success: string | null; last_failure: string | null; failed_week: number } | null = null;
  if (configured()) {
    const sb = await supabaseServer();
    const [{ data: rows }, { data: health }, { data: backupHealth }] = await Promise.all([
      sb.from('email_log')
        .select('kind, to_addr, subject, ok, detail, sent_at')
        .order('sent_at', { ascending: false }).limit(60),
      sb.from('email_health').select('last_success').maybeSingle(),
      sb.from('backup_health').select('last_success, last_failure, failed_week').maybeSingle()
    ]);
    mail = (rows ?? []) as typeof mail;
    mailEverWorked = Boolean((health as any)?.last_success);
    backup = (backupHealth as any) ?? null;
  }
  const failed = mail.filter(m => !m.ok);
  const backupAge = backup?.last_success
    ? (Date.now() - new Date(backup.last_success).getTime()) / 86400000 : null;
  const backupState: 'good' | 'warn' | 'crit' =
    backupAge == null ? 'crit' : backupAge > 2 ? 'crit' : backupAge > 1.25 ? 'warn' : 'good';

  return (
    <Shell profile={profile} active="/console/team" title="Team"
      crumb="Who can do what, and what has been done">

      <EmailCheck />

      <div className="card">
        <div className="card-head">
          <h3>Database backup</h3>
          <span className={`pill ${backupState === 'good' ? 'good' : backupState === 'warn' ? 'warn' : 'crit'}`}>
            <span className="dot" />
            {backupState === 'good' ? 'Ran recently' : backupState === 'warn' ? 'Getting stale' : 'Not confirmed'}
          </span>
        </div>
        {!backup?.last_success ? (
          <p className="small" style={{
            marginBottom: 0, padding: '13px 17px', background: 'var(--cream)',
            borderLeft: '2px solid #8C4A3F' }}>
            <b>No successful backup has ever reported in.</b> Either the daily job
            isn&rsquo;t installed yet, or it hasn&rsquo;t run since this page started
            watching for it. Run <code>./scripts/backup.sh</code> once by hand to check,
            and see Still Open in the Book for the one-time <code>crontab</code> step.
          </p>
        ) : (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Last successful backup: <b>{when(backup.last_success)}</b>.
            {backup.last_failure && ` Most recent failure: ${when(backup.last_failure)}.`}
            {backup.failed_week > 0 && ` ${backup.failed_week} failed attempt${backup.failed_week === 1 ? '' : 's'} in the last 7 days.`}
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Every email, and whether it arrived</h3>
          <span className="xs muted">Last 60 attempts</span>
        </div>
        {!mailEverWorked && (
          <p className="small" style={{
            marginBottom: 16, padding: '13px 17px', background: 'var(--cream)',
            borderLeft: '2px solid #8C4A3F' }}>
            <b>No email has ever been sent successfully from this platform.</b> Until
            that changes, every invitation, receipt and interview confirmation is going
            nowhere, and the page that sent it said nothing was wrong. Use the check
            above; it reports the mail host&rsquo;s own words.
          </p>
        )}
        <p className="small muted" style={{ marginBottom: 18 }}>
          {failed.length > 0
            ? `${failed.length} of the last ${mail.length} were refused. Each one is somebody who was told something and never heard it.`
            : 'One row per attempt, successful or not. This is the only evidence that email works.'}
        </p>
        {!mail.length ? (
          <p className="small muted">
            Nothing attempted yet. It fills the moment anything sends, or fails to.
          </p>
        ) : (
          <table className="data">
            <thead><tr><th>When</th><th>Message</th><th>To</th><th>Result</th></tr></thead>
            <tbody>
              {mail.map((m, i) => (
                <tr key={i}>
                  <td className="xs" style={{ whiteSpace: 'nowrap' }}>{when(m.sent_at)}</td>
                  <td>
                    <b style={{ fontFamily: 'Marcellus,serif', fontSize: 13.5 }}>{m.kind}</b>
                    <div className="xs muted">{m.subject}</div>
                  </td>
                  <td className="xs">{m.to_addr}</td>
                  <td>
                    <span className={`pill ${m.ok ? 'good' : 'crit'}`}>
                      <span className="dot" />{m.ok ? 'Accepted' : 'Refused'}
                    </span>
                    {m.detail && <div className="xs muted" style={{ marginTop: 4, maxWidth: 320 }}>{m.detail}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 16 }}>
          <Explain>
            &ldquo;Accepted&rdquo; means the mail host took it, not that it reached an
            inbox. If something is accepted here and still missing, that is
            deliverability rather than configuration. Check spam first.
          </Explain>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>The Relève team</h3></div>
        <div style={{ marginBottom: 18 }}>
          <Explain>
            Everyone here can see client and talent records. The role decides who
            manages the team itself, and only an owner can change it. Relève always
            keeps at least one owner.
          </Explain>
        </div>
        {!team.length ? <p className="small muted">Just you so far.</p> : (
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th>{owner && <th aria-label="Actions" />}</tr></thead>
            <tbody>
              {team.map(t => {
                const self = t.user_id === profile.id;
                const lastOwner = t.team_role === 'owner' && owners <= 1;
                return (
                  <tr key={t.user_id}>
                    <td>{t.name}{self && <span className="xs muted"> · you</span>}</td>
                    <td className="xs">{t.email}</td>
                    <td><RolePicker userId={t.user_id} name={t.name} role={t.team_role}
                          canEdit={owner && !lastOwner} /></td>
                    {owner && (
                      <td>
                        {lastOwner
                          ? <span className="xs muted">The only owner</span>
                          : <TeamMemberRemove userId={t.user_id} name={t.name} self={self} />}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {invites.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <p className="xs muted" style={{ marginBottom: 8 }}>
              Invited, not signed in yet. Each becomes an admin the first time they sign in with this email.
            </p>
            <table className="data">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th>{owner && <th aria-label="Actions" />}</tr></thead>
              <tbody>
                {invites.map(i => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td className="xs">{i.email}</td>
                    <td><span className="pill">{label(i.team_role)}</span></td>
                    {owner && <td><TeamMemberRemove inviteId={i.id} name={i.name} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {owner && <div style={{ marginTop: 14 }}><AddAdmin /></div>}
        <div style={{ marginTop: 18 }}>
          {TEAM_ROLES.map(r => (
            <p key={r.key} className="xs muted" style={{ marginBottom: 4 }}>
              <b>{r.label}</b>: {r.what}
            </p>
          ))}
        </div>
        <p className="xs muted" style={{ marginTop: 16 }}>
          {owner
            ? 'To add someone, use their email. If they already have a Relève account, they get console access as soon as you confirm. If not, they get it the first time they sign in with that email.'
            : 'Only an owner can add, change or remove people on the team.'}
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>What has been done</h3>
          <span className="xs muted">Newest first</span>
        </div>
        <div style={{ marginBottom: 18 }}>
          <Explain>
            Releases, verifications and invoices, with who did them. This log is
            append-only: nothing here can be edited or removed through the app,
            including by an owner.
          </Explain>
        </div>
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
