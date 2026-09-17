/* ============================================================
   ZOOM — server-to-server OAuth.
   ⚠ SERVER ONLY. The three credentials never reach the browser.
   If they are not set, booking still works and the meeting link
   is simply left for someone to paste in.
   ============================================================ */
const ACCOUNT = process.env.ZOOM_ACCOUNT_ID;
const CLIENT = process.env.ZOOM_CLIENT_ID;
const SECRET = process.env.ZOOM_CLIENT_SECRET;

export const zoomConfigured = () => !!(ACCOUNT && CLIENT && SECRET);

let cached: { token: string; expires: number } | null = null;
async function token(): Promise<string> {
  if (cached && cached.expires > Date.now() + 30_000) return cached.token;
  const basic = Buffer.from(`${CLIENT}:${SECRET}`).toString('base64');
  const r = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ACCOUNT}`, {
    method: 'POST', headers: { Authorization: `Basic ${basic}` }
  });
  if (!r.ok) throw new Error(`Zoom auth failed (${r.status}). Check the three ZOOM_ values.`);
  const d = await r.json();
  cached = { token: d.access_token, expires: Date.now() + d.expires_in * 1000 };
  return cached.token;
}

export type Meeting = { url: string; id: string; passcode?: string };

export async function createZoomMeeting(opts: {
  topic: string; startISO: string; durationMin: number; timezone: string; agenda?: string;
}): Promise<Meeting | null> {
  if (!zoomConfigured()) return null;
  const t = await token();
  const r = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      topic: opts.topic, type: 2,
      start_time: opts.startISO.replace(/\.\d{3}Z$/, 'Z'),
      duration: opts.durationMin, timezone: opts.timezone, agenda: opts.agenda ?? '',
      settings: {
        join_before_host: true, waiting_room: false,
        approval_type: 2, audio: 'both', auto_recording: 'none'
      }
    })
  });
  if (!r.ok) throw new Error(`Zoom could not create the meeting (${r.status}): ${await r.text()}`);
  const d = await r.json();
  return { url: d.join_url, id: String(d.id), passcode: d.password };
}

export async function cancelZoomMeeting(id: string) {
  if (!zoomConfigured() || !id) return;
  const t = await token();
  const r = await fetch(`https://api.zoom.us/v2/meetings/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
  /* 404 means Zoom already has no record of it (deleted by hand, or never
     really created) — not a failure worth surfacing. Anything else is a
     real failure and used to disappear here silently (admin-console audit). */
  if (!r.ok && r.status !== 404) {
    throw new Error(`Zoom could not cancel meeting ${id} (${r.status}): ${await r.text().catch(() => '')}`);
  }
}
