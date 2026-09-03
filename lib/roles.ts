/* Server side of the role breakdown and the skills profile. */
import { configured, supabaseServer } from './supabase/server';
import type { RoleBreakdown, SkillsProfile } from './roles-public';

export * from './roles-public';

export async function getRoleBreakdown(clientId: string): Promise<RoleBreakdown | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('role_breakdown').select('*')
    .eq('client_id', clientId).maybeSingle();
  if (!data) return null;
  const r: any = data;
  return {
    ownership: r.ownership ?? {}, priorities: r.priorities ?? '',
    never: r.never ?? '', tools: r.tools ?? '', success: r.success ?? ''
  };
}

export async function saveRoleBreakdown(clientId: string, b: RoleBreakdown) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('role_breakdown').upsert({
    client_id: clientId, ownership: b.ownership ?? {},
    priorities: b.priorities?.trim() || null, never: b.never?.trim() || null,
    tools: b.tools?.trim() || null, success: b.success?.trim() || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'client_id' });
  if (error) throw new Error(error.message);
}

export async function getSkills(talentId: string): Promise<SkillsProfile | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('skills_profile').select('*')
    .eq('talent_id', talentId).maybeSingle();
  if (!data) return null;
  const r: any = data;
  return {
    level: r.level ?? {}, appetite: r.appetite ?? {},
    tools: r.tools ?? '', best: r.best ?? '', growing: r.growing ?? ''
  };
}

export async function saveSkills(talentId: string, s: SkillsProfile) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('skills_profile').upsert({
    talent_id: talentId, level: s.level ?? {}, appetite: s.appetite ?? {},
    tools: s.tools?.trim() || null, best: s.best?.trim() || null,
    growing: s.growing?.trim() || null, updated_at: new Date().toISOString()
  }, { onConflict: 'talent_id' });
  if (error) throw new Error(error.message);
}

/* Everyone's skills at once, for ranking a bench against one role. */
export async function skillsFor(ids: string[]): Promise<Record<string, SkillsProfile>> {
  const out: Record<string, SkillsProfile> = {};
  if (!configured() || !ids.length) return out;
  const sb = await supabaseServer();
  const { data } = await sb.from('skills_profile').select('*').in('talent_id', ids);
  for (const r of (data ?? []) as any[]) {
    out[r.talent_id] = {
      level: r.level ?? {}, appetite: r.appetite ?? {},
      tools: r.tools ?? '', best: r.best ?? '', growing: r.growing ?? ''
    };
  }
  return out;
}
