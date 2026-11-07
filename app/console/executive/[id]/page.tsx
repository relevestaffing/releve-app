import Link from 'next/link';
import Files from '@/components/Files';
import { listDocuments } from '@/lib/documents';
import { redirect, notFound } from 'next/navigation';
import { currentProfile, configured, supabaseServer } from '@/lib/supabase/server';
import { teamRoles } from '@/lib/care';
import AccountManagerPicker from '@/components/AccountManagerPicker';
import { listClients, getSearch, getAvailability } from '@/lib/store';
import { signatureOf, archetype } from '@/lib/data';
import { getClientAgreement } from '@/lib/agreement';
import { zoneLabel } from '@/lib/words';
import { getAccount, assignOptions, isArchived } from '@/lib/account';
import AccountActions from '@/components/account/AccountActions';
import { Strip, PlacementTab, HoursTab, BillingTab, Messages } from '@/components/account/AccountParts';
import Shell from '@/components/Shell';
import Tabs from '@/components/crm/Tabs';
import { Activity } from '@/components/crm/Activity';
import { todayInPacific } from '@/lib/money-public';

export const metadata = { title: 'Executive' };

export const dynamic = 'force-dynamic';

const AGREEMENT_WORDS: Record<string, string> = {
  not_started: 'Not signed yet', submitted: 'Signed, with Relève to file',
  verified: 'Signed and filed', rejected: 'Needs a closer look'
};

/* The executive's record (Sage, 25 October 2026).
   ----------------------------------------------
   A talent has had a full file at /console/talent/[id] for weeks: their
   Signature, their verification, their pay, their placements. An executive,
   who is the one paying, had a row in a list and nothing else, so answering
   "where is this account up to" meant Billing, then Placements, then the
   Directory, and holding the three in your head. This is the one page. */
export default async function ExecutiveRecord({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const clients = await listClients();
  const client = clients.find(c => c.key === id);
  if (!client) notFound();

  /* Nothing here is worth failing the page over: an account that shows with
     one empty part beats an account that will not open. */
  const [brief, sig, avail, agreement, docs, acct, options, archived] = await Promise.all([
    getSearch(id).catch(() => null),
    signatureOf(id, 'client').catch(() => null),
    getAvailability(id, '').catch(() => ({ timezone: null, windows: [] } as any)),
    getClientAgreement(id).catch(() => null),
    listDocuments('person', id).catch(() => []),
    getAccount(id, 'client'),
    assignOptions('client'),
    isArchived(id)
  ]);

  /* Who owns this account, and the team the picker chooses from. The owner
     column is new (part50), so read it on its own: a record that shows the
     account beats one that will not open because the column is not there yet. */
  const [team, csm] = await Promise.all([
    teamRoles().catch(() => []),
    accountManagerId(id, 'client')
  ]);
  const type = sig ? archetype((sig as any).scores, 'client') : null;
  const threadHref = `/console/messages?thread=${id}`;
  const talentHref = (t: string) => `/console/talent/${t}`;

  /* The executive's account (3 November 2026). Nona: "if I go into an
     executive's account, I need to see their placement, the communication,
     their current billing, how many hours, what plan they are on, and it
     needs to be really simple." The strip answers those at a glance; each
     tab is one of them in full. */
  return (
    <Shell profile={profile} active="/console/directory"
      title={client.full_name}
      crumb={client.org_name || 'Executive'}
      action={<AccountActions id={id} name={client.full_name} side="client" options={options} archived={archived}
        listHref="/console/people" threadHref={threadHref} />}>

      <div className="acct-back"><Link href="/console/people">&larr; All executives</Link>
        {archived && <span className="acct-tag warn">Archived</span>}</div>

      <Strip a={acct} accountHref={talentHref} />

      <Tabs tabs={[
        { key: 'placement', label: 'Placement', body: <PlacementTab a={acct} accountHref={talentHref} emptyText="No placement yet. Use Assign placement above." /> },
        { key: 'hours', label: 'Hours', body: <HoursTab a={acct} /> },
        { key: 'billing', label: 'Billing', count: acct.billing.invoices.length, body: <BillingTab a={acct} /> },
        { key: 'communication', label: 'Communication', body: (
          <div className="acct-tab">
            <Messages a={acct} name={client.full_name} threadHref={threadHref} />
            <h4 className="acct-h" style={{ marginTop: 26 }}>Calls, emails and notes</h4>
            <Activity type="client" id={id} subjectName={client.full_name} today={todayInPacific()}
              team={team.map((m: any) => ({ user_id: m.user_id, name: m.name }))} />
          </div>
        ) },
        { key: 'files', label: 'Files', count: docs.length, body: <Files kind="person" ownerId={id} docs={docs} /> },
        { key: 'details', label: 'Details', body: (
          <div className="acct-tab">
            <dl className="acct-kv wide">
              <dt>Company</dt><dd>{client.org_name || <span className="ws-faint">Not given</span>}</dd>
              <dt>Email</dt><dd><a href={`mailto:${client.email}`}>{client.email}</a></dd>
              <dt>Time zone</dt><dd>{zoneLabel(avail?.timezone || client.timezone) || <span className="ws-faint">Not given</span>}</dd>
              <dt>Signed in</dt><dd>{client.signed_in ? 'Yes' : 'Not yet'}</dd>
              <dt>Agreement</dt><dd>{AGREEMENT_WORDS[agreement?.state ?? 'not_started'] ?? 'Not started'}</dd>
              <dt>Open role</dt><dd>{brief?.role_title || 'No brief yet'}</dd>
              <dt>Signature</dt><dd>{type ? type.n : 'Not completed yet'}</dd>
            </dl>
            <div style={{ marginTop: 18 }}><AccountManagerPicker personId={id} side="client" team={team as any} current={csm} /></div>
          </div>
        ) }
      ]} />
    </Shell>
  );
}

/* The account's owner (profiles.csm_id / profiles.tsm_id). New column, so its
   own read: an error means the migration has not run yet, and the page still
   renders with nobody assigned rather than failing. */
async function accountManagerId(personId: string, side: 'client' | 'talent'): Promise<string | null> {
  if (!configured()) return null;
  try {
    const sb = await supabaseServer();
    const col = side === 'client' ? 'csm_id' : 'tsm_id';
    const { data, error } = await sb.from('profiles').select(col).eq('id', personId).maybeSingle();
    if (error) return null;
    return ((data as any)?.[col] as string | null) ?? null;
  } catch { return null; }
}
