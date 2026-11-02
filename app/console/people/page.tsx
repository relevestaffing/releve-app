import { zoneLabel } from '@/lib/words';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile, configured, supabaseServer } from '@/lib/supabase/server';
import { listClients, getSearch, getAvailability, getSelfProfile } from '@/lib/store';
import { signatureOf } from '@/lib/data';
import { getRoleBreakdown, roleComplete } from '@/lib/roles';
import { clientSteps } from '@/lib/onboarding';
import Shell from '@/components/Shell';
import DirectoryTabs from '@/components/DirectoryTabs';
import OnboardingSender from '@/components/OnboardingSender';
import RoleBriefEditor from '@/components/RoleBriefEditor';
import DeletePerson from '@/components/DeletePerson';
import WaiveDeposit from '@/components/WaiveDeposit';
import ClientAgreementAdmin from '@/components/ClientAgreementAdmin';
import { docusignClientReady, manualSendUrl } from '@/lib/docusign';
import { getClientAgreements } from '@/lib/agreement';
import { teamRoles } from '@/lib/care';
import { todayInPacific } from '@/lib/money-public';
import PeopleWorkspace, { type PersonRow } from '@/components/crm/PeopleWorkspace';
import { Ring } from '@/components/crm/kit';

export const metadata = { title: 'Executives' };

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

