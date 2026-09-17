# Relève launch-readiness programme: the prompt

**How to use this.** Start a fresh session with your Mac linked, and paste everything below the line. It is self-contained, so it does not depend on remembering any earlier conversation. Re-runnable before any major release.

---

You are running a complete pre-launch programme for the Relève platform. This is not only an audit. You will research the competitive field, map every way this business could fail, audit the product end to end, raise the craft of the interface and the writing to match the price, and then FIX WHAT YOU FIND. A report alone is a failure of this task.

Relève is a premium virtual executive staffing business charging $2,500 to $4,500 a month with a $500 non-refundable deposit. Real money, real client accounts, real people's government identity documents. The founder is not a developer and wants minimal hands-on involvement, so do as much as possible yourself and hand her a Terminal command only when it genuinely cannot run from your sandbox.

## The end goal, stated plainly

When you are finished, the platform is ready to open to the public. That means three things are true, and you must prove each one by doing it rather than by reasoning that it should work.

**1. A stranger can become placed talent without anyone intervening.** Someone finds a role on the careers page, applies, is booked into a screening call, is invited, creates an account, completes the Talent Signature, fills in their skills breakdown, takes and passes Taking The Watch, uploads verification, signs their agreement, is matched, interviewed, offered, accepts, and starts work, with their payout details, tasks, check-ins and time off all functioning. No step dead-ends. No step requires the founder to open the database.

**2. An executive can become a paying client without anyone intervening.** Someone books a discovery call, is onboarded, pays the deposit, completes the Executive Signature, defines the role, sees one candidate with the Signature Match, approves or declines with a reason, books the interview, receives the offer, gets a placement, assigns tasks, files a monthly pulse, messages their Client Success Manager, sees and pays invoices, and can give thirty days' notice themselves. No step dead-ends.

**3. The entire business can be run from the console.** This is the test that matters most and the one most likely to fail quietly. Go through every routine operation the business needs and confirm each is possible from the console alone: adding a client, sending both kinds of onboarding, publishing a role, working applications, booking screening calls, matching and releasing, recording an answer given on a call, booking introductions, making offers, creating placements, setting pay on both sides, issuing and chasing invoices, running the month, running payroll, approving verification, scoring the Watch, deciding time off, writing and sharing feedback, assigning managers, and ending a placement.

For each one, answer: can she do this from the console, or does it require SQL, the Supabase dashboard, or a developer? **Every "requires a developer" is a launch blocker**, because it is a task that will land on her at the worst possible moment and she cannot do it. Build the missing ones.

Then write the inverse list: everything the console can do that has no obvious route to it, meaning a feature that exists but is unreachable in practice. Those are worth as little as the missing ones.

## Before you start

1. Read the Relève Book artifact. It is the master reference: business model, commercial terms, brand, voice rules, standing rules, decisions log, and what is still open. Nothing decided there gets reopened. Everything you change gets written back to it at the end.
2. Read the project memory for Relève: launch, security, backlog, email, website, vetting and audit files.
3. Read `~/Releve/SECURITY-AUDIT-2026-09-15.md`. A full security audit ran 15 to 16 September 2026 and is fixed and live. Do not re-report it. Do confirm the fixes are still in place, because a later deploy can undo one.
4. Environment: Next.js 15, Supabase, Netlify. App at `~/Releve/releve-app`, deployed with `npx netlify deploy --build --prod`. The marketing site is a SEPARATE Netlify project, deployed by dragging `~/Releve/releve-site-deploy` onto its Deploys tab. Database changes are appended to `supabase/schema.sql` as a new PART and run in full via psql.

## Rules you are working under

**Fix, do not just flag**, for everything that does not touch authentication, payment logic, or row-level-security policies.

**Those three classes are different, and here is why.** They are the only changes where being wrong takes the business offline rather than producing a visible bug. A broken row-level-security policy does not throw an error; it silently returns nothing, and the first symptom is an executive who cannot see the candidate you already emailed them about. A broken auth guard fails in the other direction and shows the wrong person someone else's data. Payment logic that is subtly wrong moves real money. None of these announce themselves in a build or a typecheck. So for these three: write up the change you would make, the risk, how you would verify it afterwards, and leave it for the founder to approve. This is a standing rule in the Book and it exists because it has already prevented a bad fix.

