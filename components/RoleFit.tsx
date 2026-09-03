import { coverage, coverageScore, type RoleBreakdown, type SkillsProfile } from '@/lib/roles-public';

const TONE = { covered: 'good', stretch: 'warn', gap: 'crit' } as const;
const WORD = { covered: 'Covered', stretch: 'A stretch', gap: 'Gap' } as const;

/* The other half of the match. The Signature says whether two people will
   work well together; this says whether the person can do the job. Both are
   needed, and no agency in this category shows the client either one. */
export default function RoleFit({ role, skills, name, compact = false }: {
  role: RoleBreakdown | null; skills: SkillsProfile | null; name: string; compact?: boolean;
}) {
  const rows = coverage(role, skills);
  if (!rows.length) return null;

  const score = coverageScore(rows);
  const gaps = rows.filter(r => r.verdict === 'gap');
  const first = name.split(' ')[0];

  return (
    <div className={compact ? '' : 'card'}>
      {!compact && (
        <div className="card-head">
          <h3>Can they do the job?</h3>
          <span className={`pill ${score! >= 80 ? 'good' : score! >= 60 ? 'warn' : 'crit'}`}>
            {score}% of the role covered
          </span>
        </div>
      )}

      <p className="small" style={{ marginBottom: 16 }}>
        {gaps.length === 0
          ? `${first} covers every area this role hands over.`
          : gaps.some(g => g.need === 'all')
            ? `${first} covers most of it, but ${gaps.filter(g => g.need === 'all').length === 1
                ? 'one area you wanted handed over entirely is new to them'
                : `${gaps.filter(g => g.need === 'all').length} areas you wanted handed over entirely are new to them`}.`
            : `${first} covers the areas you own outright; the gaps are in shared work.`}
      </p>

      <ul className="fit-list">
        {rows.map(r => (
          <li key={r.key} className={r.verdict}>
            <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
              <b>{r.name}</b>
              <div className="row" style={{ gap: 8 }}>
                {r.need === 'all' && <span className="pill">Entirely theirs</span>}
                <span className={`pill ${TONE[r.verdict]}`}>{WORD[r.verdict]}</span>
              </div>
            </div>
            <p className="xs muted">{r.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
