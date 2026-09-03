/* ============================================================
   PLAIN LANGUAGE
   The instrument speaks in axes and numbers. Executives and talent
   should not have to. This turns a scored profile into sentences
   a person reads once and understands.
   ============================================================ */
import { AXES, L1, L2 } from './signature/model';
import type { Scores } from './signature/model';
import type { Match } from './signature/score';

type Line = { key: string; text: string; strength: number };

const EXEC_LINES: Record<string, [string, string]> = {
  //            低 (score <= 40)                                   高 (score >= 60)
  tempo:        ['You decide deliberately and dislike being rushed.', 'You move fast and expect the people around you to keep up.'],
  direction:    ['You give the goal and stay out of the how.',        'You brief thoroughly before you hand anything over.'],
  cadence:      ['You would rather not be interrupted.',              'You want contact — live, and often.'],
  candor:       ['You give correction carefully.',                    'You say what is not working, plainly.'],
  initiative:   ['You want to be asked before anything moves.',       'You want the small calls made without you.'],
  structure:    ['You run on instinct more than process.',            'You want everything documented and systematised.'],
  composure:    ['Your world is steady and rarely urgent.',           'Your world moves fast enough to rattle most people.'],
  warmth:       ['You keep the working relationship contained.',      'You want a real relationship, not a transaction.'],
  rigor:        ['You would rather have it done than perfect.',       'You hold a high standard and notice when it slips.'],
  adaptability: ['What you need on Monday is what you need on Friday.','Your priorities can reverse in a day.'],
  assertion:    ['You make the calls; you do not need them argued.',  'You want to be told when you are wrong.'],
  drive:        ['This seat is stable rather than expanding.',        'This seat could grow into something much bigger.']
};

const TALENT_LINES: Record<string, [string, string]> = {
  tempo:        ['You work at a considered pace and get it right first time.', 'You move fast and refine as you go.'],
  direction:    ['You can run from a one-line brief.',                'You do your best work when the brief is explicit.'],
  cadence:      ['You do your best work in long, quiet stretches.',   'You keep people close and over-communicate on purpose.'],
  candor:       ['You handle people gently.',                         'You say the difficult thing plainly.'],
  initiative:   ['You work to what has been asked, precisely.',       'You fix things before anyone asks you to.'],
  structure:    ['You adapt as the day goes.',                        'You leave process behind you wherever you work.'],
  composure:    ['You do your best work when the pressure is even.',  'You get calmer as the pressure rises.'],
  warmth:       ['You let the work speak for itself.',                'People trust you quickly, and stay.'],
  rigor:        ['You keep things moving rather than perfect.',       'Nothing leaves your hands with an error in it.'],
  adaptability: ['You like to finish what you started.',              'A reversed priority costs you nothing.'],
  assertion:    ['You are easy to work with and rarely push back.',   'You will tell a principal plainly that they are wrong.'],
  drive:        ['You are content doing excellent work in a steady seat.', 'You are building toward something bigger.']
};

function lines(scores: Scores, table: Record<string, [string, string]>, n: number): string[] {
  const out: Line[] = AXES.map(a => {
    const v = scores[a.key] ?? 50;
    return { key: a.key, text: table[a.key][v >= 50 ? 1 : 0], strength: Math.abs(v - 50) };
  })
    .filter(l => l.strength >= 12)                 // only say something if it is actually pronounced
    .sort((a, b) => b.strength - a.strength);
  return out.slice(0, n).map(l => l.text);
}

export const execSelfLines = (s: Scores) => lines(s, EXEC_LINES, 4);
export const talentSelfLines = (s: Scores) => lines(s, TALENT_LINES, 4);

/* ---- client-facing sentences ----
   The internal notes are written for the console. These are written for
   someone who has never heard the word "axis". */
