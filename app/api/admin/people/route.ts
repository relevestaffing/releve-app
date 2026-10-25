import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { createPerson, listPending, deleteAccount, deletePendingPerson } from '@/lib/store';
import { archivePerson, restorePerson } from '@/lib/archive';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';
import { firstName } from '@/lib/words';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}
export async function GET() {
  const g = await guard(); if (g.error) return g.error;
  return NextResponse.json(await listPending());
}
export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  if (!body.email || !body.full_name)
    return NextResponse.json({ error: 'A name and an email are required.' }, { status: 400 });
  try {
    const made = await createPerson(body);

    /* Tell them they exist. Until now nobody was ever told. docs_url is
       whatever signing link (DocuSign, most likely) the admin already has in
       hand for this person — it is not stored, only used for this one send,
       so there is no schema to migrate for it. */
    const first = firstName(body.full_name, '');
    const docsUrl = String(body.docs_url ?? '').trim() || undefined;
    const tpl = body.role === 'client'
      ? templates.clientInvite(first, { docsUrl })
      : templates.talentInvite(first, { docsUrl });
    const sent = await send(body.email, tpl);

    return NextResponse.json({ ok: true, ...made, emailed: sent });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
/* Archiving and restoring. Separate verb from DELETE on purpose: one of
   these is reversible and the other is not, and a single endpoint that did
   both on a flag is exactly the sort of thing that eventually does the wrong
   one. (13 October 2026.) */
export async function PATCH(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');
  if (action !== 'archive' && action !== 'restore')
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  const ids = idsFrom(body);
  if (!ids.length) return NextResponse.json({ error: 'Nobody was selected.' }, { status: 400 });

  const failed: { id: string; why: string }[] = [];
  let done = 0;
  for (const id of ids) {
    try {
      if (action === 'archive') await archivePerson(id, body.reason);
      else await restorePerson(id);
      done++;
    } catch (e: any) {
      failed.push({ id, why: safeMessage(e) });
    }
  }
  return NextResponse.json({ ok: true, done, failed });
}

/* Permanent removal. Takes one person or a list of them — the cleanup screen
   sends a list, every older caller still sends one, and both land here.

   Each is attempted on its own and its own failure is reported back by id,
   rather than the first refusal abandoning the rest: clearing out eight test
   rows where one has an unpaid invoice should remove seven and tell you
   about the eighth, not stop at the eighth. */
export async function DELETE(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));

  const list: { id: string; pending: boolean }[] = Array.isArray(body.people)
    ? body.people.map((p: any) => ({ id: String(p?.id ?? '').trim(), pending: Boolean(p?.pending) }))
                 .filter((p: any) => p.id)
    : (String(body.id ?? '').trim()
        ? [{ id: String(body.id).trim(), pending: Boolean(body.pending) }]
        : []);
  if (!list.length) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });

  /* One person, the old shape: answer in the old shape too, so the Remove
     button on a Directory row keeps reporting its own error as it always
     has rather than a silent success with a failure buried in an array. */
  if (list.length === 1 && !Array.isArray(body.people)) {
    try {
      if (list[0].pending) await deletePendingPerson(list[0].id);
      else await deleteAccount(list[0].id);
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
    }
  }

  const failed: { id: string; why: string }[] = [];
  let done = 0;
  for (const p of list) {
    try {
      if (p.pending) await deletePendingPerson(p.id);
      else await deleteAccount(p.id);
      done++;
    } catch (e: any) {
      failed.push({ id: p.id, why: safeMessage(e) });
    }
  }
  return NextResponse.json({ ok: true, done, failed });
}

function idsFrom(body: any): string[] {
  const raw = Array.isArray(body?.ids) ? body.ids : (body?.id ? [body.id] : []);
  return [...new Set(raw.map((x: any) => String(x ?? '').trim()).filter(Boolean))] as string[];
}
