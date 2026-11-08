import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { getProspect, setProspectStage, logTouch } from '@/lib/prospects';
import {
  getStudioDoc, createStudioDoc, patchStudioDoc, queueUserMessage, kickTurn, ownerOf, listStudioDocs,
  type StudioKind, type StudioDoc
} from '@/lib/studio';
import { buildDocPdf, docPdfFilename } from '@/lib/doc-pdf';
import { send, shell, esc } from '@/lib/email';
import { SITE } from '@/lib/stripe';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}
const kindOf = (v: unknown): StudioKind | null => (v === 'audit' || v === 'plan' ? v : null);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/* What the page needs to redraw: the conversation, the document and where it is. */
function view(d: StudioDoc) {
  return {
    id: d.id, title: d.title, content: d.content, chat: d.chat, state: d.state, error: d.error,
    status: d.status, email: d.email, done_at: d.done_at, updated_at: d.updated_at
  };
}

async function logoPng(): Promise<Uint8Array | null> {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`${SITE}/logo-fern.png`, { signal: ctl.signal }); clearTimeout(t);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch { return null; }
}

async function pdfFor(doc: StudioDoc) {
  const who = await ownerOf(doc.kind, doc.owner_id);
  const company = who?.company || who?.name || null;
  const buf = await buildDocPdf(doc.content, { kind: doc.kind, preparedFor: company, logoPng: await logoPng() });
  return { buf, filename: docPdfFilename(doc.kind, company), who };
}

