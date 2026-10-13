import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { cleanupRows, listArchived, archivingIsLive } from '@/lib/archive';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import Cleanup from '@/components/Cleanup';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

/* One page for getting people out of the way.
   ------------------------------------------
   Everything here used to be a Remove button at the bottom of a disclosure
   on each row: fine for one person, hopeless for eight, and it only told
   you what was standing in the way after you had already clicked. This
   gathers every account and every unclaimed invitation in one list, says
   what each has on file, and offers the two honest actions — archive, which
   keeps the record, and remove, which does not. (13 October 2026.) */
export default async function CleanupPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const archiving = configured() ? await archivingIsLive() : false;
  const [rows, archived] = configured()
    ? await Promise.all([cleanupRows(), listArchived()])
    : [[], []];

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/cleanup"
      title="Tidy up" crumb="Archive or remove people">

      <div style={{ marginBottom: 22 }}>
        <Explain>
          Archiving is the everyday one: they come off every list, count and alert, and
          everything they did stays on file and can be put back. Removing is for rows
          with nothing worth keeping, like a test account or an invitation nobody took
          up. It erases the account and cannot be undone, so anyone with a placement,
          an invoice out and unpaid, or money still owed is held back until that is settled.
        </Explain>
      </div>

      {!configured() && (
        <div className="card tight" style={{ marginBottom: 22 }}>
          <p className="small muted">
            This is the preview. Real accounts appear here once the app is running
            against the live database.
          </p>
        </div>
      )}

      {/* The one thing on this page that needs a database change behind it.
          Said plainly rather than letting Archive fail on click. */}
      {configured() && !archiving && (
        <div className="card tight" style={{ marginBottom: 22 }}>
          <div className="card-head" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 19 }}>Archiving is not switched on yet</h3>
          </div>
          <p className="small muted" style={{ maxWidth: 'var(--measure)' }}>
            Run <code>supabase/part40-archive.sql</code> in the Supabase SQL editor and
            reload this page. Removing works either way; only archiving is waiting on it.
          </p>
        </div>
      )}

      <Cleanup rows={rows} archived={archived} />
    </Shell>
  );
}
