/* ============================================================
   THE RELÈVE SIGNATURE — model, item banks, scoring, matching.

   ⚠ SERVER ONLY. Never import this file from a client component.
   It contains the scoring key: which axis every statement loads
   onto and in which direction. If it reaches the browser, anyone
   can work out how to fake a profile.

   The browser only ever receives statement text (lib/signature/public.ts).
   ============================================================ */
export type Side = 'client' | 'talent';
export type Scores = Record<string, number>;
export type Conf = { level: 'High' | 'Moderate' | 'Low'; band: number };
export type Validity = {
  verdict: 'Valid' | 'Review' | 'Invalid';
  im: number; attFails: number; inconsistency: number; extreme: number;
  straight: number; medSec: number | null;
  flags: { k: string; v: string; d: string }[];
};
export type Axis = {
  key: string; name: string; layer: 1 | 2; lo: string; hi: string;
  type: 'align' | 'supply' | 'demand' | 'band' | 'flag';
  w: number; k?: number; def?: number; sur?: number; off?: number;
  cQ: string; tQ: string; def_?: string;
};
export type Facet = { key: string; trait: string; name: string; d: string };
export type Item =
  | { kind: 'style' | 'facet' | 'trait'; key: string; sign: 1 | -1; text: string }
  | { kind: 'validity'; vkind: 'im' | 'att' | 'dup'; text: string; expect?: number; of?: string };

export const AXES: Axis[] = [
  { key:'tempo', name:'Tempo', layer:1, lo:'Considered', hi:'Rapid', type:'align', w:0.09, k:1.15,
    cQ:'How fast you decide and expect motion.', tQ:'How fast you move from brief to output.' },
  { key:'direction', name:'Direction', layer:1, lo:'Sparse', hi:'Explicit', type:'supply', w:0.14, def:1.5, sur:0.5,
    cQ:'How much explicit instruction you naturally give.', tQ:'How much explicit instruction you need to perform.' },
  { key:'cadence', name:'Cadence', layer:1, lo:'Async', hi:'Live', type:'align', w:0.10, k:1.15,
    cQ:'How often and how directly you want contact.', tQ:'How often and how directly you want contact.' },
  { key:'candor', name:'Candor', layer:1, lo:'Diplomatic', hi:'Blunt', type:'align', w:0.10, k:1.15,
    cQ:'How directly you give and receive correction.', tQ:'How directly you give and receive correction.' },
  { key:'initiative', name:'Initiative', layer:1, lo:'On request', hi:'Anticipatory', type:'demand', w:0.13, def:1.5, sur:0.6,
    cQ:'How much unprompted ownership you want.', tQ:'How much unprompted ownership you bring.' },
  { key:'structure', name:'Structure', layer:1, lo:'Improvised', hi:'Systematized', type:'align', w:0.09, k:1.1,
    cQ:'How much your world runs on documented systems.', tQ:'How much you build and keep systems.' },
  { key:'composure', name:'Composure', layer:2, lo:'Even seas', hi:'Unshakeable', type:'demand', w:0.09, def:1.6, sur:0.15,
    cQ:'How much pressure your environment puts on the person beside you.', tQ:'How steady you stay when the pressure rises.',
    def_:'Emotional steadiness under load — how much pressure a person absorbs before their work changes.' },
  { key:'warmth', name:'Warmth', layer:2, lo:'Contained', hi:'Relational', type:'align', w:0.06, k:0.9,
    cQ:'How personal you want the working relationship to be.', tQ:'How personal you want the working relationship to be.',
    def_:'Relational orientation — how much of the working relationship is human rather than transactional.' },
  { key:'rigor', name:'Rigor', layer:2, lo:'Pragmatic', hi:'Exacting', type:'demand', w:0.09, def:1.4, sur:0.5,
    cQ:'The standard you hold work to.', tQ:'The standard you hold your own work to.',
    def_:'Conscientious exactness — attention to detail, follow-through, and the standard held without supervision.' },
  { key:'adaptability', name:'Adaptability', layer:2, lo:'Settled', hi:'Fluid', type:'demand', w:0.07, def:1.4, sur:0.25,
    cQ:'How much your priorities move underneath people.', tQ:'How easily you absorb a change of direction.',
    def_:'Response to change — tolerance for reversal, interruption, and incomplete information.' },
  { key:'assertion', name:'Assertion', layer:2, lo:'Deferential', hi:'Holds ground', type:'band', w:0.04, off:-8, k:1.0,
    cQ:'How much you want to be pushed back on.', tQ:'How readily you push back on someone senior.',
    def_:'Voice and boundary — willingness to disagree, decline, and argue a position with someone senior.' },
  { key:'drive', name:'Drive', layer:2, lo:'Settled', hi:'Ambitious', type:'flag', w:0,
    cQ:'How much the role can grow.', tQ:'How much more you want than this role.',
    def_:'Motivational appetite — ambition, learning orientation, and persistence. Measured, never scored.' }
];

