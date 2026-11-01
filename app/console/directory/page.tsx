import { redirect } from 'next/navigation';

/* Rendered on request, never prebuilt: the 29 Oct build failed prerendering
   this redirect-only page. */
export const dynamic = 'force-dynamic';

/* The Directory is two tabs rather than one page, and Executives is the one
   Sage opens first. The sidebar points here so the entry has a stable home
   even as the tabs change. */
export default function Directory() {
  redirect('/console/people');
}