**Never invent a business rule** for an ambiguous case. Ask, or write it up as a decision needed with options and a recommendation.

**Never change the locked brand.** Marcellus over Tenor Sans, fern and cream, "Consider it handled." The typography and palette are settled after an extended exploration with a long list of explicitly rejected alternatives. Your job is to raise the EXECUTION inside that system, not to propose a new one.

**Batch your changes.** Each production deploy costs Netlify credits. Accumulate the whole batch, then deploy once at the end.

**Verify with a FULL PRODUCTION BUILD**, not just a typecheck. A clean `tsc` has missed real breakage here before.

**Never put a secret in a file, a chat message, or memory.** Variable names only.

**Test accounts: create your own, and never touch the console account.** You do not need to ask the founder for these. Create as many throwaway accounts as the work needs using addresses under Sage Jackson, for example plus-addressed variants of `sjackson@relevestaffing.com` such as `sjackson+exec1@relevestaffing.com` and `sjackson+talent1@relevestaffing.com`. Google Workspace delivers plus-addressed mail to the base inbox, so sign-in links genuinely arrive and you can complete real flows end to end rather than simulating them.

**`hello@relevestaffing.com` is off limits.** It is the live console account and the business's own identity. Do not sign in as it, do not change it, do not delete it, do not send from it, and do not use it as a test recipient. If a test needs an admin, make a second admin rather than borrowing that one.

**You are creating real rows in the live database.** This matters more than it sounds. Test placements land in real reports. Test invoices land in the real money screens and the monthly billing run. Test talent land in payroll and in the margin figures. Before you create anything, decide how every test record will be identified and removed, and write that down. Prefix names distinctively so they are unmistakable, keep a list of every id you create, and clean up completely at the end. Confirm afterwards that the console's money, payroll, reports and margin screens show zero test residue. A launch-ready product whose first month's numbers are polluted by your own testing is not launch-ready.

**Stop at the three checkpoints, and understand why they exist.** An agent told to "fix everything" with no stopping points will make product and business decisions that belong to the founder, and will present them afterwards as though they were technical. The checkpoints sit at exactly the moments where the next step stops being a repair and starts being a choice: what to build against competitors, which failure modes are worth spending on, and what goes live. Do not go dark for the whole run, and do not treat a checkpoint as a formality to narrate past.

---

# Part A: the competitive field

Research the top performers in premium virtual and offshore executive staffing, as they stand today rather than from memory. Athena, Persona, Assistantly and The Grapevine Agency are already known reference points in the Book. Also look at Belay, Boldly, Prialto, Somewhere, Wing, Magic, Double, Time Etc, Virtual Latinos and MultiplyMii, and find any newer entrant winning attention. Verify everything against their live sites.

For each of the strongest five, document:

- Positioning and the exact promise, in their words.
- Pricing, and what is included at each tier.
- The client journey from first visit to placed, and how many steps it takes.
- What their CLIENT-FACING PLATFORM actually does. Most of this category sells a service with a thin portal. Find who has a real product and what is in it.
- Onboarding: what happens in the first week, and who is being onboarded, the client or the assistant. Athena's strongest lever is reportedly onboarding the EXECUTIVE rather than the assistant. Verify that, and see who else does it.
- Their matching or assessment method, and whether they show the client any of the reasoning.
- Guarantees, replacement terms, and how they handle a bad fit.
- Proof: case studies, named clients, numbers, testimonials.
- Talent-side experience, since supply is half the business.

Then produce a capability matrix: every meaningful feature across all of them, marked present or absent for each, with Relève's own column. From it, answer three questions:

1. Where is Relève genuinely ahead? The Signature assessment taken by both sides, the Signature Match shown to the client, and the one-candidate-at-a-time model are the claimed differentiators. Confirm no competitor does these. The Book asserts that no agency in this category shows the client the working, and that claim should be tested rather than assumed.
2. Where is Relève at parity, and it does not matter?
3. Where is Relève BEHIND in a way a $3,500-a-month buyer would notice on a demo call? This is the important list. Rank it by how likely it is to lose a deal.

