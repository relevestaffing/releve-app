import { redirect } from 'next/navigation';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { auditTrail, teamRoles, TEAM_ROLES } from '@/lib/care';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import EmailCheck from '@/components/EmailCheck';
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

  /* Every send attempt, worst first. Reading this used to be impossible:
     send() caught its own failure and almost every caller ignored the result,
     so a page said "Sent" whether or not anything left the building. */
  let mail: { kind: string; to_addr: string; subject: string; ok: boolean;
              detail: string | null; sent_at: string }[] = [];
  let mailEverWorked = false;
  if (configured()) {
    const sb = await supabaseServer();
    const [{ data: rows }, { data: health }] = await Promise.all([
      sb.from('email_log')
        .select('kind, to_addr, subject, ok, detail, sent_at')
        .order('sent_at', { ascending: false }).limit(60),
      sb.from('email_health').select('last_success').maybeSingle()
    ]);
    mail = (rows ?? []) as typeof mail;
    mailEverWorked = Boolean((health as any)?.last_success);
  }
  const failed = mail.filter(m => !m.ok);

  return (
    <Shell profile={profile} active="/console/team" title="Team"
      crumb="Who can do what, and what has been done">

      <EmailCheck />

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
            nowhere — and the page that sent it said nothing was wrong. Use the check
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
            Nothing attempted yet. It fills the moment anything sends — or fails to.
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
            deliverability rather than configuration — check spam first.
          </Explain>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>The Relève team</h3></div>
        <div style={{ marginBottom: 18 }}>
          <Explain>
            Everyone here can see client and talent records. The role decides who
            manages the team itself — only an owner can change these.
          </Explain>
        </div>
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
          To add a manager: they sign in once so their account exists, then set their role to admin in Supabase. Building that into this page is on the list. They appear here once it is granted.
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
            append-only — nothing here can be edited or removed through the app,
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
