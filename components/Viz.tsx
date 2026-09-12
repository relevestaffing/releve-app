/* Shared visual pieces — the same marks as the prototype. */
export function Radar({ series, size = 320, axes, note = true }: {
  series: { name: string; color: string; values: Record<string, number>; op?: number }[];
  size?: number; axes: { key: string; name: string }[]; note?: boolean;
}) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 58, n = axes.length;
  const ptr = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)] as const;
  };
  const pt = (i: number, v: number) => ptr(i, R * (v / 100));
  return (
    <div className="radar-wrap">
      <svg viewBox={`-58 -4 ${size + 116} ${size + 8}`} width={size + 116} height={size + 8}
        style={{ maxWidth: '100%', height: 'auto' }} role="img" aria-label="Relève Signature profile">
        {[25, 50, 75, 100].map(lvl => (
          <polygon key={lvl} points={axes.map((_, i) => pt(i, lvl).join(',')).join(' ')}
            fill="none" stroke="rgba(53,68,58,.14)" strokeWidth="1" />
        ))}
        {axes.map((a, i) => {
          const [x, y] = pt(i, 100), [lx, ly] = ptr(i, R + 18);
          const anch = Math.abs(lx - cx) < 6 ? 'middle' : lx > cx ? 'start' : 'end';
          const dy = Math.abs(lx - cx) < 6 ? (ly < cy ? -4 : 12) : 4;
          return (
            <g key={a.key}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(53,68,58,.12)" strokeWidth="1" />
              <text x={lx} y={ly + dy} textAnchor={anch} fontFamily="Marcellus,serif" fontSize="10"
                letterSpacing="1.4" fill="#7D9080">{a.name.toUpperCase()}</text>
            </g>
          );
        })}
        {series.map(s => (
          <g key={s.name}>
            <polygon points={axes.map((a, i) => pt(i, s.values[a.key] ?? 50).join(',')).join(' ')}
              fill={s.color} fillOpacity={s.op ?? 0.22} stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
            {axes.map((a, i) => {
              const [x, y] = pt(i, s.values[a.key] ?? 50);
              return <circle key={a.key} cx={x} cy={y} r="4" fill={s.color} stroke="#FAF8F2" strokeWidth="2" />;
            })}
          </g>
        ))}
      </svg>
      <div className="radar-legend">
        {series.map(s => (
          <div className="legend-key" key={s.name}>
            <span className="legend-swatch" style={{ background: s.color }} />
            <span>{s.name}</span>
          </div>
        ))}
        {note && <div className="small muted" style={{ maxWidth: 190, marginTop: 6 }}>
          Each spoke runs 0–100 from the low pole outward. Exact values are listed below.</div>}
      </div>
    </div>
  );
}

export function AxisBars({ values, axes, captions }: {
  values: Record<string, number>;
  axes: { key: string; name: string; lo: string; hi: string }[];
  captions?: Record<string, string>;
}) {
  return (
    <>
      {axes.map(a => {
        const v = values[a.key] ?? 50;
        return (
          <div className="axis-row" key={a.key}>
            <div className="axis-labels"><span>{a.lo}</span><b>{a.name} · {v}</b><span>{a.hi}</span></div>
            <div className="axis-track"><span className="axis-fill" style={{ width: `${v}%` }} /></div>
            {captions?.[a.key] && <div className="axis-caption">{captions[a.key]}</div>}
          </div>
        );
      })}
    </>
  );
}

/* Facet-level bars — the same track as AxisBars, but for the eighteen
   sub-measurements that sit under the six disposition traits. No lo/hi
   pole labels: a facet reads by name and a sentence, not by two adjectives. */
export function FacetBars({ items }: {
  items: { key: string; name: string; value: number; caption: string | null }[];
}) {
  return (
    <>
      {items.map(f => (
        <div className="axis-row" key={f.key}>
          <div className="axis-labels" style={{ justifyContent: 'space-between' }}>
            <b>{f.name}</b><span>{f.value}</span>
          </div>
          <div className="axis-track"><span className="axis-fill" style={{ width: `${f.value}%` }} /></div>
          {f.caption && <div className="axis-caption">{f.caption}</div>}
        </div>
      ))}
    </>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card tight">
      <div className="eyebrow" style={{ marginBottom: 12 }}>{label}</div>
      <div className="mono-num">{value}</div>
      {sub && <div className="small muted" style={{ marginTop: 8 }}>{sub}</div>}
    </div>
  );
}
export function Portrait({ id, name, cls, url }: { id: string; name: string; cls?: string; url?: string | null }) {
  /* a real photo when there is one; a calm generated plate when there is not */
  if (url) return <div className={`avatar ${cls ?? ''}`} role="img" aria-label={name}
    style={{ backgroundImage: `url("${url.replace(/"/g, '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />;
  const plates = [['#DDE5DC','#B0C4B2','#7D9080'],['#E6E2D8','#CDC7B6','#9A9280'],['#D8E1DA','#A9BFAE','#6E8574'],
                  ['#E9E5DC','#C8C2B0','#8E8A78'],['#D2DDD5','#9FB7A6','#61796A'],['#E2E6DF','#BCC9BB','#84947F']];
  const n = [...id].reduce((s, c) => s + c.charCodeAt(0), 0) % plates.length;
  const [a, b, c] = plates[n];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="39" r="16" fill="${c}" opacity=".5"/><path d="M17 95c0-19 15-31 33-31s33 12 33 31z" fill="${c}" opacity=".5"/></svg>`;
  return <div className={`avatar ${cls ?? ''}`} role="img" aria-label={name}
    style={{ backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")` }} />;
}
