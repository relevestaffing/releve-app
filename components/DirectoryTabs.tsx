import Link from 'next/link';
import ConsoleTabs from './ConsoleTabs';
import { vettingQueue } from '@/lib/work';
import { watchReviewQueue } from '@/lib/watch';

/* Executives and Talent are the Directory. Verification and Taking The Watch
   are not directories at all, they are queues that fill up and wait on a
   decision, so they appear here only while something is in them and nowhere
   at all while they are empty. Tidy up is occasional and sits on the end. */
export default async function DirectoryTabs({ active }: { active: 'executives' | 'talent' }) {
  /* A queue that cannot be read must not take the Directory down with it. */
  const [vet, watch] = await Promise.all([
    vettingQueue().catch(() => [] as unknown[]),
    watchReviewQueue().catch(() => [] as unknown[])
  ]);

  return (
    <ConsoleTabs
      active={active === 'executives' ? '/console/people' : '/console/bench'}
      items={[
        { href: '/console/people', label: 'Executives' },
        { href: '/console/bench', label: 'Talent' }
      ]}
      aside={<>
        {vet.length > 0 && (
          <Link className="btn sm" href="/console/vetting">{vet.length} to verify</Link>
        )}
        {watch.length > 0 && (
          <Link className="btn sm" href="/console/watch">{watch.length} Watch to review</Link>
        )}
        <Link className="btn sm ghost" href="/console/cleanup">Tidy up</Link>
      </>}
    />
  );
}
