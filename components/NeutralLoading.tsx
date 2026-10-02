import './experience.css';
import { SkelShell, SkelCard, Skel } from './Skeleton';

/* The loading state for any page that has no skeleton of its own: the same
   fern sidebar and topbar the page is about to have, and two quiet cards.
   Deliberately shaped like no page in particular, so it never promises a
   layout (a table, a dashboard) that the page then fails to be. */
export default function NeutralLoading() {
  return (
    <SkelShell>
      <div role="status" aria-live="polite" className="sr-only">Loading</div>
      <SkelCard titleWidth={170}>
        <Skel style={{ width: '88%' }} />
        <Skel style={{ width: '72%' }} />
        <Skel style={{ width: '54%' }} />
      </SkelCard>
      <SkelCard titleWidth={120}>
        <Skel style={{ width: '80%' }} />
        <Skel style={{ width: '60%' }} />
      </SkelCard>
    </SkelShell>
  );
}
