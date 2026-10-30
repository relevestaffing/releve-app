import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { getProspect } from '@/lib/prospects';
import { auditDraft } from '@/lib/ai';
import { createAudit, updateAudit, getAudit, markAuditSent } from '@/lib/audits';
import type { AuditInputs } from '@/lib/audits-public';
import { shell, send, esc } from '@/lib/email';
import { SITE } from '@/lib/stripe';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}

/* One audit's current title and content, for the editor. */
export async function GET(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'Which audit?' }, { status: 400 });
  const audit = await getAudit(id);
  if (!audit) return NextResponse.json({ error: 'That audit was not found.' }, { status: 404 });
  const st = (audit.inputs ?? {}) as any;
  return NextResponse.json({ ok: true, audit: {
    title: audit.title, content: audit.content, status: audit.status,
    state: st._state ?? (audit.content ? 'ready' : 'writing'), error: st._error ?? null
  } });
}

export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? '');

  // Draft a new audit with Claude from the key points.
  if (action === 'draft') {
    const prospectId = String(b.prospect_id ?? '');
    if (!prospectId) return NextResponse.json({ error: 'Which lead?' }, { status: 400 });
    const lead = await getProspect(prospectId);
    if (!lead) return NextResponse.json({ error: 'That lead was not found.' }, { status: 404 });
    const inputs = (b.inputs ?? {}) as AuditInputs;
    if (!process.env.ANTHROPIC_API_KEY)
      return NextResponse.json({ error: 'Add your Anthropic API key (ANTHROPIC_API_KEY) in Netlify to turn on audits.' }, { status: 400 });
    try {
      /* A full audit takes Claude longer than a web request may run, so the
         draft is filed empty and written by a background function; the
         console polls it (QA, 30 Oct 2026). Without the background function
         (local dev), it is written here as before. */
      const { id, token } = await createAudit({
        prospectId, title: 'Writing the audit…', inputs: { ...inputs, _state: 'writing' } as any, content: '', createdBy: g.p?.id
      });
      const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.URL ?? SITE).replace(/\/$/, '');
      const secret = process.env.CRON_SECRET;
      const kick = secret ? await fetch(`${base}/.netlify/functions/audit-draft-background`, {
        method: 'POST', headers: { 'x-cron-key': secret, 'content-type': 'application/json' }, body: JSON.stringify({ id })
      }).catch(() => null) : null;
      if (kick && kick.status < 300)
        return NextResponse.json({ ok: true, id, token, pending: true, title: 'Writing the audit…', content: '' });

      const draft = await auditDraft({
        name: lead.full_name, company: lead.org_name ?? '',
        inputs: { ...inputs, website: inputs.website || lead.website || undefined }
      });
      await updateAudit(id, { title: draft.title, content: draft.content });
      return NextResponse.json({ ok: true, id, token, title: draft.title, content: draft.content });
    } catch (e: any) {
      // auditDraft throws readable messages (missing key, bad model, rate limit).
      return NextResponse.json({ error: e?.message ?? 'The audit could not be written.' }, { status: 400 });
    }
  }

  // Save edits to a draft.
  if (action === 'save') {
    const id = String(b.id ?? '');
    if (!id) return NextResponse.json({ error: 'Which audit?' }, { status: 400 });
    try {
      await updateAudit(id, { title: b.title, content: b.content });
      return NextResponse.json({ ok: true });
    } catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }

  // Send the private link to the prospect and mark it sent.
  if (action === 'send') {
    const id = String(b.id ?? '');
    if (!id) return NextResponse.json({ error: 'Which audit?' }, { status: 400 });
    const audit = await getAudit(id);
    if (!audit) return NextResponse.json({ error: 'That audit was not found.' }, { status: 404 });
    const lead = await getProspect(audit.prospect_id);
    if (!lead?.email) return NextResponse.json({ error: 'This lead has no email on file.' }, { status: 400 });
    const url = `${SITE}/audit/${audit.view_token}`;
    const first = (lead.full_name ?? '').trim().split(/\s+/)[0] || '';
    const inner =
      `<p style="margin:0 0 15px;">${first ? esc(first) + ',' : 'Hello,'}</p>` +
      `<p style="margin:0 0 15px;">Thank you for the conversation. We put together a short audit of where your business is now and what we would run for you, with the plan and the investment laid out.</p>` +
      `<p style="margin:0 0 15px;">It is yours to read anytime at the link below.</p>`;
    const ok = await send(lead.email, {
      kind: 'audit',
      subject: 'Your Relève business audit',
      text: `${first ? first + ',' : 'Hello,'}\n\nThank you for the conversation. We put together a short audit of where your business is now and what we would run for you, with the plan and the investment laid out.\n\nRead it here: ${url}\n\nRelève`,
      html: shell('Your business audit', inner, { label: 'View your audit', href: url })
    });
    if (!ok) return NextResponse.json({ error: 'The email did not send. Check the mail setup and try again.' }, { status: 400 });
    try { await markAuditSent(id); } catch { /* sent is best-effort state */ }
    return NextResponse.json({ ok: true, sentTo: lead.email });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
