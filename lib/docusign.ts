import { createHmac, createSign, timingSafeEqual } from 'crypto';

/* DocuSign, the same way Stripe is handled in this file's sibling: plain
   fetch rather than their SDK, so a release stays a two-command job on
   Sage's own Mac and adds nothing to package.json. The JWT that logs the
   app in is signed with Node's own crypto — the same "thirty lines"
   Stripe's webhook check already is — rather than a JWT library pulled in
   for one call.

   Sends the talent contractor agreement + NDA from a DocuSign Template
   Sage builds once, by hand, in her own account: the signature and date
   fields live on the template, not something this code places on a raw
   PDF. Fully built and gracefully does nothing until every credential
   below exists — the same pattern Zoom and Google Calendar already use. */

const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY;
const USER_ID = process.env.DOCUSIGN_USER_ID;
/* The RSA private key DocuSign generates for the Integration Key, PEM
   text. Netlify environment variables cannot hold a real newline, so this
   is stored with literal \n escapes and unescaped below — same trick as
   any multi-line secret in a single-line env var. */
const PRIVATE_KEY = process.env.DOCUSIGN_PRIVATE_KEY;
const TEMPLATE_ID = process.env.DOCUSIGN_TALENT_AGREEMENT_TEMPLATE_ID;
/* The HMAC key configured on the Connect subscription that delivers the
   webhook below — separate from the four above, and needed only once
   sending is live and something has to trust what comes back. */
const CONNECT_KEY = process.env.DOCUSIGN_CONNECT_KEY;
const PROD = process.env.DOCUSIGN_ENV === 'production';
const AUTH_SERVER = PROD ? 'account.docusign.com' : 'account-d.docusign.com';

export function docusignReady() {
  return Boolean(INTEGRATION_KEY && USER_ID && PRIVATE_KEY && TEMPLATE_ID);
}
export function docusignWebhookReady() { return Boolean(CONNECT_KEY); }

export class DocuSignError extends Error {}

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* A JWT Grant assertion. One-hour lifetime; cheap enough to build fresh on
   every call rather than caching the assertion itself (the access token
   it buys is what gets cached, below). */
function buildAssertion(): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    iss: INTEGRATION_KEY, sub: USER_ID, aud: AUTH_SERVER,
    iat: now, exp: now + 3600, scope: 'signature impersonation'
  }));
  const key = (PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  const signature = base64url(createSign('RSA-SHA256').update(`${header}.${payload}`).sign(key));
  return `${header}.${payload}.${signature}`;
}

let cached: { token: string; accountId: string; baseUri: string; exp: number } | null = null;

/* Logs the app in as Sage's own DocuSign account, impersonation-style.
   The very first call for a new Integration Key + user always fails with
   consent_required — nothing broken, just the one thing only a human can
   do: docusignConsentUrl() below builds the approval link. */
async function authenticate() {
  if (!docusignReady()) throw new DocuSignError('DocuSign is not configured yet.');
  if (cached && cached.exp > Date.now() + 60_000) return cached;

  const tokRes = await fetch(`https://${AUTH_SERVER}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: buildAssertion()
    })
  });
  const tok: any = await tokRes.json().catch(() => ({}));
  if (!tokRes.ok) {
    const why = tok.error === 'consent_required'
      ? 'DocuSign needs one-time consent — open the approval link (docusignConsentUrl) signed in as the sending account, then try again.'
      : (tok.error_description ?? tok.error ?? 'DocuSign refused the login.');
    throw new DocuSignError(why);
  }

  /* The account id and API host are per-account, not guessable from the
     Integration Key alone — this is the one call that discovers both. */
  const userRes = await fetch(`https://${AUTH_SERVER}/oauth/userinfo`, {
    headers: { authorization: `Bearer ${tok.access_token}` }
  });
  const user: any = await userRes.json().catch(() => ({}));
  const account = (user.accounts ?? []).find((a: any) => a.is_default) ?? user.accounts?.[0];
  if (!account) throw new DocuSignError('That DocuSign login has no account attached.');

  cached = {
    token: tok.access_token, accountId: account.account_id,
    baseUri: `${account.base_uri}/restapi`,
    exp: Date.now() + (tok.expires_in ?? 3600) * 1000
  };
  return cached;
}

