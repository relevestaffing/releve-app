'use client';
import { useRouter } from 'next/navigation';
import PersonPicker, { type Person } from './PersonPicker';

/* Which executive the bench is being ranked against. Searchable, because a
   dropdown stops working somewhere around the fortieth client. */
export default function ClientSwitcher({ clients, current }: {
  clients: Person[]; current: string;
}) {
  const router = useRouter();
  return (
    <div className="client-picker">
      <PersonPicker people={clients} value={current}
        onChange={id => { if (id) router.push(`/console/matching?client=${id}`); }}
        placeholder="Search executives…" />
    </div>
  );
}
