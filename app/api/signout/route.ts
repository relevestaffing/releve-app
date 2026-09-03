import { NextResponse } from 'next/server';
import { configured, supabaseServer } from '@/lib/supabase/server';
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  if (configured()) { const sb = await supabaseServer(); await sb.auth.signOut(); }
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