export const FACETS: Facet[] = [
  { key:'c_pressure', trait:'composure', name:'Pressure tolerance', d:'How much load can land at once before output changes.' },
  { key:'c_recovery', trait:'composure', name:'Recovery',           d:'How quickly they return to themselves after correction or a setback.' },
  { key:'c_evenness', trait:'composure', name:'Evenness',           d:'How consistent they read to others week to week.' },
  { key:'w_warmth',   trait:'warmth',    name:'Interpersonal warmth', d:'How much genuine relationship they build with the people they work for.' },
  { key:'w_empathy',  trait:'warmth',    name:'Attunement',         d:'How accurately they read what someone is feeling, often remotely.' },
  { key:'w_rapport',  trait:'warmth',    name:'Rapport',            d:'How fast they build trust with someone new.' },
  { key:'r_detail',   trait:'rigor',     name:'Attention to detail', d:'How reliably small errors are caught before work leaves their hands.' },
  { key:'r_follow',   trait:'rigor',     name:'Follow-through',     d:'Whether what was promised is actually closed.' },
  { key:'r_standard', trait:'rigor',     name:'Standards',          d:'The bar they hold when nobody is checking.' },
  { key:'a_change',   trait:'adaptability', name:'Change tolerance', d:'How a reversed priority lands.' },
  { key:'a_switch',   trait:'adaptability', name:'Task switching',   d:'The cost of an interruption to their work.' },
  { key:'a_ambig',    trait:'adaptability', name:'Ambiguity tolerance', d:'Whether they can act without the full picture.' },
  { key:'s_voice',    trait:'assertion', name:'Voice',              d:'Willingness to say the difficult thing to someone senior.' },
  { key:'s_boundary', trait:'assertion', name:'Boundaries',         d:'Whether they can decline, or quietly absorb too much.' },
  { key:'s_influence',trait:'assertion', name:'Influence',          d:'Whether disagreement is registered, or actually argued.' },
  { key:'d_ambition', trait:'drive',     name:'Ambition',           d:'Appetite for more responsibility than they hold today.' },
  { key:'d_learning', trait:'drive',     name:'Learning orientation', d:'Whether they go and learn what they lack.' },
  { key:'d_grit',     trait:'drive',     name:'Persistence',        d:'What happens when the work stops being interesting.' }
];

const STYLE_CLIENT: [string, 1 | -1, string][] = [
  ['tempo', 1,"I'd rather see a rough version today than a polished one on Friday."],
  ['tempo',-1,"I sit with a decision for several days before I move on it."],
  ['tempo', 1,"My team hears about a new priority within the hour of me deciding it."],
  ['tempo',-1,"I would rather wait and get it right than move and correct."],
  ['direction', 1,"When I hand work off, I spell out the steps — not just the outcome."],
  ['direction',-1,"I give the goal and stay out of the how."],
  ['direction', 1,"I'd rather write a thorough brief than field questions later."],
  ['direction',-1,"I expect people to work out the method themselves."],
  ['cadence', 1,"A quick call beats a long message."],
  ['cadence', 1,"I want a standing check-in on the calendar, not ad-hoc updates."],
  ['cadence',-1,"Most days, I'd rather not be interrupted at all."],
  ['cadence', 1,"I like knowing what is happening as it happens."],
  ['candor', 1,"I say exactly what isn't working, in plain words."],
  ['candor',-1,"I soften feedback so it lands gently."],
  ['candor', 1,"I'd rather be blunt now than have the same issue again next month."],
  ['candor',-1,"If I can find a gentler route than criticising the work directly, I take it."],
  ['initiative', 1,"I expect the person supporting me to bring the problem and the solution together."],
  ['initiative',-1,"I want to be asked before anything goes out on my behalf."],
  ['initiative', 1,"The best hires I've had changed things I never asked them to change."],
  ['initiative', 1,"I want someone to make the small calls without me."],
  ['structure', 1,"My week runs on a system, not on memory."],
  ['structure',-1,"The plan I make Monday rarely survives to Wednesday."],
  ['structure', 1,"I want everything documented — process, access, playbooks."],
  ['structure',-1,"I keep most of what matters in my head."]
];

