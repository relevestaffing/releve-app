import { redirect } from 'next/navigation';

/* Recruiting is Applications and Postings. Applications is the queue, so it
   is what the sidebar entry opens. */
export default function Recruiting() {
  redirect('/console/applications');
}
