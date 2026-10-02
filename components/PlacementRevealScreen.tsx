'use client';

import { useRouter } from 'next/navigation';
import PlacementReveal from './PlacementReveal';
import { toast } from './Toast';

/* Wires the presentational reveal to the one write it is allowed to make:
   mark itself seen for whichever side is looking at it, then go on to the
   real dashboard. If the mark-seen call fails, this still moves on — the
   worst that happens is that side sees the reveal again next sign-in, which
   is a far better failure than getting stuck on it. */
export default function PlacementRevealScreen({
  counterpartLabel, counterpartName, roleTitle, startDate
}: { counterpartLabel: string; counterpartName: string; roleTitle: string; startDate: string }) {
  const router = useRouter();

  async function onViewPlacement() {
    try {
      const res = await fetch('/api/placement-reveal', { method: 'POST' });
      if (!res.ok) toast.bad('Could not save that you have seen this. It may show again next time.');
    } catch {
      toast.bad('Could not save that you have seen this. It may show again next time.');
    }
    router.push('/app');
  }

  return (
    <PlacementReveal
      counterpartLabel={counterpartLabel}
      counterpartName={counterpartName}
      roleTitle={roleTitle}
      startDate={startDate}
      onViewPlacement={onViewPlacement}
    />
  );
}
