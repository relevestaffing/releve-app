/* ============================================================
   SCORING · VALIDITY · MATCHING
   ⚠ SERVER ONLY — see the warning in model.ts.
   Answers come up from the browser; scores go down. The key
   never travels.
   ============================================================ */
import {
  AXES, AXIS, L1, L2, FACETS, facetsOf, INSTRUMENT, PAIRS, COND,
  CLIENT_TYPES, TALENT_TYPES, type Side, type Scores, type Conf, type Validity
} from './model';

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const val01 = (raw: number, sign: 1 | -1) => (sign === 1 ? (raw - 1) * 25 : (5 - raw) * 25);
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type ScoreResult = {
  scores: Scores;
  facets: Record<string, number>;
  validity: Validity;
  confidence: Record<string, Conf>;
};

export function scoreInstrument(
  side: Side,
  answers: (number | null)[],
  pairAnswers: ('a' | 'b' | null)[] | null,
  timings: number[]
): ScoreResult {
  const inst = INSTRUMENT[side];
  const bag: Record<string, number[]> = {};
  inst.items.forEach((it, i) => {
    const raw = answers[i];
    if (raw == null || it.kind === 'validity') return;
    (bag[it.key] = bag[it.key] || []).push(val01(raw, it.sign));
  });

  const facets: Record<string, number> = {};
  const scores: Scores = {};
  if (side === 'talent') {
    FACETS.forEach(f => {
      const a = bag[f.key] || [];
      facets[f.key] = a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 50;
    });
    L2.forEach(t => {
      const fs = facetsOf(t.key).map(f => facets[f.key]);
      scores[t.key] = Math.round(fs.reduce((x, y) => x + y, 0) / fs.length);
    });
  } else {
    L2.forEach(t => {
      const a = bag[t.key] || [];
      scores[t.key] = a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 50;
    });
  }
  L1.forEach(a => {
    const arr = bag[a.key] || [];
    scores[a.key] = arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : 50;
  });

  /* forced choice — ±4, so no one can inflate every trait at once */
  if (pairAnswers) {
    pairAnswers.forEach((choice, i) => {
      if (!choice) return;
      const p = PAIRS[i];
      const up = choice === 'a' ? p.a.t : p.b.t;
      const dn = choice === 'a' ? p.b.t : p.a.t;
      scores[up] = clamp((scores[up] ?? 50) + 4);
      scores[dn] = clamp((scores[dn] ?? 50) - 4);
    });
  }

  const validity = scoreValidity(side, answers, timings);
  const confidence: Record<string, Conf> = {};
  L2.forEach(t => {
    if (side === 'talent') {
      const fs = facetsOf(t.key).map(f => facets[f.key]);
      confidence[t.key] = confFrom(Math.max(...fs) - Math.min(...fs), validity);
    } else confidence[t.key] = confFrom(18, validity);
  });
  return { scores, facets, validity, confidence };
}

function confFrom(spread: number, validity: Validity): Conf {
  let band = Math.round(spread / 4 + 3);
  let level: Conf['level'] = spread <= 20 ? 'High' : spread <= 35 ? 'Moderate' : 'Low';
  if (validity.verdict === 'Review') { band += 4; level = level === 'High' ? 'Moderate' : 'Low'; }
  if (validity.verdict === 'Invalid') { band += 9; level = 'Low'; }
  return { level, band };
}

/* Thresholds loosened 3 Sept 2026. They were catching honest people: an
   impression-management flag fired at an average of "Often" across four
   never-statements, which a generous but truthful executive would trip.
   A flag now means "worth a look", and Invalid means something is genuinely
   wrong — not merely flattering. */
