'use client';
import { useId } from 'react';
import { useRouter } from 'next/navigation';
import { fmtMonth } from '@/lib/words';

/* Which month (and, for an executive with more than one person, whose).
   Changing either navigates straight away; the form still works without
   scripting through its Show button. */
export default function ReportPicker({ months, month, placements, placement }: {
  months: string[]; month: string;
  placements: { id: string; name: string }[]; placement: string;
}) {
  const router = useRouter();
  /* Shell renders an action twice (desktop and phone), so ids must differ. */
  const uid = useId();
  const go = (m: string, p: string) => router.push(`/app/report?placement=${p}&month=${m.slice(0, 7)}`);
  return (
    <form className="report-picker" action="/app/report" method="get">
      {placements.length > 1 && (
        <>
          <label className="sr-only" htmlFor={`${uid}-who`}>Whose month</label>
          <select id={`${uid}-who`} name="placement" defaultValue={placement}
            onChange={e => go(month, e.target.value)}>
            {placements.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </>
      )}
      {placements.length <= 1 && <input type="hidden" name="placement" value={placement} />}
      <label className="sr-only" htmlFor={`${uid}-month`}>Month</label>
      <select id={`${uid}-month`} name="month" defaultValue={month.slice(0, 7)}
        onChange={e => go(e.target.value + '-01', placement)}>
        {months.map(m => <option key={m} value={m.slice(0, 7)}>{fmtMonth(m)}</option>)}
      </select>
      <noscript><button className="btn sm ghost">Show</button></noscript>
    </form>
  );
}
