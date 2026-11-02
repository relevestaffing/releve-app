/* Calendly, behind Relève's own booking screen.
   ---------------------------------------------
   Nona, 2 November 2026: nothing on the booking should repeat what the site
   already asked, and Calendly should not show on the website at all. With a
   paid Calendly plan the Scheduling API lets the site read the open times and
   book the call itself: the visitor only ever sees Relève's picker. The call
   still lands on hello@'s calendar with Zoom, and the event type's buffer and
   daily cap still apply, because Calendly is still the one booking it.

   Needs CALENDLY_TOKEN (a personal access token, set by Nona on the Netlify
   project). Optional CALENDLY_EVENT_TYPE (the event type URI); without it the
   Discovery Call is found by its /30min link. With no token every function
   here reports "not configured" and the site falls back to the Calendly
   embed, so nothing breaks before the plan is upgraded. */

const API = 'https://api.calendly.com';
const SLUG = '/30min';

export function calendlyConfigured() {
  return Boolean(process.env.CALENDLY_TOKEN);
}

async function call(path: string, init?: RequestInit & { json?: unknown }) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method: init?.method ?? (init?.json ? 'POST' : 'GET'),
    headers: {
      authorization: `Bearer ${process.env.CALENDLY_TOKEN}`,
      'content-type': 'application/json'
    },
    body: init?.json ? JSON.stringify(init.json) : undefined,
    cache: 'no-store'
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) {
    const why = body?.message || body?.title || body?.raw || res.statusText;
    const err: any = new Error(`Calendly ${res.status}: ${why}`);
    err.status = res.status; err.details = body?.details;
    throw err;
  }
  return body;
}

export type EventTypeInfo = {
  uri: string;
  durationMinutes: number;
  locationKind: string | null;
  questions: { name: string; position: number; required: boolean; type: string; enabled: boolean }[];
};

/* The Discovery Call's event type, cached for the life of the server. */
let cached: { at: number; info: EventTypeInfo } | null = null;
export async function discoveryEventType(): Promise<EventTypeInfo> {
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.info;
  let uri = process.env.CALENDLY_EVENT_TYPE || '';
  if (!uri) {
    const me = await call('/users/me');
    const user = me?.resource?.uri;
    const list = await call(`/event_types?user=${encodeURIComponent(user)}&active=true&count=100`);
    const match = (list?.collection ?? []).find((e: any) => String(e.scheduling_url || '').endsWith(SLUG));
    if (!match) throw new Error('The Discovery Call event type (/30min) was not found in Calendly.');
    uri = match.uri;
  }
  const et = (await call(uri))?.resource ?? {};
  const info: EventTypeInfo = {
    uri,
    durationMinutes: Number(et.duration) || 30,
    locationKind: et.locations?.[0]?.kind ?? null,
    questions: (et.custom_questions ?? []).map((q: any) => ({
      name: String(q.name || ''), position: Number(q.position) || 0,
      required: Boolean(q.required), type: String(q.type || ''), enabled: q.enabled !== false
    }))
  };
  cached = { at: Date.now(), info };
  return info;
}

/* Open start times between two instants (Calendly allows at most 7 days per
   request for this endpoint in practice, so longer ranges are split). */
export async function availableTimes(from: Date, to: Date): Promise<string[]> {
  const et = await discoveryEventType();
  const out: string[] = [];
  let start = new Date(Math.max(from.getTime(), Date.now() + 60_000));
  while (start < to) {
    const end = new Date(Math.min(to.getTime(), start.getTime() + 7 * 86_400_000));
    const q = `/event_type_available_times?event_type=${encodeURIComponent(et.uri)}`
      + `&start_time=${encodeURIComponent(start.toISOString())}&end_time=${encodeURIComponent(end.toISOString())}`;
    const r = await call(q);
    for (const s of r?.collection ?? []) if (s.status === 'available' && s.start_time) out.push(s.start_time);
    start = end;
  }
  return Array.from(new Set(out)).sort();
}

export type Booked = {
  start: string; end: string; joinUrl: string | null;
  cancelUrl: string | null; rescheduleUrl: string | null; eventUri: string | null;
};

/* Book the call. Answers go into the event type's own questions by name, so
   the phone and the notes land where Calendly (and the calendar import) expect
   them; a required question we have no answer for is filled with a dash
   rather than failing the booking. */
export async function bookCall(o: {
  name: string; email: string; timezone: string; start: string;
  phone?: string | null; notes?: string | null; utmSource?: string | null;
}): Promise<Booked> {
  const et = await discoveryEventType();
  const qa: { question: string; answer: string; position: number }[] = [];
  for (const q of et.questions.filter(q => q.enabled)) {
    let answer: string | null = null;
    if (/phone/i.test(q.name) || q.type === 'phone_number') answer = o.phone || null;
    else if (/anything else|notes?|know before/i.test(q.name)) answer = o.notes || null;
    if (!answer && q.required) answer = '-';
    if (answer) qa.push({ question: q.name, answer: answer.slice(0, 1000), position: q.position });
  }
  const parts = o.name.trim().split(/\s+/);
  const body: Record<string, unknown> = {
    event_type: et.uri,
    start_time: new Date(o.start).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    invitee: {
      name: o.name, first_name: parts[0], last_name: parts.slice(1).join(' ') || undefined,
      email: o.email, timezone: o.timezone || 'America/Los_Angeles'
    },
    ...(et.locationKind ? { location: { kind: et.locationKind } } : {}),
    ...(qa.length ? { questions_and_answers: qa } : {}),
    ...(o.utmSource ? { tracking: { utm_source: o.utmSource } } : {})
  };
  const r = await call('/invitees', { json: body });
  const inv = r?.resource ?? {};
  let start = String(body.start_time), end = new Date(new Date(start).getTime() + et.durationMinutes * 60_000).toISOString();
  let joinUrl: string | null = null;
  if (inv.event) {
    try {
      const ev = (await call(inv.event))?.resource ?? {};
      start = ev.start_time || start; end = ev.end_time || end;
      joinUrl = ev.location?.join_url || (/^https?:/.test(ev.location?.location || '') ? ev.location.location : null);
    } catch { /* the booking stands; the confirmation just carries no Zoom link */ }
  }
  return {
    start, end, joinUrl,
    cancelUrl: inv.cancel_url ?? null, rescheduleUrl: inv.reschedule_url ?? null, eventUri: inv.event ?? null
  };
}
