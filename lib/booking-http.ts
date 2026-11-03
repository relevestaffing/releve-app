import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

/* Shared by the public booking endpoints: only relevestaffing.com (and the
   app itself) may call them from a browser, as with /api/interest. */
export function guard(req: Request) {
  const cors = corsHeaders(req.headers.get('origin'));
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: cors });
  const origin = req.headers.get('origin');
  /* Browsers always send Origin on a POST; a request without one is not our form. */
  const bad = (req.method === 'POST' && !origin) || (origin && !/^https:\/\/((www|app)\.)?relevestaffing\.com$/i.test(origin) && !/^http:\/\/localhost(:\d+)?$/i.test(origin));
  return { cors, fail, bad };
}
/* The edge's own record of the connecting address, never something the
   caller supplies (same rule as /api/apply). */
export function clientIp(req: Request): string {
  const nf = req.headers.get('x-nf-client-connection-ip')?.trim();
  if (nf) return nf.slice(0, 64);
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  const fwd = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  return (fwd || 'unknown').slice(0, 64);
}

/* Public forms share the apply limiter (12 an hour per address, 4 a day per
   email). Fails CLOSED: an unavailable limiter returns 'unsure', and the
   caller answers 503 rather than removing the limit (security pass, 2 Nov 2026). */
export async function publicFormAllowed(sb: { rpc: Function }, req: Request, email: string): Promise<'ok' | 'limited' | 'unsure'> {
  try {
    const { data, error } = await sb.rpc('apply_allowed', { p_ip: clientIp(req), p_email: email });
    if (error) throw error;
    return data === false ? 'limited' : 'ok';
  } catch { return 'unsure'; }
}

export function one(v: unknown, max: number) { return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
export function zoneOk(tz: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
