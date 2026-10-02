import { NextResponse } from 'next/server';
import { configured } from '@/lib/supabase/server';
import { adminClient, hasServiceKey, teamEmailsAdmin } from '@/lib/supabase/admin';
import { corsHeaders, preflight } from '@/lib/cors';
import { send, templates } from '@/lib/email';
import { APPLY_QUESTIONS, ENGLISH_LEVELS } from '@/lib/jobs-public';
import { looksLike } from '@/lib/filetype';

export const dynamic = 'force-dynamic';

const MAX_RESUME = 5 * 1024 * 1024;
const RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

/* A stranger can write here, so the door is narrow: a honeypot, a per-address
   cool-off, a cap on every string, a database rate limit, a resume checked by
   its bytes, and a posting confirmed open. Nothing read back.

   This route is now the ONLY way in (PART 39). The anonymous insert policy on
   job_applications and the anonymous upload policy on the resume bucket are
   gone, so every write below runs with the service role, after every check
   here has passed. Nothing a script posts straight at Supabase can skip them. */
const recent = new Map<string, number>();
const COOLOFF = 60_000;

function tidy(v: FormDataEntryValue | null, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/* Netlify's own record of the connecting address comes first: it is set at
   the edge and cannot be supplied by the caller. x-forwarded-for is only a
   fallback for other hosts, and only its first hop is used. */
function clientIp(req: Request): string {
  const nf = req.headers.get('x-nf-client-connection-ip')?.trim();
  if (nf) return nf.slice(0, 64);
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  const fwd = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  return (fwd || 'unknown').slice(0, 64);
}

export async function OPTIONS(req: Request) { return preflight(req); }

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get('origin'));
  const fail = (error: string, status = 400) =>
    NextResponse.json({ error }, { status, headers: cors });

  if (!configured() || !hasServiceKey()) return fail('Applications are not switched on yet.', 503);
  const sb = adminClient();

  let form: FormData;
  try { form = await req.formData(); }
  catch { return fail('We could not read that form.'); }

  /* Named like a real field and hidden in CSS. People never fill it in. */
  if (tidy(form.get('company_website'), 200)) return NextResponse.json({ ok: true }, { headers: cors });

  const post_id   = tidy(form.get('post_id'), 64);
  const full_name = tidy(form.get('full_name'), 120);
  const email     = tidy(form.get('email'), 200).toLowerCase();
  const yearsRaw  = tidy(form.get('years'), 6);
  const speaking  = tidy(form.get('english_speaking'), 20);
  const writing   = tidy(form.get('english_writing'), 20);

  /* An empty post_id is a general application — someone who didn't see a
     role that fit and applied anyway, from the "Nothing above fits?"
     section rather than a specific posting. Everything else about them is
     asked and checked the same way; there is just nothing to look up. A
     non-empty post_id still has to be shaped like a real uuid, checked
     against the database BEFORE anything is written anywhere — the resume
     upload happens first, so without this an anonymous caller could push
     files into the bucket by posting a made-up id and letting the insert
     fail afterwards. */
  const isGeneral = post_id === '';
  if (!isGeneral && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(post_id))
    return fail('We could not tell which role this was for.');
  if (full_name.length < 2) return fail('Please give us your full name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('That email address does not look right.');

  /* Every applicant states a minimum of experience — Relève only places
     people who clear it, so the form asks up front rather than a call
     finding out later. */
  const years = /^\d{1,2}$/.test(yearsRaw) ? Number(yearsRaw) : null;
  if (years == null || years < 1) return fail('We need at least a year of relevant experience to consider an application.');

  /* Both halves of English are required — relevestaffing.com's live apply
     form has sent these two fields since 9 Sept, so a missing value now
     means the field was skipped, not that the form doesn't ask. */
  if (!ENGLISH_LEVELS.includes(speaking as any)) return fail('Please rate your spoken English.');
  if (!ENGLISH_LEVELS.includes(writing as any)) return fail('Please rate your written English.');

  const key = `${email}|${post_id || 'general'}`;
  const last = recent.get(key);
  if (last && Date.now() - last < COOLOFF)
    return fail('We already have that one. Thank you.', 429);

  /* The map above lives in one lambda's memory — gone on a cold start, not
     shared across instances, keyed on an email the caller chose. The real
     limit is counted in the database, by address and by email. If the
     function is missing or the call fails, this now refuses rather than
     waving everyone through: an unavailable limiter used to remove all rate
     limiting silently, which is the failure an attacker would arrange for.
     A real applicant sees a 503 asking them to retry in a few minutes, which
     costs them a moment; failing open costs an uncapped flood through the
     Workspace send quota, and once that is spent every invoice and sign-in
     link in the platform stops too. */
  try {
    /* The address is read here, on the server, from what Netlify's edge
       recorded. It is never something the caller supplies to the limiter. */
    const ip = clientIp(req);
    const { data: allowed, error } = await sb.rpc('apply_allowed', { p_ip: ip, p_email: email });
    if (error) throw error;
    if (allowed === false)
      return fail('Too many applications from this address today. Please try again tomorrow.', 429);
  } catch {
    return fail('We could not accept that just now. Please try again in a few minutes.', 503);
  }

  const answers: Record<string, string> = {};
  for (const q of APPLY_QUESTIONS) {
    const v = String(form.get(`q_${q.key}`) ?? '').trim().slice(0, 2000);
    if (v) answers[q.key] = v;
  }

  /* The service role reads every posting, so "open" is checked explicitly:
     this both confirms the role exists and confirms it is still taking
     applications. Skipped for a general application, which has no posting. */
  let post: { id: string; title: string } | null = null;
  if (!isGeneral) {
    const { data } = await sb.from('job_posts')
      .select('id, title').eq('id', post_id).eq('state', 'open').maybeSingle();
    if (!data)
      return fail('That role is no longer open. Have a look at what else is posted.', 409);
    post = data;
  }

  /* A resume is required — checked before it ever touches storage. */
  const file = form.get('resume');
  if (!(file instanceof Blob) || file.size === 0) return fail('Please attach your resume.');
  if (file.size > MAX_RESUME) return fail('That resume is over 5MB. Please send a smaller file.', 413);
  if (!RESUME_TYPES.includes(file.type)) return fail('Please send a PDF or a Word document.', 415);
  const ext = file.type === 'application/pdf' ? 'pdf'
            : file.type === 'application/msword' ? 'doc' : 'docx';
  const path = `${isGeneral ? 'general' : post_id}/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  /* file.type is the caller's claim, not a fact about the file. Without this
     an executable or an HTML page arrives labelled application/pdf, is stored
     as .pdf, and is opened from the console under that name. */
  if (!looksLike('document', bytes))
    return fail('That file is not a PDF or a Word document, whatever it is named.', 415);
  const { error: uploadError } = await sb.storage.from('applications')
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return fail('We could not save that resume. Please try again.', 500);
  const resume_path = path;
  const resume_name = ((file as File).name ?? `resume.${ext}`).slice(0, 160);

  const phone     = tidy(form.get('phone'), 40) || null;
  const location  = tidy(form.get('location'), 120) || null;
  const timezone  = tidy(form.get('timezone'), 60) || null;
  const links     = tidy(form.get('links'), 500) || null;
  const heard_via = tidy(form.get('heard_via'), 80) || null;
  const note      = String(form.get('note') ?? '').trim().slice(0, 4000) || null;

  const { error } = await sb.from('job_applications').insert({
    post_id: isGeneral ? null : post_id, full_name, email, phone, location, timezone, years,
    links, heard_via, note, answers, resume_path, resume_name,
    english_speaking: speaking || null, english_writing: writing || null
  });

  if (error) {
    /* The posting was confirmed open a moment ago, so a failure here is the
       database, not the applicant. Tidy the resume away so it is not left
       orphaned, and ask them to try again. */
    console.error('[apply] insert failed:', error.message);
    await sb.storage.from('applications').remove([resume_path]).then(() => {}, () => {});
    return fail('We could not file that application just now. Please try again in a few minutes.', 503);
  }

  recent.set(key, Date.now());
  if (recent.size > 500) for (const [k, t] of recent) if (Date.now() - t > COOLOFF) recent.delete(k);

  /* Two letters, neither of which may hold up the answer to the browser. */
  try {
    const role = post?.title ?? 'a role with Relève';
    const first = full_name.split(/\s+/)[0];
    const mine = templates.applicationReceived({ name: first, role });
    await send(email, mine);
    for (const addr of await teamEmailsAdmin()) {
      const tpl = templates.newApplication({
        full_name, role, email, phone, location, years, heard_via, links, resume_name,
        english_speaking: speaking || null, english_writing: writing || null, answers, note
      });
      await send(addr, tpl);
    }
  } catch { /* the application is filed either way */ }

  return NextResponse.json({ ok: true }, { headers: cors });
}
