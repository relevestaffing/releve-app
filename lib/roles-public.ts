/* THE ROLE BREAKDOWN AND THE SKILLS PROFILE

   Both branch on discipline. The executive names the role — executive
   assistance, social media, bookkeeping — and the questions that follow are
   specific to it. The talent picks every discipline they are actually strong
   in and answers the same specific questions for each.

   That is the whole differentiator. "Good at social media" is not a
   qualification; "can run a paid budget over $10k, edits short-form, owns the
   calendar end to end, has never touched influencer outreach" is.

   Client-safe: types and arithmetic only. */
import { DISCIPLINES, DISCIPLINE, compsOf, type Need, type Prof } from './disciplines';

export * from './disciplines';
export { DISCIPLINES, DISCIPLINE, compsOf };

/* ---------- what the executive saves ---------- */
export type RoleBreakdown = {
  /* the disciplines this role is made of, most important first */
  disciplines: string[];
  /* "ea.inbox_triage" -> core | useful | no */
  needs: Record<string, Need>;
  /* "ea.inbox_volume" -> the answer */
  details: Record<string, string>;
  /* the same for every role, whatever the discipline */
  priorities: string;
  never: string;
  tools: string;
  success: string;
  hours: string;
};

/* ---------- what the talent saves ---------- */
export type SkillsProfile = {
  /* every discipline they claim, each with its own breakdown */
  disciplines: string[];
  /* "social.shortform" -> none | learning | solid | deep */
  levels: Record<string, Prof>;
  details: Record<string, string>;
  /* years in each discipline: "social" -> 4 */
  years: Record<string, number>;
  /* which one they would call their home discipline */
  primary: string;
  best: string;
  growing: string;
  tools: string;
};

export const key = (discipline: string, item: string) => `${discipline}.${item}`;

/* One shared source for the "you picked nothing" validation copy on both
   sides of this form, so the executive's and the talent's wording can't
   quietly drift apart from being hand-typed in two components. The words
   still differ — "this role" versus "you" — because the audiences do. */
export const PICK_ONE_DISCIPLINE = {
  role: 'Pick at least one kind of work first.',
  skills: 'Pick at least one kind of work you are good at.'
} as const;

/* ---------- how complete is each side ---------- */
export function roleComplete(r: RoleBreakdown | null): boolean {
  if (!r?.disciplines?.length) return false;
  return r.disciplines.every(d => compsOf(d).every(c => r.needs?.[key(d, c.key)]));
}
export function skillsComplete(s: SkillsProfile | null): boolean {
  if (!s?.disciplines?.length) return false;
  return s.disciplines.every(d => compsOf(d).every(c => s.levels?.[key(d, c.key)]));
}

/* ---------- comparing the two ---------- */
const NEED_W: Record<Need, number> = { core: 3, useful: 1, no: 0 };
const HAS_W: Record<Prof, number> = { none: 0, learning: 1, solid: 2, deep: 3 };

export type CompFit = {
  discipline: string; comp: string; label: string; hint: string;
  need: Need; have: Prof;
  verdict: 'strong' | 'covered' | 'thin' | 'missing';
};

export type DisciplineFit = {
  key: string; name: string;
  score: number;                 // 0-100 for this discipline
  years: number | null;
  comps: CompFit[];
  missingCore: CompFit[];
};

function verdictOf(need: Need, have: Prof): CompFit['verdict'] {
  if (need === 'no') return 'covered';
  if (HAS_W[have] === 0) return 'missing';
  if (need === 'core' && HAS_W[have] === 1) return 'thin';
  if (need === 'core' && HAS_W[have] >= 3) return 'strong';
  if (need === 'useful' && HAS_W[have] >= 2) return 'strong';
  return 'covered';
}

export function fitByDiscipline(
  role: RoleBreakdown | null, skills: SkillsProfile | null
): DisciplineFit[] {
  if (!role?.disciplines?.length || !skills) return [];

  return role.disciplines.map(d => {
    const def = DISCIPLINE[d];
    const comps: CompFit[] = compsOf(d)
      .map(c => {
        const need = role.needs?.[key(d, c.key)] ?? 'no';
        const have = skills.levels?.[key(d, c.key)] ?? 'none';
        return { discipline: d, comp: c.key, label: c.label, hint: c.hint,
                 need, have, verdict: verdictOf(need, have) };
      })
      .filter(c => c.need !== 'no');

    const total = comps.reduce((n, c) => n + NEED_W[c.need], 0);
    const got = comps.reduce((n, c) =>
      n + NEED_W[c.need] * Math.min(1, HAS_W[c.have] / Math.max(1, NEED_W[c.need] === 3 ? 2 : 1)), 0);

    return {
      key: d, name: def?.name ?? d,
      score: total ? Math.round((got / total) * 100) : 0,
      years: skills.years?.[d] ?? null,
      comps,
      missingCore: comps.filter(c => c.need === 'core' && c.verdict === 'missing')
    };
  });
}

/* One number for the shortlist and the console. Weighted so the discipline
   the executive named first counts most. */
export function roleFitScore(fits: DisciplineFit[]): number | null {
  if (!fits.length) return null;
  const w = (i: number) => (i === 0 ? 3 : i === 1 ? 2 : 1);
  const total = fits.reduce((n, _, i) => n + w(i), 0);
  return Math.round(fits.reduce((n, f, i) => n + f.score * w(i), 0) / total);
}

/* The role, in one line, for a heading. */
export function roleShape(r: RoleBreakdown | null): string {
  if (!r?.disciplines?.length) return '';
  const names = r.disciplines.map(d => DISCIPLINE[d]?.name ?? d);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* What the talent leads with. */
export function skillsShape(s: SkillsProfile | null): string {
  if (!s?.disciplines?.length) return '';
  const ordered = [s.primary, ...s.disciplines.filter(d => d !== s.primary)].filter(Boolean);
  return ordered.map(d => {
    const y = s.years?.[d];
    return `${DISCIPLINE[d]?.name ?? d}${y ? ` (${y}y)` : ''}`;
  }).join(' · ');
}
