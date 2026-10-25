import { redirect } from 'next/navigation';

/* Reports, Match accuracy, Calendar and Team were four sidebar entries for
   work that happens monthly, competing with the seven Sage opens daily.
   One entry, four tabs, and Reports is what it opens on. */
export default function Business() {
  redirect('/console/reports');
}