For each gap, recommend build, ignore, or defer, with reasoning. Build the ones that are cheap and close a deal-losing gap. Write the rest into the Book's Still Open.

**CHECKPOINT 1.** Show the founder the capability matrix and your build list before building anything from it. What to build against a competitor is a positioning decision, not an engineering one.

---

# Part B: every way this business could fail

Map failure modes across all eight categories below. For each, state the specific scenario, the early warning sign, the impact, and the mitigation. Then implement every mitigation that lives in the product or the operating system around it.

**1. Technical.** The app breaks, loses data, or exposes it. Mostly covered by Part C, but include here: no database backups on Supabase's free tier, code living on one Mac with no remote, and no error monitoring, so a 2am outage is discovered by a client.

**2. Delivery.** The promise is a qualified candidate within fourteen days of a search opening, plus a replacement if a hire fails. Work out what happens when the roster cannot meet that: how many bench-ready, verified, Watch-cleared talent must exist per open search to keep the promise, what the app does as day fourteen approaches, and whether the founder is warned early enough to act rather than told afterwards.

**3. Capacity and key person.** The founder personally runs every discovery call and is acting as both Client Success Manager and Talent Success Manager for the first twenty clients. Calculate the real ceiling in hours per week at ten, twenty and thirty placements. Identify the first thing that breaks. Identify every credential, account and piece of knowledge that exists in exactly one head or on exactly one machine.

**4. Financial.** Margin per placement, and whether the product makes it visible before it is too late. Unpaid invoices and the fourteen-day suspension. A client who leaves inside the minimum term. A failed bank debit days after acceptance. Concentration risk when a small number of clients are most of the revenue. Model what happens to cash if two placements end in the same month.

**5. Legal and compliance.** No attorney has reviewed the terms. The twelve-month non-circumvention at twelve times monthly is the clause most likely to be tested. Contractor classification for offshore talent. Data deletion requests. Retention. Whether the privacy policy still matches what the app actually stores, field by field, because it was written from the schema once and the schema has moved since.

**6. Reputational.** A bad placement in month one. A data leak. A spoofed email that appears to come from the domain. A talent mistreated by a client, and whether the platform would even surface it. An assistant's identity documents mishandled.

**7. Supply.** Sourcing enough qualified talent to keep the guarantee, and what happens to quality when the pipeline is thin. Talent attrition after placement. Whether the Drive retention flag is actually being used to predict and prevent it.

**8. Demand.** Where clients come from, and what happens if the current channel stops producing. Whether anything in the product creates referral or expansion.

**CHECKPOINT 2.** Show the founder the failure map and which mitigations you intend to build before you build them. Which risks are worth spending on is a business judgement about her own appetite, not a technical ranking.

---

# Part C: the product audit

**C1. Static analysis.** Run as parallel review agents.

- Every page under every state. All 37 pages, against: brand new with zero data; mid-setup; a query returning null or empty; a URL parameter missing, malformed or pointing at nothing; a role mismatch. A page that throws, renders blank, or shows a raw error instead of a considered empty state is a finding. First-run emptiness is the most common real-world break and has already produced bugs here twice.
- Every control does what its label says. Buttons, links, forms and toggles across all three sides. Controls that navigate nowhere, forms with no handler, actions reporting success when the write failed, optimistic UI clearing before the server confirmed, destructive actions with no confirmation.
- Loading, error and disabled states. Every async operation needs three, not one. Find the ones rendering nothing while loading, retrying forever with no visible error, or allowing a double submit. Slow, flaky connections are the normal case for talent in the Philippines and Latin America.
- Dead code and drift. Unused components, unreachable routes, columns nothing reads. Then confirm the LIVE database matches `schema.sql`. It has silently drifted before and disabled a vetting gate for five days.

**C2. Live page-by-page.** Using the throwaway accounts you created, cover every role at every stage: a brand new executive, a mid-setup executive, a placed executive, a brand new talent, a verified but unplaced talent, a placed talent, and admin. In each, visit every page and record HTTP status, whether it rendered, time to first paint, console errors, failed requests, and whether the primary action works. Do it at desktop width AND 390px. The founder uses this as an iPhone home-screen app and the talent are mobile-first on inexpensive Android, so phone width is the primary case, not the afterthought. Confirm the CSS bundle loaded: a Netlify deploy has reported success here while shipping an unstyled site.

