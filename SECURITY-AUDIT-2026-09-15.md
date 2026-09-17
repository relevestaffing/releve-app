# Relève: pre-launch security and privacy audit
**15 September 2026. Covers the app, the marketing site, the database, and the platform accounts.**

Method: four parallel code review agents across the full codebase, plus live testing against production (HTTP headers, DNS, WHOIS, and anonymous reads against the live Supabase REST API). Every finding below was confirmed against the running system or the actual source, not inferred. Where a test was inconclusive, it says so.

---

## The short version

The application itself is in better shape than most pre-launch products. Row level security is on all 42 tables with 124 policies, both payment webhooks verify signatures before acting, no secret is exposed to the browser, and the margin confidentiality that the business depends on is enforced in the database rather than in the interface. That is the hard part, and it is done.

The problems are at the edges: what is published about you personally, one assessment field shown to the wrong audience, an open storage policy, and a database that has drifted behind the code in a way that silently disabled a vetting gate.

Nothing here is evidence of a breach. These are gaps to close before real client money and real identity documents arrive.

---

# STATUS: what is now fixed, and what is still yours

Everything below was applied to `~/Releve/releve-app` and verified with a clean TypeScript check and a **full production build**. None of it is live until you deploy.

## Fixed in code, waiting on one deploy

| # | Finding | What changed |
|---|---|---|
| 1.1 | Home address published | Removed from `terms.html`, `privacy.html` and both markdown sources. Governing law and venue moved to Utah. Three `.bak` files that would have deployed the old address were moved out of `releve-site-deploy/`. |
| 2.1 | Executives saw candidates' Drive score | New `L2_SHOWN` in `lib/signature/model.ts` filters flag axes. Applied to all five user-facing surfaces; the console still sees everything, which is correct. |
| 2.4 | Uploads trusted the browser's word | New `lib/filetype.ts`. `apply`, `photo` and `video` now check the real bytes before writing, the same way `vetting` already did. |
| 2.5 | Rate limiter failed open | `/api/apply` now refuses with a retry message when the limiter itself fails, instead of silently removing all rate limiting. |
| 2.6 | Email templates injected raw HTML | `newMessage`, `checkinFlagged` and `vettingRejected` now escape. `full_name` is capped, and `photo_url` can no longer be pointed at an off-site server. |
| 2.7 | Raw database errors returned to callers | New `lib/errors.ts` tells a deliberate business-rule message from a Postgres one. 33 route files updated. Your own guard messages still reach people; schema detail does not. |
| 2.8 | Demo mode failed open to admin | Now requires `NEXT_PUBLIC_DEMO_MODE=1`. A build with missing variables signs nobody in instead of everybody in as Relève. All 16 admin guards decoupled from the same variable. |
| 2.11 | No framing or referrer protection | `next.config.mjs` now sends `frame-ancestors`, `X-Frame-Options`, `Referrer-Policy`, `nosniff` and `Permissions-Policy`. |
| F14 | Unbounded message bodies | Capped at 8,000 characters, matching every comparable route. |
| F9 | Path traversal in the vetting link | Any path containing `..` is refused outright. |
| 2.9 | The booby-trapped schema extract | `supabase/schema-remaining.sql` moved to `~/Releve/_to_delete/schema-remaining.sql.DO-NOT-RUN`. It can no longer be reached for by mistake. |

## Fixed in the database, waiting on one SQL run

`PART 28` was appended to `supabase/schema.sql`, which is written to be re-run in full:

- `talent_verification_badges` gets `security_invoker`, closing the one view that genuinely read past row-level security.
- The resume storage policy is scoped to the paths `/api/apply` actually writes, instead of accepting writes anywhere in the bucket.
- A check that prints a warning if `talent_directory` ever loses `security_invoker` again.

Running the whole file also applies **PART 27**, which never made it to the live database. That is what restores the Taking The Watch gate.

## Deliberately NOT changed, and why

