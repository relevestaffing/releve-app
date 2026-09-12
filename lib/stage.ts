/* Which stage an executive's account is in.
   ----------------------------------------
   An executive is not one kind of user for the life of their account. While
   hiring, the whole point is the candidate; once someone has started, the
   point is the working relationship, and candidate screens are noise at best
   and confusing at worst — they suggest the search is still running.

   The two facts are independent, which is what makes multiple assistants
   possible. Hiring is "is there an open search", never "do they have nobody",
   so an executive with one assistant who wants a second gets the hiring
   screens back the moment Relève opens a search for them.

   Both come from one view, so the navigation, the dashboard and the console
   can never disagree about what stage somebody is in. */
import { configured, supabaseServer } from './supabase/server';

export type ExecutiveStage = {
  hiring: boolean;          // a search is open — show candidate and interview screens
  placements: number;       // people currently working for them
  placed: boolean;
};

export async function executiveStage(clientId: string): Promise<ExecutiveStage> {
  /* An unconfigured preview shows the hiring account, because that is the one
     with the most in it. */
  if (!configured()) return { hiring: true, placements: 0, placed: false };

  const sb = await supabaseServer();
  const { data } = await sb
    .from('executive_stage')
    .select('hiring, live_placements')
    .eq('client_id', clientId)
    .maybeSingle();

  /* No row means the view is not there yet — the database is a migration
     behind. Fall back to hiring rather than hiding screens someone needs. */
  if (!data) return { hiring: true, placements: 0, placed: false };

  const placements = Number((data as any).live_placements ?? 0);
  return {
    hiring: Boolean((data as any).hiring),
    placements,
    placed: placements > 0
  };
}