const TRAIT_CLIENT: [string, 1 | -1, string][] = [
  ['composure', 1,"The pace around me would rattle most people."],
  ['composure', 1,"Deadlines in my world move without warning."],
  ['composure',-1,"My work is steady and rarely urgent."],
  ['composure', 1,"I can be sharp when I'm under pressure, and I don't always soften it."],
  ['warmth', 1,"I want a real relationship with the person who supports me, not a transactional one."],
  ['warmth',-1,"I keep working relationships professional and contained."],
  ['warmth', 1,"I ask about someone's life outside work, and I mean it."],
  ['warmth',-1,"I would rather not know much about my assistant's personal circumstances."],
  ['rigor', 1,"A typo in something that goes out is a real problem, not a small one."],
  ['rigor', 1,"I notice details other people miss."],
  ['rigor',-1,"Close enough is usually good enough for me."],
  ['rigor', 1,"I would rather something take longer and be exactly right."],
  ['adaptability', 1,"My priorities can reverse in a single day."],
  ['adaptability', 1,"I change my mind when better information arrives, and I expect people to keep up."],
  ['adaptability',-1,"What I need on Monday is what I still need on Friday."],
  ['adaptability', 1,"New things land on my plate constantly."],
  ['assertion', 1,"I want to be told when I'm wrong."],
  ['assertion',-1,"I'd rather someone execute what I asked than debate it."],
  ['assertion', 1,"The person supporting me should push back if they see a better way."],
  ['assertion',-1,"I make the calls; I don't need them argued."],
  ['drive', 1,"The person in this seat could grow into something much bigger."],
  ['drive', 1,"I want someone building a career, not filling a role."],
  ['drive',-1,"This role will look roughly the same in two years."],
  ['drive', 1,"I invest in the people who work for me."]
];

const STYLE_TALENT: [string, 1 | -1, string][] = [
  ['tempo', 1,"I move first and refine as I go."],
  ['tempo',-1,"I want time to get it right before anyone sees it."],
  ['tempo', 1,"A same-day turnaround energizes me."],
  ['tempo',-1,"I work at a steady pace and dislike being rushed."],
  ['direction', 1,"I do my best work when the instructions are explicit."],
  ['direction',-1,"Give me the outcome and I'll find the path myself."],
  ['direction', 1,"I'd rather ask three clarifying questions upfront than guess."],
  ['direction',-1,"I can work from a one-line brief."],
  ['cadence', 1,"I like a live check-in most days."],
  ['cadence',-1,"Long stretches of quiet focus suit me better than constant contact."],
  ['cadence', 1,"I over-communicate status by default."],
  ['cadence',-1,"I'd rather send one summary than five updates."],
  ['candor', 1,"Tell me plainly when something is wrong — I don't need it cushioned."],
  ['candor',-1,"Blunt feedback stays with me longer than it should."],
  ['candor', 1,"I'll say directly when I think a decision is a mistake."],
  ['candor',-1,"I prefer criticism delivered gently."],
  ['initiative', 1,"I fix problems before anyone tells me they exist."],
  ['initiative',-1,"I wait for approval before changing how something is done."],
  ['initiative', 1,"I bring ideas nobody asked me for."],
  ['initiative', 1,"I make small decisions on someone's behalf without checking first."],
  ['structure', 1,"I build a checklist or tracker for anything I do twice."],
  ['structure',-1,"I work best with a loose structure I can adapt daily."],
  ['structure', 1,"I document my work so someone could pick it up tomorrow."],
  ['structure',-1,"I keep track of what I owe people in my head."]
];