export function scoreValidity(side: Side, answers: (number | null)[], timings: number[]): Validity {
  const inst = INSTRUMENT[side];
  const flags: Validity['flags'] = [];
  const imVals: number[] = [], incon: number[] = [];
  let attFails = 0;

  inst.items.forEach((it, i) => {
    if (it.kind !== 'validity') return;
    const raw = answers[i];
    if (raw == null) return;
    if (it.vkind === 'att') { if (raw !== it.expect) attFails++; return; }
    if (it.vkind === 'dup') {
      const j = inst.items.findIndex(x => x.text === it.of);
      if (j >= 0 && answers[j] != null) incon.push(Math.abs((answers[j] as number) - raw));
      return;
    }
    imVals.push(raw);
  });

  const im = imVals.length ? Math.round((imVals.reduce((a, b) => a + b, 0) / imVals.length - 1) * 25) : 0;
  const inconsistency = incon.length ? Math.round((incon.reduce((a, b) => a + b, 0) / incon.length) * 25) : 0;
  const given = answers.filter((x): x is number => x != null);
  const extreme = given.length ? Math.round((given.filter(x => x === 1 || x === 5).length / given.length) * 100) : 0;
  let run = 1, longest = 1;
  for (let i = 1; i < given.length; i++) {
    if (given[i] === given[i - 1]) { run++; longest = Math.max(longest, run); } else run = 1;
  }
  const medSec = timings.length ? median(timings) : null;

  if (im >= 82) flags.push({ k: 'Impression management', v: `${im}/100`, d: 'Endorsed implausibly flattering statements — trait highs may be inflated.' });
  if (attFails > 0) flags.push({ k: 'Attention checks', v: `${attFails} failed`, d: 'Instructed-response items were answered incorrectly.' });
  if (inconsistency >= 52) flags.push({ k: 'Inconsistency', v: `${inconsistency}/100`, d: 'Near-duplicate items were answered differently.' });
  if (longest >= 15) flags.push({ k: 'Straight-lining', v: `${longest} in a row`, d: 'A long run of identical answers suggests low engagement.' });
  if (extreme >= 88) flags.push({ k: 'Extreme responding', v: `${extreme}%`, d: 'Almost every answer sat at one end of the scale.' });
  if (medSec != null && medSec < 1.2) flags.push({ k: 'Completion speed', v: `${medSec.toFixed(1)}s per item`, d: 'Completed faster than the items can reasonably be read.' });

  const hard = (im >= 93 ? 1 : 0) + (attFails >= 2 ? 1 : 0) + (inconsistency >= 72 ? 1 : 0);
  const verdict: Validity['verdict'] = hard > 0 ? 'Invalid' : flags.length ? 'Review' : 'Valid';
  return { verdict, im, attFails, inconsistency, extreme, straight: longest, medSec, flags };
}

/* ---- archetypes ---- */
export function archetype(scores: Scores, side: Side) {
  const pool = side === 'client' ? CLIENT_TYPES : TALENT_TYPES;
  let best = pool[0], bd = Infinity;
  pool.forEach(t => {
    let d = 0;
    L1.forEach((a, i) => { const x = (scores[a.key] ?? 50) - t.v[i]; d += x * x; });
    if (d < bd) { bd = d; best = t; }
  });
  return best;
}
const TRAIT_WORDS: Record<string, [string, string]> = {
  composure: ['Rattles', 'Unshakeable'], warmth: ['Contained', 'Warm'], rigor: ['Pragmatic', 'Exacting'],
  adaptability: ['Settled', 'Fluid'], assertion: ['Deferential', 'Forthright'], drive: ['Settled', 'Driven']
};
export function dispositionLine(scores: Scores) {
  return L2.map(a => ({ a, v: scores[a.key] ?? 50, dist: Math.abs((scores[a.key] ?? 50) - 50) }))
    .sort((x, y) => y.dist - x.dist).slice(0, 2)
    .map(r => TRAIT_WORDS[r.a.key][r.v >= 50 ? 1 : 0]).join(' · ');
}
export const axisWord = (key: string, v: number) => {
  const a = AXIS[key];
  return v >= 70 ? a.hi : v <= 30 ? a.lo : 'Balanced';
};

