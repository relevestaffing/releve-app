import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { listFeedback, saveFeedback } from '@/lib/work';

export async function GET() {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  return NextResponse.json({ feedback: await listFeedback({ authorId: me.id }) });
}

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json();
  if (!b.interview_id) return NextResponse.json({ error: 'which interview?' }, { status: 400 });
  try {
    await saveFeedback({
      interview_id: b.interview_id, author_id: me.id,
      side: me.role === 'client' ? 'client' : 'talent',
      rating: b.rating ? Number(b.rating) : null,
      proceed: b.proceed, strengths: b.strengths, concerns: b.concerns, notes: b.notes
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