**2.2, the `signatures` column exposure.** This is the one finding I did not fix. Postgres row-level security filters rows, never columns, so the real fix is a narrowed client-facing view plus a revoke, and the app has to be changed to query the view at the same time. Get it wrong and executives stop seeing their candidates entirely, which is the business. Your own standing rule in the Relève Book is that RLS changes get flagged rather than made, and this is exactly the case that rule is for.

It is also narrower than it first reads: an executive can reach the validity verdict and Drive facets **for candidates already released to them**, and only by opening devtools. Removing the on-screen display, which is done, closes the casual path. The rest deserves a session of its own with a test pass afterwards.

**A captcha on the apply form.** Needs a change to the marketing site and a third-party service. Worth doing before you publicise the careers page widely.

**A full Content-Security-Policy.** `frame-ancestors` is in, which is the part that protects the deposit and signing screens. A real `script-src` needs testing against every page and would break the app if it were wrong.

## Your list, in order

1. **Run the schema.** From your own Terminal, the command in the Relève Book's Commands section:
   `PGPASSWORD='<db password>' psql -h aws-0-us-east-2.pooler.supabase.com -p 5432 -U postgres.lsionxcnatbozrzmftjh -d postgres -f ~/Releve/releve-app/supabase/schema.sql`
   Two `NOTICE` lines are normal. Look for `talent_directory: security_invoker confirmed.` If you see a `WARNING` about it instead, tell me.
2. **Deploy the app.** `cd ~/Releve/releve-app && npx netlify deploy --build --prod`
3. **Deploy the marketing site.** Drag `~/Releve/releve-site-deploy` onto the **marketing site's** Deploys tab, not the app's. Check the domain at the top of the Netlify project before you drop it.
4. **Add the DMARC record.** Squarespace Domains, DNS for relevestaffing.com. Edit the existing `_dmarc` TXT record to:
   `v=DMARC1; p=none; rua=mailto:hello@relevestaffing.com`
   Leave it a week, then change `p=none` to `p=quarantine`, and a week after that to `p=reject` and SPF from `~all` to `-all`. Do not skip to reject.
5. **Set the Relève Book to private.** It is shared with anyone who has the link.

---

# Part 1: personal security

## 1.1 Your home address is published on the live website
**Severity: HIGH. Confirmed live.**

`https://relevestaffing.com/terms` and `https://relevestaffing.com/privacy` both end with:

```
Relève Staffing
25 Via Lucca
Irvine, CA
United States
```

Source files: `~/Releve/releve-site-deploy/terms.html` line 165, `~/Releve/releve-site-deploy/privacy.html` line 201, and the two markdown originals `~/Releve/terms-of-service.md` line 131 and `~/Releve/privacy-policy.md` line 150.

This is the exposure the caller was referring to. It is indexed by search engines, it is on two pages that legal and compliance scrapers specifically crawl, and Via Lucca is a residential condominium community, so the street alone identifies the building even without the unit number.

It also appears in the Relève Book artifact under Commercial terms, as "Registered address: 25 Via Lucca, Irvine, CA".

**What it is not:** it is not in the application codebase. I searched every `.ts`, `.tsx`, `.sql`, `.json` and `.md` file in `releve-app` and there is not one instance. The app is clean.

**Fix:** replace it everywhere with a non residential mailing address. See the decision note at the end, because this needs a real address rather than a deletion. Both pages need redeploying to the marketing site's Netlify project afterward.

## 1.2 The Relève Book artifact is shared with anyone who has the link
**Severity: MEDIUM to HIGH, depending on who has the link.**

The artifact at `claude.ai/code/artifact/bdc58743...` reports its sharing state as "shared with anyone with the link". It contains your address, the full commercial terms including exact fee bands and the non circumvention penalty, the complete platform architecture, the Signature assessment methodology which is your core IP, and the note that no attorney has reviewed the terms.

A link that has been shared once cannot be unshared from the recipient's history. Consider setting it back to private and treating the current link as compromised.

## 1.3 Domain registration is clean
**No action needed.** WHOIS and RDAP return no registrant name, address, phone or email. Squarespace Domains redacts it. `clientDeleteProhibited` and `clientTransferProhibited` are both set, so the domain cannot be transferred out without unlocking it first, and DNSSEC is signed. This is genuinely well configured.

