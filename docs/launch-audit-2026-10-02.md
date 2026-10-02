# Relève audit findings (2 Oct 2026), to be fixed

## SECURITY / DATABASE
S1 BLOCKER. Privilege escalation: policy "insert own profile" (schema.sql:129) only checks id = auth.uid(); guard_profile_edit is BEFORE UPDATE only. Sign-ups are open (email + Google). Anyone can sign up via Supabase auth API and POST /rest/v1/profiles {id, role:'admin'} or set email to a pending person's email so claim_pending() (AFTER INSERT, matches new.email) grants that pending role. Fix: BEFORE INSERT trigger forcing role='talent', email = auth.users email, stage/assigned_by_releve/role_chosen_at defaults, for anyone not admin/service. claim_pending must match on the auth email.
S2 BLOCKER. PART 37/38 never ran in production (client_agreements missing). Lead will run schema.
S3 HIGH. pulse_due() security definer, PUBLIC execute never revoked: anon gets placement+client ids (schema.sql:2613).
S4 HIGH. Anon can call log_backup (4417), log_email (2543, granted anon), apply_allowed (3846, anon, caller-supplied p_ip). Revoke; call server-side via service role (SUPABASE_SERVICE_ROLE_KEY is in Netlify; adminClient helper exists).
S5 HIGH. Talent can overwrite DocuSign-completed vetting/<id>/agreement.pdf (storage policies own vetting files replace/remove). Store completed agreements in admin-only bucket or block that name.
S6 MED. Anon direct insert into job_applications (policy schema.sql:3075) bypasses /api/apply rate limit, resume requirement and magic-byte check; applications bucket accepts any bytes. Move insert server-side with service role; drop anon insert policy; tighten bucket.
S7 MED. team_emails() granted to anon (3708). share_work() callable by anon (1479). Revoke.
S8 MED. Talent can read raw taking_the_watch_scores row (internal notes). Read only via my_watch_results.
S9 MED. interviews RLS: "client books" has no release check; "either side updates" has no WITH CHECK / column limits (meeting_url, starts_at, status). Route-level checks are bypassable.
S10 MED. taking_the_watch_attempts "update while open" lets talent change started_at/time_limit_minutes, defeating cutoff.
S11 MED. payout: RLS "own payout details" lets talent change detail/beneficiary without clearing confirmed_at; tax_form_on_file writable. guard_payout must null confirmed_at on detail change for non-admins and block tax_form_* writes.
S12 LOW. Cron 500s list env var names. CSP only frame-ancestors; x-powered-by exposed; HSTS no includeSubDomains/preload. No robots.txt on app (404 HTML). No og:image on app.
S13 LOW. Stripe verifyWebhook keeps only the last v1 (lib/stripe.ts:95). Interview POST/PATCH don't validate startISO/durationMin/stage/status.
S14. is_owner fails open: team/page.tsx:41 `owner = data !== false`, api/admin/team:309 `owner === false`.
S15. Admins cannot be removed/demoted; existing account cannot be promoted. team page copy contradicts AddAdmin flow.