const FACET_TALENT: [string, 1 | -1, string][] = [
  ['c_pressure', 1,"When everything is urgent at once, I get calmer, not tenser."],
  ['c_pressure', 1,"I can hold three competing deadlines without my work slipping."],
  ['c_pressure',-1,"I find high-pressure weeks genuinely draining."],
  ['c_recovery',-1,"A sharp word from someone I work for stays with me all day."],
  ['c_recovery', 1,"I can be corrected in the morning and be fully myself by lunch."],
  ['c_recovery',-1,"A mistake I made weeks ago can still bother me."],
  ['c_evenness', 1,"People would say my temperament is the same whatever the week is doing."],
  ['c_evenness',-1,"My frustration shows before I decide to show it."],
  ['c_evenness', 1,"I can deliver bad news without my own feelings entering the room."],
  ['w_warmth', 1,"I build a real relationship with the people I work for."],
  ['w_warmth',-1,"I keep things professional and to the point."],
  ['w_warmth', 1,"People I work with would describe me as warm."],
  ['w_empathy', 1,"I can tell when someone is upset before they say so."],
  ['w_empathy', 1,"I adjust how I say something depending on who is hearing it."],
  ['w_empathy',-1,"I find it hard to read how someone is feeling over a call."],
  ['w_rapport', 1,"People tell me I am easy to talk to."],
  ['w_rapport', 1,"I can build trust with someone new inside one conversation."],
  ['w_rapport',-1,"I would rather work alone than spend the day with people."],
  ['r_detail', 1,"I notice when a detail is off even when nobody else does."],
  ['r_detail', 1,"I check my work twice before it leaves my hands."],
  ['r_detail',-1,"Small errors slip past me when I am moving fast."],
  ['r_follow', 1,"If I said I would do it, it is done."],
  ['r_follow', 1,"Nothing I am given goes unanswered for more than a day."],
  ['r_follow',-1,"Things occasionally fall off my list."],
  ['r_standard', 1,"A small error in something client-facing bothers me for days."],
  ['r_standard',-1,"I move on once something is good enough."],
  ['r_standard', 1,"I would rather deliver late and correct than early and rough."],
  ['a_change', 1,"A reversed priority doesn't bother me — I just re-plan."],
  ['a_change',-1,"Frequent changes of direction wear me down."],
  ['a_change', 1,"I have held roles where the job changed every month."],
  ['a_switch', 1,"I can drop what I am doing and pick it up later without losing my place."],
  ['a_switch',-1,"I need to finish what I started before switching."],
  ['a_switch', 1,"Interruptions cost me very little."],
  ['a_ambig', 1,"I can act without knowing the full picture."],
  ['a_ambig',-1,"Unclear instructions stop me until I get clarity."],
  ['a_ambig', 1,"I am comfortable making a call that might turn out wrong."],
  ['s_voice', 1,"I will tell an executive plainly that they are wrong."],
  ['s_voice',-1,"I'd rather do it their way than have the conversation."],
  ['s_voice', 1,"I say the thing everyone in the room is thinking."],
  ['s_boundary', 1,"I can say no to someone senior."],
  ['s_boundary',-1,"I take on more than I should rather than push back."],
  ['s_boundary', 1,"I will tell someone when what they are asking for is unrealistic."],
  ['s_influence', 1,"I can change a decision-maker's mind."],
  ['s_influence', 1,"I make my case rather than just registering that I disagree."],
  ['s_influence',-1,"I state my view once and then leave it."],
  ['d_ambition', 1,"I want more responsibility than I currently have."],
  ['d_ambition',-1,"I am content doing excellent work in the same role for years."],
  ['d_ambition', 1,"I am building toward something bigger than this job."],
  ['d_learning', 1,"I'll take on work outside my scope in order to learn."],
  ['d_learning', 1,"I teach myself new tools without being asked."],
  ['d_learning',-1,"I prefer work that uses what I already know."],
  ['d_grit', 1,"I finish things that stopped being interesting."],
  ['d_grit', 1,"I keep going after a setback that would stop most people."],
  ['d_grit',-1,"I lose momentum when progress is slow."]
];

