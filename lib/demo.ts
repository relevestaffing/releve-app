/* Demo bench — used when Supabase is not configured yet, so the app
   is fully clickable before any account exists. Once the environment
   variables are set, every read comes from the database instead. */
import { FACETS, facetsOf, L2 } from './signature/model';
import type { Validity, Conf, Scores } from './signature/model';
import type { CondSet } from './signature/score';

export type Person = {
  id: string; name: string; role: string; loc: string; tz: string;
  yrs: number; eng: string; rate: string; stage: string;
  photo_url?: string | null; bio?: string | null; skills?: string[] | null;
  scores: Scores; facets: Record<string, number>;
  validity: Validity; confidence: Record<string, Conf>; cond: CondSet;
};

const base: Record<string, Scores> = {
  t1: { tempo:74, direction:25, cadence:33, candor:75, initiative:92, structure:58, composure:88, warmth:55, rigor:85, adaptability:80, assertion:70, drive:70 },
  t2: { tempo:92, direction:75, cadence:58, candor:58, initiative:33, structure:67, composure:60, warmth:65, rigor:72, adaptability:45, assertion:35, drive:80 },
  t3: { tempo:75, direction:17, cadence:25, candor:83, initiative:92, structure:58, composure:92, warmth:50, rigor:88, adaptability:85, assertion:80, drive:65 },
  t4: { tempo:50, direction:50, cadence:83, candor:25, initiative:50, structure:50, composure:65, warmth:92, rigor:70, adaptability:60, assertion:30, drive:55 },
  t5: { tempo:42, direction:42, cadence:33, candor:50, initiative:75, structure:92, composure:70, warmth:45, rigor:90, adaptability:40, assertion:45, drive:75 },
  t6: { tempo:67, direction:58, cadence:75, candor:33, initiative:50, structure:42, composure:50, warmth:85, rigor:55, adaptability:65, assertion:30, drive:85 },
  t7: { tempo:83, direction:25, cadence:42, candor:92, initiative:83, structure:50, composure:85, warmth:40, rigor:80, adaptability:75, assertion:88, drive:60 },
  t8: { tempo:33, direction:67, cadence:50, candor:42, initiative:42, structure:92, composure:62, warmth:50, rigor:95, adaptability:30, assertion:40, drive:35 }
};
const meta: Record<string, Omit<Person,'scores'|'facets'|'validity'|'confidence'|'cond'>> = {
  t1:{id:'t1',name:'Maria Elena Santos',role:'Executive Assistant',loc:'Cebu, Philippines',tz:'GMT+8',yrs:9,eng:'Native-fluent',rate:'$1,450/mo',stage:'Vetted'},
  t2:{id:'t2',name:'Joshua Ramos',role:'Executive Assistant',loc:'Manila, Philippines',tz:'GMT+8',yrs:6,eng:'Fluent',rate:'$1,200/mo',stage:'Vetted'},
  t3:{id:'t3',name:'Andrea Villanueva',role:'Chief of Staff / Sr. EA',loc:'Davao, Philippines',tz:'GMT+8',yrs:11,eng:'Native-fluent',rate:'$1,850/mo',stage:'Placed'},
  t4:{id:'t4',name:'Sofía Herrera',role:'Client Care / Ops',loc:'Medellín, Colombia',tz:'GMT-5',yrs:7,eng:'Native-fluent',rate:'$1,350/mo',stage:'Vetted'},
  t5:{id:'t5',name:'Paolo Mendoza',role:'Operations Associate',loc:'Iloilo, Philippines',tz:'GMT+8',yrs:8,eng:'Fluent',rate:'$1,400/mo',stage:'Vetted'},
  t6:{id:'t6',name:'Bea Concepción',role:'Marketing Assistant',loc:'Quezon City, Philippines',tz:'GMT+8',yrs:5,eng:'Native-fluent',rate:'$1,150/mo',stage:'Screening'},
  t7:{id:'t7',name:'Diego Navarro',role:'Executive Assistant',loc:'Buenos Aires, Argentina',tz:'GMT-3',yrs:10,eng:'Native-fluent',rate:'$1,700/mo',stage:'Vetted'},
  t8:{id:'t8',name:'Luis Aguilar',role:'Finance & Admin',loc:'Guadalajara, Mexico',tz:'GMT-6',yrs:9,eng:'Fluent',rate:'$1,550/mo',stage:'Vetted'}
};
const conds: Record<string, CondSet> = {
  t1:{overlap:'Full working day',volume:'Heavy — 25+',discretion:'Maximum — personal & deal-sensitive',mix:'Mostly heads-down',tools:['Google Workspace','Slack','Notion','Canva']},
  t2:{overlap:'4 hours',volume:'Steady — 10 to 25',discretion:'Standard',mix:'Balanced',tools:['Google Workspace','Slack','HubSpot']},
  t3:{overlap:'Full working day',volume:'Heavy — 25+',discretion:'Maximum — personal & deal-sensitive',mix:'Balanced',tools:['Google Workspace','Slack','Notion','QuickBooks']},
  t4:{overlap:'Full working day',volume:'Heavy — 25+',discretion:'High — financial & legal',mix:'Mostly people-facing',tools:['Google Workspace','HubSpot','Slack']},
  t5:{overlap:'Full working day',volume:'Steady — 10 to 25',discretion:'Standard',mix:'Mostly heads-down',tools:['Airtable','Notion','Slack','Google Workspace']},
  t6:{overlap:'4 hours',volume:'Light — under 10 requests/week',discretion:'Standard',mix:'Mostly people-facing',tools:['Canva','Slack','Google Workspace']},
  t7:{overlap:'Full working day',volume:'Heavy — 25+',discretion:'Maximum — personal & deal-sensitive',mix:'Balanced',tools:['Microsoft 365','Google Workspace','Slack','Notion']},
  t8:{overlap:'4 hours',volume:'Steady — 10 to 25',discretion:'High — financial & legal',mix:'Mostly heads-down',tools:['QuickBooks','Microsoft 365','Google Workspace']}
};
const vals: Record<string, Validity> = {
  t1:{verdict:'Valid',im:30,attFails:0,inconsistency:12,extreme:34,straight:4,medSec:6.8,flags:[]},
  t2:{verdict:'Review',im:45,attFails:0,inconsistency:44,extreme:28,straight:5,medSec:5.1,
      flags:[{k:'Inconsistency',v:'44/100',d:'Near-duplicate items were answered differently.'}]},
  t3:{verdict:'Valid',im:25,attFails:0,inconsistency:8,extreme:41,straight:3,medSec:7.9,flags:[]},
  t4:{verdict:'Valid',im:40,attFails:0,inconsistency:16,extreme:30,straight:5,medSec:6.2,flags:[]},
  t5:{verdict:'Valid',im:20,attFails:0,inconsistency:10,extreme:38,straight:4,medSec:9.1,flags:[]},
  t6:{verdict:'Review',im:78,attFails:0,inconsistency:22,extreme:52,straight:7,medSec:4.4,
      flags:[{k:'Impression management',v:'78/100',d:'Endorsed implausibly flattering statements — trait highs may be inflated.'}]},
  t7:{verdict:'Valid',im:35,attFails:0,inconsistency:14,extreme:46,straight:5,medSec:7.1,flags:[]},
  t8:{verdict:'Valid',im:28,attFails:0,inconsistency:6,extreme:26,straight:4,medSec:10.4,flags:[]}
};

