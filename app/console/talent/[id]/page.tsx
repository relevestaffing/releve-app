import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile, configured, supabaseServer } from '@/lib/supabase/server';
import { signatureOf, archetype, dispositionLine } from '@/lib/data';
import { talentSelfLines } from '@/lib/plain';
import { L1, L2 } from '@/lib/signature/model';
import { getSkills, DISCIPLINE, compsOf, PROFS, skillsComplete } from '@/lib/roles';
import { listVetting, benchPay } from '@/lib/work';
import { getAvailability, getSelfProfile } from '@/lib/store';
import { getPayout, listPayments } from '@/lib/payout';
import { payoutReady, PAYOUT_METHODS, periodLabel } from '@/lib/payout-public';
import { money, dayLabel } from '@/lib/money-public';
import Shell from '@/components/Shell';
import { Radar, AxisBars, Portrait } from '@/components/Viz';
import PaySetter from '@/components/PaySetter';
import Explain from '@/components/Explain';

export const dynamic = 'force-dynamic';

/* One talent, in full, for the team.
   ----------------------------------
   The roster showed a row; Matching showed a rank; Verification showed a
   document; Billing showed a rate. Nowhere showed the person — the Signature,
   the skills they claim, whether they are verified, whether the Watch has
   cleared them, when they can be booked, what Relève pays them, and where
   they have been placed — on one page, before a decision about them. */
