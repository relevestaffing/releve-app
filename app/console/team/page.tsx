import { redirect } from 'next/navigation';
import ConsoleTabs from '@/components/ConsoleTabs';
import { signinStageLabel } from '@/lib/signin-public';
import { DASH } from '@/lib/words';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { auditTrail, TEAM_ROLES } from '@/lib/care';
import { teamLoad, type MemberLoad } from '@/lib/founder';
import type { TeamRole } from '@/lib/care-public';
import Shell from '@/components/Shell';
import EmailCheck from '@/components/EmailCheck';
import RolePicker from '@/components/RolePicker';
import TeamMemberRemove from '@/components/TeamMemberRemove';
import AddAdmin from '@/components/AddAdmin';

export const metadata = { title: 'Team' };

export const dynamic = 'force-dynamic';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
});

/* How long ago, in the fewest words, for "last acted". */
const since = (iso: string | null): string => {
  if (!iso) return 'No actions yet';
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return 'Just now';
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
};
const carrying = (m: { executives: number; talent: number }): string => {
  const parts: string[] = [];
  if (m.executives) parts.push(`${m.executives} executive${m.executives === 1 ? '' : 's'}`);
  if (m.talent) parts.push(`${m.talent} talent`);
  return parts.join(' · ') || 'No live accounts';
};

