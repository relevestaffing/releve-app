import './experience.css';
import { SkelShell } from './Skeleton';

/* The loading state for any page that has no skeleton of its own: the same
   fern sidebar and topbar the page is about to have, and the Relève mark
   waiting in the middle with its fill bar, so a slow page looks like Relève
   taking a moment rather than a blank or a stranger's spinner. */
export default function NeutralLoading() {
  return (
    <SkelShell>
      <div role="status" aria-live="polite" className="sr-only">Loading</div>
      <div className="rv-wait" aria-hidden="true">
        <img className="rv-wait-logo" src="/logo-fern.png" alt="" width="1200" height="360" />
        <div className="rv-wait-bar"><i /></div>
      </div>
    </SkelShell>
  );
}
