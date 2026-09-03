/* Attempt storage. Supabase when configured; an in-memory map keyed by a
   cookie when not, so the demo still saves progress within a session. */
import { cookies } from 'next/headers';
import { configured, supabaseServer } from './supabase/server';

export type Attempt = {
  side: 'client' | 'talent';
  answers: (number | null)[];
  pairs: ('a' | 'b' | null)[];
  timings: (number | null)[];
  submitted: boolean;
};
const memory = new Map<string, Attempt>();

async function demoKey() {
  const store = await cookies();
  return store.get('releve_demo')?.value ?? 'demo';
}

export async function loadAttempt(side: 'client' | 'talent', userId: string | null): Promise<Attempt | null> {
  if (!configured()) return memory.get((await demoKey()) + side) ?? null;
  const sb = await supabaseServer();
  const { data } = await sb.from('signature_attempts')
    .select('side, answers, pairs, timings, submitted')
    .eq('user_id', userId).eq('side', side).maybeSingle();
  return (data as Attempt) ?? null;
}

export async function saveAttempt(side: 'client' | 'talent', userId: string | null, a: Omit<Attempt, 'side' | 'submitted'>) {
  if (!configured()) {
    memory.set((await demoKey()) + side, { side, ...a, submitted: false });
    return;
  }
  const sb = await supabaseServer();
  await sb.from('signature_attempts').upsert({
    user_id: userId, side, answers: a.answers, pairs: a.pairs, timings: a.timings,
    submitted: false, updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,side' });
}
