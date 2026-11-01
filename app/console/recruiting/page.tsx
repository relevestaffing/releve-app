import { redirect } from 'next/navigation';

/* Rendered on request, never prebuilt (see console/directory). */
export const dynamic = 'force-dynamic';

/* Recruiting is Applications and Postings. Applications is the queue, so it
   is what the sidebar entry opens. */
export default function Recruiting() {
  redirect('/console/applications');
}
