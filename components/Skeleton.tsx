/* Building blocks for route-level loading.tsx skeletons.

   Kept apart from Shell on purpose: Shell needs a signed-in profile — its
   own data fetch — and the entire point of a loading skeleton is to paint
   something before that fetch (or the page's own) has resolved. So SkelShell
   below is a static stand-in for Shell's chrome (same .shell/.side/.topbar
   grid, shimmering bars instead of a real name and nav), and everything
   inside it reuses the *real* .card/table.data/.qa-grid/.money-strip/
   .attention classes so a skeleton's proportions can never drift from the
   page it is standing in for. */

export function Skel({
  className = '', style
}: { className?: string; style?: React.CSSProperties }) {
  return <span className={`skel skel-text ${className}`} style={style} aria-hidden="true" />;
}

/* The static chrome around a skeleton page: a fern sidebar silhouette and a
   topbar, in the same grid Shell renders once the real profile and nav are
   in hand. */
export function SkelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="skel-shell" aria-hidden="true">
      <aside className="skel-side">
        <div className="skel skel-side-logo on-dark" />
        <div className="skel-side-role">
          <Skel className="on-dark" style={{ width: '40%', height: '.65em', marginBottom: 10 }} />
          <Skel className="on-dark" style={{ width: '75%' }} />
        </div>
        <nav className="skel-side-nav">
          {Array.from({ length: 7 }).map((_, i) => <Skel key={i} className="on-dark" />)}
        </nav>
      </aside>
      <main className="skel-main">
        <div className="skel-topbar"><Skel /><Skel /></div>
        <div className="skel-page-body">{children}</div>
      </main>
    </div>
  );
}

/* A card with the real .card-head geometry — a title-width bar on the left,
   a pill on the right — so it sits exactly where the loaded card's own head
   will land. */
export function SkelCard({
  children, titleWidth = 150, tall
}: { children: React.ReactNode; titleWidth?: number; tall?: boolean }) {
  return (
    <div className="card" style={tall ? undefined : { paddingBottom: 22 }}>
      <div className="card-head">
        <Skel style={{ width: titleWidth, height: '1.05em', margin: 0 }} />
        <div className="skel skel-pill" />
      </div>
      {children}
    </div>
  );
}

/* A table.data skeleton: real header cells (so the columns already read
   correctly) and shimmering rows at the real row height and border. */
export function SkelTable({
  cols, rows = 5, firstColAvatar
}: { cols: string[]; rows?: number; firstColAvatar?: boolean }) {
  return (
    <table className="data skel-table">
      <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {cols.map((c, i) => (
              <td key={c}>
                {i === 0 && firstColAvatar ? (
                  <div className="row" style={{ gap: 12 }}>
                    <div className="skel skel-avatar" />
                    <Skel style={{ width: 120 }} />
                  </div>
                ) : (
                  <Skel style={{ width: i === 0 ? '70%' : '50%' }} />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
