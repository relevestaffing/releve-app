/* Signed links for the one payment Relève needs before an account exists.
   -----------------------------------------------------------------------
   Everything else in this app that reaches someone by email points them
   back to a session — sign in, then act. The deposit is the one exception:
   Nona wants it payable straight from the onboarding email, before the
   discovery-call lead has ever signed in, because that payment is the sale
   closing. So the link itself has to carry its own authority rather than
   borrow a session's — a compact HMAC over the search id and an expiry,
   the same shape and the same check Stripe's own webhook signature uses. */
import { createHmac, timingSafeEqual } from 'crypto';

const SECRET = process.env.DEPOSIT_LINK_SECRET;
const DEFAULT_DAYS = 45;   // longer than a Checkout session's own 24h, on purpose

export function depositLinkReady() { return Boolean(SECRET); }

export function signDepositLink(searchId: string, days = DEFAULT_DAYS): string {
  if (!SECRET) throw new Error('DEPOSIT_LINK_SECRET is not set on the server.');
  const expires = Date.now() + days * 86_400_000;
  const payload = `${searchId}.${expires}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`, 'utf8').toString('base64url');
}

export function verifyDepositLink(token: string): { searchId: string } | null {
  if (!SECRET) return null;
  let decoded: string;
  try { decoded = Buffer.from(token, 'base64url').toString('utf8'); } catch { return null; }

  const firstDot = decoded.indexOf('.');
  const lastDot = decoded.lastIndexOf('.');
  if (firstDot < 0 || lastDot <= firstDot) return null;
  const searchId = decoded.slice(0, firstDot);
  const expiresStr = decoded.slice(firstDot + 1, lastDot);
  const sig = decoded.slice(lastDot + 1);

  const expected = createHmac('sha256', SECRET).update(`${searchId}.${expiresStr}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (!Number.isFinite(Number(expiresStr)) || Date.now() > Number(expiresStr)) return null;
  return { searchId };
}