/* ---- conditions ---- */
export type CondSet = { overlap: string; volume: string; discretion: string; mix: string; tools: string[]; never?: string };
const ordIdx = (k: string, v: string) => COND.find(c => c.key === k)!.ord.indexOf(v);
export function conditionCheck(c?: CondSet | null, t?: CondSet | null) {
  if (!c || !t) return [];
  const out: { label: string; state: 'pass' | 'warn' | 'fail'; note: string }[] = [];
  (['overlap', 'volume', 'discretion'] as const).forEach(k => {
    const need = ordIdx(k, c[k]), has = ordIdx(k, t[k]);
    const cd = COND.find(x => x.key === k)!;
    out.push({
      label: cd.label,
      state: has >= need ? 'pass' : need - has === 1 ? 'warn' : 'fail',
      note: has >= need ? `Meets the requirement (${t[k]}).` : `Requires ${c[k]}; talent offers ${t[k]}.`
    });
  });
  out.push({
    label: 'Work mix',
    state: c.mix === t.mix ? 'pass' : c.mix === 'Balanced' || t.mix === 'Balanced' ? 'warn' : 'fail',
    note: c.mix === t.mix ? `Both set to ${t.mix.toLowerCase()}.` : `Role is ${c.mix.toLowerCase()}; talent prefers ${t.mix.toLowerCase()}.`
  });
  const missing = (c.tools || []).filter(x => !(t.tools || []).includes(x));
  out.push({
    label: 'Tools',
    state: !missing.length ? 'pass' : missing.length <= 1 ? 'warn' : 'fail',
    note: missing.length ? `Not yet fluent in ${missing.join(', ')}.` : 'Fluent in every tool required.'
  });
  return out;
}

