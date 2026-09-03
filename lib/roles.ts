/* Server side of the role breakdown and the skills profile. */
import { configured, supabaseServer } from './supabase/server';
import type { RoleBreakdown, SkillsProfile } from './roles-public';

export * from './roles-public';

const EMPTY_ROLE: RoleBreakdown = {
  disciplines: [], needs: {}, details: {},
  priorities: '', never: '', tools: '', success: '', hours: ''
};
const EMPTY_SKILLS: SkillsProfile = {
  disciplines: [], levels: {}, details: {}, years: {},
  primary: '', best: '', growing: '', tools: ''
};

export async function getRoleBreakdown(clientId: string): Promise<RoleBreakdown | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('role_breakdown').select('*')
    .eq('client_id', clientId).maybeSingle();
  if (!data) return null;
  const r: any = data;
  return {
    ...EMPTY_ROLE,
    disciplines: r.disciplines ?? [], needs: r.needs ?? {}, details: r.details ?? {},
    priorities: r.priorities ?? '', never: r.never ?? '',
    tools: r.tools ?? '', success: r.success ?? '', hours: r.hours ?? ''
  };
}

export async function saveRoleBreakdown(clientId: string, b: RoleBreakdown) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('role_breakdown').upsert({
    client_id: clientId,
    disciplines: b.disciplines ?? [], needs: b.needs ?? {}, details: b.details ?? {},
    priorities: b.priorities?.trim() || null, never: b.never?.trim() || null,
    tools: b.tools?.trim() || null, success: b.success?.trim() || null,
    hours: b.hours?.trim() || null,
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
    ...EMPTY_SKILLS,
    disciplines: r.disciplines ?? [], levels: r.levels ?? {},
    details: r.details ?? {}, years: r.years ?? {},
    primary: r.primary_key ?? '', best: r.best ?? '',
    growing: r.growing ?? '', tools: r.tools ?? ''
  };
}

export async function saveSkills(talentId: string, s: SkillsProfile) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('skills_profile').upsert({
    talent_id: talentId,
    disciplines: s.disciplines ?? [], levels: s.levels ?? {},
    details: s.details ?? {}, years: s.years ?? {},
    primary_key: s.primary || null, best: s.best?.trim() || null,
    growing: s.growing?.trim() || null, tools: s.tools?.trim() || null,
    updated_at: new Date().toISOString()
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
      ...EMPTY_SKILLS,
      disciplines: r.disciplines ?? [], levels: r.levels ?? {},
      details: r.details ?? {}, years: r.years ?? {},
      primary: r.primary_key ?? '', best: r.best ?? '',
      growing: r.growing ?? '', tools: r.tools ?? ''
    };
  }
  return out;
}
