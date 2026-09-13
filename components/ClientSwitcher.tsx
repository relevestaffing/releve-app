'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PersonPicker, { type Person } from './PersonPicker';

/* Which executive the bench is being ranked against. Searchable, because a
   dropdown stops working somewhere around the fortieth client.

   PersonPicker only shows its search box once its own `value` prop is
   empty — pressing its "Change" button calls onChange('') expecting that.
   This component used to hand that straight to the router: `if (id)
   router.push(...)`, which silently drops the empty-string call, so
   `value` (driven by the URL's `client` param) never actually cleared and
   "Change" did nothing you could see. Local state now mirrors it instead,
   clearing immediately on "Change" and only navigating once a real id is
   chosen; the effect keeps it in sync after that navigation lands, so a
   fresh pick from elsewhere (or the back button) still shows correctly. */
export default function ClientSwitcher({ clients, current, basePath = '/console/matching' }: {
  clients: Person[]; current: string;
  /* Which page's query string to update. Matching and Interviews both use
     this picker; without this it always pushed to Matching, so switching
     executives from Interviews silently navigated you away from the page
     you were on. */
  basePath?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(current);
  useEffect(() => { setSelected(current); }, [current]);

  return (
    <div className="client-picker">
      <PersonPicker people={clients} value={selected}
        onChange={id => {
          setSelected(id);
          if (id) router.push(`${basePath}?client=${id}`);
        }}
        placeholder="Search executives…" />
    </div>
  );
}