export const VALIDITY_TALENT: {kind:'im'|'att'|'dup'; text:string; expect?:number; of?:string}[] = [
  { kind:'im',  text:"I have never been irritated by a colleague." },
  { kind:'att', text:"Not a question — a check that you are still reading. Please choose “Rarely”.", expect:2 },
  { kind:'im',  text:"I have never missed a deadline in my life." },
  { kind:'dup', of:"I check my work twice before it leaves my hands.", text:"I look over my work a second time before I send it." },
  { kind:'im',  text:"I admit every mistake immediately, without exception." },
  { kind:'att', text:"Another reading check, not a question. Please choose “Exactly like me”.", expect:5 },
  { kind:'dup', of:"I need to finish what I started before switching.", text:"Switching tasks before I have finished bothers me." },
  { kind:'im',  text:"I have never told even a small lie to make a situation easier." }
];

export const VALIDITY_CLIENT: {kind:'im'|'att'|'dup'; text:string; expect?:number; of?:string}[] = [
  { kind:'im',  text:"I have never been unfair to someone who works for me." },
  { kind:'att', text:"Not a question — a check that you are still reading. Please choose “Rarely”.", expect:2 },
  { kind:'dup', of:"I say exactly what isn't working, in plain words.", text:"I tell people directly when their work has missed." },
  { kind:'im',  text:"I have never lost patience with anyone at work." }
];

export const PAIRS = [
  { a:{t:'composure', s:'Nothing rattles me when the pressure lands.'},      b:{t:'rigor',        s:'Nothing gets past me — I catch every detail.'} },
  { a:{t:'assertion', s:'I tell people the truth, even when it is awkward.'},b:{t:'warmth',       s:'I make people feel comfortable, always.'} },
  { a:{t:'adaptability', s:'I adapt the moment the plan changes.'},          b:{t:'rigor',        s:'I keep the process running exactly as designed.'} },
  { a:{t:'drive',     s:'I am always learning something new.'},              b:{t:'rigor',        s:'I am completely reliable on the same work.'} },
  { a:{t:'composure', s:'I never let frustration show.'},                    b:{t:'assertion',    s:'I always speak up when something is wrong.'} },
  { a:{t:'warmth',    s:'I read people accurately.'},                        b:{t:'adaptability', s:'I switch between tasks effortlessly.'} },
  { a:{t:'drive',     s:'I push for more responsibility.'},                  b:{t:'composure',    s:'I stay calm when it all lands at once.'} },
  { a:{t:'assertion', s:'I hold my position in a disagreement.'},            b:{t:'adaptability', s:'I re-plan without frustration.'} }
];