/* What each entry in the log actually means, in words rather than table names. */
const SAYS: Record<string, string> = {
  release: 'sent a candidate to an executive',
  vetting_verified: 'verified a document',
  vetting_rejected: 'rejected a document',
  vetting_submitted: 'received a document',
  invoice_draft: 'drafted an invoice',
  invoice_sent: 'sent an invoice',
  invoice_paid: 'marked an invoice paid',
  invoice_void: 'voided an invoice',
  rate_set: 'changed an executive\u2019s rate',
  talent_pay_set: 'changed a talent\u2019s pay',
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
  if (!configured()) return { members: [
    { user_id: 'demo-admin', name: 'Rae Lindqvist', email: 'hello@relevestaffing.com', team_role: 'owner' },
    { user_id: 'demo-csm', name: 'Marguerite Vance', email: 'marguerite@relevestaffing.com', team_role: 'client_success' },
    { user_id: 'demo-tsm', name: 'Theo Okafor', email: 'theo@relevestaffing.com', team_role: 'talent_success' }
  ], invites: [] };
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

  /* Each person's book beside their name, so the founder sees who is carrying
     the load and who is behind. Owner-only: this is oversight, not something
     a peer needs to see about a peer. */
  const load: Map<string, MemberLoad> = new Map(
    owner ? (await teamLoad()).map(m => [m.user_id, m]) : []);

  /* Every send attempt, worst first. Reading this used to be impossible:
     send() caught its own failure and almost every caller ignored the result,
     so a page said "Sent" whether or not anything left the building. */
  let mail: { kind: string; to_addr: string; subject: string; ok: boolean;
              detail: string | null; sent_at: string }[] = [];
  let signins: { email: string | null; stage: string; detail: string | null; at: string }[] = [];
  let mailEverWorked = false;
  let backup: { last_success: string | null; last_failure: string | null; failed_week: number } | null = null;
  if (configured()) {
    const sb = await supabaseServer();
    const [{ data: rows }, { data: health }, { data: backupHealth }, { data: signinRows }] = await Promise.all([
      sb.from('email_log')
        .select('kind, to_addr, subject, ok, detail, sent_at')
        .order('sent_at', { ascending: false }).limit(60),
      sb.from('email_health').select('last_success').maybeSingle(),
      sb.from('backup_health').select('last_success, last_failure, failed_week').maybeSingle(),
      /* PART 45. Errors here read as an empty list: a database one migration
         behind must not take the whole Team page down with it. */
      sb.from('signin_failures').select('email, stage, detail, at')
        .order('at', { ascending: false }).limit(40)
    ]);
    mail = (rows ?? []) as typeof mail;
    mailEverWorked = Boolean((health as any)?.last_success);
    backup = (backupHealth as any) ?? null;
    signins = (signinRows ?? []) as typeof signins;
  }
  const failed = mail.filter(m => !m.ok);
  const backupAge = backup?.last_success
    ? (Date.now() - new Date(backup.last_success).getTime()) / 86400000 : null;
  const backupState: 'good' | 'warn' | 'crit' =
    backupAge == null ? 'crit' : backupAge > 2 ? 'crit' : backupAge > 1.25 ? 'warn' : 'good';

  return (
    <Shell profile={profile} active="/console/business" title="The business"
      crumb="Team">
      <ConsoleTabs active="/console/team" items={[
        { href: '/console/reports', label: 'Reports' },
        { href: '/console/signals', label: 'Match accuracy' },
        { href: '/console/calendar', label: 'Calendar' },
        { href: '/console/booking', label: 'Booking page' },
        { href: '/console/team', label: 'Team' },
        { href: '/console/training', label: 'Training' }
      ]} />

      <div className="card">
        <div className="card-head"><h3>The Relève team</h3></div>
        {!team.length ? <p className="small muted">Just you so far.</p> : (
          <table className="data">
            <thead><tr>
              <th>Name</th><th>Role</th>
              {owner && <><th>Accounts</th><th>Open items</th></>}
              {owner && <th aria-label="Actions" />}
            </tr></thead>
            <tbody>
              {team.map(t => {
                const self = t.user_id === profile.id;
                const lastOwner = t.team_role === 'owner' && owners <= 1;
                const l = load.get(t.user_id);
                const open = l ? l.openRequests + l.reviewsOverdue + l.flaggedReports : 0;
                return (
                  <tr key={t.user_id}>
                    <td>{t.name}{self && <span className="xs muted"> · you</span>}
                      {t.name !== t.email && <div className="xs muted">{t.email}</div>}</td>
                    <td><RolePicker userId={t.user_id} name={t.name} role={t.team_role}
                          canEdit={owner && !lastOwner} /></td>
                    {owner && <>
                      <td className="small">{l ? carrying(l) : DASH}</td>
                      <td>
                        {!l ? DASH : open === 0
                          ? <span className="pill good"><span className="dot" />Clear</span>
                          : <span className="pill warn"><span className="dot" />{open} to pick up</span>}
                        {l && open > 0 && (
                          <div className="xs muted wrap" style={{ marginTop: 4 }}>
                            {[l.openRequests && `${l.openRequests} request${l.openRequests === 1 ? '' : 's'}`,
                              l.reviewsOverdue && `${l.reviewsOverdue} review${l.reviewsOverdue === 1 ? '' : 's'} due`,
                              l.flaggedReports && `${l.flaggedReports} report${l.flaggedReports === 1 ? '' : 's'} to review`]
                              .filter(Boolean).join(', ')}
                          </div>
                        )}
                        {l && <div className="xs muted wrap" style={{ marginTop: 3 }}>
                          Last acted {since(l.lastActedAt).toLowerCase()}</div>}
                      </td>
                    </>}
                    {owner && (
                      <td>
                        {lastOwner
                          ? <span className="xs muted">Sole owner</span>
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
              Invited, not signed in yet. Each gets console access the first time they sign in with this email.
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
            ? 'Add someone by email. If they already have a Relève account, access starts as soon as you confirm. If not, it starts the first time they sign in with that email.'
            : 'Only an owner can add, change or remove people on the team.'}
        </p>
      </div>

      <EmailCheck />

      <div className="card">
        <div className="card-head">
          <h3>Database backup</h3>
          <span className={`pill ${backupState === 'good' ? 'good' : backupState === 'warn' ? 'warn' : 'crit'}`}>
            <span className="dot" />
            {backupState === 'good' ? 'Up to date' : backupState === 'warn' ? 'Overdue' : 'Not confirmed'}
          </span>
        </div>
        {!backup?.last_success ? (
          <p className="small" style={{
            marginBottom: 0, padding: '13px 17px', background: 'var(--cream)',
            borderLeft: '2px solid #8C4A3F' }}>
            <b>No successful backup on record.</b> The nightly backup is either not switched
            on or has not run since monitoring began. Switch it on and every day from then
            can be restored.
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
          <h3>Email delivery</h3>
          <span className="xs muted">Last 60 attempts</span>
        </div>
        {!mailEverWorked && (
          <p className="small" style={{
            marginBottom: 16, padding: '13px 17px', background: 'var(--cream)',
            borderLeft: '2px solid #8C4A3F' }}>
            <b>No email has been sent successfully yet.</b> Until this is fixed, invitations,
            receipts and interview confirmations are not being delivered. Run the check above
            to see the mail host&rsquo;s exact response.
          </p>
        )}
        <p className="small muted" style={{ marginBottom: 18 }}>
          {failed.length > 0
            ? `${failed.length} of the last ${mail.length} were refused. Each row shows the recipient and message, so it can be resent.`
            : 'Every send attempt, successful or not.'}
        </p>
        {!mail.length ? (
          <p className="small muted">
            No send attempts yet.
          </p>
        ) : (
          <table className="data">
            <thead><tr><th>When</th><th>Message</th><th>To</th><th>Result</th></tr></thead>
            <tbody>
              {mail.map((m, i) => (
                <tr key={i}>
                  <td className="xs" style={{ whiteSpace: 'nowrap' }}>{when(m.sent_at)}</td>
                  <td>
                    <b style={{ fontFamily: 'Lora,serif', fontSize: 13.5 }}>{m.kind}</b>
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
      </div>

      {/* PART 45. The twin of the email log above, and added for the same
          reason: in October a sign-in refused every invited executive for
          eleven days and nothing anywhere said so. */}
      <div className="card">
        <div className="card-head">
          <h3>Failed sign-ins</h3>
          <span className={`pill ${signins.length ? 'warn' : 'good'}`}>
            {signins.length ? `${signins.length} to review` : <><span className="dot" />All clear</>}
          </span>
        </div>
        {!signins.length ? (
          <div className="empty"><span className="tick" />
            <p className="small">
              No failed sign-ins. Any failure appears here right away, and the team
              is emailed at most once an hour.
            </p>
          </div>
        ) : (
          <table className="data">
            <thead><tr><th>When</th><th>Who</th><th>Where it stopped</th></tr></thead>
            <tbody>
              {signins.map((s, i) => (
                <tr key={i}>
                  <td className="xs">{when(s.at)}</td>
                  <td><div className="xs">{s.email ?? 'Unknown'}</div></td>
                  <td><div className="xs">
                    {signinStageLabel(s.stage)}
                    {s.detail && <><br /><span className="muted">{s.detail}</span></>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>


      <div className="card">
        <div className="card-head">
          <h3>Activity log</h3>
          <span className="xs muted">Newest first</span>
        </div>
        {!log.length ? (
          <p className="small muted">No activity recorded yet.</p>
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