/* The one-time approval link consent_required is asking for. Visit it
   signed in as the DocuSign account that will send agreements, once, any
   time after the Integration Key and RSA key exist. */
export function docusignConsentUrl(): string {
  const redirect = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';
  return `https://${AUTH_SERVER}/oauth/auth?response_type=code&scope=signature%20impersonation`
    + `&client_id=${INTEGRATION_KEY}&redirect_uri=${encodeURIComponent(redirect)}`;
}

/* Sends the talent contractor agreement + NDA from the template Sage owns.
   The template supplies the document and the fields; this only says who
   it goes to. Returns the envelope id the webhook will report back
   against, so it is stored on the vetting row that requested the send.

   clientUserId marks the recipient as an embedded signer rather than a
   remote one: DocuSign then holds the envelope for this app to present
   (via embeddedSigningUrl below) instead of emailing a signing link
   itself. Always pass the talent's own profile id here — set once, at
   send time, it cannot be added later, so both the admin-initiated send
   and the talent's own "sign now" use the same value (their profile id)
   and the envelope stays embeddable either way. */
export async function sendTalentAgreement(
  o: { name: string; email: string; clientUserId: string }
): Promise<string> {
  const { token, accountId, baseUri } = await authenticate();
  const res = await fetch(`${baseUri}/v2.1/accounts/${accountId}/envelopes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      templateId: TEMPLATE_ID,
      templateRoles: [{
        name: o.name, email: o.email, roleName: 'Signer', clientUserId: o.clientUserId
      }],
      status: 'sent'
    })
  });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new DocuSignError(out.message ?? 'DocuSign would not send that.');
  return out.envelopeId as string;
}

/* The embedded signing ceremony itself: a one-time-use URL good for a few
   minutes, which is why this is called fresh on every "Sign now" click
   rather than stored. clientUserId here has to be byte-identical to the
   one the envelope was created with above, or DocuSign refuses the view. */
export async function embeddedSigningUrl(o: {
  envelopeId: string; name: string; email: string; clientUserId: string; returnUrl: string;
}): Promise<string> {
  const { token, accountId, baseUri } = await authenticate();
  const res = await fetch(
    `${baseUri}/v2.1/accounts/${accountId}/envelopes/${o.envelopeId}/views/recipient`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        returnUrl: o.returnUrl, authenticationMethod: 'none',
        email: o.email, userName: o.name, clientUserId: o.clientUserId
      })
    }
  );
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new DocuSignError(out.message ?? 'DocuSign would not open that for signing.');
  return out.url as string;
}

/* The signed, completed document set — called once the webhook says the
   envelope is done, not before: DocuSign refuses this call on anything
   still in progress. */
export async function downloadCompletedEnvelope(envelopeId: string): Promise<Buffer> {
  const { token, accountId, baseUri } = await authenticate();
  const res = await fetch(
    `${baseUri}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/combined`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new DocuSignError(`Could not fetch the signed copy for envelope ${envelopeId}.`);
  return Buffer.from(await res.arrayBuffer());
}

/* DocuSign Connect signs its webhook body with the HMAC key configured on
   the Connect subscription — checked exactly the way Stripe's webhook is,
   because underneath it is the same thirty lines either way. Simpler than
   Stripe's: no timestamp to age-check, just a base64 HMAC-SHA256 of the
   raw body. */
export function verifyDocuSignWebhook(rawBody: string, signatureHeader: string | null): void {
  if (!CONNECT_KEY) throw new DocuSignError('No DOCUSIGN_CONNECT_KEY is set, so webhooks cannot be trusted.');
  if (!signatureHeader) throw new DocuSignError('No signature on that request.');
  const expected = createHmac('sha256', CONNECT_KEY).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(expected, 'utf8'), b = Buffer.from(signatureHeader, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new DocuSignError('That signature does not match.');
}
