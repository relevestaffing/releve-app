import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { getBench, archetype, dispositionLine } from '@/lib/data';
import Shell from '@/components/Shell';
import { Portrait } from '@/components/Viz';
import AddPerson from '@/components/AddPerson';
import { listPending, getAvailability } from '@/lib/store';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function Bench() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin' && configured()) redirect('/app');
  const bench = await getBench();
  const pending = await listPending();
  /* someone with no availability looks ready and cannot be booked — surface it */
  const unbookable = (await Promise.all(bench.map(async t => {
    const a = await getAvailability(t.id, '');
    return (a.windows?.length ?? 0) === 0 || !a.timezone ? t : null;
  }))).filter(Boolean) as typeof bench;

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/bench" title="Talent Bench" crumb="Talent accounts">
      <div className="card">
        <div className="card-head"><h3>Every assessed profile</h3>
          <div className="row" style={{ gap: 10 }}><span className="pill">{bench.length} on file</span>
            <AddPerson role="talent" /></div></div>
        <table className="data">
          <thead><tr><th>Name</th><th>Role</th><th>Profile</th><th>Disposition</th><th>Validity</th><th>Pay</th><th>Stage</th></tr></thead>
          <tbody>
            {bench.map(t => (
              <tr key={t.id}>
                <td><div className="row"><Portrait id={t.id} name={t.name} url={t.photo_url} />
                  <div><b>{t.name}</b><div className="small muted">{t.yrs} yrs · {t.loc}</div></div></div></td>
                <td className="small">{t.role}</td>
                <td><span className="pill">{archetype(t.scores, 'talent').n}</span></td>
                <td className="small muted">{dispositionLine(t.scores)}</td>
                <td><span className={`pill ${t.validity.verdict === 'Valid' ? 'good' : t.validity.verdict === 'Review' ? 'warn' : 'crit'}`}>
                  <span className="dot" />{t.validity.verdict}</span></td>
                <td className="small">{t.rate}</td>
                <td><span className={`pill ${t.stage === 'Placed' ? 'good' : t.stage === 'Vetted' ? '' : 'warn'}`}>
                  <span className="dot" />{t.stage}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-head"><h3>Validity detail</h3><span className="pill">Internal only</span></div>
        <p className="small muted" style={{ marginBottom: 18 }}>
          Clients see a verified badge and confidence bands. These numbers stay here.
        </p>
        <table className="data">
          <thead><tr><th>Talent</th><th>Impression mgmt</th><th>Inconsistency</th><th>Extreme</th><th>Longest run</th><th>Median s/item</th><th>Flags</th></tr></thead>
          <tbody>
            {bench.map(t => (
              <tr key={t.id}>
                <td><b>{t.name}</b></td>
                <td className="num">{t.validity.im}</td>
                <td className="num">{t.validity.inconsistency}</td>
                <td className="small">{t.validity.extreme}%</td>
                <td className="small">{t.validity.straight}</td>
                <td className="small">{t.validity.medSec?.toFixed(1) ?? '—'}</td>
                <td className="small muted">{t.validity.flags.map(f => f.k).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unbookable.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(140,74,63,.45)' }}>
          <div className="card-head"><h3>Ready on paper, impossible to book</h3>
            <span className="pill crit"><span className="dot" />{unbookable.length}</span></div>
          <p className="small muted" style={{ marginBottom: 14 }}>
            These profiles are complete but have no availability set, so no executive can book them.
            Nudge them to their Availability page before releasing them to a client.
          </p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {unbookable.map(t => <span className="pill warn" key={t.id}>{t.name}</span>)}
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Added, not yet signed in</h3><span className="pill warn"><span className="dot" />{pending.length}</span></div>
          <p className="small muted" style={{ marginBottom: 16 }}>
            These records attach themselves the first time each person signs in with the email on file.
          </p>
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Added as</th></tr></thead>
            <tbody>{pending.map((p: any) => (
              <tr key={p.id}><td><b>{p.full_name}</b></td><td className="small">{p.email}</td>
                <td className="small">{p.headline ?? p.org_name ?? '—'}</td>
                <td><span className="pill">{p.role}</span></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
