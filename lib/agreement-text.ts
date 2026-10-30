/* The Client Services Agreement, as signed in the app.
   Text taken verbatim from Releve-Client-Agreement-DOCUSIGN-READY.docx
   (Sage's draft, 27 September 2026; attorney review still pending).
   Change the wording only together with AGREEMENT_VERSION, so every signed copy
   says exactly which text it carries. */
export const AGREEMENT_VERSION = 'csa-2026-10-30';
export const AGREEMENT_TITLE = 'Client Services Agreement';
export type AgItem = { p?: string; sub?: string; bullet?: string };
export const AGREEMENT_INTRO: string[] = [
 "This Client Services Agreement (“Agreement”) is entered into between Relève Staffing LLC, a Utah entity, registration number 14736520-0160 (“Relève,” “we,” or “us”), and the individual or business identified in the signature block below (“Client,” “you,” or “your”), effective as of the date of Client’s acceptance below (the “Effective Date”).",
 "Recitals",
 "Relève sources, evaluates, and matches independent professionals (“Talent”) with U.S.-based business owners on a retainer basis for ongoing virtual staffing services. Talent are independent contractors engaged directly by Relève, not by Client. Client engages Relève to identify, introduce, and manage access to Talent suited to Client’s business, and access to any Talent Relève introduces to Client is available exclusively through Relève.",
 "In consideration of the mutual promises in this Agreement, the parties agree as follows:"
];
export const AGREEMENT_SECTIONS: { h: string; items: AgItem[] }[] = [
 {
  "h": "1. SERVICES",
  "items": [
   {
    "sub": "1.1 Retainer Engagement"
   },
   {
    "p": "Relève will source, evaluate, and match Talent to Client’s stated needs, and introduce candidates for Client’s review and approval. No candidate is presented to Client, and no Talent begins work for Client, without Client’s own named approval."
   },
   {
    "sub": "1.2 Talent’s Status"
   },
   {
    "p": "Talent Relève introduces to Client are independent contractors engaged by Relève. Talent are not Client’s employees, and Client shall not treat, describe, or hold out any Talent as Client’s employee."
   },
   {
    "sub": "1.3 Direction and Control of Work"
   },
   {
    "p": "Client directs the day-to-day performance of the services under each Placement: the specific tasks assigned, their priority and sequencing, the tools and methods used, and the standard the work must meet. Client is solely responsible for supervising and directing Talent’s day-to-day work product and conduct while performing services for Client. Relève’s role is limited to sourcing, matching, administering payment to Talent, and providing relationship management through a Talent Success Manager — regular check-ins, coaching, escalation support, and quality monitoring. Relève does not direct the substance of Talent’s day-to-day work."
   },
   {
    "sub": "1.4 Client’s Own Compliance"
   },
   {
    "p": "Because Client directs the day-to-day work, Client is responsible for ensuring Client’s use of Talent’s services, and Client’s own workplace practices toward Talent, comply with law applicable to Client’s business."
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
    "p": "For twelve (12) months from the date Relève introduces a given Talent to Client, Client shall not employ, contract, or otherwise engage that Talent — directly, through an affiliate, or through any third party, and including anyone Client refers the Talent to — outside of Relève, whether or not a Placement with that Talent ever began."
   },
   {
    "sub": "2.3 Buyout"
   },
   {
    "p": "If Client wants to bring a Talent in-house on a permanent basis, Client should raise it with Relève; Relève would rather agree a buyout than discover an unauthorized direct engagement afterward."
   },
   {
    "sub": "2.4 Remedy"
   },
   {
    "p": "If Client breaches this Section, Client shall pay Relève a fee equal to twelve (12) months of the monthly rate applicable to that Talent’s Placement. This reflects what Relève would reasonably have earned had the Placement continued through Relève, plus the cost of the sourcing, vetting, and matching work already performed — it is a genuine pre-estimate of Relève’s loss, not a penalty — and is in addition to any amounts already owed."
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
    "p": "A deposit of $500 is due when Client opens a search for Talent. The deposit is non-refundable and is credited against Client’s first monthly invoice for the resulting Placement. Relève may, at its discretion, waive or reduce the deposit for a specific search."
   },
   {
    "sub": "3.2 Monthly Fee"
   },
   {
    "p": "Client will pay Relève a monthly retainer of between $2,500 and $4,500, depending on the scope, seniority, and hours of the Placement, as set out in the applicable Placement Schedule."
   },
   {
    "sub": "3.3 Invoicing"
   },
   {
    "p": "Relève will invoice Client on the first Monday of each month. Invoices are due on receipt."
   },
   {
    "sub": "3.4 Minimum Term"
   },
   {
    "p": "Each Placement has a minimum term of three (3) months. If Client ends a Placement before the end of the minimum term, Client remains responsible for the full fees for the remainder of the minimum term."
   },
   {
    "sub": "3.5 Continuation"
   },
   {
    "p": "After the minimum term, a Placement continues on a month-to-month basis until either party gives thirty (30) days’ written notice to end it, effective at the end of the following billing month."
   },
   {
    "sub": "3.6 Non-Payment"
   },
   {
    "p": "If an invoice remains unpaid for fourteen (14) days after its due date, Client’s account locks: Client may still view messages and billing, but other account features become unavailable until the invoice is paid."
   },
   {
    "sub": "3.7 Proration"
   },
   {
    "p": "Fees are not prorated for a Placement that starts or ends mid-month."
   }
  ]
 },
 {
  "h": "4. GUARANTEES",
  "items": [
   {
    "sub": "4.1 Candidate Timeline"
   },
   {
    "p": "Relève aims to present Client with a qualified candidate within fourteen (14) days of Client’s search opening (the day the deposit is paid). A “qualified candidate” is someone who has completed the Signature assessment and Relève’s verification process, and who has been reviewed and approved, by name, by a person at Relève as a genuine match to the role Client described. If Relève has not presented a qualified candidate within fourteen (14) days, Relève will continue the search at no additional cost until it does, or, at Client’s election, refund the deposit and close the search. This standard describes Relève’s own search process; it is not a promise about how quickly a Placement results in a signed offer, which also depends on Client’s own availability and decisions."
   },
   {
    "sub": "4.2 Replacement Guarantee"
   },
   {
    "p": "If a Placement ends within the first ninety (90) days of the Talent’s start date, for reasons other than Client’s breach of this Agreement, Relève will search for and present a replacement candidate at no additional placement fee. Client’s monthly fee continues to apply to any active Placement, and a replacement does not restart the three-month minimum term. This guarantee applies once per search. It does not apply where Client has failed to pay amounts owed, has materially changed the role from what was described at the start of the search, or has otherwise acted in a way that made the Placement unworkable."
   }
  ]
 },
 {
  "h": "5. CONFIDENTIALITY",
  "items": [
   {
    "p": "Client shall keep confidential, and not disclose to any third party, Relève’s business systems, pricing, matching methodology, the Relève Signature assessment, and any information about Talent that Relève provides to Client, other than what Relève designates for Client’s use in evaluating a candidate. This obligation survives termination of this Agreement."
   }
  ]
 },
 {
  "h": "6. INTELLECTUAL PROPERTY",
  "items": [
   {
    "p": "Work product Talent creates specifically for Client under a Placement belongs to Client, as set out in Relève’s agreement with that Talent. Relève’s own materials, including its training content, the Relève Signature assessment, and its underlying methodology, remain Relève’s property."
   }
  ]
 },
 {
  "h": "7. INDEMNIFICATION",
  "items": [
   {
    "p": "Client shall indemnify and hold Relève harmless from third-party claims, losses, and reasonable expenses (including attorneys’ fees) arising from:"
   },
   {
    "bullet": "Client’s direction, supervision, or management of Talent’s day-to-day work;"
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
  "h": "8. DISCLAIMERS AND LIMITATION OF LIABILITY",
  "items": [
   {
    "p": "Relève does not guarantee any particular business outcome from a Placement, beyond the specific commitments in Section 4. Relève is not a party to, and disclaims liability for, the substance, quality, or outcome of work Client directs Talent to perform, since Client controls the means and methods of that work. Relève’s total liability to Client under this Agreement, for any claim, is limited to the fees Client paid Relève in the twelve (12) months before the claim arose."
   }
  ]
 },
 {
  "h": "9. TERM AND TERMINATION",
  "items": [
   {
    "sub": "9.1 Term of a Placement"
   },
   {
    "p": "Governed by Sections 3.4 and 3.5 above."
   },
   {
    "sub": "9.2 Termination for Cause"
   },
   {
    "p": "Either party may end a Placement immediately on written notice if the other party materially breaches this Agreement and does not cure the breach within ten (10) days of notice, or breaches Section 2 (Non-Circumvention) or Section 5 (Confidentiality), which are not subject to a cure period."
   },
   {
    "sub": "9.3 Effect of Termination"
   },
   {
    "p": "On termination, Client remains responsible for fees accrued through the termination date and, where applicable, for the remainder of any minimum term under Section 3.4. Sections 2, 5, 6, 7, 8, and 10 survive termination."
   }
  ]
 },
 {
  "h": "10. DISPUTE RESOLUTION AND GOVERNING LAW",
  "items": [
   {
    "sub": "10.1 Informal Resolution"
   },
   {
    "p": "Before filing a claim, the parties agree to first raise the issue with the other (Client via hello@relevestaffing.com) so it can be worked out directly."
   },
   {
    "sub": "10.2 Governing Law"
   },
   {
    "p": "This Agreement is governed by the laws of the State of Utah, without regard to conflict-of-law principles."
   },
   {
    "sub": "10.3 Arbitration"
   },
   {
    "p": "Any dispute arising from this Agreement will be resolved by binding arbitration rather than in court, administered under the American Arbitration Association's Commercial Arbitration Rules, with the seat of arbitration in Utah, conducted in English, and may proceed remotely by video conference. Judgment on the arbitrator’s award may be entered in any court with jurisdiction. Either party may seek urgent injunctive relief in court to enforce Section 2 (Exclusivity and Non-Circumvention) or Section 5 (Confidentiality) pending arbitration."
   }
  ]
 },
 {
  "h": "11. GENERAL PROVISIONS",
  "items": [
   {
    "sub": "11.1 Entire Agreement"
   },
   {
    "p": "This Agreement, together with any Placement Schedule, is the entire agreement between Client and Relève regarding its subject matter, and supersedes any earlier discussion or document on the same subject, including prior versions of Relève’s published Terms of Service to the extent they conflict with this Agreement."
   },
   {
    "sub": "11.2 Amendment"
   },
   {
    "p": "Relève may update this Agreement on reasonable notice to Client for future Placements; changes do not apply retroactively to a Placement already underway without Client’s agreement."
   },
   {
    "sub": "11.3 Assignment"
   },
   {
    "p": "Client may not assign this Agreement without Relève’s consent. Relève may assign this Agreement in connection with a merger, reorganization, or sale of its business."
   },
   {
    "sub": "11.4 Severability"
   },
   {
    "p": "If any provision of this Agreement is unenforceable, the rest remains in effect, and the unenforceable provision will be read to be enforceable to the maximum extent the law allows."
   },
   {
    "sub": "11.5 Notices"
   },
   {
    "p": "Notices under this Agreement may be given electronically, including through the Relève platform or by email to the address on file."
   },
   {
    "sub": "11.6 Electronic Signature"
   },
   {
    "p": "Client’s electronic acceptance of this Agreement through the Relève platform is a valid signature with the same effect as a handwritten one."
   }
  ]
 }
];