## 1.4 Anyone can send email that appears to come from relevestaffing.com
**Severity: HIGH. Confirmed live.**

```
SPF:   v=spf1 include:_spf.google.com ~all      (softfail, not enforced)
DMARC: v=DMARC1; p=none;                        (monitoring only, nothing is rejected)
DKIM:  present and correct on the google selector
```

`p=none` means you have asked receiving mail servers to do nothing about forgeries. `~all` asks them to accept forgeries with a soft warning. Together they mean a stranger can send an email that arrives in your client's inbox appearing to come from `hello@relevestaffing.com`, and it will very likely land in the primary folder.

For a business that emails invoices and payment links to people paying $2,500 to $4,500 a month, this is the highest value attack available against you. A forged "our bank details have changed" email to a new client is the entire fraud.

**Fix, in order, over about two weeks:**
1. Now: `v=DMARC1; p=none; rua=mailto:hello@relevestaffing.com` so you start receiving reports on who is sending as you.
2. After a week of clean reports: `p=quarantine; pct=100`.
3. After another week: `p=reject`, and change SPF from `~all` to `-all`.

Do not jump straight to `p=reject`. If any legitimate service sends on your behalf, it will start failing silently.

---

# Part 2: the application

## 2.1 Executives can see each candidate's Drive score
**Severity: HIGH. Confirmed in code.**

`lib/signature/model.ts:59` defines Drive as `type:'flag', w:0`. It is deliberately excluded from match scoring, and the Relève Book states it is "measured but never scored, an internal retention flag, visible only in the console".

But `lib/signature/model.ts:418` defines `L2` as every layer 2 axis, which includes Drive, and `app/app/pipeline/page.tsx:166` renders `<AxisBars values={person.scores} axes={L2} />` on the executive facing page. `components/Viz.tsx:68` draws each one as a labelled bar with a number.

So an executive who expands "See the full assessment" reads `Settled · Drive · 78 · Ambitious` for a candidate.

Drive measures how likely someone is to outgrow the role and leave. You are showing your paying client a prediction about whether the person they are about to hire will stay. It damages the candidate, it damages the placement, and it is the opposite of what the product promises.

The same fields are shown to the talent about themselves at `app/app/signature/page.tsx:87` and `app/app/profile/page.tsx:133`, which is a smaller problem but still contradicts "never scored or shown".

**Fix:** add `export const L2_SHOWN = L2.filter(a => a.type !== 'flag')` in `lib/signature/model.ts` and use it on every surface outside `app/console/`. One line plus three import changes.

## 2.2 Assessment validity verdicts and Drive facets are readable from the browser
**Severity: HIGH. Policy confirmed in code.**

`supabase/schema.sql:3548` grants SELECT on the entire `signatures` row to any client holding a released match for that talent. The row includes `validity` (the verdict, impression management score, attention check failures, inconsistency and straight lining flags) and `facets` (including `d_ambition`, `d_learning`, `d_grit`).

Postgres row level security controls which rows are visible, never which columns. So even though `app/app/pipeline/page.tsx:196` correctly displays only a confidence band, the underlying data is one request away. A signed in executive can open devtools and run a query against `/rest/v1/signatures` with their own token and read the candidate's raw validity verdict.

This is what makes 2.1 more than a display bug: filtering the UI does not remove the data.

**Fix:** the schema already uses the right pattern elsewhere for `talent_pay`. Create a narrowed client facing view exposing only the fields an executive should see, then `revoke select on signatures from authenticated` and grant on the view instead. Roughly twenty lines of SQL.

## 2.3 Anyone on the internet can write unlimited files into your storage
**Severity: HIGH. Confirmed in schema.**

`supabase/schema.sql:2145`:

```sql
create policy "anyone may attach a resume" on storage.objects for insert
  with check (bucket_id = 'applications');
```

No path restriction, no owner check, no size or count limit. The anonymous key is public by design, it ships in every visitor's browser bundle. So a script can post directly to the Supabase Storage API and write files into that bucket forever, never touching `/api/apply` and never hitting your rate limiter.

