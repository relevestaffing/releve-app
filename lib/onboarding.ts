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
  hasSkills?: boolean;
  vettingDone?: number; vettingTotal?: number;
  /* Their own identity document: submitted, and verified. The agreement is
     Relève's to issue, so it is deliberately not part of their checklist. */
  vettingSent?: number; hasIdentity?: boolean;
  hasPayout?: boolean;
  hasIntroVideo?: boolean;
  /* Taking The Watch: the real-work test built from the disciplines they
     claim. 'none' while no discipline is claimed (nothing to test yet);
     otherwise whether every claimed discipline has cleared. The release
     gate in the console reads the same thing — this is the step that used
     to be enforced silently and asked for nowhere. */
  watch?: 'none' | 'cleared' | 'pending' | 'awaiting_review';
  /* An Invalid Signature counts as not done: it will not be matched. */
  signatureInvalid?: boolean;
}): Step[] {
  const cleared = o.vettingDone ?? 0, needed = o.vettingTotal ?? 3;
  const sent = o.vettingSent ?? 0;
  /* Their half of verification is the identity document. The agreement is
     issued and filed by Relève, so counting it here left this step showing as
     outstanding forever — through no fault of theirs, on the screen that tells
     them what is left to do. */
  const idDone = o.hasIdentity ?? (cleared >= needed);
  return [
    { key: 'vetting', title: 'Verify who you are', href: '/app/vetting', minutes: '5 min',
      blurb: idDone
        ? 'Verified. The signed agreement is ours to send and file — nothing more for you to do.'
        : sent > 0
          ? 'Sent, and with us. We check documents within one working day and will email you either way.'
          : 'Proof of identity. We check it once and never again, and it is never shown to an executive.',
      done: idDone, critical: true },
    { key: 'signature', title: o.signatureInvalid ? 'Retake the Talent Signature' : 'Take the Talent Signature',
      href: o.signatureInvalid ? '/app/signature?retake=1' : '/app/signature', minutes: '20–25 min',
      blurb: o.signatureInvalid
        ? 'Your last attempt did not pass its own checks, so it cannot be matched. Take it again when you have twenty uninterrupted minutes.'
        : 'How you work and who you are under pressure. Nothing is matched until this is done.',
      done: o.hasSignature && !o.signatureInvalid, critical: true },
    { key: 'skills', title: 'Break down your skills', href: '/app/skills', minutes: '8 min',
      blurb: 'Pick every kind of work you are good at — each opens its own breakdown. This is what decides the roles you are put forward for.',
      done: !!o.hasSkills, critical: true },
    { key: 'watch', title: 'Take the Watch', href: '/app/watch', minutes: '2½–3 hrs, per discipline',
      blurb: o.watch === 'awaiting_review'
        ? 'Submitted, and with us. Your Talent Success Manager reviews it within two working days and you will hear either way.'
        : o.watch === 'cleared'
          ? 'Cleared. You are eligible to be put forward for every discipline you claimed.'
          : o.watch === 'none'
            ? 'Comes after you pick your skills below — a real day of work in each discipline you claim, done once. Nobody is put in front of an executive without it.'
            : 'A real day of work in each discipline you claimed, done once. Nobody is put in front of an executive without it.',
      /* Only actually cleared counts as done. 'none' used to count as done
         too, on the idea that nothing is outstanding if nothing has been
         claimed yet — but the checklist renders "done" as a checkmark and
         "Done", so a talent who had done nothing at all saw Take the Watch
         marked complete, and the header's own count (done of total) was
         inflated by one before anyone had done anything. Order already
         keeps this from ever being pushed as "Start here" ahead of skills,
         since skills sits earlier in the list and won't be done either. */
      done: o.watch === 'cleared', critical: true },
    { key: 'availability', title: 'Set your availability', href: '/app/availability', minutes: '2 min',
      blurb: 'The hours you can genuinely take a call. Without this, no executive can book you.',
      done: o.hasAvailability, critical: true },
    { key: 'profile', title: 'Complete your profile', href: '/app/talent/edit', minutes: '5 min',
      blurb: 'Skills, experience and a short introduction — this is what an executive reads first.',
      done: o.hasProfile },
    { key: 'payout', title: 'Say how you want to be paid', href: '/app/pay', minutes: '2 min',
      blurb: 'Relève pays you directly each month. Doing this now means the first payment is not held up while we ask.',
      done: !!o.hasPayout },
    { key: 'photo', title: 'Add a photo', href: '/app/talent/edit#photo', minutes: '1 min',
      blurb: 'People hire people. A face makes a real difference to how a profile lands.',
      done: o.hasPhoto },
    { key: 'intro_video', title: 'Record a short introduction', href: '/app/talent/edit#video', minutes: '5 min',
      blurb: 'Thirty to sixty seconds of you, in your own voice. Executives read a lot of profiles — this is what makes yours stick.',
      done: !!o.hasIntroVideo }
  ];
}

export function clientSteps(o: {
  hasSignature: boolean; hasAvailability: boolean; hasIntro: boolean; hasRole?: boolean;
}): Step[] {
  return [
    { key: 'signature', title: 'Take the Executive Signature', href: '/app/signature', minutes: '15–20 min',
      blurb: 'How you run your day. Every candidate is scored against it before you see a name. It saves as you go — stop and come back whenever you like.',
      done: o.hasSignature, critical: true },
    { key: 'role', title: 'Break down the role', href: '/app/role', minutes: '10 min',
      blurb: 'Say what the role is, then answer questions specific to it. The more exact you are, the closer the match lands.',
      done: !!o.hasRole, critical: true },
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