export default async function TalentFile({ params }: { params: Promise<{ id: string }> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const { id } = await params;

  const self = await getSelfProfile(id);
  if (!self || !self.full_name && configured()) redirect('/console/bench');
  const name = self.full_name ?? 'Talent';

  const [sig, skills, vetting, avail, pay, payout, payments, placements, watch, decisions] = await Promise.all([
    signatureOf(id, 'talent'),
    getSkills(id),
    listVetting(id),
    getAvailability(id, ''),
    benchPay([id]),
    getPayout(id),
    listPayments(id),
    placementsOf(id),
    watchOf(id),
    decisionsAbout(id)
  ]);

  const type = sig ? archetype(sig.scores, 'talent') : null;
  const lines = sig ? talentSelfLines(sig.scores) : [];
  const identity = vetting.find(v => String(v.kind) === 'identity');
  const agreement = vetting.find(v => String(v.kind) === 'agreement');
  const verified = identity?.state === 'verified' && agreement?.state === 'verified';
  const disciplines: string[] = skills?.disciplines ?? [];
  const method = PAYOUT_METHODS.find(m => m.key === payout?.method);
  const stateWord = (v?: { state: string } | null) =>
    !v ? 'Not started' : v.state === 'verified' ? 'Verified' : v.state === 'submitted' ? 'Waiting on you' : v.state === 'rejected' ? 'Rejected' : v.state;
  const stateTone = (v?: { state: string } | null) =>
    !v ? '' : v.state === 'verified' ? 'good' : v.state === 'rejected' ? 'crit' : 'warn';

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/bench"
      title={name}
      crumb={[self.headline, self.location].filter(Boolean).join(' · ') || 'Talent file'}
      action={<Link className="btn sm ghost" href="/console/bench">← Talent Roster</Link>}>

      <div className="card dark">
        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          <Portrait id={id} name={name} cls="lg" url={self.photo_url} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={{ fontSize: 24, color: 'var(--cream)', marginBottom: 6 }}>{name}</h2>
            <p style={{ fontFamily: 'Marcellus,serif', fontSize: 16, color: 'var(--pale)' }}>
              {[self.headline, self.location, self.timezone?.replace('_', ' ')].filter(Boolean).join(' · ')}
            </p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <span className={`pill ${verified ? 'good' : 'warn'}`}><span className="dot" />{verified ? 'Verified' : 'Not verified'}</span>
              {type && <span className="pill">{type.n}</span>}
              {sig && <span className={`pill ${sig.validity?.verdict === 'Valid' ? 'good' : sig.validity?.verdict === 'Review' ? 'warn' : 'crit'}`}>
                Signature {sig.validity?.verdict ?? '—'}</span>}
              {disciplines.length > 0 && (
                <span className={`pill ${watch.every(w => w.cleared) && watch.length === disciplines.length ? 'good' : 'warn'}`}>
                  Watch {watch.filter(w => w.cleared).length}/{disciplines.length} cleared
                </span>
              )}
              <span className="pill">{self.years_exp != null ? `${self.years_exp} yrs` : 'Years —'}{self.english ? ` · ${self.english}` : ''}</span>
            </div>
          </div>
        </div>
        {self.bio && <p className="small" style={{ maxWidth: 640, marginTop: 18 }}>{self.bio}</p>}
        <div className="row" style={{ gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <span className="xs muted">{self.intro_video_url ? 'Intro video on file' : 'No intro video yet'}</span>
          <span className="xs muted">·</span>
          <span className="xs muted">{self.photo_url ? 'Photo on file' : 'No photo yet'}</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>The Signature</h3>{type && <span className="pill">{type.n}</span>}</div>
          {!sig ? (
            <div className="empty"><span className="tick" /><p className="small">Not taken yet. Nothing can be matched until it is.</p></div>
          ) : (
            <>
              <Radar series={[{ name, color: '#35443A', values: sig.scores, op: .2 }]} axes={L1} size={230} note={false} />
              <div className="hr" style={{ margin: '14px 0' }} />
              <div className="eyebrow" style={{ marginBottom: 8 }}>Disposition</div>
              <p className="small muted" style={{ marginBottom: 10 }}>{dispositionLine(sig.scores)}</p>
              <AxisBars values={sig.scores} axes={L2} />
              {lines.length > 0 && (
                <>
                  <div className="eyebrow" style={{ margin: '16px 0 8px' }}>In plain words</div>
                  <ul className="plain">{lines.map(l => <li key={l} className="small">{l}</li>)}</ul>
                </>
              )}
              {sig.validity?.flags?.length ? (
                <div style={{ marginTop: 12 }}>
                  <Explain>
                    {sig.validity.flags.map((f: any) => `${f.k}: ${f.v} — ${f.d}`).join(' ')}
                  </Explain>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Verification</h3>
              <Link className="btn sm ghost" href="/console/vetting">Open Verification</Link></div>
            <dl className="brief-facts">
              <dt>Identity</dt><dd><span className={`pill ${stateTone(identity)}`}>{stateWord(identity)}</span></dd>
              <dt>Agreement</dt><dd><span className={`pill ${stateTone(agreement)}`}>{stateWord(agreement)}</span>
                {(agreement as any)?.signed_on && <span className="xs muted" style={{ marginLeft: 8 }}>signed {dayLabel((agreement as any).signed_on)}</span>}</dd>
              <dt>Stage</dt><dd>{(self as any).stage ?? '—'}</dd>
            </dl>
          </div>

          <div className="card">
            <div className="card-head"><h3>What Relève pays</h3></div>
            <PaySetter talentId={id} cents={pay[id] != null ? pay[id]! * 100 : null} />
            <div className="hr" style={{ margin: '14px 0' }} />
            <dl className="brief-facts">
              <dt>Paid by</dt>
              <dd>{payoutReady(payout)
                ? <>{method?.label ?? payout?.method}{payout?.confirmed_at ? <span className="pill good" style={{ marginLeft: 8 }}>Checked</span> : <span className="pill warn" style={{ marginLeft: 8 }}>Not checked</span>}</>
                : <span className="muted">No payment details yet</span>}</dd>
              <dt>Tax form</dt>
              <dd>{payout?.tax_form_on_file ? 'On file' : payout?.tax_residence ? 'Not on file' : <span className="muted">Not asked yet</span>}</dd>
              <dt>Payments</dt>
              <dd>{payments.length === 0 ? <span className="muted">None yet</span>
                : payments.slice(0, 6).map(p => (
                  <div key={p.id} className="xs">{periodLabel(p.period_start)} · {money(p.amount_cents)} · {p.state}</div>
                ))}</dd>
            </dl>
          </div>

          <div className="card">
            <div className="card-head"><h3>Availability</h3></div>
            {!avail.timezone?.trim() || !avail.windows?.length ? (
              <p className="small muted">Not set — no executive can book them until it is.</p>
            ) : (
              <>
                <p className="xs muted" style={{ marginBottom: 8 }}>{avail.timezone.replace('_', ' ')}</p>
                <ul className="plain">
                  {avail.windows.map((w: any, i: number) => (
                    <li key={i} className="small">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][w.day] ?? w.day} · {w.start}–{w.end}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Skills breakdown</h3>
          <span className={`pill ${skillsComplete(skills) ? 'good' : 'warn'}`}>{skillsComplete(skills) ? 'Complete' : disciplines.length ? 'Partial' : 'Not started'}</span></div>
        {!disciplines.length ? (
          <p className="small muted">No discipline claimed yet.</p>
        ) : (
          <div className="grid-2">
            {disciplines.map(d => {
              const w = watch.find(x => x.discipline === d);
              return (
                <div key={d} style={{ marginBottom: 12 }}>
                  <div className="row between" style={{ marginBottom: 8, gap: 8 }}>
                    <b className="small">{DISCIPLINE[d]?.name ?? d}</b>
                    <span className={`pill ${w?.cleared ? 'good' : w?.status === 'submitted' ? 'warn' : ''}`}>
                      {w?.cleared ? 'Watch cleared' : w?.status === 'submitted' ? 'Watch to score' : w ? 'Watch in progress' : 'Watch not taken'}
                    </span>
                  </div>
                  <ul className="plain">
                    {compsOf(d).map(c => {
                      const lvl = skills?.levels?.[`${d}.${c.key}`] ?? 'none';
                      const yrs = skills?.years?.[`${d}.${c.key}`];
                      return (
                        <li key={c.key} className="xs">
                          <span className={lvl === 'deep' || lvl === 'solid' ? '' : 'muted'}>{c.label}</span>
                          <span className="muted"> · {PROFS.find(p => p.key === lvl)?.label ?? lvl}{yrs ? ` · ${yrs} yrs` : ''}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Placements</h3><span className="pill">{placements.length}</span></div>
          {!placements.length ? <p className="small muted">Never placed yet.</p> : (
            <ul className="past-list">
              {placements.map(p => (
                <li key={p.id}>
                  <span className="past-date">{dayLabel(p.started_on)}{p.ended_on ? ` – ${dayLabel(p.ended_on)}` : ' →'}</span>
                  <Link className="small" href={`/console/placements/${p.id}`}>{p.org_name ?? p.client_name}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h3>Put forward</h3><span className="pill">{decisions.length}</span></div>
          {!decisions.length ? <p className="small muted">Not yet sent to any executive.</p> : (
            <ul className="past-list">
              {decisions.map(d => (
                <li key={d.client_id}>
                  <span className="past-date">{d.released ? 'Sent' : 'Matched'}</span>
                  <span className="small">{d.client_name}{d.state ? ` · ${d.state === 'passed' ? 'declined' : d.state === 'shortlisted' ? 'approved' : d.state}` : ' · no answer yet'}
                    {d.reason ? <span className="xs muted"> — {d.reason}</span> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Shell>
  );
}

async function placementsOf(talentId: string) {
  if (!configured()) return [] as { id: string; started_on: string; ended_on: string | null; client_name: string; org_name: string | null }[];
  const sb = await supabaseServer();
  const { data } = await sb.from('placements')
    .select('id, started_on, ended_on, client:client_id(full_name, org_name)')
    .eq('talent_id', talentId).order('started_on', { ascending: false });
  return ((data ?? []) as any[]).map(r => ({
    id: r.id, started_on: r.started_on, ended_on: r.ended_on,
    client_name: r.client?.full_name ?? 'Executive', org_name: r.client?.org_name ?? null
  }));
}

/* Taking The Watch, per discipline, read as the team: the latest attempt
   and whether its score cleared them. */
async function watchOf(talentId: string) {
  if (!configured()) return [] as { discipline: string; status: string; cleared: boolean }[];
  const sb = await supabaseServer();
  const { data } = await sb.from('taking_the_watch_attempts')
    .select('id, discipline, status, started_at, score:taking_the_watch_scores(overall_result)')
    .eq('talent_id', talentId).order('started_at', { ascending: false });
  const latest = new Map<string, any>();
  for (const r of (data ?? []) as any[]) if (!latest.has(r.discipline)) latest.set(r.discipline, r);
  return [...latest.values()].map(r => {
    const score = Array.isArray(r.score) ? r.score[0] : r.score;
    return { discipline: r.discipline, status: r.status, cleared: score?.overall_result === 'cleared' };
  });
}

/* Every executive this person has been matched to, and what they said. */
async function decisionsAbout(talentId: string) {
  if (!configured()) return [] as { client_id: string; client_name: string; released: boolean; state: string | null; reason: string | null }[];
  const sb = await supabaseServer();
  const [{ data: m }, { data: d }] = await Promise.all([
    sb.from('matches').select('client_id, released, client:client_id(full_name, org_name)').eq('talent_id', talentId),
    sb.from('talent_decisions').select('client_id, state, reason').eq('talent_id', talentId)
  ]);
  const byClient = new Map(((d ?? []) as any[]).map(x => [x.client_id, x]));
  return ((m ?? []) as any[]).map(r => ({
    client_id: r.client_id, released: !!r.released,
    client_name: r.client?.org_name ?? r.client?.full_name ?? 'Executive',
    state: byClient.get(r.client_id)?.state ?? null, reason: byClient.get(r.client_id)?.reason ?? null
  }));
}
