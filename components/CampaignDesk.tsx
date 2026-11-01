'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = {
  id: string; slot: string; send_at: string; when: string; status: string; hold_reason: string | null;
  subject: string; preheader: string | null; paragraphs: string[]; cta_label: string | null; cta_url: string | null;
  written_by: string; recipients: number; delivered: number; topic: string | null;
};

const PILL: Record<string, string> = { scheduled: 'pill good', held: 'pill warn', sending: 'pill', sent: 'pill', failed: 'pill crit', cancelled: 'pill' };
const LABEL: Record<string, string> = { scheduled: 'Sends on schedule', held: 'Held', sending: 'Sending', sent: 'Sent', failed: 'Failed', cancelled: 'Cancelled' };

export default function CampaignDesk({ campaigns, me, ready }: { campaigns: Row[]; me: string; ready: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(campaigns.find(c => c.status === 'scheduled' || c.status === 'held')?.id ?? null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action + (body.id ?? '')); setNote('');
    try {
      const r = await fetch('/api/admin/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'That did not work.');
      if (action === 'test') setNote(`Test sent to ${j.to}.`);
      if (action === 'draft_next') setNote(j.made?.length ? 'The next email is drafted and the preview is on its way.' : 'The next email is already drafted.');
      if (action === 'edit') setEditing(null);
      router.refresh();
    } catch (e: any) { setNote(e?.message || 'That did not work.'); }
    setBusy('');
  }

  const upcoming = campaigns.filter(c => ['scheduled', 'held', 'sending'].includes(c.status)).sort((a, b) => a.send_at.localeCompare(b.send_at));
  const past = campaigns.filter(c => !['scheduled', 'held', 'sending'].includes(c.status));

  function card(c: Row) {
    const isOpen = open === c.id, isEdit = editing === c.id;
    const done = c.status === 'sent' || c.status === 'sending';
    return (
      <div className="card" key={c.id}>
        <div className="row between" style={{ cursor: 'pointer', gap: 16 }} onClick={() => setOpen(isOpen ? null : c.id)}>
          <div>
            <div className="eyebrow">{c.when}</div>
            <div style={{ fontSize: 18, marginTop: 4 }}>{c.subject}</div>
            {c.preheader && <div className="small muted">{c.preheader}</div>}
          </div>
          <span className={PILL[c.status] ?? 'pill'}>{LABEL[c.status] ?? c.status}{c.status === 'sent' ? `, ${c.delivered} of ${c.recipients}` : ''}</span>
        </div>
        {c.hold_reason && c.status === 'held' && <p className="small" style={{ marginTop: 10 }}>{c.hold_reason}</p>}
        {isOpen && !isEdit && (
          <div style={{ marginTop: 18, maxWidth: 620 }}>
            {c.paragraphs.map((p, i) => <p key={i} style={{ margin: '0 0 14px', lineHeight: 1.7 }}>{p}</p>)}
            {c.cta_url && <p className="small muted">Button: {c.cta_label} &rarr; {c.cta_url.replace('https://', '')}</p>}
            <p className="small muted">{c.written_by === 'team' ? 'Edited by the team.' : 'Written by Claude.'}</p>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              {!done && c.status !== 'held' && <button className="btn solid" disabled={!!busy} onClick={() => act('hold', { id: c.id })}>Hold this email</button>}
              {!done && c.status === 'held' && <button className="btn solid" disabled={!!busy} onClick={() => { if (new Date(c.send_at).getTime() > Date.now() || confirm('Its send time has passed, so this goes to every subscriber right now. Send it?')) act('resume', { id: c.id }); }}>{new Date(c.send_at).getTime() > Date.now() ? 'Send on schedule' : 'Send it now'}</button>}
              {!done && c.status === 'cancelled' && <button className="btn solid" disabled={!!busy} onClick={() => { if (new Date(c.send_at).getTime() > Date.now() || confirm('Its send time has passed, so putting it back sends it to every subscriber right now. Send it?')) act('resume', { id: c.id }); }}>{new Date(c.send_at).getTime() > Date.now() ? 'Put it back' : 'Put it back and send now'}</button>}
              {!done && <button className="btn" disabled={!!busy} onClick={() => setEditing(c.id)}>Edit</button>}
              {!done && <button className="btn" disabled={!!busy} onClick={() => act('redraft', { id: c.id })}>{busy === 'redraft' + c.id ? 'Rewriting…' : 'Rewrite it'}</button>}
              <button className="btn" disabled={!!busy} onClick={() => act('test', { id: c.id, to: me })}>Send me a test</button>
              {!done && c.status !== 'cancelled' && <button className="btn" disabled={!!busy} onClick={() => { if (confirm('Skip this email? It will not send. You can put it back later.')) act('cancel', { id: c.id }); }}>Skip this one</button>}
            </div>
          </div>
        )}
        {isEdit && (
          <form style={{ marginTop: 18, maxWidth: 680 }} onSubmit={e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            act('edit', { id: c.id, subject: f.get('subject'), preheader: f.get('preheader'), body: f.get('body'), cta_label: f.get('cta_label') });
          }}>
            <div className="ff"><label htmlFor={`s-${c.id}`}>Subject</label><input id={`s-${c.id}`} name="subject" defaultValue={c.subject} maxLength={90} /></div>
            <div className="ff"><label htmlFor={`p-${c.id}`}>Preview line</label><input id={`p-${c.id}`} name="preheader" defaultValue={c.preheader ?? ''} maxLength={140} /></div>
            <div className="ff"><label htmlFor={`b-${c.id}`}>Email <span className="muted">(a blank line between paragraphs)</span></label>
              <textarea id={`b-${c.id}`} name="body" rows={16} defaultValue={c.paragraphs.join('\n\n')} /></div>
            <div className="ff"><label htmlFor={`c-${c.id}`}>Button words</label><input id={`c-${c.id}`} name="cta_label" defaultValue={c.cta_label ?? ''} maxLength={40} /></div>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn solid" disabled={!!busy}>Save</button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      {note && <div className="card tight"><p className="small" role="status" style={{ margin: 0 }}>{note}</p></div>}
      <div className="row between">
        <h2 style={{ margin: 0 }}>Coming up</h2>
        {ready && <button className="btn" disabled={!!busy} onClick={() => act('draft_next')}>{busy === 'draft_next' ? 'Writing…' : 'Write the next one now'}</button>}
      </div>
      {upcoming.length ? upcoming.map(card)
        : <div className="card tight"><p className="small muted" style={{ margin: 0 }}>Nothing drafted yet. Claude writes each email two days before it sends.</p></div>}
      {past.length > 0 && <h2 style={{ margin: '18px 0 0' }}>Sent and skipped</h2>}
      {past.map(card)}
    </div>
  );
}
