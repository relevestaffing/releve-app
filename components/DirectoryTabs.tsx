import Link from 'next/link';
import ConsoleTabs from './ConsoleTabs';
import { vettingQueue } from '@/lib/work';
import { watchReviewQueue } from '@/lib/watch';
import { listProspects } from '@/lib/prospects';

/* Executives and Talent are the Directory. Verification and Taking The Watch
   are not directories at all, they are queues that fill up and wait on a
   decision, so they appear here only while something is in them and nowhere
   at all while they are empty. Tidy up is occasional and sits on the end as
   the last tab: a lone ghost button beside the strip read as an orphan on a
   phone and was invisible against the hero on a desktop. */
export default async function DirectoryTabs({ active }: { active: 'prospects' | 'executives' | 'talent' }) {
  /* A queue that cannot be read must not take the Directory down with it. */
  const [vet, watch, prospects] = await Promise.all([
    vettingQueue().catch(() => [] as unknown[]),
    watchReviewQueue().catch(() => [] as unknown[]),
    listProspects().catch(() => [])
  ]);
  const live = prospects.filter(p => !['won', 'lost'].includes(p.stage)).length;
  const aside = <>
    {vet.length > 0 && (
      <Link className="btn sm" href="/console/vetting">{vet.length} to verify</Link>
    )}
    {watch.length > 0 && (
      <Link className="btn sm" href="/console/watch">{watch.length} Watch to review</Link>
    )}
  </>;

  return (
    <ConsoleTabs
      active={active === 'prospects' ? '/console/prospects' : active === 'executives' ? '/console/people' : '/console/bench'}
      items={[
        { href: '/console/prospects', label: 'Leads', count: live },
        { href: '/console/people', label: 'Executives' },
        { href: '/console/bench', label: 'Talent' },
        { href: '/console/cleanup', label: 'Tidy up' }
      ]}
      aside={vet.length > 0 || watch.length > 0 ? aside : undefined}
    />
  );
}