**C3. Every process end to end.** Walk the whole placement lifecycle as the Book defines it, from application through screening call, account creation, both assessments, role breakdown, search opening and deposit, verification, matching and release, approval, briefing, interview, offer, placement, the ninety-day plan, the engagement, the six-month review, and ending. At every handoff, confirm the other side sees what it should and not what it should not. Then separately: money arithmetic by hand through a full cycle including the deposit credit and a mid-month start; payroll; every email template triggered for real and opened on a phone in dark mode; both assessments including abandonment, a dropped connection mid-autosave, and a retake.

**C4. The unhappy paths.** A declined card. A bank debit failing days after acceptance. An expired or already-used sign-in link. A user abandoning setup at each step and returning a week later. A talent who never verifies. An executive who never finishes their assessment. An interview cancelled by each side. A candidate declined until the roster is empty. A search passing fourteen days with nobody put forward. A placement ended inside the minimum term. Two people acting at once on the same invoice, release or record. The same form submitted twice by double-click, back button and refresh. Stripe, DocuSign and Zoom are built but not switched on: confirm each degrades to something honest, because the deposit page once told people their link had expired when the truth was that Stripe was not connected.

**C5. Cross-cutting.** Timezones, with talent in Manila and Bogotá, clients in the US and the founder on Pacific: every date boundary, every "this week", the Friday check-in, the first-Monday billing run, interview slots, daylight saving. Slow-network behaviour and autosave ordering. Accessibility: keyboard navigation, focus states, contrast against fern and cream, labels, screen reader. Performance: cold start, dashboard query count, time to interactive on mid-range Android over 4G. Browser matrix including Safari on iOS and the home-screen web app. Session expiry mid-form and on a shared device.

**C6. Operational.** Backups, monitoring, rollback, and quota ceilings. Google Workspace caps outbound mail near 2,000 a day, and when that is spent every transactional email stops silently, invoices included. Supabase's free tier has row, storage and bandwidth limits. Netlify credits are shared with the marketing site. Work out where each ceiling sits against realistic month-one volume, and what the first symptom of each looks like.

---

# Part D: craft. Make it look and read like the price

A client paying $3,500 a month judges the product in the first ten seconds and never says so out loud. Go through every screen as that person.

**Why this section is written as specifics rather than an instruction to make it premium.** "Make it look expensive" produces nothing actionable, and an agent given that instruction will add gradients and call it done. What actually separates a $3,500 product from a competent internal tool is unglamorous and enumerable: empty states that say what to do next, components that behave identically everywhere they appear, numbers that line up in columns, and micro-copy that says exactly what a button will do. Work the list. The feeling is the result of the details, not a thing you can target directly.

The brand is locked and is not up for discussion: Marcellus display, Tenor Sans body, WindSong for the tagline only, fern and cream and the existing palette. Raise the execution inside it.

**D0. Look at it. Actually look at it.**

Everything else in this section is judged from code. This step is judged with your eyes, and it has to come first, because a screen can be correct in every line of CSS and still look wrong.

**Capture.** Drive a real browser and screenshot every screen. Not a sample: all of them. For each route, capture:

- Each role that can reach it: executive, talent, admin.
- Two widths: desktop at 1440px, and phone at 390px.
- Both themes: light and dark.
- Two data states: populated, and EMPTY. The empty version matters more, because it is what a new client actually sees, and it is the state least likely to have been looked at by anyone.

Save them somewhere organised and named so a human can find a specific one later.

**Then open them and look at them.** This is the step that gets skipped. Taking a screenshot is not seeing it. Read each image and describe what is actually on screen before forming any judgement, because an agent that skips to the verdict will produce a generic one. If you cannot describe the visual hierarchy of a screen in a sentence, that is itself the finding.

