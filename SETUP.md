# Getting the Relève platform live

Written to be followed start to finish without prior experience. Every step says
exactly what to click and what you should see. Total time: about an hour, most of
it waiting for things to install.

There are four stages:

1. Run it on your own computer (30 min)
2. Create the database (15 min)
3. Turn on sign-in, including Google (15 min)
4. Put it on the internet at `app.relevestaffing.com` (20 min)

You can stop after any stage. After stage 1 it works on your machine. After
stage 4 it works for everyone.

---

## Before you start

You need three free accounts. Create them now, in this order:

- **GitHub** — github.com. This is where the code lives.
- **Supabase** — supabase.com. This is the database and the sign-in system.
- **Vercel** — vercel.com. This is what serves the site. Sign up *with GitHub*
  when it offers, it saves a step later.

You also need **Node.js** on your Mac. Go to nodejs.org and download the version
labelled **LTS**. Run the installer, accept the defaults.

---

## Stage 1 — Run it on your own computer

**1.1** Put the `releve-app` folder somewhere you'll find it — your Documents
folder is fine.

**1.2** Open **Terminal** (press ⌘ + space, type "terminal", hit return).

**1.3** Type `cd ` — that's c, d, then a space — then drag the `releve-app`
folder from Finder onto the Terminal window. It fills in the path. Press return.

**1.4** Type this and press return:

```
npm install
```

It prints a lot and takes a couple of minutes. When you get your prompt back,
it's done.

**1.5** Type this and press return:

```
npm run dev
```

You should see `Ready in …` and `http://localhost:3000`.

**1.6** Open that address in your browser. The sign-in screen appears with a
green **Demo mode** bar. Click through — you can take the whole Signature, see
your profile scored, and browse the bench. Nothing saves yet; that's stage 2.

**To stop the server**, click the Terminal window and press `control + C`.
**To start it again**, `cd` to the folder as in 1.3 and run `npm run dev`.

---

## Stage 2 — Create the database

**2.1** Go to supabase.com, sign in, click **New project**.

- Name: `releve`
- Database password: click **Generate a password**, then **copy it somewhere
  safe**. You won't need it often, but you cannot recover it.
- Region: pick the one closest to most of your clients — `West US` if that's
  California.

Click **Create new project** and wait about two minutes.

**2.2** In the left sidebar click **SQL Editor**, then **New query**.

**2.3** Open the file `supabase/schema.sql` from the app folder in TextEdit.
Select all of it, copy, paste into the Supabase query box, and click **Run**.

You should see *Success. No rows returned.* That's correct — it built the tables
rather than returning data.

**2.4** In the left sidebar click **Project Settings** (the gear), then **API**.
You need two values from this page:

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — a long string starting `eyJ…`

**2.5** In the app folder there's a file called `.env.example`. Make a copy of it
in the same folder and name the copy `.env.local` — exactly that, including the
dot at the front. Open it in TextEdit and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Save it.

**2.6** Back in Terminal, stop the server (`control + C`) and start it again
(`npm run dev`). Reload the browser. **The green demo bar is gone.** The app is
now talking to your database.

> These two values are safe to keep in the app — they only allow what the
> security rules in `schema.sql` permit. Never put the *service role* key from
> that same Supabase page anywhere; that one bypasses every rule.

---

## Stage 3 — Turn on sign-in

### Magic link (works immediately)

Supabase sends sign-in emails out of the box, limited to a few per hour, which is
fine for testing. Try it: go to `http://localhost:3000`, enter your own email,
click **Email me a sign-in link**, then click the link in your inbox. You land in
your account.

**Make yourself an admin.** Supabase → **SQL Editor** → New query:

```sql
update profiles set role = 'admin' where email = 'hello@relevestaffing.com';
```

Use whichever address you just signed in with. Run it, then reload the app —
you're now in the Relève Console instead of a talent account.

**Before real people use it**, connect your own email sending so messages come
from `hello@relevestaffing.com` rather than Supabase, and don't hit the rate
limit: Supabase → **Project Settings → Authentication → SMTP Settings**. Resend
(resend.com) is free at your volume and takes about ten minutes to set up.

### Google sign-in

**3.1** Go to console.cloud.google.com. Create a project called `Releve`.

**3.2** Search for **Google Auth Platform** in the top search bar. Set up the
consent screen: External, app name `Relève`, your support email, your logo if you
want it. Save.

**3.3** Go to **Credentials → Create credentials → OAuth client ID**.
Type: **Web application**. Under **Authorised redirect URIs**, add exactly this,
substituting your Supabase project URL:

```
https://abcdefgh.supabase.co/auth/v1/callback
```

Create. Copy the **Client ID** and **Client secret**.

