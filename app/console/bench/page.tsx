import { DASH } from '@/lib/words';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile, configured, supabaseServer } from '@/lib/supabase/server';
import { getBench, archetype } from '@/lib/data';
import Shell from '@/components/Shell';
import DirectoryTabs from '@/components/DirectoryTabs';
import { Portrait } from '@/components/Viz';
import AddPerson from '@/components/AddPerson';
import TalentOnboardingSender from '@/components/TalentOnboardingSender';
import { listPending, getAvailability } from '@/lib/store';
import { bookableIds } from '@/lib/store';
import { benchPay } from '@/lib/work';
import { money } from '@/lib/money-public';
import PaySetter from '@/components/PaySetter';
import DeletePerson from '@/components/DeletePerson';
import { teamRoles } from '@/lib/care';
import { todayInPacific } from '@/lib/money-public';
import PeopleWorkspace, { type PersonRow } from '@/components/crm/PeopleWorkspace';
import { assignOptions } from '@/lib/account';

export const metadata = { title: 'Talent' };

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function Bench({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const sp = await searchParams;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const allBench = await getBench();
  /* PART 33: talent_directory includes people mid-onboarding with no
     Signature yet (has_signature === false). They have no scores or
     validity, so they sit in their own section rather than vanishing. */
  const bench = allBench.filter((t: any) => t.has_signature !== false);
  const unsigned = allBench.filter((t: any) => t.has_signature === false);
  const pending = (await listPending()).filter((p: any) => p.role === 'talent');
  /* One query for everybody: someone with no availability looks ready and
     cannot be booked, so it is surfaced. */
  const [bookable, pay, team, managers] = await Promise.all([
    bookableIds(bench.map(t => t.id)),
    benchPay(bench.map(t => t.id)),
    teamRoles().catch(() => []),
    talentManagers([...bench, ...unsigned].map((t: any) => t.id))
  ]);
  const today = todayInPacific();
  const VALID: Record<string, string> = { Valid: 'good', Review: 'warn' };
  const STAGE_COLOR: Record<string, string> = { Placed: '#35443A', Vetted: '#4E7A5C', Shortlisted: '#8A6DA3', Interviewing: '#8A6DA3' };

  /* The roster at Asana quality (2 November 2026): one list, sectioned by
     where each person is, every assessed profile, the ones mid-onboarding
     and the ones not yet signed in, with the same panel and history as
     Leads and Executives. */
  const rows: PersonRow[] = [
    ...bench.map((t: any) => {
      const placed = t.stage === 'Placed';
      const verdict = t.validity?.verdict ?? 'Review';
      const canBook = bookable.has(t.id);
      const manager = managers[t.id] ?? null;
      const type = archetype(t.scores, 'talent').n;
      const payNode = <PaySetter talentId={t.id} cents={pay[t.id] != null ? pay[t.id]! * 100 : null} compact />;
      return {
        id: t.id, name: t.name, sub: `${t.role}${t.loc ? ` · ${t.loc}` : ''}`, photo: t.photo_url ?? null,
        section: placed ? 'placed' : 'ready',
        stage: { label: placed ? 'Placed' : verdict === 'Valid' ? (t.stage || 'Vetted') : 'To review', color: placed ? STAGE_COLOR.Placed : verdict === 'Valid' ? (STAGE_COLOR[t.stage] ?? '#4E7A5C') : '#C6A465' },
        ownerId: manager,
        tags: [placed ? 'placed' : 'ready', verdict !== 'Valid' ? 'review' : '', !canBook && !placed ? 'unbookable' : '', manager === profile.id ? 'mine' : '', manager ? '' : 'nomanager'].filter(Boolean),
        search: [t.name, t.role, t.loc, type].filter(Boolean).join(' '),
        fullHref: `/console/talent/${t.id}`,
        headline: <>{type} · {t.yrs} yrs · {canBook ? 'interview hours set' : <span style={{ color: '#A4483A' }}>no interview hours</span>}</>,
        cells: {
          stage: <span className="ws-stage" style={{ ['--c' as any]: placed ? STAGE_COLOR.Placed : verdict === 'Valid' ? (STAGE_COLOR[t.stage] ?? '#4E7A5C') : '#C6A465', cursor: 'default' }}>{placed ? 'Placed' : verdict === 'Valid' ? (t.stage || 'Vetted') : 'To review'}</span>,
          profile: <span className="ws-tag">{type}</span>,
          validity: <span className={`ws-tag ${VALID[verdict] ?? 'bad'}`}>{verdict}</span>,
          pay: pay[t.id] != null ? <span>{money(pay[t.id]! * 100)}<span className="ws-faint"> /mo</span></span> : <span className="ws-faint">Not set</span>,
          book: canBook ? <span className="ws-muted"><span className="ws-fresh g" style={{ display: 'inline-block', marginRight: 7 }} />Bookable</span>
            : <span style={{ color: '#A4483A', fontSize: 13 }}><span className="ws-fresh r" style={{ display: 'inline-block', marginRight: 7 }} />No hours</span>
        },
        props: [
        { k: 'Role', v: t.role || DASH },
        { k: 'Experience', v: `${t.yrs} years` },
        { k: 'Location', v: t.loc || DASH },
        { k: 'Profile', v: <span key="p" className="ws-tag">{type}</span> },
        { k: 'Validity', v: <span key="v" className={`ws-tag ${VALID[verdict] ?? 'bad'}`}>{verdict}</span> },
        { k: 'Interview hours', v: canBook ? 'Set' : <span key="h" style={{ color: '#A4483A' }}>Not set, so nobody can book them</span> },
        { k: 'What Relève pays', v: payNode }
      ],
        tabs: [{ key: 'record', label: 'Record', body: <div style={{ display: 'grid', gap: 14 }}>
          <p className="small muted" style={{ margin: 0 }}>The full profile, Signature and documents are on the talent&rsquo;s own page.</p>
          <div><Link className="btn sm" href={`/console/talent/${t.id}`}>Open the full profile</Link></div>
          <div><DeletePerson id={t.id} name={t.name} pending={false} /></div></div> }]
      } as PersonRow;
    }),
    ...unsigned.map((t: any) => ({
      id: t.id, name: t.name, sub: [t.role, t.loc].filter(Boolean).join(' · ') || 'Mid-onboarding', photo: t.photo_url ?? null,
      section: 'onboarding', stage: { label: 'Signature due', color: '#6E8CA8' }, ownerId: managers[t.id] ?? null,
      tags: ['onboarding', managers[t.id] === profile.id ? 'mine' : '', managers[t.id] ? '' : 'nomanager'].filter(Boolean),
      search: [t.name, t.role, t.loc].filter(Boolean).join(' '), fullHref: `/console/talent/${t.id}`,
      headline: 'Started, Signature not finished, so there is nothing to match against yet.',
      cells: { stage: <span className="ws-stage" style={{ ['--c' as any]: '#6E8CA8', cursor: 'default' }}>Signature due</span>,
        profile: <span className="ws-faint">Not yet</span>, validity: <span className="ws-faint">—</span>, pay: <span className="ws-faint">—</span>, book: <span className="ws-faint">—</span> },
      props: [
        { k: 'Role', v: t.role || DASH },
        { k: 'Location', v: t.loc || DASH },
        { k: 'Signature', v: 'In progress' }
      ]
    } as PersonRow)),
    ...pending.map((p: any) => ({
      id: p.id, name: p.full_name, sub: [p.headline ?? p.org_name, p.email].filter(Boolean).join(' · '), photo: null,
      section: 'onboarding', stage: { label: 'Invited', color: '#9AA59C' }, ownerId: null,
      tags: ['invited'], search: [p.full_name, p.email, p.headline].filter(Boolean).join(' '), fullHref: null,
      headline: 'Added, not yet signed in.',
      cells: { stage: <span className="ws-stage" style={{ ['--c' as any]: '#9AA59C', cursor: 'default' }}>Invited</span>,
        profile: <span className="ws-faint">—</span>, validity: <span className="ws-faint">—</span>, pay: <span className="ws-faint">—</span>, book: <span className="ws-faint">—</span> },
      props: [
        { k: 'Email', v: <a key="e" href={`mailto:${p.email}`}>{p.email}</a> },
        { k: 'Added as', v: p.role },
        { k: 'Record', v: <DeletePerson key="d" id={p.id} name={p.full_name} pending /> }
      ]
    } as PersonRow))
  ];

  const assignable = await assignOptions('talent');

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/directory" title="Directory" crumb="Talent">
      <DirectoryTabs active="talent" />
      <PeopleWorkspace
        title="Talent" noun="talent" rows={rows} today={today} side="talent" activityType="talent" assignOptions={assignable} openId={sp.open ?? null}
        team={team.map(m => ({ user_id: m.user_id, name: m.name }))}
        toolbar={<><TalentOnboardingSender /><AddPerson /></>}
        cols={[
          { key: 'stage', label: 'Stage', width: '120px' },
          { key: 'profile', label: 'Profile', width: '132px', opt: true },
          { key: 'validity', label: 'Validity', width: '92px', opt: true },
          { key: 'pay', label: 'Pay', width: '104px', opt: true },
          { key: 'book', label: 'Interviews', width: '112px', opt: true }
        ]}
        sections={[
          { key: 'ready', label: 'Ready to place', color: '#4E7A5C' },
          { key: 'placed', label: 'Placed', color: '#35443A' },
          { key: 'onboarding', label: 'Onboarding', color: '#6E8CA8' }
        ]}
        views={[
          { key: 'all', label: 'All talent' }, { key: 'mine', label: 'Mine' }, { key: 'ready', label: 'Ready to place' }, { key: 'placed', label: 'Placed' },
          { key: 'review', label: 'To review', warn: true }, { key: 'unbookable', label: 'No interview hours', warn: true },
          { key: 'onboarding', label: 'Onboarding' }, { key: 'invited', label: 'Not signed in' }, { key: 'nomanager', label: 'No manager', warn: true }
        ]}
        empty={{ title: "The roster is empty", text: "Add someone from the top of this list, or let them apply through Careers." }}
      />

      {bench.length > 0 && (
      <div className="card">
        <div className="card-head"><h3>Validity detail</h3><span className="pill">Internal only</span></div>
        <details className="more">
          <summary>Show the raw control measures</summary>
          <div className="inner">
        <table className="data">
          <thead><tr><th>Talent</th><th>Impression mgmt</th><th>Inconsistency</th><th>Extreme</th><th>Longest run</th><th>Median s/item</th><th>Notes</th></tr></thead>
          <tbody>
            {bench.map(t => (
              <tr key={t.id}>
                <td><b>{t.name}</b></td>
                <td className="num">{t.validity.im}</td>
                <td className="num">{t.validity.inconsistency}</td>
                <td className="small">{t.validity.extreme}%</td>
                <td className="small">{t.validity.straight}</td>
                <td className="small">{t.validity.medSec?.toFixed(1) ?? DASH}</td>
                <td className="small muted">{t.validity.flags.map(f => f.k).join(', ') || DASH}</td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        </details>
      </div>
      )}
    </Shell>
  );
}

/* Who looks after each talent (profiles.tsm_id, part 50), in one read. */
async function talentManagers(ids: string[]): Promise<Record<string, string | null>> {
  if (!configured() || !ids.length) return {};
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.from('profiles').select('id, tsm_id').in('id', ids);
    if (error) return {};
    return Object.fromEntries(((data ?? []) as any[]).map(r => [r.id, r.tsm_id ?? null]));
  } catch { return {}; }
}