Files cannot be read back or overwritten, since there is no anonymous SELECT or UPDATE policy. So this is not a data disclosure. It is an uncapped storage bill and a bucket full of rubbish, and it is available to anyone who views the page source.

**Fix:** scope the policy to the path prefix the route actually writes to, and add a storage quota alert in the Supabase dashboard.

## 2.4 Uploaded resumes are trusted to be what the browser claims
**Severity: MEDIUM to HIGH.**

`app/api/apply/route.ts:121` checks `RESUME_TYPES.includes(file.type)`. `file.type` is a string supplied by the caller, not read from the file. The vetting route does this correctly with magic byte sniffing via `looksLike()` at line 16, called before the write at line 72. Apply was missed, and so were photo (`app/api/photo/route.ts:18`) and video (`app/api/video/route.ts:22`).

So someone can upload an executable, an HTML file, or a zip bomb labelled `application/pdf`, and you will open it from the console. The photo route additionally hardcodes `contentType: 'image/jpeg'` on write regardless of the real bytes.

**Fix:** call the existing `looksLike()` from all three routes. It is already written and tested.

## 2.5 The application rate limiter fails open
**Severity: MEDIUM to HIGH.**

`app/api/apply/route.ts:88` wraps the `apply_allowed` database call in `try { ... } catch { /* stay open */ }` and only rejects when the call succeeds and explicitly returns false. Any failure, a paused project, a connection blip, a migration that was never applied, removes rate limiting entirely and silently.

There is also no captcha and no email verification, and every accepted application sends one email to the applicant plus one per team member. Google Workspace caps you at roughly 2,000 sends a day. Burn that and every transactional email in the platform stops: invoices, interview confirmations, onboarding links, all of it, with no error anyone sees.

**Fix:** make the limiter reject when the check fails, and put a captcha on the marketing site form.

## 2.6 Three email templates interpolate user text without escaping
**Severity: MEDIUM.**

- `lib/email.ts:348` `newMessage` inserts `${o.from}` and `${o.preview}` raw. The preview is the first 180 characters of any message a signed in talent or executive posts.
- `lib/email.ts:710` `checkinFlagged` inserts `${o.why}` raw, taken from the talent's typed check in.
- `lib/email.ts:753` `vettingRejected` inserts an admin typed reason raw.

So a talent can type an anchor tag into a placement message and the executive receives it as a live clickable link inside a genuine, correctly signed Relève email. That is a well built phishing vector, because every authentication signal on the mail is real.

The `newApplication` template does this correctly with `esc()`. The reasoning in the comment at `lib/email.ts:166`, that signed in users do not need escaping, is the flaw.

**Fix:** wrap those variables in the existing `esc()`. Three lines.

Related, `app/api/profile/route.ts:14` accepts `full_name` with no length cap and `photo_url` as any string, which is then rendered as an `<img src>` across the console. A talent can point it at their own server and get your IP and a timestamp every time you open their profile.

## 2.7 Database error text is returned to callers
**Severity: MEDIUM.**

About twenty routes use `catch (e: any) { return NextResponse.json({ error: e.message }) }`. Postgres error messages name tables, columns, constraints and policies. Any signed in user can map your schema by sending deliberately malformed requests, which is the reconnaissance step before everything else in this document.

**Fix:** one generic message to the caller, full detail to the server log.

## 2.8 Demo mode fails open to full admin
**Severity: architectural. Production is currently safe, and I tested this.**

`lib/supabase/server.ts:33`: when `configured()` is false, `currentProfile()` returns a profile based on an unsigned cookie, and `releve_demo_role=admin` returns `DEMO_ADMIN`. `configured()` is false whenever the two `NEXT_PUBLIC_SUPABASE_*` variables are missing.

Those variables are inlined at build time, not read at runtime. So if a build ever runs without them present, the deployed site permanently serves full admin to anyone who sets a cookie, while the Netlify dashboard still shows the variables as configured.

