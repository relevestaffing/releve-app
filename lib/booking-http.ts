import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

/* Shared by the public booking endpoints: only relevestaffing.com (and the
   app itself) may call them from a browser, as with /api/interest. */
export function guard(req: Request) {
  const cors = corsHeaders(req.headers.get('origin'));
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: cors });
  const origin = req.headers.get('origin');
  const bad = origin && !/^https:\/\/((www|app)\.)?relevestaffing\.com$/i.test(origin) && !/^http:\/\/localhost(:\d+)?$/i.test(origin);
  return { cors, fail, bad };
}
export function one(v: unknown, max: number) { return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
export function zoneOk(tz: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