**3.4** In Supabase: **Authentication → Providers → Google**. Toggle it on, paste
both values, save.

**3.5** Test it — the "Continue with Google" button on the sign-in screen should
now work.

---

## Stage 4 — Put it on the internet

**4.1** Push the code to GitHub. In Terminal, in the app folder:

```
git init
git add -A
git commit -m "Relève platform"
```

Then go to github.com, click **New repository**, name it `releve-platform`, keep
it **Private**, and click Create. GitHub then shows you two lines starting
`git remote add origin…` — copy those, paste into Terminal, press return.

**4.2** Go to vercel.com → **Add New → Project** → import `releve-platform`.

**4.3** Before clicking Deploy, open **Environment Variables** and add the same
three values from your `.env.local`, except the last one, which changes:

```
NEXT_PUBLIC_SUPABASE_URL       https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  eyJ…
NEXT_PUBLIC_SITE_URL           https://app.relevestaffing.com
```

Click **Deploy**. Two minutes later you have a live URL ending `.vercel.app`.

**4.4** Point your domain at it. In Vercel: **Settings → Domains → Add**, enter
`app.relevestaffing.com`. Vercel shows you a CNAME record. Add that record
wherever you manage relevestaffing.com's DNS. It usually goes live within the
hour.

**4.5** Tell Supabase the new address, or sign-in links will send people to the
wrong place: **Authentication → URL Configuration**. Set **Site URL** to
`https://app.relevestaffing.com` and add
`https://app.relevestaffing.com/auth/callback` to **Redirect URLs**.

**4.6** Add the same callback to Google: back in Google Cloud → Credentials →
your OAuth client → add `https://abcdefgh.supabase.co/auth/v1/callback` if it
isn't there already. (It's the Supabase URL, not yours — Google talks to
Supabase, and Supabase talks to your app.)

Done. Anything you push to GitHub from now on deploys itself.

---

## Stage 5 — Connect Zoom (optional, 20 minutes)

Interviews work without this; they simply record without a meeting link.
Connect Zoom and every booking creates a real meeting automatically.

**5.1** Go to marketplace.zoom.us, sign in with your Relève Zoom account,
then **Develop → Build App → Server-to-Server OAuth**. Name it `Relève Platform`.

**5.2** On the **App Credentials** screen, copy three values: **Account ID**,
**Client ID**, and **Client Secret**.

**5.3** Under **Scopes**, click **Add Scopes** and add:

- `meeting:write:meeting:admin`
- `meeting:delete:meeting:admin`

**5.4** Click **Activate your app** at the top.

**5.5** Add the three values to `.env.local` locally, and to Vercel's
Environment Variables for the live site:

```
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
```

Restart locally, or redeploy on Vercel. The Interviews page in your console
will show **Zoom connected**.

> These three are secrets — they are read only on the server and never sent to
> a browser. Do not put them in a file whose name starts with `NEXT_PUBLIC_`.

---

## Stage 6 — Google Calendar sync (optional, 10 minutes)

People set their weekly hours by hand, and that is enough on its own. Connecting
a calendar adds one thing: anything already booked in it is hidden from the times
they can be offered, so nobody gets double-booked.

Relève reads **only free/busy blocks** — never event titles, guests, or notes.
That is a different Google permission from reading a calendar, and it is the one
this app asks for.

**6.1** In Google Cloud (the project you made in stage 3), search for
**Google Calendar API** and click **Enable**.

**6.2** Go to **Google Auth Platform → Data access → Add or remove scopes**.
Add this one scope:

```
https://www.googleapis.com/auth/calendar.freebusy
```

Save. While your consent screen is in *Testing*, only addresses you add under
**Audience → Test users** can connect. Publish the app when you are ready for
real clients and talent.

**6.3** Add your Google OAuth credentials — the same Client ID and Secret from
stage 3 — to `.env.local` and to Vercel:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Restart or redeploy.

**6.4** Sign in, go to **Availability**, and click **Connect Google Calendar**.
Google asks permission once. The card then tells you how many blocks of busy time
it is hiding.

> Nobody is required to do this. Anyone who does not connect simply relies on
> their weekly hours, which is how it works out of the box.

---

## Stage 7 — The Console Calendar (hello@ bookings), 15 minutes

This is different from Stage 6. Stage 6 lets each person hide their own busy
times. This stage makes discovery calls, interviews and everything else booked
on **hello@relevestaffing.com** show up automatically on the Console's
**Calendar** page, for every admin to see. Skip it and that page just says
it isn't connected yet, which is harmless.

**7.1** Go to console.cloud.google.com, make sure the **Releve** project from
Stage 3 is selected top left, then go to **IAM & Admin → Service Accounts →
Create service account**.

