# Relève, Part C: the product audit
**16 September 2026. Four parallel review agents plus direct verification of every money finding against the schema.**

## The shape of it

The application is genuinely well built. Across ~50 pages, ~90 components and 41 lib modules, the review found almost no crashes, almost no dead-ends, disciplined empty states, and correct handling of missing data and bad URLs. **21 of the 22 routine business operations are reachable from the console** with no SQL. That is a rare result and worth stating plainly before the findings, because the findings are mostly narrow.

There are, however, **billing bugs that would overcharge or under-pay real people the moment Stripe is switched on.** Those are the reason this section matters. I verified each one against the actual code rather than trusting the review. I have not touched any of them — payment logic is the one class I write up and leave for you, and this is exactly why that rule exists.

---

## A. What I will fix in the execution pass (safe, not payments/auth/RLS)

**A1. HIGH — the Interviews page can crash for a client.** `app/app/interviews/page.tsx:145` calls `.split(' ')[0]` on a counterpart's name that can be null (a person who signed in before filling their profile). Everywhere else uses the null-safe `firstName()`; this one line does not, and it takes the whole Interviews screen down. One-line fix.

**A2. HIGH — a completed task can silently disagree with the server.** `components/TaskBoard.tsx` flips a task done/undone in the browser, then does a bare `fetch` with no try/catch. On a dropped connection — the normal case for talent in Manila or Bogotá — the flip stays on screen but never reached the server. Also the checkbox's disable is dead, so a double-tap fires twice. Fix: wrap the fetch, reload on failure, wire the busy state.

**A3. MEDIUM — money and placement actions fire with no confirmation.** "Make the placement" and "Withdraw" (OfferDesk), marking a deposit paid (DepositControl), and "Run the month" / "Run payroll" all commit on a single click. The money runs are idempotent so they are safe on a repeat, but none asks "are you sure." I will add confirmations consistent with the ones the app already uses elsewhere (the invoice picker already guards paid/void this way).

**A4. LOW — cross-slot double-book, guarantee-badge off-by-one, dead code.** BookInterview lets a second slot be tapped while the first is in flight (two interviews booked). The executive's guarantee badge counts "Day 15" while the console still reads day 14 — a display mismatch. Dead code: the client branch of `AddPerson`, `_OLD-part7-do-not-run.sql`, and a stale comment pointing at the now-deleted `schema-remaining.sql`. All safe to tidy.

**Weak empty states** (present but thin — bare "None recorded.") on the console placement file and a couple of admin cards go into the craft pass, not here.

---

## B. What I will build (the one console gap + the approved feature list)

**B0. LAUNCH BLOCKER — you cannot add a second admin from the console.** The Team page can change the *label* on someone who already has a role, but nothing grants console access to a new person — that requires editing the database directly. For a solo non-technical founder, discovering this during an emergency is the worst case. I will build an owner-only "add a team admin" that sets the role from the console. Because granting admin is an authorization change, I will implement it guarded to owner-only and flag the exact security reasoning for you to sanity-check before it goes live.

Plus the seven features you already approved: executive delegation onboarding, the ROI/savings view, the proof/methodology page (Part A), and the bench-coverage signal, failed-autopay state, complete-erasure, and concentration/churn view (Part B).

---

## C. The billing cluster — VERIFIED, and yours to approve before I touch a line

Every one of these is confirmed against `supabase/schema.sql` and `lib/billing.ts`, not inferred. None is live-dangerous today because Stripe autopay is still off and deposits are collected by hand — but every one of them bites the moment Stripe is switched on, so they gate the go-live.

**C1. CRITICAL — every first-month client is overcharged the $500 deposit.**
When the first retainer is issued, the run creates a full-price retainer ($3,500) *and* a separate −$500 "credit" invoice. But charging only ever touches invoices with a positive amount (`lib/billing.ts:246`, and `chargeInvoice` refuses anything ≤ 0). So the credit is never applied to real money: the client pays the $500 deposit, then autopay charges the full $3,500, and the −$500 sits as a draft forever. They pay **$4,000** where the terms promise **$3,500**.
**Recommended fix:** issue the first retainer at `rate − deposit` for a client with an uncredited paid deposit, and drop the separate credit invoice. One invoice, correct amount, the note explains the credit. This is a schema change to `issue_monthly_retainers`. **It blocks Stripe go-live.**

**C2. HIGH — giving notice does not stop the billing.** `give_notice` records the notice date but never sets an end the billing run respects. After notice, retainers keep issuing at full price every month until someone *manually* ends the placement. A client told "billing stops at month end" gets charged for months afterward — a chargeback. **Recommended fix:** store the notice end-date and have the monthly run stop (and auto-end) placements past it.

**C3. HIGH (decision) — no mid-month proration.** A placement starting on the 20th is billed a full month, with a period labelled as the whole calendar month. Your written terms say billing runs from the start date. Either proration is missing or the label is wrong. **I need your intent:** prorate the first month, or bill a full month anchored to the start date? I will not guess a money rule.

**C4. MEDIUM (decision) — the notice period in the code disagrees with your terms.** The app ends a placement at the end of the following calendar month; your terms say the first Monday of the following month. Code, email and terms should say one thing. Which is correct?

**C5. HIGH-if-it-happens — a talent on two placements is paid once.** Payroll is keyed per talent per month, so a second placement's pay is silently dropped, while the client side bills both. Underneath it is a model question: can one talent serve two executives, and if so how are they paid? Rare at launch, but latent. **Your call on the model**, then I fix to match.

**C6. MEDIUM — a Pacific-evening action records tomorrow's date.** `ended_on` and `notice_given_on` are stored as UTC dates, so an action taken after ~5pm Pacific records the next day — which near a month boundary bills an extra month. This one is a clear bug rather than a policy choice, but because it changes what gets billed I am grouping it here. **Recommended fix:** record these two dates in Pacific, or take an explicit date from you at the moment of the action.

---

## D. Still to do in Part C (needs the live site + test accounts)

The live page-by-page walk, the full lifecycle end-to-end, and the unhappy paths are the same work as the Part F acceptance proof, so I run them there with the throwaway accounts rather than twice. The static analysis above is what a code read can establish; the live walk confirms it against the running app.

## Checked and clean (so the next audit does not repeat it)

No orphan pages or unreachable components. No code-vs-schema drift (every column the code touches exists, including the PART 27/28 additions). Cents-to-Stripe is integer-clean everywhere; margin never leaks negative; the retainer and deposit runs are idempotent; charging claims the row atomically and dedupes on the Stripe key; only the webhook marks paid. The first-Monday billing date and the cron zones are correct year-round. The new-client first session — the case that matters most — has a real empty state on every screen.
