import {
  fitByDiscipline, roleFitScore, DISCIPLINE,
  type RoleBreakdown, type SkillsProfile
} from '@/lib/roles-public';
import { firstName } from '@/lib/words';

const TONE = { strong: 'good', covered: 'good', thin: 'warn', missing: 'crit' } as const;
const WORD = { strong: 'Strong', covered: 'Covered', thin: 'Thin', missing: 'Not done it' } as const;

/* Can this person do the job — discipline by discipline, competency by
   competency. The Signature answers whether two people will get on; this
   answers whether the work will get done. Both are needed. */
export default function RoleFit({ role, skills, name }: {
  role: RoleBreakdown | null; skills: SkillsProfile | null; name: string;
}) {
  const fits = fitByDiscipline(role, skills);
  if (!fits.length) return null;

  const score = roleFitScore(fits);
  const first = firstName(name);
  const missing = fits.flatMap(f => f.missingCore);

  return (
    <div className="rolefit">
      <div className="row between" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="eyebrow">Can they do the work</div>
        <span className={`pill ${score! >= 80 ? 'good' : score! >= 60 ? 'warn' : 'crit'}`}>
          {score}% of what you asked for
        </span>
      </div>

      <p className="small" style={{ marginBottom: 18 }}>
        {missing.length === 0
          ? `${first} can do everything you marked as a must-have.`
          : missing.length === 1
            ? `${first} covers almost all of it. One must-have, ${missing[0].label.toLowerCase()}, is something they have not done before.`
            : `${first} covers most of it, with ${missing.length} must-haves they have not done before.`}
      </p>

      {fits.map(f => (
        <div className="fit-disc" key={f.key}>
          <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <b>{f.name}</b>
            <div className="row" style={{ gap: 8 }}>
              {f.years != null && f.years > 0 && <span className="xs muted">{f.years} years</span>}
              <span className={`pill ${f.score >= 80 ? 'good' : f.score >= 60 ? 'warn' : 'crit'}`}>
                {f.score}%
              </span>
            </div>
          </div>

          <ul className="fit-list">
            {f.comps
              .slice()
              .sort((a, b) =>
                (a.verdict === 'missing' ? 0 : a.verdict === 'thin' ? 1 : 2) -
                (b.verdict === 'missing' ? 0 : b.verdict === 'thin' ? 1 : 2))
              .map(c => (
                <li key={c.comp} className={c.verdict}>
                  <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                    <span>{c.label}</span>
                    <div className="row" style={{ gap: 7 }}>
                      {c.need === 'core' && <span className="pill">Must have</span>}
                      <span className={`pill ${TONE[c.verdict]}`}>{WORD[c.verdict]}</span>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