I tested production directly. `GET /console` with `Cookie: releve_demo_role=admin` redirects to `/`. **You are not exposed today.** Sixteen admin routes and console pages also write their guard as `if (configured() && role !== 'admin')`, which couples authorization to the same variable.

**Fix:** make demo mode require an explicit `DEMO_MODE=1` rather than inferring it from missing configuration, so the failure direction reverses. Then drop `configured() &&` from the sixteen guards.

## 2.9 The live database is behind the code, and the Watch gate is not running
**Severity: HIGH, and the next database update is booby trapped. Confirmed live.**

I identified which version of `talent_directory` is live by testing which columns exist. Result: `intro_video_url` is present, `watch_cleared` and `has_disciplines` are absent. That matches `schema.sql:3132` or `schema.sql:3465`, both of which correctly carry `security_invoker = true`. **The live view is safe.**

But two consequences follow.

**First, PART 27 was never applied.** `app/console/matching/page.tsx:97` and `app/api/admin/matches/route.ts:68` both read `p.has_disciplines` and `p.watch_cleared`. Those columns do not exist, so the expression evaluates to `undefined`, which is falsy, so the "Watch not cleared" warning never fires. It does not crash. It silently never triggers. The Relève Book records this gate as live since 11 September. In production it is not running, and a talent who has not cleared Taking The Watch can be released to an executive with no warning shown.

**Second, and this is the part that matters most:** `supabase/schema-remaining.sql` is an extract containing only PARTs 25 to 27, and its `talent_directory` at line 425 is missing `security_invoker`. If you paste that file into Supabase to catch up, you will replace a safe view with an unsafe one. A view without `security_invoker` runs as its owner and ignores row level security entirely, so at that moment every talent's name, location, photo, full psychometric profile, validity flags and Drive facets become readable by anyone on the internet holding the public anonymous key.

**Fix: apply PART 27 from `supabase/schema.sql` only. Do not paste `schema-remaining.sql`.** Delete that file so it cannot be used by mistake. Then verify with:

```sql
select viewname, definition from pg_views where viewname = 'talent_directory';
```

and confirm `security_invoker` appears.

## 2.10 One view genuinely does bypass row level security
**Severity: MEDIUM today, HIGH at launch. Confirmed live.**

`talent_verification_badges` is defined without `security_invoker` in both schema files, at `schema.sql:3330` and `schema-remaining.sql:295`, so it runs as its owner and ignores RLS. I confirmed an anonymous request returns HTTP 200 rather than an error.

It currently returns zero rows, because no talent has a scored Watch attempt yet. The moment one does, that talent's user ID and their pass or fail result become readable by anyone on the internet, with no account.

**Fix:** `create or replace view talent_verification_badges with (security_invoker = true) as ...` using the same body. One statement.

## 2.11 Missing browser security headers
**Severity: MEDIUM. Confirmed against live response headers.**

Netlify already supplies `strict-transport-security: max-age=31536000` and `x-content-type-options: nosniff`, so those are covered. Absent:

- **`X-Frame-Options` / `frame-ancestors`.** Nothing stops your app being loaded in a hidden iframe on another site. Users approve deposits and sign talent agreements in the app, so a clickjacked confirmation is the realistic attack. This is the one that matters.
- **`Referrer-Policy`.** Your deposit and invoice payment links carry tokens in the URL. Default referrer behaviour leaks the full path to any third party resource the page loads.
- **`Content-Security-Policy`.** Worth doing in report-only mode first. Do not block launch on it.

**Fix:** a `headers()` block in `next.config.mjs`, which currently contains only `{ reactStrictMode: true }`.

---

# Part 3: what is already right

Stated plainly, because the list above is long and the balance matters.