function clientNote(p: { axis: { key: string }; client: number; talent: number; score: number }, name: string): string | null {
  const k = p.axis.key, c = p.client, t = p.talent, d = t - c;
  const near = Math.abs(d) <= 12;
  const mid = (v: number) => v > 40 && v < 60;
  /* an agreement in the middle of a scale says nothing worth reading */
  if (near && mid(c) && mid(t)) return null;

  const A: Record<string, { same: string; higher: string; lower: string }> = {
    tempo: {
      same: c >= 60 ? `${name} moves fast, the way you do.` : `${name} works deliberately, the way you do.`,
      higher: `${name} moves faster than you do.`,
      lower: `${name} works more deliberately than you do — expect a little longer for a polished result.` },
    direction: {
      same: `${name} can run on the amount of direction you naturally give.`,
      higher: `${name} needs more explicit instruction than you tend to give. This is the thing most likely to cause friction.`,
      lower: `${name} needs less instruction than you tend to give — expect them to want more rope than you might offer.` },
    cadence: {
      same: c >= 60 ? `You both like frequent contact.` : `You both prefer to work quietly and check in rarely.`,
      higher: `${name} likes more contact than you do.`,
      lower: `${name} prefers more quiet than you do — you may find them less visible than you expect.` },
    candor: {
      same: c >= 60 ? `You are both direct. Nothing will need softening.` : `You both handle correction carefully.`,
      higher: `${name} is blunter than you are.`,
      lower: `${name} is gentler than you are — your directness may land harder than you intend.` },
    initiative: {
      same: `${name} takes the amount of ownership you want taken.`,
      higher: `${name} moves ahead of you more than you may want.`,
      lower: `${name} waits to be asked more than you would like.` },
    structure: {
      same: c >= 60 ? `You both run on documented process.` : `Neither of you needs heavy process.`,
      higher: `${name} builds more structure than you do — which may be exactly what you are missing.`,
      lower: `${name} works less systematically than you do.` },
    composure: {
      same: `${name} absorbs the kind of pressure your world carries.`,
      higher: `${name} is steadier than this role even demands.`,
      lower: `Your pace is heavier than ${name} is used to absorbing. Worth probing at interview.` },
    warmth: {
      same: c >= 60 ? `You both want a real working relationship, not a transaction.` : `You both keep things professional.`,
      higher: `${name} is warmer than you may need.`,
      lower: `${name} is more contained than you are.` },
    rigor: {
      same: `${name} holds the standard you hold.`,
      higher: `${name} is more exacting than you require — expect more time spent on polish than you may want.`,
      lower: `Your standard is higher than the one ${name} naturally works to.` },
    adaptability: {
      same: `${name} handles the amount of change your week carries.`,
      higher: `${name} copes with more change than this role will ever throw at them.`,
      lower: `Your priorities move more than ${name} is used to.` },
    assertion: {
      same: `${name} will push back about as much as you want to be pushed back on.`,
      higher: `${name} pushes back harder than you may invite.`,
      lower: `${name} defers more than you say you want — you may not hear it when they disagree.` },
    drive: { same: '', higher: '', lower: '' }
  };
  const set = A[k]; if (!set || !set.same) return null;
  return near ? set.same : d > 0 ? set.higher : set.lower;
}

/* One good thing and one thing to watch, in plain words. */
export function matchHeadline(m: Match, name: string): { good: string | null; watch: string | null } {
  const sorted = [...m.parts].sort((a, b) => b.score - a.score);
  const good = sorted.map(p => (p.score >= 80 ? clientNote(p, name) : null)).find(Boolean) ?? null;
  const worst = [...sorted].reverse().map(p => (p.score < 75 ? clientNote(p, name) : null)).find(Boolean) ?? null;
  return { good, watch: worst };
}

/* Conditions, said the way a person would say them. */
export function conditionNote(c: { label: string; state: string; note: string }, name: string): string {
  if (c.state === 'pass') return '';
  const M: Record<string, string> = {
    'Hours overlap': `${name} cannot cover as much of your day as this role needs.`,
    'Volume': `You send more work in a week than ${name} is used to carrying.`,
    'Discretion': `This role sees more sensitive material than ${name} has handled before.`,
    'Work mix': `This role is shaped differently from where ${name} works best.`,
    'Tools': `${name} is not yet fluent in one of the tools you run on.`
  };
  return M[c.label] ?? c.note;
}

/* A short verdict sentence for the top of a candidate card. */
export function fitSentence(m: Match, firstName: string): string {
  if (m.overall >= 90) return `${firstName} works almost exactly the way you do.`;
  if (m.overall >= 80) return `${firstName} fits how you work, with one thing to keep an eye on.`;
  if (m.overall >= 70) return `${firstName} could work, but it would take some adjustment on both sides.`;
  return `${firstName} works differently enough from you that we would not lead with them.`;
}

/* Talent: what this profile is good for, in one sentence. */
export function talentSummary(scores: Scores, archetypeName: string): string {
  const strongest = L2.map(a => ({ a, v: scores[a.key] ?? 50 }))
    .sort((x, y) => Math.abs(y.v - 50) - Math.abs(x.v - 50))[0];
  const word = (strongest.v >= 50 ? strongest.a.hi : strongest.a.lo).toLowerCase();
  return `Your profile came out as ${archetypeName}, and the thing that stands out most is how ${word} you are.`;
}
export { L1, L2 };