export const CLIENT_TYPES = [
  { id:'architect', n:'The Architect', r:'I', v:[45,80,55,52,45,88],
    tag:'You design the system, then hand someone the blueprint.',
    d:'You lead by specification. Work is defined before it is delegated, and you would rather invest an hour in the brief than a week in corrections. Ambiguity is the thing you remove for other people.',
    seek:'Talent who executes a detailed standard precisely and keeps the system current.',
    friction:'A highly independent operator who rewrites your process will read as insubordinate — even when they are right.' },
  { id:'conductor', n:'The Conductor', r:'II', v:[70,62,88,50,55,58],
    tag:'You run the day live, in the room, in real time.',
    d:'You think out loud and decide in conversation. Momentum comes from contact — a fifteen-minute call resolves what a thread would take two days to settle. Your support person is a presence, not a queue.',
    seek:'Talent with high communication tolerance and same-day responsiveness.',
    friction:'A deep-focus, async-preferring hire will feel unavailable to you and overwhelmed by you.' },
  { id:'catalyst', n:'The Catalyst', r:'III', v:[92,25,58,70,84,22],
    tag:'You move at speed and expect the gaps to be closed behind you.',
    d:'You generate more direction than any one person can absorb, and you change course the moment better information arrives. You do not document; you decide. What you need is someone who converts velocity into order.',
    seek:'Talent who anticipates, builds structure unprompted, and never needs the same instruction twice.',
    friction:'Anyone waiting for a brief will stall, and you will read the stall as incapacity.' },
  { id:'strategist', n:'The Strategist', r:'IV', v:[35,22,25,45,86,55],
    tag:'You delegate outcomes and disappear into the deep work.',
    d:'You are deliberate, quiet, and low-contact by design. You hand over territory rather than tasks, and you measure people on whether the territory is handled — not on how visible they were while handling it.',
    seek:'Fully autonomous talent who reports by exception and owns the outcome.',
    friction:'A hire who needs frequent direction will read your silence as abandonment and stall waiting for it.' },
  { id:'steward', n:'The Steward', r:'V', v:[40,60,74,20,45,55],
    tag:'You lead through relationship, and the working rapport is the point.',
    d:'You invest in the person, not only the output. Correction is given carefully because you intend the relationship to last years. Your team stays a long time, and your standards travel through trust rather than through pressure.',
    seek:'Talent who is relationally warm, communicative, and steady over the long term.',
    friction:'A blunt operator will feel abrasive to you, and your softened feedback may not register with them as feedback at all.' },
  { id:'principal', n:'The Principal', r:'VI', v:[85,30,30,88,88,45],
    tag:'You want it handled — and you want to hear about it once.',
    d:'You are direct, fast, and allergic to noise. You are not looking for a task-taker; you are looking for someone who removes entire categories of decision from your day and tells you plainly when something is off.',
    seek:'A senior, self-directed right hand with high judgment and thick skin.',
    friction:'A hire who needs reassurance or step-by-step direction will exhaust you inside a month.' }
];

export const TALENT_TYPES = [
  { id:'anticipator', n:'The Anticipator', r:'I', v:[70,22,40,55,90,60],
    tag:'You are already three moves ahead of the request.',
    d:'You read patterns and act before you are asked. You need context, not instruction — once you understand how someone thinks, you can make the call they would have made.',
    seek:'Executives who delegate outcomes and trust judgment: the Strategist, the Catalyst, the Principal.',
    friction:'Leaders who want to approve every step will feel like a ceiling — and you will feel wasted.' },
  { id:'steady', n:'The Steady Hand', r:'II', v:[40,55,50,40,50,85],
    tag:'Nothing you touch is dropped, ever.',
    d:'Your value is reliability at volume. You work to a standard, keep the record clean, and deliver the same quality on week ninety as on week one. You would rather be exactly right than fast.',
    seek:'Leaders who value consistency and give a clear standard: the Architect, the Steward.',
    friction:'A leader who changes direction hourly will feel chaotic and erode your quality.' },
  { id:'executor', n:'The Executor', r:'III', v:[88,72,55,60,35,65],
    tag:'Give the brief and consider it done — today.',
    d:'You convert instruction into output at speed. Clear scope is what unlocks you: with a defined target you outproduce anyone, and you would rather ask upfront than guess and rework.',
    seek:'Leaders who brief well and want fast turnaround: the Architect, the Conductor.',
    friction:'A leader who gives one-line direction and expects invention will leave you spinning.' },
  { id:'systemizer', n:'The Systemizer', r:'IV', v:[45,40,35,50,72,92],
    tag:'You build the machine behind the person.',
    d:'You leave process where there was memory. Anything done twice becomes a documented, repeatable system — which is why the operation runs whether or not you are in the room.',
    seek:'Leaders drowning in undocumented chaos: the Catalyst, the Principal.',
    friction:'A leader who protects an existing process may experience your improvements as overreach.' },
  { id:'diplomat', n:'The Diplomat', r:'V', v:[50,55,85,20,55,50],
    tag:'You are the voice clients and teams want to hear from.',
    d:'You handle the human surface of the business — follow-up, tone, difficult conversations kept warm. You over-communicate on purpose, and people trust the account because they trust you.',
    seek:'Client-facing, relationship-led leaders: the Steward, the Conductor.',
    friction:'A blunt, low-contact executive may read your check-ins as noise.' },
  { id:'second', n:'The Second', r:'VI', v:[75,18,30,80,88,55],
    tag:'You are a right hand, not a pair of hands.',
    d:'You take territory and hold it. You will tell a principal plainly when they are wrong, absorb decisions on their behalf, and go quiet for a week because nothing needed escalating.',
    seek:'Senior operators who delegate whole domains: the Principal, the Strategist.',
    friction:'A leader who wants visibility into every step will find you opaque.' }
];

