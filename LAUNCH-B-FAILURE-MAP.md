# Relève, Part B: every way this business could fail
**16 September 2026. Grounded against the live code, not assumed.**

Tag key: **COVERED** the product already handles it · **PARTIAL** handled but with a real gap · **GAP** nothing handles it · **BUSINESS** not a code problem, yours to decide.

## The honest headline

The product already carries most of the *operational* risk you would expect a launch to miss: the 14-day guarantee warns you three days early, replacements owed are tracked and auto-settle when covered, margin is visible per placement, and the pay wall between the two sides is structural. Where this business is exposed is not mostly in the app. It is in three places: **one person is every role**, **there are no backups of anything**, and **the guarantee can be sold faster than talent can be sourced to keep it**. Those are the ones that turn a good week into a bad month.

## 1. Technical — mostly COVERED, two real GAPS

- **Backups — GAP, highest value.** Supabase's free tier takes no database backups, and the code lives on one Mac whose git history is behind its own working files. If that laptop dies or the database is corrupted tonight, there is no recovery path. Both are free to fix. This is the single most important item in this document.
- **Monitoring — GAP.** If the app breaks at 2am, the way you find out is a client telling you. There is a warm-ping function already; the cheapest fix extends it to alert on failure.
- App integrity, secrets, RLS, webhooks: COVERED (the September audit, live and verified).

## 2. Delivery — PARTIAL, one GAP that can take the guarantee down

- The 14-day promise is warned at day 11 (`guarantee_watch`), and replacements owed are tracked. COVERED.
- **The GAP: you can open a guarantee you cannot keep.** The clock starts when the $500 deposit is paid. Nothing tells you *at that moment* whether the bench even holds a verified, Watch-cleared person who fits. If it does not, the day-11 warning arrives too late — sourcing, assessing, Taking The Watch and verifying a new person takes far longer than three days. So the structural risk is: **the promise is sold faster than cold sourcing can deliver.** The fix is a coverage signal that is visible *before* a search opens, not after it is nearly lapsed.

## 3. Capacity and key person — BUSINESS, the ceiling is real

You personally run every discovery call and are both CSM and TSM for the first twenty clients. Rough ceiling, at ~15 min per weekly talent check-in plus monthly client pulses plus discovery calls plus matching:

- **10 placements:** comfortable, ~1 focused week/month holds.
- **20 placements:** the weekly Friday check-ins alone are ~5 hours, before pulses, new calls and matching. The 1-week/month model starts to strain.
- **30 placements:** it breaks. The first thing to go is check-in responsiveness — which is exactly the thing that catches a talent being mistreated or a placement going wrong.

The first hire should be triggered by a number, not a crisis. Recommend: the moment placements cross ~15, hire into the TSM seat first (the check-ins are the early-warning system and cannot lapse). This is yours to decide, not code — but the console could surface the trigger.

**Bus factor:** every credential, the Supabase password, the Netlify login, the Google admin, the one Mac — all single points. Tied to the backup gap above.

## 4. Financial — COVERED visibility, two GAPS

- Margin per placement and across the roster: COVERED (`placement_margin`, the Margin screen).
- **GAP: a failed autopay looks identical to one never attempted.** The money view does not distinguish "we charged and the bank refused" from "not charged yet." A client whose debit failed silently reads as simply unbilled. Known from the September review; buildable.
- **GAP: no forward view of concentration or churn.** Your first clients are most of your revenue, and nothing models "what ends this month and next." Two placements ending in one month is a real cash event you would only see after it happened. A small view fixes it.

## 5. Legal and compliance — PARTIAL, one precise GAP

- **Erasure is incomplete — GAP.** Deleting an account cascades the database correctly (Signature, interviews, matches, feedback, history all go). But identity documents, photos and intro videos live in **storage buckets keyed by user id, not database rows**, so they are *not* removed. A deletion request today leaves the person's passport in the private `vetting` bucket. For a real GDPR/CCPA erasure this must also clear storage. Precise, buildable.
- **BUSINESS:** no attorney has reviewed the terms; contractor classification for offshore talent is unresolved and matters before the first payout; the privacy policy must be verified field-by-field against what the app actually stores (Part C7). The non-circumvention clause is stronger now under Utah but still untested.

## 6. Reputational — PARTIAL

- Spoofing: the DMARC record is now `p=none` with reporting; the escalation to quarantine then reject is owed over the next two weeks (from the September work). Until then the domain is still spoofable. PARTIAL.
- Talent mistreatment: the weekly check-in with a flag to the TSM is the surfacing mechanism — COVERED in design, but it depends entirely on a human reading the flags, which ties back to the capacity ceiling.
- A bad first placement or a data leak: mitigated by the vetting rigor and the September security work; residual and unavoidable at launch.

## 7. Supply — BUSINESS, coupled to Delivery

Keeping the guarantee depends on bench depth. When the pipeline is thin, quality drops or the promise slips — see §2. The Drive retention flag exists and is console-only, but nothing yet *uses* it to predict or prevent attrition; it is measured and then ignored. Worth wiring into the six-month review as a signal, later.

## 8. Demand — BUSINESS, defer

Clients come from one channel: discovery calls off the marketing site and your audience. Nothing in the product yet creates referral or expansion. Not a launch blocker; a growth build for after real clients exist.

---

## Mitigations I propose to build — for your decision at Checkpoint 2

**Product (needs your yes):**

| # | Build | Fixes | Effort | My call |
|---|---|---|---|---|
| M1 | **Bench coverage signal** — releasable/verified/Watch-cleared roster vs open searches, on the console overview and at search-open | The one delivery risk that can break the guarantee (§2) | Med | **Build** |
| M2 | **Failed-autopay distinct state** in the money view | §4, closes a known open item | Low | **Build** |
| M3 | **Complete erasure** — account deletion also clears the person's storage objects | §5, real compliance gap | Low | **Build** |
| M4 | **Concentration / forward-churn view** — revenue by client, what ends this month and next | §4 | Low–Med | **Build** |

**Operational (I recommend doing regardless — pure risk reduction):**

| # | Set up | Note |
|---|---|---|
| O1 | **Database backups** — scheduled logical dump to a private destination | Highest-value fix in this document. Needs a destination (a private GitHub repo is the plan in the Book); I need that connected or your say to use it. |
| O2 | **Off-machine code backup** — commit the working tree and push to a private remote | The git HEAD is behind the working files; the code exists only on the Mac. |
| O3 | **Basic uptime + error alert** — extend the warm-ping so an outage pages you, not a client | Cheapest monitoring. |

**Business (yours, not code — recommendations in the final report):** attorney review, contractor classification before first payout, the capacity-hire trigger, and the DMARC escalation already scheduled.