/* One document, for the page's polling; or its PDF, for the preview button. */
export async function GET(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const u = new URL(req.url);
  const kind = kindOf(u.searchParams.get('kind')); const id = u.searchParams.get('id') ?? '';
  if (!kind || !id) return bad('Which document?');
  const doc = await getStudioDoc(kind, id);
  if (!doc) return bad('That document was not found.', 404);
  if (u.searchParams.get('pdf')) {
    if (!doc.content.trim()) return bad('Nothing has been written yet.');
    try {
      const { buf, filename } = await pdfFor(doc);
      return new Response(new Uint8Array(buf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${filename}"`, 'cache-control': 'no-store' } });
    } catch (e: any) { return bad(safeMessage(e)); }
  }
  return NextResponse.json({ ok: true, doc: view(doc) });
}

export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  if (!configured()) return bad('The studio is not available in preview.');
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? '');
  const kind = kindOf(b.kind);
  if (!kind) return bad('Which studio?');
  if (!process.env.ANTHROPIC_API_KEY && ['create', 'say', 'retry'].includes(action))
    return bad('Add your Anthropic API key (ANTHROPIC_API_KEY) in Netlify to turn the studio on.');

  try {
    /* ----- start a new document, and let Claude open the interview ----- */
    if (action === 'create') {
      if (kind === 'audit') {
        const lead = await getProspect(String(b.lead_id ?? ''));
        if (!lead) return bad('That lead was not found.', 404);
        const id = await createStudioDoc('audit', lead.id, { title: `Business VA Audit: ${lead.org_name || lead.full_name}`, by: g.p?.id });
        await kickTurn('audit', id);
        return NextResponse.json({ ok: true, id });
      }
      const clientId = String(b.client_id ?? '');
      if (!clientId) return bad('Which executive?');
      const who = await ownerOf('plan', clientId);
      if (!who) return bad('That executive was not found.', 404);
      const existing = (await listStudioDocs('plan', clientId))[0];
      if (existing && !b.fresh) return NextResponse.json({ ok: true, id: existing.id, existing: true });
      const id = await createStudioDoc('plan', clientId, { title: `Your 90-Day Success Plan: ${who.company || who.name}`, by: g.p?.id });
      await kickTurn('plan', id);
      return NextResponse.json({ ok: true, id });
    }

    const id = String(b.id ?? '');
    if (!id) return bad('Which document?');
    const doc = await getStudioDoc(kind, id);
    if (!doc) return bad('That document was not found.', 404);

    /* ----- a message in the chat ----- */
    if (action === 'say') {
      const text = String(b.text ?? '').trim().slice(0, 6000);
      if (!text) return bad('Write a message first.');
      if (doc.state === 'working') return bad('Still writing the last one. One moment.', 409);
      await queueUserMessage(kind, doc, text);
      await kickTurn(kind, id);
      return NextResponse.json({ ok: true });
    }
    if (action === 'retry') {
      await queueUserMessage(kind, doc, null);
      await kickTurn(kind, id);
      return NextResponse.json({ ok: true });
    }

    /* ----- hand edits ----- */
    if (action === 'save') {
      const patch: Record<string, unknown> = {};
      if (typeof b.title === 'string') patch.title = b.title.trim().slice(0, 160) || doc.title;
      if (typeof b.content === 'string') patch.content = b.content;
      if (b.email && typeof b.email === 'object')
        patch.email = { subject: String(b.email.subject ?? '').slice(0, 200), body: String(b.email.body ?? '').slice(0, 8000) };
      if (Object.keys(patch).length) await patchStudioDoc(kind, id, patch);
      return NextResponse.json({ ok: true });
    }

    /* ----- send the audit / publish the plan, with the PDF attached ----- */
    if (action === 'send' || action === 'publish') {
      if ((kind === 'audit') !== (action === 'send')) return bad('Unknown action.');
      if (!doc.content.trim()) return bad('Nothing has been written yet.');
      const who = await ownerOf(kind, doc.owner_id);
      const to = String(b.to ?? who?.email ?? '').trim().toLowerCase();
      if (!to.includes('@')) return bad('There is no email address to send to.');
      const first = (who?.name ?? '').trim().split(/\s+/)[0] || '';
      const subject = String(b.subject ?? doc.email?.subject ?? '').trim()
        || (kind === 'plan' ? 'Your 90-Day Success Plan' : 'Your Business Audit');
      const text = String(b.body ?? doc.email?.body ?? '').trim()
        || (kind === 'plan'
          ? `${first ? first + ',' : 'Hello,'}\n\nYour 90-Day Success Plan is attached. It sets out what happens in your first 30, 60 and 90 days, who is responsible for each part, and what we need from you.\n\nThe plan is the start of onboarding, not the end. Relève keeps watching the work for as long as we work together.\n\nRelève`
          : `${first ? first + ',' : 'Hello,'}\n\nThank you for the conversation. Attached is your Business Audit: where your business is today and exactly how a virtual assistant steps in.\n\nWhen you are ready to move, reply to this email and we will send your onboarding the same day.\n\nRelève`);
      const link = `${SITE}/${kind === 'plan' ? 'plan' : 'audit'}/${doc.view_token}`;
      const includeLink = b.include_link !== false;

      /* A plan has to be published before its link opens. */
      if (kind === 'plan') await patchStudioDoc('plan', id, { status: 'published', published_at: new Date().toISOString() });

      const { buf, filename } = await pdfFor(doc);
      const inner = text.split(/\n{2,}/).map(p => `<p style="margin:0 0 15px;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
      const ok = await send(to, {
        kind, subject,
        text: `${text}${includeLink ? `\n\nRead it online: ${link}` : ''}`,
        html: shell(kind === 'plan' ? 'Your 90-Day Success Plan' : 'Your Business Audit', inner,
          includeLink ? { label: kind === 'plan' ? 'View your plan online' : 'View your audit online', href: link } : undefined),
        attachments: [{ filename, content: buf, contentType: 'application/pdf' }]
      });
      if (!ok) {
        if (kind === 'plan' && doc.status !== 'published') await patchStudioDoc('plan', id, { status: 'draft', published_at: null });
        return bad('The email did not send. Check the mail setup and try again.');
      }
      if (kind === 'audit') {
        await patchStudioDoc('audit', id, { status: 'sent', sent_at: new Date().toISOString() });
        /* The call is held and the audit is out: the lead is Deciding. */
        try {
          const lead = await getProspect(doc.owner_id);
          await logTouch({ prospect_id: doc.owner_id, kind: 'email', note: 'Business audit emailed (PDF attached, private link included).', by: g.p?.id });
          if (lead && ['new', 'contacted', 'nurturing', 'booked', 'held'].includes(lead.stage)) await setProspectStage(lead.id, 'proposal');
        } catch { /* the email is out; the history line is best-effort */ }
      }
      return NextResponse.json({ ok: true, sentTo: to });
    }

    return bad('Unknown action.');
  } catch (e: any) {
    return bad(safeMessage(e));
  }
}