function seedFacets(id: string, scores: Scores) {
  const out: Record<string, number> = {};
  FACETS.forEach(f => {
    const key = [...(id + f.key)].reduce((s, c) => s + c.charCodeAt(0), 0);
    out[f.key] = Math.max(0, Math.min(100, (scores[f.trait] ?? 50) + ((key % 25) - 12)));
  });
  L2.forEach(tr => {
    const fs = facetsOf(tr.key).map(f => out[f.key]);
    scores[tr.key] = Math.round(fs.reduce((a, b) => a + b, 0) / fs.length);
  });
  return out;
}
function seedConfidence(facets: Record<string, number>) {
  const c: Record<string, Conf> = {};
  L2.forEach(tr => {
    const fs = facetsOf(tr.key).map(f => facets[f.key]);
    const spread = Math.max(...fs) - Math.min(...fs);
    c[tr.key] = { level: spread <= 20 ? 'High' : spread <= 35 ? 'Moderate' : 'Low', band: Math.round(spread / 4 + 3) };
  });
  return c;
}

export const DEMO_BENCH: Person[] = Object.keys(meta).map(id => {
  const scores = { ...base[id] };
  const facets = seedFacets(id, scores);
  return { ...meta[id], scores, facets, validity: vals[id], confidence: seedConfidence(facets), cond: conds[id] };
});

export const DEMO_EXEC = {
  name: 'Elena Marsh', org: 'Marsh & Co.',
  scores: { tempo:83, direction:33, cadence:33, candor:83, initiative:92, structure:50,
            composure:85, warmth:35, rigor:88, adaptability:82, assertion:78, drive:70 } as Scores,
  cond: { overlap:'Full working day', volume:'Heavy — 25+', discretion:'Maximum — personal & deal-sensitive',
          mix:'Mostly heads-down', tools:['Google Workspace','Slack','Notion'],
          never:'Client relationships and anything that speaks for me on a deal.' } as CondSet,
  search: { role:'Executive Assistant', scope:'Inbox, calendar, travel, deal-room prep', day:8, target:'Aug 25, 2026', hours:'30–40 / week' }
};