/* ---- matching ---- */
export type MatchPart = { axis: typeof AXES[number]; client: number; talent: number; score: number; note: string };
export type Match = {
  overall: number; parts: MatchPart[]; band: { k: string; c: string };
  l1: number; l2: number;
  drive: { level: string; note: string };
  confidence: { level: string; why: string };
};
export function matchScore(
  c: Scores, t: Scores,
  opts?: { validity?: Validity | null; confidence?: Record<string, Conf> | null }
): Match {
  const parts: MatchPart[] = AXES.filter(a => a.type !== 'flag').map(a => {
    const cv = c[a.key] ?? 50, tv = t[a.key] ?? 50, diff = tv - cv;
    let s: number, note: string;
    if (a.type === 'align') {
      s = 100 - Math.abs(diff) * (a.k ?? 1);
      note = Math.abs(diff) <= 12
        ? `Both sit at ${label(a, cv)} — no translation needed.`
        : diff > 0
          ? `Talent runs more ${a.hi.toLowerCase()} than the executive (${Math.abs(diff)} pts apart).`
          : `Talent runs more ${a.lo.toLowerCase()} than the executive (${Math.abs(diff)} pts apart).`;
    } else if (a.type === 'supply') {
      const deficit = Math.max(0, tv - cv), surplus = Math.max(0, cv - tv);
      s = 100 - deficit * (a.def ?? 1.5) - surplus * (a.sur ?? 0.5);
      note = deficit > 14
        ? 'Talent needs more explicit direction than this executive gives — the main risk in this pairing.'
        : surplus > 28
          ? 'Executive briefs more heavily than this talent requires; expect them to want more rope.'
          : 'Direction given and direction needed are in balance.';
    } else if (a.type === 'demand') {
      const deficit = Math.max(0, cv - tv), surplus = Math.max(0, tv - cv);
      s = 100 - deficit * (a.def ?? 1.5) - surplus * (a.sur ?? 0.5);
      note = deficit > 14 ? demandNote(a.key, 'short') : surplus > 30 ? demandNote(a.key, 'over') : demandNote(a.key, 'ok');
    } else {
      const ideal = clamp(cv + (a.off ?? 0)), gap = Math.abs(tv - ideal);
      s = 100 - gap * (a.k ?? 1);
      note = gap <= 12
        ? 'Talent will push back about as much as this executive wants.'
        : tv < ideal
          ? 'Talent defers more than this executive wants to be deferred to; expect unspoken disagreement.'
          : 'Talent holds ground harder than this executive invites; expect friction over decisions.';
    }
    return { axis: a, client: cv, talent: tv, score: Math.round(clamp(s)), note };
  });
  const overall = Math.round(parts.reduce((s, p) => s + p.score * p.axis.w, 0));
  const weighted = (ps: MatchPart[]) => {
    const w = ps.reduce((s, p) => s + p.axis.w, 0);
    return Math.round(ps.reduce((s, p) => s + p.score * p.axis.w, 0) / w);
  };
  return {
    overall, parts, band: band(overall),
    l1: weighted(parts.filter(p => p.axis.layer === 1)),
    l2: weighted(parts.filter(p => p.axis.layer === 2)),
    drive: driveFlag(c, t),
    confidence: matchConfidence(opts)
  };
}
function matchConfidence(opts?: { validity?: Validity | null; confidence?: Record<string, Conf> | null }) {
  const v = opts?.validity, conf = opts?.confidence;
  let level = 'High', why = 'Profile verified; trait facets agree.';
  if (conf) {
    const lows = Object.values(conf).filter(c => c.level === 'Low').length;
    const mods = Object.values(conf).filter(c => c.level === 'Moderate').length;
    if (lows >= 2) { level = 'Low'; why = `${lows} traits scored with low internal agreement.`; }
    else if (lows || mods >= 3) { level = 'Moderate'; why = 'Some traits scored with mixed facet agreement.'; }
  }
  if (v) {
    if (v.verdict === 'Invalid') { level = 'Low'; why = 'Profile failed validity checks — re-test before relying on this score.'; }
    else if (v.verdict === 'Review' && level === 'High') { level = 'Moderate'; why = 'Profile flagged for review on a validity check.'; }
  }
  return { level, why };
}
function demandNote(key: string, k: 'short' | 'over' | 'ok') {
  const M: Record<string, Record<string, string>> = {
    initiative: {
      short: 'Executive expects more anticipation than this talent naturally brings.',
      over: 'Talent moves ahead of what this executive wants decided without them.',
      ok: 'Ownership expected and ownership offered line up.'
    },
    composure: {
      short: 'This environment carries more pressure than the talent has shown they absorb — the likeliest source of burnout here.',
      over: 'Talent is steadier than this role demands; no risk, simply unused capacity.',
      ok: 'Talent absorbs the pressure this role carries.'
    },
    rigor: {
      short: 'Executive holds a higher standard than this talent naturally works to.',
      over: 'Talent is more exacting than the executive requires; may slow work the executive wanted fast.',
      ok: 'Standards held on both sides are aligned.'
    },
    adaptability: {
      short: 'Priorities move here more than this talent absorbs comfortably.',
      over: 'Talent is more fluid than this role needs; nothing at risk.',
      ok: 'Talent handles the amount of change this role carries.'
    }
  };
  return M[key][k];
}
function driveFlag(c: Scores, t: Scores) {
  const gap = (t.drive ?? 50) - (c.drive ?? 50);
  if (gap > 25) return { level: 'Watch', note: 'Talent wants materially more growth than this seat offers. Retention risk beyond 12 months — brief the client on a widening scope.' };
  if (gap < -25) return { level: 'Watch', note: 'The executive expects someone building a career; this talent is content in a steady role. Expect the growth on offer to go unused.' };
  return { level: 'Clear', note: 'Growth on offer and growth wanted are compatible.' };
}
const label = (a: typeof AXES[number], v: number) => (v >= 66 ? a.hi.toLowerCase() : v <= 33 ? a.lo.toLowerCase() : 'the middle');
const band = (v: number) =>
  v >= 90 ? { k: 'Exceptional', c: 'good' } :
  v >= 80 ? { k: 'Strong', c: 'good' } :
  v >= 70 ? { k: 'Workable', c: 'warn' } : { k: 'Friction', c: 'crit' };

/* ---- bench norms ---- */
export function percentile(value: number, pool: number[]) {
  if (!pool.length) return null;
  const below = pool.filter(v => v < value).length, equal = pool.filter(v => v === value).length;
  return Math.round(((below + equal / 2) / pool.length) * 100);
}
export const pctLabel = (p: number | null) =>
  p == null ? '—' : p >= 90 ? 'Top 10% of the roster' : p >= 75 ? 'Upper quartile' : p >= 25 ? 'Mid-range' : 'Lower quartile';
