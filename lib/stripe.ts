import { createHmac, timingSafeEqual } from 'crypto';

/* Stripe, without the SDK.
   ------------------------
   Deploys build on Sage's own Mac rather than on Netlify, so every dependency
   is something that has to install there before a release can happen. Stripe's
   API is form-encoded POSTs and JSON back; the only thing the library really
   buys is webhook signature checking, which is thirty lines of node crypto.
   So this is plain fetch, and the deploy stays a two-command job.

   The secret key never leaves the server and never appears with
   NEXT_PUBLIC_ in front of it — same rule as the Supabase secret. */

const API = 'https://api.stripe.com/v1';
const KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';

export function stripeReady() { return Boolean(KEY); }
export function webhookReady() { return Boolean(WEBHOOK_SECRET); }

/* Stripe takes nested data as bracketed form keys — payment_method_types[0],
   metadata[invoice_id] — so objects and arrays are flattened rather than sent
   as JSON. Getting this wrong fails quietly by ignoring the parameter, which
   is worse than an error. */
function encode(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') out.push(...encode(item as any, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === 'object') {
      out.push(...encode(v as any, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export class StripeError extends Error {
  code?: string;
  declineCode?: string;
  constructor(message: string, code?: string, declineCode?: string) {
    super(message);
    this.code = code;
    this.declineCode = declineCode;
  }
}

/* Throws with Stripe's own wording. Money is the one place where a swallowed
   failure is worse than a crash — the email log taught that lesson once. */
export async function stripeCall<T = any>(
  path: string,
  body?: Record<string, unknown>,
  opts?: { idempotencyKey?: string; method?: 'GET' | 'POST' }
): Promise<T> {
  if (!KEY) throw new StripeError('Stripe is not configured on the server (STRIPE_SECRET_KEY is unset).');

  const method = opts?.method ?? (body ? 'POST' : 'GET');
  const headers: Record<string, string> = {
    authorization: `Bearer ${KEY}`,
    'content-type': 'application/x-www-form-urlencoded'
  };
  /* Stripe deduplicates on this key for 24 hours. Every charge passes one, so
     a double-clicked button or a retried request cannot take the money twice. */
  if (opts?.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;

  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: body ? encode(body).join('&') : undefined,
    cache: 'no-store'
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as any)?.error ?? {};
    throw new StripeError(e.message ?? `Stripe refused that (${res.status}).`, e.code, e.decline_code);
  }
  return json as T;
}

/* ---------- webhook signatures ---------- */

/* Stripe signs the raw body. Parsing it first and re-serialising changes the
   bytes and the signature never matches, so the route must hand this the
   exact text it received. */
export function verifyWebhook(rawBody: string, signatureHeader: string | null, toleranceSeconds = 300): any {
  if (!WEBHOOK_SECRET) throw new StripeError('No STRIPE_WEBHOOK_SECRET is set, so webhooks cannot be trusted.');
  if (!signatureHeader) throw new StripeError('No signature on that request.');

  /* Stripe may send more than one v1 signature (during a secret roll, one per
     active secret). Keep every one of them, and accept the event if any
     matches. Collapsing the header into an object kept only the last v1. */
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') timestamp = v;
    else if (k === 'v1' && v) signatures.push(v);
  }
  if (!timestamp || !signatures.length) throw new StripeError('Malformed signature header.');

  /* An old signature is a replay. Five minutes is Stripe's own tolerance. */
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds)
    throw new StripeError('That signature is too old to trust.');

  const expected = Buffer.from(createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`, 'utf8').digest('hex'), 'utf8');

  /* Constant time, and length-checked first: timingSafeEqual throws on a
     length mismatch rather than returning false. */
  const matched = signatures.some(sig => {
    const b = Buffer.from(sig, 'utf8');
    return b.length === expected.length && timingSafeEqual(expected, b);
  });
  if (!matched) throw new StripeError('That signature does not match.');

  return JSON.parse(rawBody);
}
