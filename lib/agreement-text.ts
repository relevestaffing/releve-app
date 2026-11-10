/* The Client Services Agreement, as signed in the app.
   Generated from ~/Releve/legal/CSA-csa-2026-11-06.1.md (started from Sage's
   27 September 2026 draft; attorney review still pending).
   Change the wording only together with AGREEMENT_VERSION, so every signed copy
   says exactly which text it carries.

   KEEP IN STEP WITH THE TERMS: whenever Nona changes prices, plans, terms of
   commitment, guarantees, the deposit, or how a placement works, update this
   text to match in the same piece of work, bump AGREEMENT_VERSION, and tell
   her what changed. The live Terms of Service (relevestaffing.com/terms) and the
   Relève Book carry the same terms. Version history:
   csa-2026-10-30   first in-app text, from Sage's 27 September draft.
   csa-2026-10-30.2 plans and prices (Essential, Specialist, Starter, eLIVate
     discount), deposit refund exception, 6/3-month terms with 3-month renewals,
     30 days' notice before a term ends, two replacements, Starter buyout figure,
     talent on US business hours with an NDA.
   csa-2026-11-05.1 pivot to fully managed virtual staff: Starter and Essential
     offshore, Specialist a local hire (US or Europe); every plan gets a free
     business audit, both success managers, monthly and biweekly calls, end of
     week report, the app and the 90-day plan; Starter capped at 15 hours with
     general training; Essential and Specialist add monthly audits and ongoing
     training. Relève is still not the employer; talent stay contractors.
   csa-2026-11-06.1 legal review pass. Starter and Essential only (Specialist
     moves to a separate Specialist Addendum); defined Placement and Placement
     Schedule; Relève sets scope, holds the weekly (Essential) or biweekly
     (Starter) call and runs performance reviews while the client directs daily
     tasks; replacement guarantee for life of the agreement, two per placement;
     fees pause during a vacancy and the minimum term extends; deposit refunded
     only if the search closes before any candidate is presented; non-
     circumvention runs 12 months from the end of the last placement, with a
     stated conversion fee; confidentiality now runs both ways, with the talent
     NDA enforceable for the client; data, AI-tool, client-conduct, advice,
     force majeure and notice clauses added; background-check claim removed.
   csa-2026-11-10.1 Section 1.2: Client buys hours of service from Relève, not the
     services of one particular individual; the Placement Schedule terms continue
     if the Talent changes; Talent log their work in the platform. Client-specific
     addenda added (lib/client-addenda.ts), the first for Refynity. */
