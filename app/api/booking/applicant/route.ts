import { NextResponse } from 'next/server';
import { preflight } from '@/lib/cors';
import { guard } from '@/lib/booking-http';
import { adminClient } from '@/lib/supabase/admin';
import { bookingReady, readAppToken } from '@/lib/booking';

export const dynamic = 'force-dynamic';

/* The screening-call link made for one applicant (relevestaffing.com/book/screening/?a=...).
   The signed token reveals that person's own name and email, so the page can
   greet them and fill the form, and nothing about anyone else. */

export async function OPTIONS(req: Request) { return preflight(req); }

export async function GET(req: Request) {
  const { cors, fail } = guard(req);
  if (!bookingReady()) return fail('Booking is not switched on yet.', 503);
  const id = readAppToken(new URL(req.url).searchParams.get('a') || '');
  if (!id) return fail('This link is not valid. Please ask Relève for a new one.', 404);
  const { data } = await adminClient().from('job_applications').select('full_name, email, phone').eq('id', id).maybeSingle();
  if (!data) return fail('This link is not valid. Please ask Relève for a new one.', 404);
  return NextResponse.json({ name: data.full_name, email: data.email, phone: data.phone ?? '' }, { headers: { ...cors, 'cache-control': 'no-store' } });
}