export default async function People({ searchParams }: { searchParams: Promise<{ onboard?: string; name?: string; open?: string }> }) {
  const q = await searchParams;
  const prefill = q.onboard ? { email: q.onboard, name: q.name ?? '' } : null;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const clients = await listClients();
  const [briefs, agreements, onboarding, team, managers] = await Promise.all([
    Promise.all(clients.map(c => getSearch(c.key).catch(() => null))),
    getClientAgreements(clients.map(c => c.key)),
    Promise.all(clients.map(c => clientOnboarding(c.key))),
    teamRoles().catch(() => []),
    accountManagers(clients.filter(c => c.signed_in).map(c => c.key))
  ]);
  const docusignOn = docusignClientReady();
  const today = todayInPacific();

  /* Where each executive is, said once: invited, onboarding, hiring,
     interviewing, placed or paused. Drives the section, the stage label and
     the saved views (the Directory at Asana quality, 2 November 2026). */
  const STAGE = {
    invited: { label: 'Invited', color: '#6E8CA8' }, onboarding: { label: 'Onboarding', color: '#C6A465' },
    hiring: { label: 'Hiring', color: '#4E7A5C' }, interviewing: { label: 'Interviewing', color: '#8A6DA3' },
    placed: { label: 'Placed', color: '#35443A' }, paused: { label: 'On hold', color: '#A08478' }
  };
  const AGREE: Record<string, [string, string]> = {
    not_started: ['Not sent', ''], submitted: ['To countersign', 'warn'], verified: ['Signed', 'good'], rejected: ['Needs a look', 'bad']
  };

  const rows: PersonRow[] = clients.map((c, i) => {
    const brief: any = briefs[i];
    const steps = onboarding[i];
    const done = steps.filter(x => x.done).length;
    const agreement = agreements[c.key]?.state ?? 'not_started';
    const placed = brief?.closed_at && brief?.closed_reason === 'placed';
    const key: keyof typeof STAGE = !c.signed_in ? 'invited'
      : brief?.closed_at ? (placed ? 'placed' : 'paused')
      : done < steps.length ? 'onboarding'
      : /interview|shortlist/i.test(brief?.stage ?? '') ? 'interviewing' : 'hiring';
    const section = key === 'invited' || key === 'onboarding' ? 'start' : key === 'placed' ? 'placed' : key === 'paused' ? 'paused' : 'search';
    const manager = managers[c.key] ?? null;
    const tags = [key, manager === profile.id ? 'mine' : '', manager ? '' : 'nomanager', brief?.role_title ? '' : 'nobrief',
      key === 'invited' ? 'invited' : '', agreement === 'submitted' || agreement === 'rejected' ? 'agreement' : ''].filter(Boolean);
    const [aLabel, aTone] = AGREE[agreement] ?? AGREE.not_started;
    const opened = brief?.opened_at ? Math.max(0, Math.round((Date.now() - new Date(brief.opened_at).getTime()) / 86400000)) : null;
    return {
      id: c.key, name: c.full_name, sub: [c.org_name, c.email].filter(Boolean).join(' · '), company: c.org_name,
      section, stage: STAGE[key], ownerId: manager, tags,
      search: [c.full_name, c.org_name, c.email, brief?.role_title].filter(Boolean).join(' '),
      fullHref: c.signed_in ? `/console/executive/${c.key}` : null,
      headline: <>{brief?.role_title ? <><b>{brief.role_title}</b>{opened !== null && !brief?.closed_at ? ` · search open ${opened} day${opened === 1 ? '' : 's'}` : ''}</> : 'No role brief yet'}</>,
      cells: {
        stage: <span className="ws-stage" style={{ background: STAGE[key].color, cursor: 'default' }}>{STAGE[key].label}</span>,
        onboarding: <><Ring done={done} total={steps.length} /><span className="ws-muted">{done} of {steps.length}</span></>,
        role: brief?.role_title ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brief.role_title}</span> : <span className="ws-faint">No brief yet</span>,
        agreement: <span className={`ws-tag ${aTone}`}>{aLabel}</span>,
        zone: <span className="ws-muted">{zoneLabel(c.timezone) || '—'}</span>
      },
      props: [
        ['Company', c.org_name || <span key="c" className="ws-faint">Not given</span>],
        ['Email', <a key="e" href={`mailto:${c.email}`}>{c.email}</a>],
        ['Timezone', zoneLabel(c.timezone) || <span key="z" className="ws-faint">Not given</span>],
        ['Account', <span key="s" className={`ws-tag ${c.signed_in ? 'good' : 'warn'}`}>{c.signed_in ? 'Signed in' : 'Not yet signed in'}</span>],
        ['Agreement', <span key="a" className={`ws-tag ${aTone}`}>{aLabel}</span>],
        ['Onboarding', <div key="o" style={{ display: 'grid', gap: 6, padding: '8px 0' }}>
          {steps.map(st => <div key={st.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: st.done ? '#22302A' : '#9AA59C' }}>
            <span className={`ws-fresh ${st.done ? 'g' : 'n'}`} />{st.title}</div>)}</div>],
        ['Open role', brief?.role_title || <span key="r" className="ws-faint">No brief written yet</span>]
      ],
      tabs: [
        { key: 'role', label: 'Role brief', body: <RoleBriefEditor clientKey={c.key} pending={!c.signed_in} initial={brief ?? {}} name={c.full_name} /> },
        { key: 'account', label: 'Agreement and account', body: (
          <div style={{ display: 'grid', gap: 16 }}>
            <ClientAgreementAdmin clientId={c.key} docusignOn={docusignOn} state={agreement as any}
              rejectReason={agreements[c.key]?.reject_reason ?? null} manualSendUrl={manualSendUrl('client')} />
            {brief && !brief.closed_at && brief.id && (
              <WaiveDeposit searchId={brief.id} cents={brief.deposit_cents ?? 50000} status={(brief.deposit_status ?? 'due') as 'due' | 'paid' | 'waived'} />
            )}
            <div><DeletePerson id={c.key} name={c.full_name} pending={!c.signed_in} /></div>
          </div>
        ) }
      ]
    };
  });

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/directory" title="Directory" crumb="Executives">
      <DirectoryTabs active="executives" />
      <PeopleWorkspace
        title="Executives" noun="executives" rows={rows} today={today} side="client" activityType="client" openId={q.open ?? null}
        team={team.map(m => ({ user_id: m.user_id, name: m.name }))}
        toolbar={<OnboardingSender prefill={prefill} />}
        cols={[
          { key: 'stage', label: 'Stage', width: '132px' },
          { key: 'onboarding', label: 'Onboarding', width: '120px', opt: true },
          { key: 'role', label: 'Open role', width: 'minmax(140px,1.2fr)', opt: true },
          { key: 'agreement', label: 'Agreement', width: '130px', opt: true },
          { key: 'zone', label: 'Timezone', width: '110px', opt: true }
        ]}
        sections={[
          { key: 'start', label: 'Getting started', color: '#C6A465' },
          { key: 'search', label: 'Searching', color: '#4E7A5C' },
          { key: 'placed', label: 'Placed', color: '#35443A' },
          { key: 'paused', label: 'On hold', color: '#A08478' }
        ]}
        views={[
          { key: 'all', label: 'All executives' }, { key: 'mine', label: 'Mine' }, { key: 'onboarding', label: 'Onboarding' },
          { key: 'hiring', label: 'Hiring' }, { key: 'interviewing', label: 'Interviewing' }, { key: 'placed', label: 'Placed' },
          { key: 'invited', label: 'Not signed in', warn: true }, { key: 'nobrief', label: 'No brief', warn: true },
          { key: 'agreement', label: 'Agreement to act on', warn: true }, { key: 'nomanager', label: 'No manager', warn: true }
        ]}
        empty={<><h4>No executives yet</h4><p className="small">After a discovery call, send the onboarding email from the top of this list.</p></>}
      />
    </Shell>
  );
}

/* Who looks after each account (profiles.csm_id, part 50), read in one go.
   Missing column or preview: nobody assigned, and the page still renders. */
async function accountManagers(ids: string[]): Promise<Record<string, string | null>> {
  if (!configured() || !ids.length) return {};
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.from('profiles').select('id, csm_id').in('id', ids);
    if (error) return {};
    return Object.fromEntries(((data ?? []) as any[]).map(r => [r.id, r.csm_id ?? null]));
  } catch { return {}; }
}
