import { hasServiceKey, adminClient } from '@/lib/supabase/admin';

/* The unsubscribe side of the Relève email list (29 Oct 2026, Nona: "add an
   unsubscribe link"). Every row in subscribers (part 53) carries its own
   unsubscribe_token, so a link names one address and nothing else, and
   nobody has to sign in to leave the list.

   Whatever sends the biweekly email must put both of these in every message:
     - unsubscribeUrl(token) as a visible link in the footer;
     - listUnsubscribeHeaders(token) as message headers, which is what gives
       Gmail and Apple Mail their own one-tap "Unsubscribe" button. */

const APP = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');

export function unsubscribeUrl(token: string) {
  return `${APP()}/unsubscribe?t=${encodeURIComponent(token)}`;
}

export function listUnsubscribeHeaders(token: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${APP()}/api/unsubscribe?t=${encodeURIComponent(token)}>, <mailto:hello@relevestaffing.com?subject=Unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  };
}

/* Tokens are 32 hex characters; anything else is refused before a query. */
export function cleanToken(t: unknown): string | null {
  const s = String(t ?? '').trim();
  return /^[a-f0-9]{16,64}$/i.test(s) ? s.toLowerCase() : null;
}

export type UnsubResult = 'done' | 'already' | 'unknown' | 'unavailable';

/* Flip one address off the list. Idempotent: pressing it twice says so
   kindly rather than erroring. Runs under the service role because the
   person has no session. */
export async function unsubscribeByToken(token: string): Promise<{ result: UnsubResult; email?: string }> {
  if (!hasServiceKey()) return { result: 'unavailable' };
  const sb = adminClient();
  const { data, error } = await sb.from('subscribers')
    .select('id, email, subscribed').eq('unsubscribe_token', token).maybeSingle();
  if (error) return { result: 'unavailable' };      // part 53 not applied yet
  if (!data) return { result: 'unknown' };
  if (!data.subscribed) return { result: 'already', email: data.email };
  const { error: upErr } = await sb.from('subscribers')
    .update({ subscribed: false, unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', data.id);
  if (upErr) return { result: 'unavailable' };
  return { result: 'done', email: data.email };
}

/* Put someone back if they unsubscribed by mistake. */
export async function resubscribeByToken(token: string): Promise<boolean> {
  if (!hasServiceKey()) return false;
  const { error } = await adminClient().from('subscribers')
    .update({ subscribed: true, unsubscribed_at: null, updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', token);
  return !error;
}

/* Show the address partly, so the page confirms who without exposing it. */
export function maskEmail(email?: string) {
  if (!email || !email.includes('@')) return '';
  const [u, d] = email.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`;
}
