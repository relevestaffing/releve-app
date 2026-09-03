/* ============================================================
   ONBOARDING
   What is still outstanding for this account, in the order it
   should be done. Nothing here blocks anything — it exists so
   nobody is ever unsure what is left.
   ============================================================ */
export type Step = {
  key: string; title: string; blurb: string; href: string;
  done: boolean; minutes?: string; critical?: boolean;
};

export function talentSteps(o: {
  hasSignature: boolean; hasAvailability: boolean; hasProfile: boolean; hasPhoto: boolean;
  vettingDone?: number; vettingTotal?: number;
}): Step[] {
  const cleared = o.vettingDone ?? 0, needed = o.vettingTotal ?? 3;
  return [
    { key: 'vetting', title: 'Verify who you are', href: '/app/vetting', minutes: '5 min',
      blurb: cleared === 0
        ? 'Identity, right to work, and the signed agreement. We check these once and never again.'
        : `${cleared} of ${needed} cleared. An executive is never shown a candidate who has not been verified.`,
      done: cleared >= needed, critical: true },
    { key: 'signature', title: 'Take the Talent Signature', href: '/app/signature', minutes: '20 min',
      blurb: 'How you work and who you are under pressure. Nothing is matched until this is done.',
      done: o.hasSignature, critical: true },
    { key: 'availability', title: 'Set your availability', href: '/app/availability', minutes: '2 min',
      blurb: 'The hours you can genuinely take a call. Without this, no executive can book you.',
      done: o.hasAvailability, critical: true },
    { key: 'profile', title: 'Complete your profile', href: '/app/talent/edit', minutes: '5 min',
      blurb: 'Skills, experience and a short introduction — this is what an executive reads first.',
      done: o.hasProfile },
    { key: 'photo', title: 'Add a photo', href: '/app/talent/edit', minutes: '1 min',
      blurb: 'People hire people. A face makes a real difference to how a profile lands.',
      done: o.hasPhoto }
  ];
}

export function clientSteps(o: { hasSignature: boolean; hasAvailability: boolean; hasIntro: boolean }): Step[] {
  return [
    { key: 'signature', title: 'Take the Executive Signature', href: '/app/signature', minutes: '13 min',
      blurb: 'How you run your day. Every candidate is scored against it before you see a name.',
      done: o.hasSignature, critical: true },
    { key: 'availability', title: 'Set your interview hours', href: '/app/availability', minutes: '2 min',
      blurb: 'When you are open to meeting candidates. We never offer anyone a slot outside these.',
      done: o.hasAvailability, critical: true },
    { key: 'intro', title: 'Add your photo and a short intro', href: '/app/profile', minutes: '3 min',
      blurb: 'What a candidate reads before they meet you. It is the difference between someone who prepared and someone who did not.',
      done: o.hasIntro }
  ];
}

export const progress = (steps: Step[]) => ({
  done: steps.filter(s => s.done).length,
  total: steps.length,
  complete: steps.every(s => s.done),
  next: steps.find(s => !s.done) ?? null
});