## BILLING / BUSINESS
B1 BLOCKER. Notice: schema.sql:4016-4035. notice_ends_on = first Monday of following month (2 days notice possible) and notice filter skips the 3-month minimum. Implement the business rule in AGENT-BRIEF.
B2 BLOCKER. Guarantee replacement double-bills: ended placement keeps billing through minimum (4031) while replacement bills from start; nothing checks replaces_id/ended_reason (guaranteed reasons in lib/care-public.ts:93-94).
B3 BLOCKER. Monthly cron fails: final pay_the_month (4247, guard 4254, also 4090) uses is_admin(); cron runs as service role. Use is_team_or_service(). Alert team on cron failure.
B4 BLOCKER. Console notice path (lib/money.ts:122-132 via api/admin/money 'notice', EndPlacement.tsx) never sets notice_ends_on; billing never stops. Toast lies.
B5. Notice wording five ways: GiveNotice.tsx:23,45,54; billing/page.tsx:155; EndPlacement.tsx:24,46; ValueCalculator.tsx:71 ("Cancel any month. No severance, no contract" contradicts minimum); email.ts:747,751. give_notice doesn't mention minimum.
B6. Deposit credit: only applies if deposit 'paid' when first retainer drafted (ACH 'processing' never credited, no retry); greatest(0, base-dep) throws away remainder; credited_on set at draft time so voiding loses credit.
B7. Placements created after the 1st miss partial first month (cron on 1st; next run bills full month). Console alert goes quiet once any retainer exists for period (lib/console.ts:389). period_start still 1st for prorated.
B8. Payroll not prorated (4256-4268). Final minimum month not prorated for mid-month starts (minimum_term_ends 1004).
B9. customerFor (billing.ts:47) reads billing_accounts via session-less client on pay link pages; creates duplicate Stripe customer; payment method mismatch breaks autopay. Use adminClient.
B10. No dispute/refund handling (webhook handles only checkout.session.completed, setup_intent.succeeded, payment_intent.processing/succeeded/payment_failed, payment_method.detached). Add charge.dispute.created/closed, charge.refunded, mandate.updated, payment_intent.canceled; admin refund action.
B11. Double payment: checkoutForInvoice (billing.ts:261) doesn't claim invoice; pre-signup deposit processing not tracked (deposit_status stays due; console nags a paid client); succeeded handler overwrites intent on an already-paid invoice.
B12. Idempotency key invoice:${id} (billing.ts:369) blocks retries 24h. Include attempt/amount/pm.
B13. 14-day suspension not enforced: only client gate; payroll keeps paying talent. Add suspended state, pause payroll, notify both sides; reminders day 1/7/13.
B14. Webhook ignores DB write errors; no status guards (processing overwrites paid; failed flips paid; succeeded revives void).
B15. Waived deposit leaves a draft deposit invoice that can be mailed/charged (money.ts:63). $0 retainer can never be sent (money route:35).
B16. Pre-signup deposit failure: no email/alert; Checkout-created Stripe customer never stored (mandate orphaned).
B17. Invoices not real documents: no printable/PDF, no entity, bill-to, line items. due_on not reset when sent late.
B18. Any admin (incl. manager) has full money powers; status picker can move processing to paid/void. Owner-only for paid/void/amount edits/payout details; refuse manual change on processing.
B19. Reports show contracted rates, not cash collected; no receivables aging, MRR history; retention counts guarantee replacements as churn.
B20. setTalentPay refuses talent with 2 placements and points at a per-placement editor that doesn't exist (lib/payout.ts:64).
B21. Contracts don't gate money; client_agreements one row per client overwritten.
B22. ACH deposit shows "Pay your $500" for days; ?deposit=done / ?paid=done / ?setup=done never read; no success confirmation.
B23. Failed autopay locks client out immediately (billing.ts:247): give a grace banner first.
B24. Pay link pages are GET pages creating Stripe objects on every load (link scanners). Make creation happen on button click.
B25. UTC dates still: work.ts:356 endPlacement, work.ts:278 createPlacement default, money.ts:68,93, webhook paid_on 109,139, care.ts:267, console/money/page.tsx:112, money.ts:213. PlacementMaker.tsx:115, IssueAgreement.tsx:20 default tomorrow after 5pm PT.
B26. DocuSign signer defaults to 'Sage Jackson' (lib/docusign.ts:37) if env unset: use "Relève".
B27. Talent payment currency from roster row while amount USD; record amount sent/fee. W-9/1099 for US talent missing.

