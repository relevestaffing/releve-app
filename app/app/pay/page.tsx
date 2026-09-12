import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import PayoutForm from '@/components/PayoutForm';
import NextStep from '@/components/NextStep';
import { setupFor } from '@/lib/setup';
import { getPayout, listPayments, periodLabel } from '@/lib/payout';
import { money } from '@/lib/money-public';
import { supabaseServer, configured } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/words';

export const dynamic = 'force-dynamic';

export default async function PayPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'talent') redirect('/app');

  const payout = await getPayout(profile.id);
  const payments = await listPayments(profile.id);

  /* Their own rate, and only theirs. The client's number lives in another
     table that no policy admits them to. */
  let rate: number | null = null;
  if (configured()) {
    const sb = await supabaseServer();
    const { data } = await sb.from('my_pay').select('rate_month_cents').maybeSingle();
    rate = (data as any)?.rate_month_cents ?? null;
  }

  return (
    <Shell profile={profile} active="/app/pay" title="Your pay" crumb="What you are paid, and how it reaches you">
      {rate != null && (
        <div className="card">
          <div className="card-head"><h3>Your rate</h3></div>
          <div className="score" style={{ marginBottom: 4 }}>{money(rate)}</div>
          <p className="small muted" style={{ margin: 0 }}>
            A month, paid by Relève. This is what was agreed in your offer.
          </p>
        </div>
      )}

      <PayoutForm initial={payout} />

      <div className="card">
        <div className="card-head"><h3>Your payments</h3></div>
        {payments.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            Nothing yet. Once you are placed, every payment appears here with the date it
            was sent and a reference — so if anything ever goes missing, there is a record
            rather than a conversation.
          </p>
        ) : (
          <table className="data" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Month</th><th style={{ textAlign: 'right' }}>Amount</th><th>Sent</th><th>Reference</th></tr></thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td>{periodLabel(p.period_start)}</td>
                  <td className="amount">{money(p.amount_cents)}</td>
                  <td className="small">{p.sent_on ? fmtDate(p.sent_on)
                    : <span className="pill warn"><span className="dot" />Due</span>}</td>
                  <td className="xs muted">{p.reference ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NextStep steps={await setupFor(profile)} current="payout" />
    </Shell>
  );
}