**Judge them as a set, not one at a time.** Lay the screenshots out as a contact sheet and look across them. Drift between screens is invisible when you inspect one screen but obvious across twenty: a card that is 16px padded here and 24px there, a heading that is Marcellus on four pages and Tenor Sans on the fifth, three different shades of the same grey, buttons at four different heights. Single-screen review will never catch this, and it is exactly what makes a product feel assembled rather than designed.

**The specific things to look for.** Go through every screenshot against this list and note every instance with the screen, the element, and what is wrong:

- Spacing that differs between elements that should match.
- Misalignment: things that should share an edge or a baseline and do not.
- Density that is wrong for the role. Cramped where it should breathe, or acres of empty space where an operator wants information.
- Orphaned elements: one item alone on a row that fits three, a lone card at the bottom of a grid.
- Awkward text: widows, orphans, a heading that breaks badly, a label that wraps to two lines when nothing else does.
- Anything clipped, truncated, or running off its container.
- Inconsistent corner radii, border weights, or shadow depths between comparable objects.
- Hierarchy failures: everything the same visual weight, or several elements competing to be the focal point, or no focal point at all.
- Colour used decoratively rather than meaningfully. Semantic colour for status should be separate from the brand accent, and neither should be sprinkled.
- Icons at inconsistent weights, sizes, or styles.
- Buttons of different heights sitting in the same row.
- Numbers that do not line up in columns.
- Photographs and avatars at inconsistent sizes or aspect ratios, or distorted.
- Dark mode specifically: contrast failures, one theme's text on the other theme's ground, a component that clearly only had light mode designed.
- Loading and error states that look broken rather than deliberate.

**The squint test.** For each key screen, blur or squint at it. What draws the eye first? Is it the thing that should? On an executive's dashboard the answer should be the candidate or the action waiting on them, not a navigation bar or a decorative panel. If the most visually prominent element is not the most important one, the hierarchy is wrong regardless of what the CSS says.

**The ten-second test.** For the five screens a paying client sees most, look at each for ten seconds as someone deciding whether $3,500 a month was a good decision. Write down the honest first impression in one sentence. If any of those sentences is lukewarm, that screen needs work, and the sentence you wrote is the brief.

**Benchmark visually.** Screenshot the equivalent screens from the strongest competitors identified in Part A, including their marketing sites and any product screens they show publicly. Put them beside Relève's. Do not copy anything. The question is narrow and honest: placed side by side, does Relève look like the more expensive product? Where it does not, name the specific visual reason, not a vague one.

**Fix, then prove it.** After the craft pass below, re-capture the same screens and put before and after side by side. A fix you cannot see in a screenshot is not a fix to an aesthetic problem. Include the before-and-after pairs in the final report so the founder can judge the result herself rather than taking your word for it.

**D1. Typography and spacing.** One type scale, used consistently, with real hierarchy rather than three sizes of similar grey. Consistent vertical rhythm. Running text near 65 characters. Balanced headings. Tabular numerals everywhere numbers line up, which means every money figure, every score and every date column. Find and fix every place a one-off font size, weight or margin was introduced.

**D2. Component consistency.** Cards, tables, pills, badges, buttons and form fields should be the same object everywhere they appear: same padding, same radius, same border, same shadow, same hover and focus behaviour. Audit for drift and consolidate. Border, fill, radius and shadow each say "separate object" and should be spent by role, not stamped on every block, which flattens hierarchy.

**D3. Empty states.** Every one of them. An empty state on a premium product is not a blank panel or the word "None". It says what this is for, why there is nothing here yet, and the one thing to do next. This is the single highest-leverage polish item in the whole programme, because a new client sees almost nothing BUT empty states in their first session, and that session is where they decide whether the price was justified.

**D4. Micro-copy.** Every label, button, helper line, confirmation, error and email. Rules from the Book, which are binding: language points toward the fix and never toward the threat; no "chase"; no "flagged"; no silence-is-bad framing; "team" never "bench"; "one candidate" never "shortlist"; "describe the role" never "tell us the role"; nothing outbound signed with the founder's personal name. Beyond those: a button says exactly what happens, an error says what went wrong and how to fix it with no apology and no vagueness, and specific beats clever. Remove every placeholder, every lorem, every TODO string and every piece of test data.

