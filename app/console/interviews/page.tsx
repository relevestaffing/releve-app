import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { listInterviews } from '@/lib/store';
import { formatSlot } from '@/lib/scheduling';
import { zoomConfigured } from '@/lib/zoom';
import Shell from '@/components/Shell';
import InterviewStatus from '@/components/InterviewStatus';
import { Stat } from '@/components/Viz';
import { getAvailability } from '@/lib/store';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function ConsoleInterviews() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin' && configured()) redirect('/app');
  const all = await listInterviews();
  /* The operator's own timezone, not a hardcoded Pacific. A London-based
     manager was reading every interview eight hours out. */
  const myAvail = await getAvailability(profile.id, '');
  const tz = myAvail.timezone || 'America/Los_Angeles';
  const tzLabel = tz.split('/')[1]?.replace(/_/g, ' ') ?? tz;
  const count = (s: string) => all.filter(i => i.status === s).length;

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/interviews" title="Interviews" crumb="Every account"
      action={<span className={`pill ${zoomConfigured() ? 'good' : 'warn'}`}><span className="dot" />
        {zoomConfigured() ? 'Zoom connected' : 'Zoom not connected'}</span>}>
      <div className="grid-4">
        <Stat label="Scheduled" value={count('Confirmed') + count('Proposed')} sub="Confirmed or awaiting" />
        <Stat label="Completed" value={count('Completed')} sub="Interviews held" />
        <Stat label="Declined" value={count('Declined') + count('Cancelled')} sub="Did not go ahead" />
        <Stat label="No-shows" value={count('No-show')} sub="Flag these to the CSM" />
      </div>
      <div className="card">
        <div className="card-head"><h3>All interviews</h3><span className="pill">{all.length} on record</span></div>
        {all.length === 0
          ? <p className="small muted">Nothing booked yet. Clients book from their own account once you release a shortlist.</p>
          : (
            <table className="data">
              <thead><tr><th>Client</th><th>Talent</th><th>Stage</th><th>When ({tzLabel})</th><th>Status</th><th>Link</th></tr></thead>
              <tbody>
                {all.map(iv => (
                  <tr key={iv.id}>
                    <td><b>{iv.client_name}</b></td>
                    <td>{iv.talent_name}</td>
                    <td className="small">{iv.stage}</td>
                    <td className="small">{formatSlot(iv.starts_at, tz)}</td>
                    <td><InterviewStatus id={iv.id} status={iv.status} canEdit /></td>
                    <td>{iv.meeting_url
                      ? <a className="btn sm ghost" href={iv.meeting_url} target="_blank" rel="noreferrer">Open</a>
                      : <span className="xs muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      {!zoomConfigured() && (
        <div className="card tight">
          <p className="small muted">
            <b>Meeting links are being added by hand.</b> Zoom is not connected yet, so
            each booking is recorded without a link and somebody has to send one. Connecting
            Zoom makes that automatic — the steps are in your notes.
          </p>
        </div>
      )}
    </Shell>
  );
}
