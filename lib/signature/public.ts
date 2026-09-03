/* Client-safe display metadata. No scoring key here — safe to import
   from a browser component. */
export type PublicAxis = { key: string; name: string; layer: 1 | 2; lo: string; hi: string; def_?: string };
export type PublicFacet = { key: string; trait: string; name: string; d: string };

export const SCALE = ['Not like me', 'Rarely', 'Sometimes', 'Often', 'Exactly like me'];
export const TOOLS = ['Google Workspace','Microsoft 365','Slack','Notion','Airtable','HubSpot','QuickBooks','Canva'];
export const COND_PUBLIC = [
  { key:'overlap', label:'Hours overlap', ord:['2 hours','4 hours','Full working day'],
    cQ:'How much of your working day must they cover?', tQ:'How much of the client day can you cover?' },
  { key:'volume', label:'Volume', ord:['Light — under 10 requests/week','Steady — 10 to 25','Heavy — 25+'],
    cQ:'How much work will you send in a week?', tQ:'What volume do you work best at?' },
  { key:'discretion', label:'Discretion', ord:['Standard','High — financial & legal','Maximum — personal & deal-sensitive'],
    cQ:'How sensitive is what they will see?', tQ:'What level of confidential work have you held?' },
  { key:'mix', label:'Work mix', ord:['Mostly heads-down','Balanced','Mostly people-facing'],
    cQ:'Is this role facing your people and clients, or behind them?', tQ:'Where do you do your best work?' }
];
/* What the browser receives for a question: text only. */
export type Screen =
  | { i: number; kind: 'likert'; tag: string; text: string }
  | { i: number; kind: 'pair'; a: string; b: string }
  | { i: number; kind: 'conditions' };
