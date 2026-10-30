/* Publishing to Instagram and Facebook through Meta's own API (30 October 2026).
   Free: Relève's own Meta app, in development mode, used only by Sage on
   Relève's own pages, needs no App Review. Sage connects once from the
   Content tab; the long-lived page tokens that come back do not expire.
   Relative imports only, so the background worker can bundle this. */

export const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}`;
export const META_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts',
  'instagram_basic', 'instagram_content_publish', 'business_management'
];

export type MetaPage = { id: string; name: string; token: string; ig: { id: string; username: string } | null };
export type MetaConn = { pages: MetaPage[]; client: string | null; careers: string | null; connected_at: string; user_name?: string };

export function metaAppReady() { return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET); }

async function call(path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'POST') {
  const url = new URL(`${GRAPH()}${path}`);
  let body: URLSearchParams | undefined;
  if (method === 'GET') Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  else body = new URLSearchParams(params);
  const r = await fetch(url, { method, body });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Meta: ${j?.error?.message ?? `status ${r.status}`}`);
  return j;
}

/* ---------- connecting ---------- */

export function metaAuthUrl(redirect: string, state: string) {
  const u = new URL(`https://www.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/dialog/oauth`);
  u.searchParams.set('client_id', process.env.META_APP_ID!);
  u.searchParams.set('redirect_uri', redirect);
  u.searchParams.set('state', state);
  /* A Business-type app logs in through "Facebook Login for Business", which
     takes a saved configuration instead of a list of permissions. */
  if (process.env.META_LOGIN_CONFIG_ID) u.searchParams.set('config_id', process.env.META_LOGIN_CONFIG_ID);
  else u.searchParams.set('scope', META_SCOPES.join(','));
  return u.toString();
}

/* Code -> long-lived user token -> every page Sage manages, with its own
   token and its linked Instagram business account. */
export async function metaExchange(code: string, redirect: string): Promise<{ pages: MetaPage[]; user_name?: string }> {
  const short = await call('/oauth/access_token', {
    client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: redirect, code
  }, 'GET');
  const long = await call('/oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: short.access_token
  }, 'GET');
  const me = await call('/me', { fields: 'name', access_token: long.access_token }, 'GET').catch(() => ({}));
  const acc = await call('/me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '50', access_token: long.access_token
  }, 'GET');
  const pages: MetaPage[] = (acc.data ?? []).map((p: any) => ({
    id: p.id, name: p.name, token: p.access_token,
    ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? '' } : null
  }));
  return { pages, user_name: me?.name };
}

/* ---------- publishing ---------- */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function igWait(container: string, token: string, maxMs = 60000) {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    const s = await call(`/${container}`, { fields: 'status_code,status', access_token: token }, 'GET');
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram could not process the media: ${s.status ?? s.status_code}`);
    await sleep(3000);
  }
  throw new Error('Instagram is still processing the media.');
}

/* images: public JPEG URLs, one for a card, several for a carousel. */
export async function igPublishImages(igId: string, token: string, images: string[], caption: string) {
  let creation: string;
  if (images.length === 1) {
    creation = (await call(`/${igId}/media`, { image_url: images[0], caption, access_token: token })).id;
  } else {
    const kids: string[] = [];
    for (const url of images.slice(0, 10)) {
      kids.push((await call(`/${igId}/media`, { image_url: url, is_carousel_item: 'true', access_token: token })).id);
    }
    creation = (await call(`/${igId}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption, access_token: token })).id;
  }
  await igWait(creation, token);
  const pub = await call(`/${igId}/media_publish`, { creation_id: creation, access_token: token });
  return pub.id as string;
}

/* A video becomes a Reel. Processing can take minutes, so this starts it
   and returns the container; igFinishReel publishes once it is ready. */
export async function igStartReel(igId: string, token: string, videoUrl: string, caption: string) {
  return (await call(`/${igId}/media`, { media_type: 'REELS', video_url: videoUrl, caption, share_to_feed: 'true', access_token: token })).id as string;
}
export async function igFinishReel(igId: string, token: string, container: string): Promise<string | null> {
  const s = await call(`/${container}`, { fields: 'status_code,status', access_token: token }, 'GET');
  if (s.status_code === 'IN_PROGRESS') return null;
  if (s.status_code !== 'FINISHED') throw new Error(`Instagram could not process the video: ${s.status ?? s.status_code}`);
  return (await call(`/${igId}/media_publish`, { creation_id: container, access_token: token })).id as string;
}

export async function fbPublishImages(pageId: string, token: string, images: string[], message: string) {
  if (images.length === 1) {
    return (await call(`/${pageId}/photos`, { url: images[0], caption: message, access_token: token })).post_id ?? null;
  }
  const ids: string[] = [];
  for (const url of images.slice(0, 10)) ids.push((await call(`/${pageId}/photos`, { url, published: 'false', access_token: token })).id);
  const params: Record<string, string> = { message, access_token: token };
  ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  return (await call(`/${pageId}/feed`, params)).id as string;
}

export async function fbPublishVideo(pageId: string, token: string, videoUrl: string, description: string) {
  return (await call(`/${pageId}/videos`, { file_url: videoUrl, description, access_token: token })).id as string;
}
