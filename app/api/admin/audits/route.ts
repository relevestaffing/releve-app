import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { getProspect } from '@/lib/prospects';
import { auditDraft } from '@/lib/ai';
import { createAudit, updateAudit, getAudit, markAuditSent } from '@/lib/audits';
import type { AuditInputs } from '@/lib/audits-public';
import { shell, send } from '@/lib/email';
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
  return NextResponse.json({ ok: true, audit: { title: audit.title, content: audit.content, status: audit.status } });
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
    try {
      const draft = await auditDraft({
        name: lead.full_name, company: lead.org_name ?? '',
        inputs: { ...inputs, website: inputs.website || lead.website || undefined }
      });
      const { id, token } = await createAudit({
        prospectId, title: draft.title, inputs, content: draft.content, createdBy: g.p?.id
      });
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
      `<p style="margin:0 0 15px;">${first ? first + ',' : 'Hello,'}</p>` +
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