export const AGREEMENT_VERSION = 'csa-2026-11-10.1';
export const AGREEMENT_TITLE = 'Client Services Agreement';
export type AgItem = { p?: string; sub?: string; bullet?: string };
export const AGREEMENT_INTRO: string[] = [
 "This Client Services Agreement (“Agreement”) is entered into between Relève Staffing LLC, a Utah limited liability company, registration number 14736520-0160 (“Relève,” “we,” or “us”), and the individual or business identified in the signature block below (“Client,” “you,” or “your”), effective as of the date of Client’s acceptance below (the “Effective Date”). If Client is a business, the person signing confirms they are authorized to bind it, and “Client” means that business.",
 "Recitals",
 "Relève sources, evaluates, matches, and manages independent professionals (“Talent”) for U.S.-based business owners on a retainer basis for ongoing virtual staffing services. Talent are independent contractors engaged and paid by Relève. They are not employees of Client or of Relève. Access to any Talent Relève introduces to Client is available exclusively through Relève.",
 "In consideration of the mutual promises in this Agreement, the parties agree as follows:"
];
export const AGREEMENT_SECTIONS: { h: string; items: AgItem[] }[] = [
 {
  "h": "1. DEFINITIONS AND SERVICES",
  "items": [
   {
    "sub": "1.1 Definitions"
   },
   {
    "bullet": "“Placement” means the engagement of one Talent in one role for Client under this Agreement. A Replacement for that Talent continues the same Placement."
   },
   {
    "bullet": "“Placement Schedule” means the offer for a Placement that Client accepts in the Relève platform. It states the plan, monthly rate, weekly hours, role, time zone, and start date, and it forms part of this Agreement."
   },
   {
    "bullet": "“Search” means Relève’s process of sourcing, vetting, and presenting candidates for a role. A Search opens on the day Client’s deposit is paid."
   },
   {
    "bullet": "“Replacement” means a new Talent presented to fill a Placement after the previous Talent’s assignment ends."
   },
   {
    "bullet": "“Vacancy” has the meaning given in Section 4.3."
   },
   {
    "sub": "1.2 Retainer Engagement"
   },
   {
    "p": "Relève will source, evaluate, and match Talent to Client’s stated needs, and introduce candidates for Client’s review and approval. No candidate is presented to Client, and no Talent begins work for Client, without Client’s own named approval. Client buys hours of service from Relève, delivered through the Talent Client approves, and not the services of one particular individual. If a Talent changes under Section 4, the plan, rate, weekly hours, and minimum term in the Placement Schedule continue to apply. Talent log their hours and work in the Relève platform."
   },
   {
    "sub": "1.3 Talent’s Status"
   },
   {
    "p": "Talent Relève introduces to Client are independent contractors engaged and paid by Relève. Talent are not Client’s employees, and Client shall not treat, describe, or hold out any Talent as Client’s employee. Relève pays Talent from its own funds. The fees Client pays are for Relève’s services and are not a pass-through of any Talent’s compensation. Talent work on U.S. business hours as set out in the Placement Schedule and sign a written non-disclosure and confidentiality agreement with Relève before any Client information is shared with them."
   },
   {
    "sub": "1.4 Who Directs What"
   },
   {
    "p": "Relève sets the scope of the role and the recurring work the role is responsible for, such as a standing weekly posting schedule, and agrees it with Client at the start of the Placement and as Client’s business changes. Relève holds a regular call with Talent (weekly on the Essential plan and biweekly on the Starter plan), coaches Talent, reviews Talent’s performance against the agreed scope, and acts on what it finds, including by coaching, replacing, or ending Talent’s assignment."
   },
   {
    "p": "Client directs the day-to-day work within that scope: the individual tasks and requests Client assigns, their order and urgency, and the standard Client expects for each. Client is responsible for giving Talent clear and lawful instructions and for supervising Talent’s day-to-day work product."
   },
   {
    "p": "Client does not set Talent’s compensation, conduct Talent’s performance reviews, or discipline or dismiss Talent. If Client has a concern about Talent, Client raises it with the Client Success Manager, and Relève acts on it under Section 4."
   },
   {
    "sub": "1.5 Client’s Own Compliance"
   },
   {
    "p": "Because Client directs the day-to-day work, Client is responsible for ensuring that Client’s use of Talent’s services, and Client’s own workplace practices toward Talent, comply with law applicable to Client’s business."
   },
   {
    "sub": "1.6 Client Conduct"
   },
   {
    "p": "Client shall treat Talent respectfully and lawfully. Client shall not harass, discriminate against, or abuse Talent, shall not instruct Talent to do anything unlawful, deceptive, or outside the role (including work that requires a professional license Talent does not hold), and shall not require Talent to work beyond the hours in the Placement Schedule. Relève may suspend or end a Placement immediately on written notice if Client breaches this Section."
   }
  ]
 },
 {
  "h": "2. EXCLUSIVITY AND NON-CIRCUMVENTION",
  "items": [
   {
    "sub": "2.1 Exclusive Access"
   },
   {
    "p": "Client may access and engage Talent introduced by Relève only through Relève. Relève does not permit Client to hire, subcontract, or otherwise directly engage a Talent Relève has introduced outside of this Agreement."
   },
   {
    "sub": "2.2 Restriction"
   },
   {
    "p": "During each Placement with a given Talent, and for twelve (12) months after the last day of the most recent Placement with that Talent, Client shall not employ, contract, or otherwise engage that Talent, directly, through an affiliate, or through any third party (including anyone Client refers the Talent to), outside of Relève. If Relève introduces a Talent to Client and no Placement with that Talent ever begins, the restriction runs for twelve (12) months from the date of introduction. Client shall not encourage or induce any Talent to end their relationship with Relève."
   },
   {
    "sub": "2.3 Conversion"
   },
   {
    "p": "Client may bring a Talent in-house on a permanent or direct basis at any time by notifying Relève and paying the Conversion Fee, after which Relève releases Client from Section 2.2 for that Talent. The Conversion Fee is twelve (12) times the monthly rate of the plan under which the Talent was introduced or placed: $11,400 for the Starter plan and $30,000 for the Essential plan."
   },
   {
    "sub": "2.4 Remedy"
   },
   {
    "p": "If Client breaches this Section, Client shall pay Relève a fee equal to the Conversion Fee for the plan applicable to that Talent (if no plan applied because no Placement began, the plan Client was offered or, if none, the Starter fee). Relève’s loss from a breach, being the retainer it would have earned and the sourcing, vetting, and matching work already performed, is difficult to calculate, and the parties agree this fee is a reasonable pre-estimate of that loss and not a penalty. It is in addition to any amounts already owed."
   },
   {
    "sub": "2.5 Enforceability"
   },
   {
    "p": "If a court finds any part of this Section broader than necessary to protect Relève’s legitimate interests, it will be narrowed to what is reasonable and enforced as narrowed, rather than voided entirely."
   }
  ]
 },
 {
  "h": "3. FEES AND PAYMENT",
  "items": [
   {
    "sub": "3.1 Deposit"
   },
   {
    "p": "A deposit of $500 is due before Relève begins a Search for Talent, and Client’s account opens once it is paid. It covers the sourcing and assessment work that begins immediately, and is credited against Client’s first invoice for the resulting Placement. The deposit is non-refundable, with one exception: it is refunded in full if the Search closes, for any reason other than Client’s breach, before Relève has presented a candidate to Client. A candidate is presented when Relève makes that candidate available for Client’s review in the Relève platform. Once a candidate has been presented, the deposit is not refundable, even if Client declines that candidate or every candidate presented. Relève may, at its discretion, waive or reduce the deposit for a specific Search."
   },
   {
    "sub": "3.2 Plans and Fees"
   },
   {
    "p": "Relève offers two plans under this Agreement. Essential is $2,500 per month for a dedicated, full-time, non-specialized offshore professional, on a six-month commitment. Starter is $950 per month, or $2,500 paid in full for each three-month term, on a three-month commitment, with an offshore professional whose hours are capped at fifteen (15) per week. eLIVate Club members receive $500 off the monthly fee for the first three (3) months on the Essential plan."
   },
   {
    "p": "Every plan includes sourcing, vetting and matching, a free business audit at the start of the engagement, a Client Success Manager and a Talent Success Manager, a monthly call with Client, a regular call with the professional (weekly on Essential, biweekly on Starter), an end of week report, the Relève platform, a written 90-Day Success Plan, and payment of the professional through Relève. Starter includes general training before the professional starts. Essential adds full management of the role, a business audit every month, and consistent training from Relève on the role’s specifics."
   },
   {
    "p": "A Specialist plan, with a professional hired locally in the United States or Europe, is not covered by this Agreement. It is available only under a written Specialist Addendum signed by both parties before the Placement starts."
   },
   {
    "p": "Client’s plan and rate are confirmed in the Placement Schedule before the Placement starts and do not change during the initial term."
   },
   {
    "sub": "3.3 Hours"
   },
   {
    "p": "On the Essential plan, “full-time” means approximately forty (40) hours per week on U.S. business hours in the time zone stated in the Placement Schedule, excluding Talent’s approved time off and local public holidays. Extra hours or overtime require Relève’s prior consent. On the Starter plan, hours are capped at fifteen (15) per week, and Relève is not required to provide hours above the cap. If Client regularly needs more, Relève may require Client to move to the Essential plan. Talent are paid a fixed monthly rate, and hours are not invoiced."
   },
   {
    "sub": "3.4 Authorization and Invoicing"
   },
   {
    "p": "Relève will invoice Client on the first Monday of each month, and invoices are due on receipt. A Starter plan paid in full is invoiced once, at the start of each three-month term. Client authorizes Relève to charge the payment method Client designates in the Relève platform (bank debit or card) for the deposit and for each invoice when due, and to retry a failed payment. Client will keep that payment method current. Fees do not include taxes. Client is responsible for any sales, use, or similar taxes on the fees, and Relève is responsible for taxes on its own income."
   },
   {
    "sub": "3.5 Proration"
   },
   {
    "p": "Fees are prorated by calendar day for the first partial month of a Placement and for any Vacancy."
   },
   {
    "sub": "3.6 Minimum Term"
   },
   {
    "p": "Each Placement has a minimum term from its start date: six (6) months on the Essential plan and three (3) months on the Starter plan. Days of Vacancy do not count toward the minimum term, and the minimum term extends by the length of any Vacancy. If Client ends a Placement before the end of the minimum term and does not request a Replacement, Client remains responsible for the full fees for the remainder of the minimum term, except where Section 4.4 or Section 11.3 allows Client to end the Placement without that liability."
   },
   {
    "sub": "3.7 Automatic Renewal"
   },
   {
    "p": "After the minimum term, a Placement renews automatically in three-month terms, and Client may move to a different plan at the end of any term. Either party may choose not to renew by giving thirty (30) days’ written notice before the current term ends."
   },
   {
    "sub": "3.8 Non-Payment"
   },
   {
    "p": "If an invoice remains unpaid for fourteen (14) days after its due date, Relève may suspend the Placement and lock Client’s account: Client may still view messages and billing, but other account features become unavailable until the invoice is paid. Suspension does not reduce the fees owed. Client shall pay Relève’s reasonable costs of collecting overdue amounts, including attorneys’ fees."
   }
  ]
 },
 {
  "h": "4. REPLACEMENT, VACANCY, AND GUARANTEES",
  "items": [
   {
    "sub": "4.1 Candidate Timeline"
   },
   {
    "p": "Relève will present a qualified candidate within fourteen (14) days of Client’s Search opening. A “qualified candidate” is someone who has completed the Signature assessment and Relève’s vetting process, and who has been reviewed and approved, by name, by a person at Relève as a genuine match to the role Client described. The fourteen days pause for any day Client has not provided the role information or assessment Relève needs, or has not responded to a Relève request. If Relève has not presented a qualified candidate within fourteen (14) days, Relève will continue the Search at no additional cost until it does, and Section 3.1 applies if the Search closes before a candidate is presented. This standard describes Relève’s own search process. It is not a promise about how quickly a Placement results in a signed offer, which also depends on Client’s own availability and decisions."
   },
   {
    "sub": "4.2 Replacement Guarantee"
   },
   {
    "p": "If a Talent’s assignment to a Placement ends for any reason other than those listed below, then on Client’s request Relève will search for and present a Replacement at no additional placement fee or deposit. This guarantee has no time limit and applies at any time while this Agreement is in effect. It covers up to two (2) Replacements per Placement. A Replacement does not restart the minimum term. The guarantee does not apply where the assignment ended because Client failed to pay amounts owed or otherwise materially breached this Agreement, because Client treated Talent abusively or unlawfully, or because Client materially changed the role from what the Placement Schedule describes without Relève’s agreement."
   },
   {
    "sub": "4.3 Vacancy and Fees"
   },
   {
    "p": "A “Vacancy” begins on the day after Talent’s last working day (or the day Talent is suspended or removed at Client’s request) and ends on the day a Replacement starts. Fees do not accrue during a Vacancy. Client pays only for the days a Talent is assigned to the Placement. Approved time off and local public holidays are not a Vacancy, and Relève will use reasonable efforts to arrange cover. An absence of more than ten (10) consecutive business days without cover is treated as a Vacancy."
   },
   {
    "sub": "4.4 If a Replacement Is Not Presented"
   },
   {
    "p": "If Relève has not presented a Replacement within thirty (30) days after Client’s request, Client may end the Placement on written notice and owes nothing for the remainder of the minimum term. No fees accrue during the Vacancy."
   },
   {
    "sub": "4.5 Removal for Misconduct"
   },
   {
    "p": "Client may ask Relève to suspend a Talent immediately for suspected theft, fraud, misuse of Client’s data, or other serious misconduct. Relève will act promptly, and fees do not accrue from the day of suspension. Unless Client caused the misconduct, the ending of the assignment counts for purposes of Section 4.2."
   },
   {
    "sub": "4.6 Sole Remedy"
   },
   {
    "p": "The commitments in Sections 3.1, 4.1, 4.2, 4.3, and 4.4 are Client’s remedy if a candidate is not presented or a Placement does not work out."
   }
  ]
 },
 {
  "h": "5. CONFIDENTIALITY",
  "items": [
   {
    "sub": "5.1 Client’s Obligations"
   },
   {
    "p": "Client shall keep confidential, and not disclose to any third party, Relève’s business systems, pricing, matching methodology, the Relève Signature assessment, and any information about Talent that Relève provides to Client, other than what Relève designates for Client’s use in evaluating a candidate."
   },
   {
    "sub": "5.2 Relève’s Obligations"
   },
   {
    "p": "Relève shall keep confidential all non-public information Client shares or that Talent learns about Client’s business, finances, customers, systems, and credentials (“Client Confidential Information”), shall use it only to provide the services, and shall not disclose it except to Talent and Relève personnel who need it to provide the services and are bound by written confidentiality obligations. Relève shall protect Client Confidential Information with at least reasonable care."
   },
   {
    "sub": "5.3 Talent’s Confidentiality"
   },
   {
    "p": "Every Talent signs a written confidentiality agreement with Relève before receiving any Client Confidential Information. Client is an intended third-party beneficiary of Talent’s confidentiality obligations to the extent they protect Client Confidential Information. At Client’s reasonable request, Relève will enforce those obligations against Talent."
   },
   {
    "sub": "5.4 Exclusions and Required Disclosure"
   },
   {
    "p": "Confidential information does not include information that is or becomes public through no fault of the receiving party, that the receiving party already lawfully knew, or that it independently develops. A party may disclose confidential information where the law requires, after giving the other party prompt notice where legally permitted."
   },
   {
    "sub": "5.5 Incident Notice"
   },
   {
    "p": "If Relève learns that Client Confidential Information was lost, accessed, or disclosed without authorization through a Talent or Relève’s systems, Relève will notify Client without undue delay and within seventy-two (72) hours, and will cooperate reasonably with Client’s response."
   },
   {
    "sub": "5.6 Duration"
   },
   {
    "p": "These obligations survive termination of this Agreement for five (5) years, and for trade secrets and personal data for as long as they remain protected."
   }
  ]
 },
 {
  "h": "6. DATA, SECURITY, AND ACCESS",
  "items": [
   {
    "sub": "6.1 Client Controls Access"
   },
   {
    "p": "Client decides what systems and data Talent may access, and shall grant only the access the role requires. Client shall share credentials through a password manager or comparable vault rather than by sharing passwords directly, shall use multi-factor authentication where available, and shall remove Talent’s access when a Placement ends. Client is responsible for the security of its own systems and for its own financial controls, including approval of payments."
   },
   {
    "sub": "6.2 Excluded Data"
   },
   {
    "p": "Unless Client and Relève agree otherwise in writing, Client shall not give Talent access to protected health information, payment card numbers, or other data that the law requires to be handled under special safeguards."
   },
   {
    "sub": "6.3 Personal Data"
   },
   {
    "p": "Client is responsible for having the right to give Talent access to the personal data Client provides. Where the law requires a written data-processing agreement between Client and a service provider, the parties will sign one on Client’s request."
   },
   {
    "sub": "6.4 AI Tools"
   },
   {
    "p": "Relève requires Talent not to enter Client Confidential Information into any artificial intelligence tool unless Client has approved that tool, and not into any tool that uses inputs to train models."
   },
   {
    "sub": "6.5 Relève’s Use of Information"
   },
   {
    "p": "Relève uses the information Client provides to run the Search, prepare the business audit, match candidates, and operate the platform. Relève uses service providers, including artificial intelligence tools, for these purposes. They are described in Relève’s Privacy Policy and are bound by confidentiality."
   }
  ]
 },
 {
  "h": "7. INTELLECTUAL PROPERTY",
  "items": [
   {
    "sub": "7.1 Client Work Product"
   },
   {
    "p": "Relève assigns to Client all rights Relève holds in work product Talent creates specifically for Client under a Placement, effective when the related fees are paid. Relève obtains a matching assignment or license from each Talent. Tools, templates, and know-how Talent owned before the Placement remain Talent’s, and Client may use them as embedded in the work product."
   },
   {
    "sub": "7.2 Client Materials"
   },
   {
    "p": "Client keeps ownership of the materials, content, and data it provides, and grants Relève and Talent a limited license to use them to provide the services. Client is responsible for the content it directs Talent to create and publish."
   },
   {
    "sub": "7.3 Relève Materials"
   },
   {
    "p": "Relève’s own materials, including its training content, the Relève Signature assessment, and its underlying methodology, remain Relève’s property."
   }
  ]
 },
 {
  "h": "8. BUSINESS AUDIT AND ADVICE",
  "items": [
   {
    "p": "The business audit, the 90-Day Success Plan, and recommendations from Relève’s success managers are for general business operations only. They are not legal, tax, accounting, financial, medical, or compliance advice. Client decides whether to act on them, and Relève does not guarantee any business result."
   }
  ]
 },
 {
  "h": "9. INDEMNIFICATION",
  "items": [
   {
    "p": "Client shall indemnify and hold Relève harmless from third-party claims, losses, and reasonable expenses (including attorneys’ fees) arising from:"
   },
   {
    "bullet": "Client’s direction or supervision of Talent’s day-to-day work;"
   },
   {
    "bullet": "Any claim, by a Talent or a governmental authority, that Client’s control over Talent’s day-to-day work created an employment or similar relationship between Client and Talent; or"
   },
   {
    "bullet": "Client’s breach of this Agreement."
   }
  ]
 },
 {
  "h": "10. DISCLAIMERS AND LIMITATION OF LIABILITY",
  "items": [
   {
    "p": "Relève does not guarantee any particular business outcome from a Placement, beyond the specific commitments in Sections 3.1 and 4. Relève is not responsible for the substance, quality, or outcome of the day-to-day work Client directs Talent to perform, since Client controls that work. Neither party is liable to the other for indirect, incidental, special, or consequential damages, including lost profits. Relève’s total liability to Client under this Agreement, for any claim, is limited to the fees Client paid Relève in the twelve (12) months before the claim arose. These limits do not apply to Client’s obligation to pay fees and the amounts due under Section 2, or to liability that the law does not allow to be limited, including fraud and willful misconduct."
   }
  ]
 },
 {
  "h": "11. TERM AND TERMINATION",
  "items": [
   {
    "sub": "11.1 Term of this Agreement"
   },
   {
    "p": "This Agreement continues until terminated. Either party may terminate it on thirty (30) days’ written notice if no Search or Placement is active."
   },
   {
    "sub": "11.2 Term of a Placement"
   },
   {
    "p": "Governed by Sections 3.6 and 3.7 above."
   },
   {
    "sub": "11.3 Termination for Cause"
   },
   {
    "p": "Either party may end a Placement immediately on written notice if the other party materially breaches this Agreement and does not cure the breach within ten (10) days of notice, or breaches Section 2 (Exclusivity and Non-Circumvention) or Section 5 (Confidentiality), which are not subject to a cure period. Client owes nothing for the remainder of the minimum term where Client ends a Placement for Relève’s uncured breach."
   },
   {
    "sub": "11.4 Effect of Termination"
   },
   {
    "p": "On termination, Client remains responsible for fees accrued through the termination date (excluding any Vacancy) and, where applicable, for the remainder of any minimum term under Section 3.6. Sections 2, 5, 7, 9, 10, and 12 survive termination."
   }
  ]
 },
 {
  "h": "12. DISPUTE RESOLUTION AND GOVERNING LAW",
  "items": [
   {
    "sub": "12.1 Informal Resolution"
   },
   {
    "p": "Before filing a claim, the parties agree to first raise the issue in writing with the other (Client by email to hello@relevestaffing.com, and Relève by email to the address on file for Client) and to try in good faith to resolve it for thirty (30) days. This does not delay a request for urgent injunctive relief under Section 12.3."
   },
   {
    "sub": "12.2 Governing Law"
   },
   {
    "p": "This Agreement is governed by the laws of the State of Utah, without regard to conflict-of-law principles."
   },
   {
    "sub": "12.3 Arbitration"
   },
   {
    "p": "Any dispute arising from this Agreement will be resolved by binding arbitration before a single arbitrator rather than in court, administered under the American Arbitration Association’s Commercial Arbitration Rules, with the seat of arbitration in Utah, conducted in English, and which may proceed remotely by video conference. The Federal Arbitration Act governs this Section. Each party bears its own costs, and the arbitrator may award the prevailing party its reasonable attorneys’ fees. Judgment on the arbitrator’s award may be entered in any court with jurisdiction. Either party may seek urgent injunctive relief in court to enforce Section 2 (Exclusivity and Non-Circumvention) or Section 5 (Confidentiality) pending arbitration."
   },
   {
    "sub": "12.4 Relationship to the Terms of Service"
   },
   {
    "p": "If this Agreement conflicts with Relève’s Terms of Service published at relevestaffing.com/terms, this Agreement controls. The Terms of Service continue to govern use of the website and platform in all other respects."
   }
  ]
 },
 {
  "h": "13. GENERAL PROVISIONS",
  "items": [
   {
    "sub": "13.1 Entire Agreement"
   },
   {
    "p": "This Agreement, together with each Placement Schedule, is the entire agreement between Client and Relève regarding its subject matter, and supersedes any earlier discussion, marketing statement, or document on the same subject. Client confirms it has not relied on any statement that is not in this Agreement. Nothing in this Section excludes liability for fraud."
   },
   {
    "sub": "13.2 Amendment"
   },
   {
    "p": "Relève may update this Agreement on reasonable notice to Client for future Placements. Changes do not apply to a Placement already underway without Client’s agreement."
   },
   {
    "sub": "13.3 Assignment"
   },
   {
    "p": "Client may not assign this Agreement without Relève’s consent. Relève may assign this Agreement in connection with a merger, reorganization, or sale of its business."
   },
   {
    "sub": "13.4 Severability"
   },
   {
    "p": "If any provision of this Agreement is unenforceable, the rest remains in effect, and the unenforceable provision will be read to be enforceable to the maximum extent the law allows."
   },
   {
    "sub": "13.5 Notices"
   },
   {
    "p": "Notices under this Agreement may be given electronically, including through the Relève platform or by email to the address on file for the receiving party, and take effect when sent."
   },
   {
    "sub": "13.6 Force Majeure"
   },
   {
    "p": "Neither party is liable for a delay or failure caused by events beyond its reasonable control, including utility or internet outages, natural disasters, civil unrest, and government action. This does not excuse payment for days a Talent is assigned and available to work. Section 4.3 governs fees when a Talent is unavailable."
   },
   {
    "sub": "13.7 Relationship of the Parties"
   },
   {
    "p": "Relève and Client are independent contracting parties. Nothing in this Agreement creates a partnership, joint venture, agency, or employment relationship between them, or between Client and any Talent."
   },
   {
    "sub": "13.8 Publicity"
   },
   {
    "p": "Relève will not use Client’s name, logo, or results in public materials without Client’s consent."
   },
   {
    "sub": "13.9 No Third-Party Beneficiaries"
   },
   {
    "p": "Except as stated in Section 5.3, this Agreement creates no rights in any person other than the parties."
   },
   {
    "sub": "13.10 Authority"
   },
   {
    "p": "Each party represents that it has the authority to enter into this Agreement."
   },
   {
    "sub": "13.11 Electronic Signature"
   },
   {
    "p": "Client’s electronic acceptance of this Agreement through the Relève platform is a valid signature with the same effect as a handwritten one. Relève accepts through its Founder, Sage Jackson, under the company’s standing authorization, effective on Client’s acceptance."
   }
  ]
 }
];
