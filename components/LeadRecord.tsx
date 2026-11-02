'use client';
import { useState } from 'react';
import type { Prospect, ProspectStage } from '@/lib/prospects-public';
import { stageLabel } from '@/lib/prospects-public';
import { LeadDetail, send } from './LeadWorkspace';
import { Panel, cleanName, type Member } from './crm/kit';
import { toast } from './Toast';

/* One lead on its own page (2 November 2026): the same detail as the panel
   on the Leads list, at full width, with the audits and files below. */
export default function LeadRecord({ lead, team, today, children }: {
  lead: Prospect; team: Member[]; today: string; children?: React.ReactNode;
}) {
  const [p, setP] = useState<Prospect>(lead);
  const put = (c: Partial<Prospect>) => setP(x => ({ ...x, ...c }));
  const nameOf = (id: string | null) => cleanName(team.find(t => t.user_id === id)?.name);

  const onStage = (stage: string) => {
    const prev = { stage: p.stage, stage_changed_at: p.stage_changed_at };
    put({ stage: stage as ProspectStage, stage_changed_at: new Date().toISOString() });
    send('PATCH', { id: p.id, stage, from: p.stage }).then(ok => {
      if (!ok) return put(prev);
      toast.undo(`Moved to ${stageLabel(stage)}`, () => { put(prev); send('PATCH', { id: p.id, stage: prev.stage, from: stage }); });
    });
  };
  const onOwner = (o: string | null) => {
    const prev = p.owner_id;
    put({ owner_id: o });
    send('PATCH', { id: p.id, owner_id: o, from_owner: prev, subject_name: p.full_name }).then(ok => {
      if (!ok) return put({ owner_id: prev });
      toast.undo(o ? `Assigned to ${nameOf(o)}` : 'Unassigned', () => { put({ owner_id: prev }); send('PATCH', { id: p.id, owner_id: prev }); });
    });
  };
  const onFollow = (d: string | null) => {
    const prev = p.next_follow_up;
    put({ next_follow_up: d });
    send('PATCH', { id: p.id, next_follow_up: d }).then(ok => {
      if (!ok) return put({ next_follow_up: prev });
      toast.undo(d ? 'Follow-up set' : 'Follow-up cleared', () => { put({ next_follow_up: prev }); send('PATCH', { id: p.id, next_follow_up: prev }); });
    });
  };
  const onField = (change: Partial<Prospect>, field: string) => {
    const next = { ...p, ...change };
    if (!next.full_name.trim() || !next.email.includes('@')) { toast.bad('A lead needs a name and an email.'); return; }
    const prev = { ...p };
    put(change);
    send('POST', { id: p.id, full_name: next.full_name, email: next.email, org_name: next.org_name, source: next.source,
      website: next.website, ...(change.note !== undefined ? { note: change.note } : {}), field }).then(ok => {
      if (!ok) setP(prev); else toast.saved('Saved');
    });
  };

  return (
    <Panel page crumb={`Lead · ${stageLabel(p.stage)}`}>
      <LeadDetail p={p} team={team} today={today} onStage={onStage} onOwner={onOwner} onFollow={onFollow} onField={onField}
        onTouched={next => put({ last_touched_at: new Date().toISOString(), ...(next ? { next_follow_up: next } : {}) })}
        extra={children} />
    </Panel>
  );
}