export const COND = [
  { key:'overlap', label:'Hours overlap', ord:['2 hours','4 hours','Full working day'],
    cQ:'How much of your working day must they cover?', tQ:'How much of the client day can you cover?' },
  { key:'volume', label:'Volume', ord:['Light — under 10 requests/week','Steady — 10 to 25','Heavy — 25+'],
    cQ:'How much work will you send in a week?', tQ:'What volume do you work best at?' },
  { key:'discretion', label:'Discretion', ord:['Standard','High — financial & legal','Maximum — personal & deal-sensitive'],
    cQ:'How sensitive is what they will see?', tQ:'What level of confidential work have you held?' },
  { key:'mix', label:'Work mix', ord:['Mostly heads-down','Balanced','Mostly people-facing'],
    cQ:'Is this role facing your people and clients, or behind them?', tQ:'Where do you do your best work?' }
];

/* ---- derived ---- */
export const AXIS: Record<string, Axis> = Object.fromEntries(AXES.map(a => [a.key, a]));
export const L1 = AXES.filter(a => a.layer === 1);
export const L2 = AXES.filter(a => a.layer === 2);
export const FACET: Record<string, Facet> = Object.fromEntries(FACETS.map(f => [f.key, f]));
export const facetsOf = (trait: string) => FACETS.filter(f => f.trait === trait);
export const SCALE = ['Not like me', 'Rarely', 'Sometimes', 'Often', 'Exactly like me'];
export const TOOLS = ['Google Workspace','Microsoft 365','Slack','Notion','Airtable','HubSpot','QuickBooks','Canva'];

/* ---- instrument assembly ---- */
export function buildInstrument(side: Side) {
  const style = side === 'client' ? STYLE_CLIENT : STYLE_TALENT;
  const core = side === 'client' ? TRAIT_CLIENT : FACET_TALENT;
  const val = side === 'client' ? VALIDITY_CLIENT : VALIDITY_TALENT;
  const items: Item[] = [];
  style.forEach(q => items.push({ kind: 'style', key: q[0], sign: q[1], text: q[2] }));
  core.forEach(q => items.push({ kind: side === 'client' ? 'trait' : 'facet', key: q[0], sign: q[1], text: q[2] }));
  const step = Math.floor(items.length / (val.length + 1));
  val.forEach((v, n) => items.splice((n + 1) * step + n, 0,
    { kind: 'validity', vkind: v.kind, text: v.text, expect: (v as any).expect, of: (v as any).of }));
  const pairs = side === 'talent' ? PAIRS : [];
  return { items, pairs, total: items.length + pairs.length };
}
export const INSTRUMENT = { client: buildInstrument('client'), talent: buildInstrument('talent') };

export function sections(side: Side) {
  const inst = INSTRUMENT[side], n = inst.items.length;
  const styleEnd = inst.items.reduce((last, it, i) => (it.kind === 'style' ? i : last), 0);
  return [
    { from: 0, to: styleEnd, name: 'Working style', note: 'How work moves between you and the person beside you.' },
    { from: styleEnd + 1, to: n - 1, name: 'Disposition', note: side === 'talent'
        ? 'Who you are under pressure, measured across eighteen facets.'
        : 'Who you are under pressure, and what your environment demands of someone.' },
    ...(inst.pairs.length ? [{ from: n, to: n + inst.pairs.length - 1, name: 'Forced choice',
        note: 'Two statements, both true of good people. Pick the one more true of you.' }] : []),
    { from: n + inst.pairs.length, to: n + inst.pairs.length, name: 'Conditions',
      note: 'The practical requirements. Checked, never scored.' }
  ];
}
