'use client';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';

/* Only rendered in demo mode. Lets you look at all three accounts
   without creating anything. */
export default function DemoSwitch({ current }: { current: string }) {
  const router = useRouter();
  async function to(role: string, reset = false) {
    const ok = await saving(() => fetch('/api/demo-role', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role, reset }) }), reset ? 'Sample data reset' : 'Switched');
    if (!ok) return;
    router.push(role === 'admin' ? '/console' : '/app');
    router.refresh();
  }
  return (
    <div className="demo-switch">
      <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 10 }}>Preview as</div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {[['client', 'Executive'], ['talent', 'Talent'], ['admin', 'Relève'], ['new', 'New sign-up']].map(([k, label]) => (
          <button key={k} onClick={() => to(k)} className={`demo-btn ${current === k ? 'on' : ''}`}>{label}</button>
        ))}
      </div>
      <button onClick={() => to(current, true)} className="demo-reset">
        Reset the sample data
      </button>
    </div>
  );
}
