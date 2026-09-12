/* Client-safe display metadata. No scoring key here — safe to import
   from a browser component. */
export type PublicAxis = { key: string; name: string; layer: 1 | 2; lo: string; hi: string; def_?: string };
export type PublicFacet = { key: string; trait: string; name: string; d: string };

export const SCALE = ['Not like me', 'A little like me', 'Somewhat like me', 'Mostly like me', 'Exactly like me'];
export const TOOLS = ['Google Workspace','Microsoft 365','Gmail','Slack','Notion','Airtable','HubSpot','QuickBooks','Canva','Wix or Squarespace','Social media schedulers'];
export const COND_PUBLIC = [
  { key:'overlap', label:'Overlapping hours', ord:['About 2 hours','About 4 hours','A full working day'],
    cQ:'How many hours of your day do you need them working alongside you?',
    tQ:'How many hours of a US working day can you be online for?' },
  { key:'volume', label:'How much work', ord:['Light — a few things a week','Steady — something most days','Heavy — a constant stream'],
    cQ:'Roughly how much will you hand over in a week?', tQ:'How much work do you handle best?' },
  { key:'discretion', label:'How sensitive', ord:['Ordinary business information','Financial and legal','Personal and deal-sensitive'],
    cQ:'What kind of information will they see?', tQ:'What kind of confidential work have you handled?' },
  { key:'mix', label:'Who they deal with', ord:['Mostly on their own','A mix of both','Mostly talking to people'],
    cQ:'Will they be talking to your clients and team, or working quietly behind you?',
    tQ:'Do you do your best work talking to people, or heads-down on your own?' }
];
/* What the browser receives for a question: text only. */
export type Screen =
  | { i: number; kind: 'likert'; tag: string; text: string }
  | { i: number; kind: 'pair'; a: string; b: string }
  | { i: number; kind: 'conditions' };