- **Row level security is on all 42 tables**, with 124 policies, and not one `USING (true)`.
- **Margin confidentiality is enforced in the database, not the interface.** `placement_terms` holds the client rate in its own table with no policy admitting talent. `talent_pay` is admin write with a narrow own row read. The offer views are split by side, `my_offer_client` omits talent pay and `my_offer_talent` omits the client rate. An audit of every import in `app/` found no route serving an admin shaped money object to a non admin caller.
- **Every `app/app/` page is a React Server Component**, so a field fetched but not rendered does not reach the browser. Section 2.2 is the exception and it is a grant problem, not a rendering one.
- **Both payment webhooks verify signatures before touching the database.** Stripe uses a constant time HMAC comparison with a five minute replay window. DocuSign does the same and fails closed when no key is configured. The brief I gave the reviewer assumed DocuSign was unverified. It was wrong.
- **The three cron routes use a length checked `timingSafeEqual`** and reject an unset secret rather than accepting an empty header. Replaying monthly billing creates no duplicate invoices, because `issue_monthly_retainers` guards on `(placement_id, kind, period_start)`.
- **Payment link tokens are 256 bit HMACs** over a dedicated secret, compared in constant time, with the expiry checked after the signature. Not guessable, not forgeable, and one token reveals nothing about another.
- **No secret is exposed to the browser.** I verified by prefix class that the anon key is a publishable key and not a service key, which is the one mix up that would have been catastrophic. The service role key appears only in server routes.
- **TypeScript strict mode is on and `tsc --noEmit` is clean.** No suppressed build errors. This materially lowers the risk of the whole codebase.
- **The service worker caches only `/_next/static/`.** No page render, no API response, nothing user specific. On a shared device one person's data cannot be served to another.
- **Storage buckets are private** with folder per owner policies, and signed links expire in 60 to 120 seconds.
- **Self promotion to admin is blocked** by the `profile_edit_guard` trigger at `schema.sql:480`, which resets `role` on any non admin edit. I specifically tested for this.
- **The weekly check in, the monthly pulse, and unshared feedback drafts** are each protected by a database policy, not by a UI filter.
- **The domain is locked, redacted and DNSSEC signed.**

---

# Priority order

**Before you take a single real payment:**

1. Replace the home address on `terms.html` and `privacy.html`, plus the two markdown sources, and redeploy the marketing site. (1.1)
2. Set the Relève Book artifact back to private. (1.2)
3. Apply PART 27 from `schema.sql`. Delete `schema-remaining.sql` so it can never be pasted. (2.9)
4. Add `security_invoker` to `talent_verification_badges`. (2.10)
5. Filter Drive out of the executive and talent views. (2.1)
6. Scope the storage insert policy. (2.3)

**Before you onboard talent at volume:**

7. Narrow the `signatures` grant behind a client facing view. (2.2)
8. Start the DMARC progression at `p=none` with reporting. (1.4)
9. Call `looksLike()` in the apply, photo and video routes. (2.4)
10. Make the rate limiter fail closed, and add a captcha. (2.5)
11. Escape the three email templates, cap `full_name`. (2.6)
12. Add the headers block, starting with frame ancestors and referrer policy. (2.11)

**Within the first month:**

13. Reverse the demo mode failure direction and drop the sixteen conditional guards. (2.8)
14. One generic error string across all routes. (2.7)
15. Finish the DMARC progression to `p=reject` and SPF `-all`. (1.4)
16. `npm audit fix` without `--force`, and build with `npm ci` rather than `npm install`.

---

# One decision I cannot make for you

Removing the address is easy. Choosing what replaces it is not, and it needs to be right.

California requires a business mailing address on a privacy policy in practice, and CAN-SPAM requires a valid physical postal address in commercial email. So the answer is a different address rather than no address.

The realistic options are a virtual mailbox with a real street address that accepts legal mail, roughly $10 to $30 a month from providers such as Anytime Mailbox or PostScan Mail; a registered agent service, roughly $50 to $150 a year, which is the right answer if Relève is or becomes an LLC, since the agent's address then appears on the public state filing too; or a coworking space with a mail plan.

A PO box is the one option to avoid. Many jurisdictions will not accept one for a registered business address, and some payment processors reject it.

Worth checking separately: if Relève is registered as an LLC or corporation in California, the Secretary of State's business search is public and free, and if you used the home address on the formation filing it is published there regardless of what the website says. Removing it from the site does not remove it from the state record. That filing can be amended.