**D5. Motion and feedback.** Restraint. Every action gets immediate acknowledgement. No spinner where a skeleton would be calmer. No animation that delays the user. Respect `prefers-reduced-motion`. A page at rest should be fully readable without waiting for anything to animate in.

**D6. Density by role.** The console is an operator's tool and should be dense and fast. The executive side is a premium service surface and should be calm, spacious and confident. The talent side should feel respectful and clear, never like a monitoring tool. Check that each side actually reads that way, because they share components and drift toward each other.

**D7. The details that signal price.** Real favicon and touch icons. A proper page title on every route. Open Graph tags so a shared link previews well. Consistent date and money formatting everywhere, including in email. Sensible tab order. Visible focus rings. Sentence case used consistently. No horizontal scroll at any width. Nothing clipped.

**D8. The first five minutes.** Walk a brand new executive's first session start to finish and be honest about whether it feels like a $3,500 product or a competent internal tool. Then do the same as a brand new talent. Fix what makes it feel cheap.

---

# Part E: execute

Now fix everything. Not a plan to fix: the fixes.

Order of work:

1. Anything that loses or exposes data.
2. Anything that breaks the money chain.
3. Anything that dead-ends a real user.
4. Competitive gaps agreed at Checkpoint 1.
5. Failure-mode mitigations agreed at Checkpoint 2.
6. The full craft pass in Part D, including the visual work from D0.
7. Anything missing that stops the console running the business unaided, from the end-goal list at the top.
8. Everything else, ranked.

While you work: keep a running log of every file changed and why. Never leave the build broken between changes. Re-run the production build after each meaningful batch, not only at the end. If a fix turns out to need a business decision, stop that one, write it up, and carry on with the rest rather than guessing.

Database changes go into a new PART appended to `supabase/schema.sql`, written so the whole file stays safe to re-run, with a comment explaining what and why.

Authentication, payments and row-level security: write up the change, the risk, and how to verify it afterwards. Do not apply it. See the rule above for why.

---

# Part F: verify, then hand over

1. Full production build, clean.
2. **Run the three end-to-end proofs from "The end goal" above, start to finish, on the live site, with real accounts and real email.** Not a code review of whether they should work: actually walk a stranger into being placed talent, actually walk an executive into being a paying client, and actually run every routine business operation from the console. This is the acceptance test for the whole programme. If any of the three cannot be completed without opening the database, the work is not done.
3. **Remove every test record you created**, then confirm the console's money, payroll, reports and margin screens are clean.
4. Re-walk every page in every role at both widths and confirm nothing regressed.
5. Re-run the security spot-checks from the September audit and confirm they still hold: the six security headers, demo mode refusing an admin cookie, admin routes answering 401 unauthenticated, and no sensitive table readable anonymously.
6. Re-test the three flows that touch money, end to end.

Then produce `~/Releve/LAUNCH-READINESS-<date>.md` containing:

- A one-paragraph verdict: is this launch-ready, and if not, what is in the way.
- The three end-to-end proofs, each marked passed or failed, with the account used and what happened at every step. If one failed, exactly where and why.
- The console operations list, each marked as doable from the console, built during this run, or still requiring a developer.
- The competitive matrix and the positioning conclusion.
- The failure map, with each mitigation marked done, deferred, or needing a decision.
- Everything you fixed, with file and line.
- The visual before-and-after pairs from D0, for every screen the craft pass changed, so the founder can judge the result with her own eyes rather than taking your word for it.
- Everything you deliberately did not fix, and why.
- Decisions needed, each written as a question with options and your recommendation.
- A "checked and clean" list, so the next run does not repeat it.

Update the Relève Book with every change, republishing to the same URL rather than creating a new artifact.

**CHECKPOINT 3.** Give the founder the deploy steps one at a time and wait for her at each, rather than handing over a list. She is not a developer, batches of five steps lose her, and a deploy that touches the live site, the live database and live email deserves a person watching each one land. Verify each step yourself from outside the dashboards before moving to the next.

Every finding must be reproducible and every fix must be verified. If you could not verify something, say so plainly and say what would be needed. A confident guess is worse than an admitted gap.