## CLIENT / TALENT / ADMIN EXPERIENCE
X1 BLOCKER. No error.tsx / global-error.tsx / not-found.tsx anywhere; live 404 is Next's unbranded black/white page. No loading.tsx under /app/**; console loading shows Overview skeleton for every page.
X2. Direct client<->talent message email mislabelled (api/messages/route.ts:66 newMessage name 'there' -> "Your account manager has replied").
X3. Full-screen gates trap people: TermsGate, InvoiceGate, ExecFirstRun have no sign-out/contact; TermsGate name-mismatch says "tell us" with no way.
X4. Client sees no value month over month: only counts (PlacementView.tsx:107); talent weekly "What got done" only to manager; no hours; /app/value static and reads first placement only; no monthly summary email. Build monthly report page + email.
X5. Messaging feels unattended: no unread indicator for client/talent; MessageThread loads once (105); no response-time promise; manager anonymous ("Your Success Manager"); team replies show "Relève". Show named CSM/TSM with photo; reply promise.
X6. No per-manager scoping: csm_id/tsm_id assignable but unused; every message emails every admin. Add "Mine" filter and route notifications to assigned manager (fallback all admins).
X7. 14-day promise wording inconsistent (GuaranteeBadge.tsx:28 "Placement Guarantee" measures first candidate; ValueContent.tsx:85, ValueCalculator.tsx:60,70 say "in the seat in fourteen days"); badge hardcodes 14 ignoring searches.guarantee_days.
X8. Timezone bugs: TaskBoard groups by UTC date (176) labels local (199); same in PlacementView.tsx:74, FirstFortnight.tsx:23, PlacementProgress.tsx:22, GuaranteeBadge.tsx:9, billing/page.tsx:138.
X9. Talent "Message" (PlacedSummary.tsx) opens manager thread; add ?tab= support (MessagesTabs.tsx:13).
X10. Silent failures: CalendarConnect.tsx:13; ApplicationCard.tsx:37 openResume; VettingReview.tsx:16 & VettingUpload.tsx:64 window.open after await (Safari blocks).
X11. Null crash: RoleBriefEditor.tsx:30,68,69,83 name.split; DeletePerson.tsx:18 name.trim() on possibly null full_name.
X12. Console "Notice given" no confirmation (EndPlacement.tsx:51).
X13. Gaps client: interview reminders (no template); request replacement or pause from app; exit survey on notice; quarterly review prompt; task comments, status beyond done, edit task after creation.
X14. Gaps talent: EOD/time log; ask a question on a task; executive-specific briefing (tools, access, preferences); pay schedule & which placement each rate belongs to (app/app/pay/page.tsx:44).
X15. Gaps admin: see client<->talent direct threads in console (TeamInbox lists only manager threads).
X16. Low: tz.replace('_',' ') first only (interviews/page.tsx:343); "no search yet" no timeline (ExecOnboarding.tsx:14); shortlisted email names not escaped (email.ts:544); task update refused by RLS returns ok (lib/work.ts:88); Google sign-in no busy/error state (SignIn.tsx:396).

## COPY / A11Y / POLISH
P1. ~505 lines with em dashes in app/ components/ lib/ user-facing strings; 46 email sign-offs "— Relève"; title "Relève — Accounts Center".
P2. Banned words visible: "Bench ready" (console/page.tsx:194); "vets the shortlist" (vision/HowContent.tsx:15); "Chasing an overdue invoice", "Screening to a shortlist" (lib/watch-tasks.ts:123,292); "flagged to me first" (lib/signature/model.ts:104); "Profile flagged for review" (lib/signature/score.ts:261). Red "Fails" pill to client (app/app/pipeline/page.tsx:191).
P3. "Accounts Centre" (SignIn.tsx:66) vs "Accounts Center" (layout).
P4. 139/140 <label> not tied to input (.ff pattern). .muted #7D9080 on #FAFAF8 ~3.2:1. Rapport buttons no aria-pressed (CheckinForm.tsx:203). RolePicker select no label.
P5. Availability page shows "Calendar syncing is coming shortly" + disabled "AVAILABLE SHORTLY" when Google env missing; never show "coming soon" to a client: hide the card instead.
