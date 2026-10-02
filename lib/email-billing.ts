/* Billing and money emails.
   ------------------------
   Kept out of lib/email.ts so the money lane can change its own letters
   without touching every other message. Sent through the same send() (which
   logs every attempt), in the same letter as everything else Relève sends:
   white page, fern type, one action. Always signed as Relève, never a person.

   Copy rules: no em dashes, nothing that reads as a threat, and every letter
   points at the next right action. */
import { shell, p, esc, type Message } from './email';
import { NOTICE_TERMS } from './money-public';

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';

const quiet = (s: string) => `<p style="margin:18px 0 0;font-size:13px;color:#5F7163;">${s}</p>`;
const boxed = (s: string, edge = '#35443A') =>
  `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid ${edge};">${s}</p>`;

const SIGN = '\n\nRelève';
const BILLING = `${SITE}/app/billing`;

function msg(kind: string, subject: string, text: string, html: string): Message {
  return { kind, subject, text, html };
}

export const billingTemplates = {
  /* The invoice itself. A fully credited month says so rather than asking for
     nothing; a pay link leads when there is one. */
  invoiceIssued(o: {
    name: string; number: string; amount: string; period: string; due: string;
    payUrl?: string; creditNote?: string | null; zero?: boolean; docUrl?: string;
  }) {
    const doc = o.docUrl ?? BILLING;
    if (o.zero) return msg('invoiceIssued',
      `Relève invoice ${o.number}, ${o.period}`,
      `${o.name},\n\nInvoice ${o.number} for ${o.period} comes to nothing this time${o.creditNote ? `: ${o.creditNote}` : ''}. Nothing is due.\n\nThe full invoice is in your account: ${doc}${SIGN}`,
      shell(`Invoice ${esc(o.number)}`,
        p(`${esc(o.name)},`) +
        p(`Invoice <b>${esc(o.number)}</b> for ${esc(o.period)} comes to nothing this time${o.creditNote ? `: ${esc(o.creditNote)}` : ''}.`) +
        p('Nothing is due. It is in your account for your records.'),
        { label: 'View the invoice', href: doc }));

    return msg('invoiceIssued',
      `Relève invoice ${o.number}, ${o.period}`,
      `${o.name},\n\nInvoice ${o.number} for ${o.period}.\n\nAmount: ${o.amount}${o.creditNote ? ` (${o.creditNote})` : ''}\nDue: ${o.due}, on receipt\n\n${o.payUrl ? `Pay it directly, no sign-in needed: ${o.payUrl}\n\n` : ''}The full invoice, ready to print or save, is in your account: ${doc}\n\nIf anything on it looks wrong, reply to this email rather than paying it. We would rather fix it now.${SIGN}`,
      shell(`Invoice ${esc(o.number)}`,
        p(`${esc(o.name)},`) +
        p(`<b>${esc(o.amount)}</b> for ${esc(o.period)}, due ${esc(o.due)}, on receipt.`) +
        (o.creditNote ? p(esc(o.creditNote) + '.') : '') +
        p('If anything on it looks wrong, reply to this email rather than paying it. We would rather fix it now.'),
        o.payUrl ? { label: `Pay ${esc(o.amount)}`, href: o.payUrl } : { label: 'View the invoice', href: doc },
        o.payUrl ? { label: 'View the full invoice', href: doc } : undefined));
  },

  /* Day 1, 7 and 13 after the due date. Short, warm, and always one tap from
     done. Day 13 says plainly what day 14 means, once, without leaning on it. */
  invoiceReminder(o: { name: string; number: string; amount: string; day: number; payUrl?: string }) {
    const href = o.payUrl ?? BILLING;
    const head = o.day >= 13 ? 'A note before tomorrow' : o.day >= 7 ? 'A gentle reminder' : 'A quick reminder';
    const lead = o.day >= 13
      ? `Invoice ${o.number} for ${o.amount} is still open. Under the terms, a placement pauses once an invoice has been open fourteen days, and we would much rather it carried on without a break.`
      : o.day >= 7
        ? `Invoice ${o.number} for ${o.amount} is still open. If it is already on its way, thank you, and please ignore this.`
        : `Invoice ${o.number} for ${o.amount} was due yesterday. If it is already on its way, thank you, and please ignore this.`;
    return msg('invoiceReminder',
      `${head}: invoice ${o.number}`,
      `${o.name},\n\n${lead}\n\nIt takes a minute by bank or card: ${href}\n\nIf something about it is not right, reply here and we will sort it out.${SIGN}`,
      shell(head,
        p(`${esc(o.name)},`) + p(esc(lead)) +
        p('If something about it is not right, reply here and we will sort it out.'),
        { label: `Pay ${esc(o.amount)}`, href }));
  },

  /* Day 14. The placement pauses; the letter says how it resumes, today. */
  placementPausedClient(o: { name: string; number: string; amount: string; talent: string; payUrl?: string }) {
    const href = o.payUrl ?? BILLING;
    return msg('placementPausedClient',
      `Your placement is paused until invoice ${o.number} is settled`,
      `${o.name},\n\nInvoice ${o.number} for ${o.amount} has been open for fourteen days, so as the terms set out, ${o.talent}'s work with you is paused for now.\n\nEverything resumes the same day it is settled: ${href}\n\nIf there is something we should know, reply here. We are glad to help.${SIGN}`,
      shell('Your placement is paused for now',
        p(`${esc(o.name)},`) +
        p(`Invoice <b>${esc(o.number)}</b> for <b>${esc(o.amount)}</b> has been open for fourteen days, so as the terms set out, ${esc(o.talent)}'s work with you is paused for now.`) +
        p('Everything resumes the same day it is settled. If there is something we should know, reply here. We are glad to help.'),
        { label: `Settle ${esc(o.amount)}`, href }));
  },

  placementPausedTalent(o: { name: string; executive: string }) {
    return msg('placementPausedTalent',
      `A short pause with ${o.executive}`,
      `${o.name},\n\nWe have paused your placement with ${o.executive} for a few days while we settle an administrative matter on their account. Nothing about your work has changed, and you will be paid for every day you have worked.\n\nPlease hold new work for ${o.executive} until we write again, which we will the moment it resumes. Questions any time: just reply.${SIGN}`,
      shell(`A short pause with ${esc(o.executive)}`,
        p(`${esc(o.name)},`) +
        p(`We have paused your placement with <b>${esc(o.executive)}</b> for a few days while we settle an administrative matter on their account. Nothing about your work has changed, and you will be paid for every day you have worked.`) +
        p(`Please hold new work for ${esc(o.executive)} until we write again, which we will the moment it resumes. Questions any time: just reply.`),
        { label: 'Open your account', href: `${SITE}/app` }));
  },

  placementResumed(o: { name: string; withWhom: string; side: 'client' | 'talent' }) {
    const line = o.side === 'client'
      ? `Thank you. Your placement with ${o.withWhom} is running again, as of today.`
      : `Good news: your placement with ${o.withWhom} is running again, as of today. Pick up where you left off.`;
    return msg('placementResumed',
      `Your placement with ${o.withWhom} has resumed`,
      `${o.name},\n\n${line}${SIGN}`,
      shell('Back up and running', p(`${esc(o.name)},`) + p(esc(line)),
        { label: 'Open your account', href: `${SITE}/app` }));
  },

  placementPausedTeam(o: { client: string; talent: string; number: string; amount: string }) {
    return msg('placementPausedTeam',
      `Placement paused: ${o.client} and ${o.talent}`,
      `${o.client}'s invoice ${o.number} (${o.amount}) reached fourteen days open, so the placement with ${o.talent} is paused and payroll for it will not be created until it resumes. Both sides have been told, warmly.\n\nIt resumes on its own when the invoice is paid. To resume it sooner, open the placement file.\n\n${SITE}/console/money${SIGN}`,
      shell('A placement is paused',
        p(`<b>${esc(o.client)}</b>'s invoice <b>${esc(o.number)}</b> (${esc(o.amount)}) reached fourteen days open, so the placement with <b>${esc(o.talent)}</b> is paused and payroll for it will not be created until it resumes.`) +
        p('Both sides have been told. It resumes on its own when the invoice is paid; to resume it sooner, open the placement file.'),
        { label: 'Open Billing', href: `${SITE}/console/money` }));
  },

  /* Notice, both ways. The end date and the one sentence of terms, always. */
  noticeGiven(o: { name: string; who: string; endsOn: string; toTeam: boolean; reason?: string | null; note?: string | null }) {
    if (o.toTeam) return msg('noticeGiven',
      `Notice given: ${o.who}`,
      `${o.who} has given notice. The placement runs to ${o.endsOn} and is billed through that date.${o.reason ? `\n\nReason: ${o.reason}` : ''}${o.note ? `\nIn their words: ${o.note}` : ''}\n\n${NOTICE_TERMS}\n\n${SITE}/console/placements${SIGN}`,
      shell('Notice given',
        p(`<b>${esc(o.who)}</b> has given notice. The placement runs to <b>${esc(o.endsOn)}</b> and is billed through that date.`) +
        (o.reason ? boxed(`<b>Reason.</b> ${esc(o.reason)}${o.note ? `<br>${esc(o.note)}` : ''}`) : '') +
        quiet(esc(NOTICE_TERMS)),
        { label: 'Open Placements', href: `${SITE}/console/placements` }));
    return msg('noticeGiven',
      'We have your notice',
      `${o.name},\n\nWe have your notice. Your placement runs to ${o.endsOn}, and billing continues through that date, as the terms set out. Your Client Success Manager will be in touch about a smooth handover.\n\n${NOTICE_TERMS}\n\n${SITE}/app/care${SIGN}`,
      shell('We have your notice',
        p(`${esc(o.name)},`) +
        p(`Your placement runs to <b>${esc(o.endsOn)}</b>, and billing continues through that date, as the terms set out. Your Client Success Manager will be in touch about a smooth handover.`) +
        quiet(esc(NOTICE_TERMS)),
        { label: 'Open your placement', href: `${SITE}/app/care` }));
  },

  /* A deposit that did not clear. To the payer, pointed at the retry. */
  depositFailed(o: { name: string; amount: string; payUrl?: string }) {
    const href = o.payUrl ?? `${SITE}/app`;
    return msg('depositFailed',
      `Your ${o.amount} deposit needs another try`,
      `${o.name},\n\nYour ${o.amount} search deposit did not go through this time. Most often a bank declines a first debit that clears on the next attempt, or a card works where a bank did not.\n\nTry again here: ${href}\n\nIf you would rather pay another way, reply and we will arrange it.${SIGN}`,
      shell('Your deposit needs another try',
        p(`${esc(o.name)},`) +
        p(`Your <b>${esc(o.amount)}</b> search deposit did not go through this time. Most often a bank declines a first debit that clears on the next attempt, or a card works where a bank did not.`) +
        p('If you would rather pay another way, reply and we will arrange it.'),
        { label: 'Try again', href }));
  },

  depositFailedTeam(o: { who: string; amount: string; reason?: string | null }) {
    return msg('depositFailedTeam',
      `Deposit did not clear: ${o.who}, ${o.amount}`,
      `${o.who}'s ${o.amount} search deposit did not clear.${o.reason ? ` Reason: ${o.reason}` : ''}\n\nThey have been emailed a link to try again, and the search shows the deposit as due.\n\n${SITE}/console/money${SIGN}`,
      shell('A deposit did not clear',
        p(`<b>${esc(o.who)}</b>'s <b>${esc(o.amount)}</b> search deposit did not clear.`) +
        (o.reason ? boxed(esc(o.reason), '#8C4A3F') : '') +
        p('They have been emailed a link to try again, and the search shows the deposit as due.'),
        { label: 'Open Billing', href: `${SITE}/console/money` }));
  },

  /* Disputes and refunds: to the team, the moment Stripe says so. */
  disputeTeam(o: { client: string; number: string; amount: string; state: 'opened' | 'won' | 'lost' | 'closed'; reason?: string | null }) {
    const head = o.state === 'opened' ? 'A payment is disputed'
      : o.state === 'won' ? 'A dispute was decided in your favour'
      : o.state === 'lost' ? 'A dispute was decided for the client' : 'A dispute is closed';
    const next = o.state === 'opened'
      ? 'Respond in the Stripe dashboard with the signed agreement and the invoice. Stripe sets the deadline.'
      : o.state === 'won' ? 'The invoice is back to paid.' : 'The invoice is marked refunded. Decide with the client how it is settled.';
    return msg('disputeTeam',
      `${head}: ${o.client}, ${o.amount}`,
      `${o.client}, invoice ${o.number || 'on file'}, ${o.amount}.${o.reason ? ` Reason given: ${o.reason}.` : ''}\n\n${next}\n\n${SITE}/console/money${SIGN}`,
      shell(head,
        p(`<b>${esc(o.client)}</b>, invoice <b>${esc(o.number || 'on file')}</b>, ${esc(o.amount)}.`) +
        (o.reason ? boxed(`Reason given: ${esc(o.reason)}`, '#8C4A3F') : '') + p(esc(next)),
        { label: 'Open Billing', href: `${SITE}/console/money` }));
  },

  refundIssued(o: { name: string; number: string; amount: string; full: boolean }) {
    return msg('refundIssued',
      `Refund issued: ${o.amount}`,
      `${o.name},\n\nWe have refunded ${o.amount}${o.number ? ` on invoice ${o.number}` : ''}${o.full ? '' : ' (part of the invoice)'}. It returns to the account you paid from, usually within five to ten business days.${SIGN}`,
      shell('Refund issued',
        p(`${esc(o.name)},`) +
        p(`We have refunded <b>${esc(o.amount)}</b>${o.number ? ` on invoice <b>${esc(o.number)}</b>` : ''}${o.full ? '' : ' (part of the invoice)'}. It returns to the account you paid from, usually within five to ten business days.`),
        { label: 'See your billing', href: BILLING }));
  },

  /* Anything the ledger cannot square on its own: a second payment on a paid
     invoice, money arriving on a void one. */
  moneyNeedsALook(o: { headline: string; detail: string }) {
    return msg('moneyNeedsALook',
      `Billing needs a look: ${o.headline}`,
      `${o.detail}\n\n${SITE}/console/money${SIGN}`,
      shell('Billing needs a look', p(`<b>${esc(o.headline)}</b>`) + p(esc(o.detail)),
        { label: 'Open Billing', href: `${SITE}/console/money` }));
  },

  /* A scheduled job that did not finish. Said the same morning. */
  cronFailed(o: { job: string; detail: string }) {
    return msg('cronFailed',
      `Scheduled job did not finish: ${o.job}`,
      `The scheduled job "${o.job}" did not finish.\n\n${o.detail}\n\nNothing was lost: every job is safe to run again. Billing can be run by hand from the console with Run the month.\n\n${SITE}/console/money${SIGN}`,
      shell('A scheduled job did not finish',
        p(`The scheduled job <b>${esc(o.job)}</b> did not finish.`) +
        boxed(esc(o.detail).slice(0, 1200), '#8C4A3F') +
        p('Nothing was lost: every job is safe to run again. Billing can be run by hand from the console with Run the month.'),
        { label: 'Open Billing', href: `${SITE}/console/money` }));
  }
};
