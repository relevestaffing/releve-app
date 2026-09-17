import { SkelShell, SkelCard, SkelTable, Skel } from '@/components/Skeleton';

/* Shown the instant a navigation to /console starts, while the real page
   awaits consoleSnapshot() — replaces the console's busiest screen's old
   blank wait with the same shape it is about to become: six launcher
   tiles, the Today card, the money/pipeline/roster rail, and the live
   placements table. See PreLaunch Audit, P1. */
export default function Loading() {
  return (
    <SkelShell>
      <div className="qa-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="qa-tile" key={i}>
            <div className="skel skel-avatar" style={{ width: 21, height: 21, borderRadius: 5 }} />
            <div style={{ flex: 1 }}>
              <Skel style={{ width: '70%', height: '1em' }} />
              <Skel style={{ width: '90%' }} />
            </div>
          </div>
        ))}
      </div>

      <SkelCard titleWidth={70}>
        <ul className="attention">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <div className="skel skel-avatar" style={{ borderRadius: 8 }} />
              <div className="att-body"><Skel style={{ width: '80%' }} /></div>
              <div className="skel skel-pill" />
            </li>
          ))}
        </ul>
      </SkelCard>

      <div className="overview-grid">
        <div className="stack overview-stats">
          {[4, 5, 4].map((n, gi) => (
            <div key={gi}>
              <Skel style={{ width: 110, height: '1em', margin: '0 0 12px' }} />
              <div className="money-strip">
                {Array.from({ length: n }).map((_, i) => (
                  <div className="money-stat" key={i}>
                    <Skel style={{ width: '55%', height: '1.4em' }} />
                    <Skel style={{ width: '75%', marginTop: 7 }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card overview-table">
          <div className="card-head">
            <Skel style={{ width: 130, height: '1.05em', margin: 0 }} />
            <div className="skel skel-pill" style={{ width: 100 }} />
          </div>
          <SkelTable cols={['Executive', 'Talent', 'Rate', 'Health']} rows={5} />
        </div>
      </div>
    </SkelShell>
  );
}
