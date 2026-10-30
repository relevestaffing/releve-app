/* Publishing to LinkedIn (30 October 2026).
   Sage's own profile: LinkedIn's self-serve "Share on LinkedIn" product, free,
   no review. The token lasts 60 days, so the Content tab and the morning email
   say when it is time to reconnect (one click).
   The Relève LinkedIn pages need LinkedIn's Community Management API, which
   LinkedIn approves by application. Until then the page posts are prepared
   for LinkedIn's own scheduler. Once approved, set LINKEDIN_PAGE_ACCESS=1 and
   the page ids, reconnect, and pages post themselves too.
   Relative imports only, so the background worker can bundle this. */

export type LinkedInConn = {
  token: string; expires_at: string; person_urn: string; name: string; scopes: string[]; connected_at: string;
};

export function linkedinAppReady() { return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET); }
export const pageAccess = () => process.env.LINKEDIN_PAGE_ACCESS === '1';
export const orgFor = (which: 'client' | 'careers') =>
  (which === 'client' ? process.env.LINKEDIN_ORG_CLIENT : process.env.LINKEDIN_ORG_CAREERS) || '';

export function linkedinScopes() {
  return ['openid', 'profile', 'w_member_social', ...(pageAccess() ? ['w_organization_social', 'r_organization_social'] : [])];
}

/* LinkedIn's versioned API wants a recent YYYYMM; two months back is always live. */
function apiVersion() {
  if (process.env.LINKEDIN_API_VERSION) return process.env.LINKEDIN_API_VERSION;
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 2);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function linkedinAuthUrl(redirect: string, state: string) {
  const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', process.env.LINKEDIN_CLIENT_ID!);
  u.searchParams.set('redirect_uri', redirect);
  u.searchParams.set('state', state);
  u.searchParams.set('scope', linkedinScopes().join(' '));
  return u.toString();
}

export async function linkedinExchange(code: string, redirect: string): Promise<LinkedInConn> {
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirect,
      client_id: process.env.LINKEDIN_CLIENT_ID!, client_secret: process.env.LINKEDIN_CLIENT_SECRET!
    })
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`LinkedIn: ${j.error_description ?? j.error ?? `status ${r.status}`}`);
  const me: any = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { authorization: `Bearer ${j.access_token}` } })
    .then(x => x.json()).catch(() => ({}));
  if (!me.sub) throw new Error('LinkedIn did not say whose account this is.');
  return {
    token: j.access_token,
    expires_at: new Date(Date.now() + (Number(j.expires_in) || 5184000) * 1000).toISOString(),
    person_urn: `urn:li:person:${me.sub}`, name: me.name ?? '',
    scopes: String(j.scope ?? '').split(/[ ,]+/).filter(Boolean), connected_at: new Date().toISOString()
  };
}

/* LinkedIn's post text treats these characters as markup; escape them so the
   words read exactly as written. */
export function littleText(s: string) {
  return s.replace(/[\\|{}@\[\]()<>#*_~]/g, m => `\\${m}`);
}

function headers(token: string, json = true): Record<string, string> {
  return {
    authorization: `Bearer ${token}`, 'LinkedIn-Version': apiVersion(), 'X-Restli-Protocol-Version': '2.0.0',
    ...(json ? { 'content-type': 'application/json' } : {})
  };
}

async function uploadImage(token: string, owner: string, bytes: Buffer, type: string) {
  const r = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST', headers: headers(token), body: JSON.stringify({ initializeUploadRequest: { owner } })
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`LinkedIn image: ${j.message ?? r.status}`);
  const { uploadUrl, image } = j.value;
  const up = await fetch(uploadUrl, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': type }, body: new Uint8Array(bytes) });
  if (!up.ok) throw new Error(`LinkedIn image upload: status ${up.status}`);
  return image as string;
}

/* One post with one or more images (LinkedIn shows several as a grid). */
export async function linkedinPost(conn: LinkedInConn, author: string, text: string, images: { bytes: Buffer; type: string }[]) {
  const ids: string[] = [];
  for (const im of images.slice(0, 9)) ids.push(await uploadImage(conn.token, author, im.bytes, im.type));
  const content = ids.length === 1 ? { media: { id: ids[0] } }
    : ids.length > 1 ? { multiImage: { images: ids.map(id => ({ id })) } } : undefined;
  const r = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST', headers: headers(conn.token),
    body: JSON.stringify({
      author, commentary: littleText(text), visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(content ? { content } : {}),
      lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false
    })
  });
  if (!r.ok) {
    const j: any = await r.json().catch(() => ({}));
    throw new Error(`LinkedIn: ${j.message ?? `status ${r.status}`}`);
  }
  return r.headers.get('x-restli-id') ?? 'posted';
}
