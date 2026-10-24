
/* Paying talent through PayPal and Wise, from one button.
   -------------------------------------------------------
   Sage, 19 October 2026: one-click payouts. Until now Relève prepared a Wise
   batch file and a person uploaded it; this sends each payment straight
   through the official APIs instead.

   It never runs on its own. Nothing here is called by a cron or a webhook:
   money only moves when the owner presses Pay in the console, and the route
   that calls this checks that first.

   Both providers are told the exact payment id, so pressing Pay twice cannot
   pay somebody twice. PayPal refuses a sender_batch_id it has already seen,
   and Wise refuses a customerTransactionId it has already seen. A retry after
   a failure uses a fresh id on purpose, because the first one is spent.

   Credentials live in Netlify's environment, never in a file:
     PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (live | sandbox)
     WISE_API_TOKEN, WISE_PROFILE_ID, WISE_ENV (live | sandbox)
   With a provider's variables missing, its button simply does not appear. */

export type SendResult =
  | { ok: true; reference: string; status: string; feeCents?: number | null }
  | { ok: false; error: string };

export function payoutProviders() {
  return {
    paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    wise: Boolean(process.env.WISE_API_TOKEN && process.env.WISE_PROFILE_ID)
  };
}

const dollars = (cents: number) => (cents / 100).toFixed(2);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/* ---------------- PayPal Payouts ---------------- */

function paypalBase() {
  return process.env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}

async function paypalToken(): Promise<string> {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const r = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    cache: 'no-store'
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('PayPal did not accept Relève\'s credentials. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in Netlify.');
  return d.access_token as string;
}

export async function sendPayPal(p: { batchId: string; itemId: string; email: string; cents: number; note: string }): Promise<SendResult> {
  if (!isEmail(p.email)) return { ok: false, error: 'The PayPal email on file is not a valid email address.' };
  try {
    const token = await paypalToken();
    const r = await fetch(`${paypalBase()}/v1/payments/payouts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: p.batchId,
          email_subject: 'Your pay from Relève',
          email_message: p.note
        },
        items: [{
          recipient_type: 'EMAIL',
          receiver: p.email.trim(),
          amount: { value: dollars(p.cents), currency: 'USD' },
          note: p.note,
          sender_item_id: p.itemId
        }]
      }),
      cache: 'no-store'
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const why = d?.message || d?.name || `PayPal answered ${r.status}`;
      return { ok: false, error: `PayPal did not send it: ${why}` };
    }
    return { ok: true, reference: d?.batch_header?.payout_batch_id ?? p.batchId, status: d?.batch_header?.batch_status ?? 'PENDING' };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'PayPal could not be reached.' };
  }
}

/** Where a PayPal payout has got to: SUCCESS, PENDING, UNCLAIMED, FAILED… */
export async function paypalStatus(batchId: string): Promise<{ status: string; feeCents: number | null } | null> {
  try {
    const token = await paypalToken();
    const r = await fetch(`${paypalBase()}/v1/payments/payouts/${encodeURIComponent(batchId)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
    });
    if (!r.ok) return null;
    const d = await r.json();
    const item = d?.items?.[0];
    const fee = item?.payout_item_fee?.value ? Math.round(Number(item.payout_item_fee.value) * 100) : null;
    return { status: item?.transaction_status ?? d?.batch_header?.batch_status ?? 'PENDING', feeCents: fee };
  } catch { return null; }
}

/* ---------------- Wise ---------------- */

function wiseBase() {
  return process.env.WISE_ENV === 'sandbox' ? 'https://api.sandbox.transferwise.tech' : 'https://api.wise.com';
}

async function wise(path: string, body?: unknown) {
  const r = await fetch(`${wiseBase()}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${process.env.WISE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const why = d?.errors?.[0]?.message || d?.message || d?.error || `Wise answered ${r.status}`;
    throw new Error(why);
  }
  return d;
}

/* Dollars to dollars, delivered in full: the quote fixes the TARGET amount,
   so Wise's fee comes out of Relève's balance and the talent receives exactly
   what they are owed (Sage's call, 12 October). They convert inside Wise. */
export async function sendWise(p: { transactionId: string; email: string; name: string; cents: number; reference: string }): Promise<SendResult> {
  if (!isEmail(p.email)) return { ok: false, error: 'The Wise email on file is not a valid email address.' };
  const profile = Number(process.env.WISE_PROFILE_ID);
  try {
    const quote = await wise(`/v3/profiles/${profile}/quotes`, {
      sourceCurrency: 'USD', targetCurrency: 'USD', targetAmount: Number(dollars(p.cents)), payOut: 'BALANCE'
    });
    const recipient = await wise('/v1/accounts', {
      profile, currency: 'USD', type: 'email', accountHolderName: p.name, details: { email: p.email.trim() }
    });
    const transfer = await wise('/v1/transfers', {
      targetAccount: recipient.id, quoteUuid: quote.id, customerTransactionId: p.transactionId,
      details: { reference: p.reference.slice(0, 35) }
    });
    const funded = await wise(`/v3/profiles/${profile}/transfers/${transfer.id}/payments`, { type: 'BALANCE' });
    if (funded?.status && funded.status !== 'COMPLETED')
      return { ok: false, error: `Wise created the transfer but did not fund it (${funded.errorCode ?? funded.status}). Check the Wise balance.` };
    const fee = quote?.paymentOptions?.find((o: any) => o.payIn === 'BALANCE')?.fee?.total;
    return { ok: true, reference: String(transfer.id), status: 'FUNDED', feeCents: fee != null ? Math.round(Number(fee) * 100) : null };
  } catch (e: any) {
    return { ok: false, error: `Wise did not send it: ${e?.message ?? 'Wise could not be reached.'}` };
  }
}

export async function wiseStatus(transferId: string): Promise<string | null> {
  try { const d = await wise(`/v1/transfers/${encodeURIComponent(transferId)}`); return d?.status ?? null; }
  catch { return null; }
}