- Name: `releve-calendar-reader`
- Click **Create and continue**, then **Continue**, then **Done** — skip
  granting it any roles, it doesn't need any.

**7.2** Click into the service account you just made. Look for **Show domain-
wide delegation** (sometimes shown as a checkbox during creation, sometimes as
a link on the details page afterward). Turn it on. It will ask for a product
name for the consent screen — type `Relève` — and save.

You should now see a **Client ID** on that page: a long number, distinct from
the service account's email address. Copy it.

**7.3** Go to admin.google.com (you need to be a super admin for
relevestaffing.com, which you are). Go to **Security → Access and data
control → API controls → Domain-wide delegation → Add new**.

- Client ID: paste the number from 7.2
- OAuth scopes: `https://www.googleapis.com/auth/calendar.readonly`

Click **Authorize**. This is the one real permission grant in this whole
stage: it lets that one service account read free/busy and event details on
your Workspace calendars, nothing else, and you can revoke it here at any
time.

**7.4** Back in Google Cloud, on the service account's **Keys** tab: **Add
key → Create new key → JSON → Create**. A file downloads — something like
`releve-12345.json`. Open it in TextEdit.

If key creation is blocked with "Service account key creation is disabled":
your org now defaults new projects to block key downloads. Go to **IAM &
Admin → Organization Policies**, search `service account key creation`, open
**Disable service account key creation**, **Manage Policy → Add a rule**,
set **Enforcement** to **Off**, save, then try the key again.

**7.5** In that file you need two values: `client_email` and `private_key`
(the private_key is long and starts `-----BEGIN PRIVATE KEY-----`).

Go to your Netlify site → **Site configuration → Environment variables → Add
a variable**, and add:

```
GOOGLE_CALENDAR_CLIENT_EMAIL=<the client_email value, no quotes>
GOOGLE_CALENDAR_PRIVATE_KEY=<the whole private_key value, no quotes>
```

Paste the private key exactly as it appears in the file, `\n` characters and
all — don't try to reformat it.

> Delete the downloaded JSON file once it's pasted in. Never send it by email
> or put it in the repo — whoever holds it can read hello@'s calendar.

**7.6** Netlify → **Deploys → Trigger deploy → Deploy site**. When it
finishes, reload the Console **Calendar** page — the "not connected" message
is gone and hello@'s next 30 days shows up.

---

## How people get accounts

You add people from the console — **Clients** and **Talent Bench** both have an
**Add** button. Fill in their name and email and save.

Nothing is sent to them at that moment. The record simply waits. The first time
that person signs in with the email you entered, their account attaches itself to
the record you made — right role, right company, right details, no invitation and
no password. Until then they show under *Added, not yet signed in*.

Your own team is the exception, because an admin can't be created by an admin who
doesn't exist yet. Sign in once, then run this in the Supabase SQL editor:

```sql
update profiles set role = 'admin' where email = 'hello@relevestaffing.com';
```

---

## The role brief

A Signature says how someone works. It does not say what the job is. That part
comes off your intro call, so it lives in the console rather than in a form the
client fills in: **Clients → the client → Edit brief**. Role, what the person
will own, hours, tools, target start.

You can write a brief for someone who has not signed in yet — it attaches to
their account the moment they do, exactly like the rest of their record. The
client sees what you wrote on their own dashboard and can correct it with their
CSM, and a candidate sees it on their Interviews page before the call.

---

## What's in this build

- Sign-in by magic link and Google, with sessions and role-based routing
- Guided first run on both sides — a short welcome, then a checklist that tracks
  Signature, availability and profile until it is complete
- Talent manage their own profile; pay, role and pipeline stage stay yours
- Executives have a profile too, so candidates walk into a call knowing who
  they are meeting and what the role is
- The full Relève Signature, both instruments, **scored on the server** — the
  answer key never reaches the browser, so it can't be reverse-engineered
- Validity controls, facet scoring, confidence bands, bench percentiles
- Talent profile with all eighteen facets
- Client pipeline ranked by fit, with conditions checks, and no pay visible
- Relève Console: bench, validity detail, matching engine

Not yet ported from the prototype: the delegation desk, weekly reports, and the
calibration view. Those are phase 2 — the prototype file remains the reference
for how they should work.

---

## If something goes wrong

**`command not found: npm`** — Node.js didn't install. Reinstall from nodejs.org
and open a *new* Terminal window.

**The green demo bar won't go away** — `.env.local` is in the wrong folder or
misspelled. It belongs beside `package.json`, and the name starts with a dot.

**Sign-in link says "invalid"** — the link was already used, or it's over an hour
old. Request a new one.

**Deployed site shows an error but local works** — you almost certainly forgot
the environment variables in Vercel (step 4.3). Add them, then **Deployments →
⋯ → Redeploy**.
