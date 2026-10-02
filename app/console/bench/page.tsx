import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile, configured } from '@/lib/supabase/server';
import { getBench, archetype, dispositionLine } from '@/lib/data';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import { Portrait } from '@/components/Viz';
import AddPerson from '@/components/AddPerson';
import TalentOnboardingSender from '@/components/TalentOnboardingSender';
import { listPending, getAvailability } from '@/lib/store';
import { bookableIds } from '@/lib/store';
import { benchPay } from '@/lib/work';
import { money } from '@/lib/money-public';
import TableSearch from '@/components/TableSearch';
import PaySetter from '@/components/PaySetter';
import DeletePerson from '@/components/DeletePerson';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function Bench() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const allBench = await getBench();
  /* PART 33: talent_directory now includes people mid-onboarding with no
     Signature yet (has_signature === false) instead of hiding them. The main
     table below reads scores/validity, which don't exist until the Signature
     is done, so it keeps to the assessed group; the unsigned group gets its
     own section further down instead of vanishing. */
  const bench = allBench.filter((t: any) => t.has_signature !== false);
  const unsigned = allBench.filter((t: any) => t.has_signature === false);
  const pending = (await listPending()).filter((p: any) => p.role === 'talent');
  /* Someone with no availability looks ready and cannot be booked — surface it.
     One query for everybody, not one per person: the old version made a round
     trip per talent before the page could paint. */
  const bookable = await bookableIds(bench.map(t => t.id));
  /* Pay moved out of profiles into talent_pay; this column had been rendering
     a field that no longer exists, so it was blank for everyone. */
  const pay = await benchPay(bench.map(t => t.id));
  const unbookable = bench.filter(t => !bookable.has(t.id));

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/bench" title="Talent" crumb="Everyone we can put forward">
      <div className="card tight">
        <p className="small" style={{ margin: 0, maxWidth: 660 }}>
          Everyone Relève can put forward: assessed, verified, and not currently
          placed. A person joins the roster once their Talent Signature is done,
          and leaves it when they take a seat.
        </p>
      </div>

      <TalentOnboardingSender />

      <div className="card">
        <div className="card-head"><h3>Every assessed profile</h3>
          <div className="row" style={{ gap: 10 }}>
            {bench.length > 5 && <TableSearch scope="bench-table" placeholder="Search the roster…" />}
            <span className="pill">{bench.length} on file</span>
            <AddPerson /></div></div>
        {!bench.length ? (
          <div className="empty-card" style={{ padding: '34px 24px' }}>
            <div className="empty-mark" aria-hidden="true" />
            <h3>The roster is empty</h3>
            <p className="small">
              Add talent with the button above, or let them apply through the Careers
              page. Nobody appears here until they have completed their Talent Signature.
              An unassessed profile cannot be matched against anyone.
            </p>
          </div>
        ) : (
        <table className="data" id="bench-table">
          <thead><tr><th>Name</th><th>Role</th><th>Profile</th><th>Disposition</th><th>Validity</th><th style={{ textAlign: 'right' }}>We pay</th><th>Stage</th><th></th></tr></thead>
          <tbody>
            {bench.map(t => (
              <tr key={t.id}>
                <td><div className="row"><Portrait id={t.id} name={t.name} url={t.photo_url} />
                  <div><Link href={`/console/talent/${t.id}`}><b>{t.name}</b></Link><div className="small muted">{t.yrs} yrs · {t.loc}</div></div></div></td>
                <td className="small">{t.role}</td>
                <td><span className="pill">{archetype(t.scores, 'talent').n}</span></td>
                <td className="small muted">{dispositionLine(t.scores)}</td>
                <td><span className={`pill ${t.validity.verdict === 'Valid' ? 'good' : t.validity.verdict === 'Review' ? 'warn' : 'crit'}`}>
                  <span className="dot" />{t.validity.verdict}</span></td>
                <td className="amount"><PaySetter talentId={t.id} cents={pay[t.id] != null ? pay[t.id]! * 100 : null} compact /></td>
                <td><span className={`pill ${t.stage === 'Placed' ? 'good' : t.stage === 'Vetted' ? '' : 'warn'}`}>
                  <span className="dot" />{t.stage}</span></td>
                <td><DeletePerson id={t.id} name={t.name} pending={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
      {bench.length > 0 && (
      <div className="card">
        <div className="card-head"><h3>Validity detail</h3><span className="pill">Internal only</span></div>
        <div style={{ marginBottom: 8 }}>
          <Explain>
            Clients see a verified badge and confidence bands. These numbers stay here.
          </Explain>
        </div>
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
                <td className="small">{t.validity.medSec?.toFixed(1) ?? '·'}</td>
                <td className="small muted">{t.validity.flags.map(f => f.k).join(', ') || '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        </details>
      </div>
      )}
      {unbookable.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(140,74,63,.45)' }}>
          <div className="card-head"><h3>Assessed but not bookable</h3>
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
      {unsigned.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Mid-onboarding, no Signature yet</h3><span className="pill warn"><span className="dot" />{unsigned.length}</span></div>
          <p className="small muted" style={{ marginBottom: 14 }}>
            Signed in and started, but haven't finished their Talent Signature.
            There is nothing to match against yet, so they sit here rather than on the roster below. Worth a nudge if it's
            been a while.
          </p>
          <table className="data">
            <thead><tr><th>Name</th><th>Role</th><th>Location</th></tr></thead>
            <tbody>
              {unsigned.map((t: any) => (
                <tr key={t.id}>
                  <td><div className="row"><Portrait id={t.id} name={t.name} url={t.photo_url} />
                    <b>{t.name}</b></div></td>
                  <td className="small">{t.role || '·'}</td>
                  <td className="small muted">{t.loc || '·'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pending.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Added, not yet signed in</h3><span className="pill warn"><span className="dot" />{pending.length}</span></div>
          <div style={{ marginBottom: 16 }}>
            <Explain>
              These records attach themselves the first time each person signs in with the email on file.
            </Explain>
          </div>
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Added as</th><th></th></tr></thead>
            <tbody>{pending.map((p: any) => (
              <tr key={p.id}><td><b>{p.full_name}</b></td><td className="small">{p.email}</td>
                <td className="small">{p.headline ?? p.org_name ?? '·'}</td>
                <td><span className="pill">{p.role}</span></td>
                <td><DeletePerson id={p.id} name={p.full_name} pending /></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
