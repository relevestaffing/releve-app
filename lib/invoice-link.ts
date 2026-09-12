/* Signed links for paying one invoice with no session required — the same
   shape as deposit-link.ts, and kept as its own file rather than folded into
   it so an already-issued deposit link keeps meaning exactly what it meant
   when it was sent. Reuses the same secret: it is one HMAC key for every
   link this app hands out, not a per-purpose credential to rotate. */
import { createHmac, timingSafeEqual } from 'crypto';

const SECRET = process.env.DEPOSIT_LINK_SECRET;
const DEFAULT_DAYS = 60;

export function invoiceLinkReady() { return Boolean(SECRET); }

export function signInvoiceLink(invoiceId: string, days = DEFAULT_DAYS): string {
  if (!SECRET) throw new Error('DEPOSIT_LINK_SECRET is not set on the server.');
  const expires = Date.now() + days * 86_400_000;
  const payload = `inv.${invoiceId}.${expires}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`, 'utf8').toString('base64url');
}

/* invoice ids are UUIDs, which never contain a ".", so a plain split is
   sound here in a way it would not be for a free-text field. */
export function verifyInvoiceLink(token: string): { invoiceId: string } | null {
  if (!SECRET) return null;
  let decoded: string;
  try { decoded = Buffer.from(token, 'base64url').toString('utf8'); } catch { return null; }

  const parts = decoded.split('.');
  if (parts.length !== 4 || parts[0] !== 'inv') return null;
  const [, invoiceId, expiresStr, sig] = parts;

  const expected = createHmac('sha256', SECRET).update(`inv.${invoiceId}.${expiresStr}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (!Number.isFinite(Number(expiresStr)) || Date.now() > Number(expiresStr)) return null;
  return { invoiceId };
}
