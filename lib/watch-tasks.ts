/* TAKING THE WATCH — task templates
   ----------------------------------
   Generic per discipline, not per client: this happens at intake, before any
   client exists to write a real brief for. Each template gives a realistic
   scenario and a short set of written tasks, timed as a whole rather than
   per task, since a real day does not ring a bell between jobs either.

   Client-safe: content and types only, same convention as lib/disciplines.ts. */

export type WatchTaskDef = {
  key: string;
  title: string;
  prompt: string;
  placeholder?: string;
};

export type WatchTemplate = {
  disciplineKey: string;
  timeLimitMinutes: number;
  scenario: string;
  tasks: WatchTaskDef[];
};

export const WATCH_TEMPLATES: Record<string, WatchTemplate> = {
  ea: {
    disciplineKey: 'ea',
    timeLimitMinutes: 180,
    scenario:
      'You have just started as Executive Assistant to Priya Nandakumar, CEO of a 40-person product ' +
      'studio. It is Monday morning. Priya is mid-flight and will land in four hours with no signal.',
    tasks: [
      {
        key: 'inbox_triage',
        title: 'Inbox triage',
        prompt:
          'Below is a list of 14 subject lines that landed in Priya’s inbox over the weekend, each ' +
          'with a one-line summary of the sender and ask. Sort them into Handle yourself, Draft a reply ' +
          'for her to approve, Flag for her the moment she lands, and Can wait a week — and say, in one ' +
          'line each, why. Then write the actual draft reply for the one item you marked most urgent.',
        placeholder: 'Handle yourself: ...\nDraft for approval: ...\nFlag on landing: ...\nCan wait: ...\n\nDraft reply:'
      },
      {
        key: 'scheduling_conflict',
        title: 'A scheduling conflict across time zones',
        prompt:
          'Priya has a board call already fixed for Thursday 9am Pacific. A lead investor’s assistant just asked ' +
          'to move a term-sheet call, previously Wednesday, to the only other slot their partner has this week: ' +
          'Thursday 9am Singapore time. Work out whether these actually clash, and write the email you would send ' +
          'back to the investor’s assistant — including what you’d propose instead if they do.',
        placeholder: 'Do they clash? ...\n\nEmail to the investor’s assistant:'
      },
      {
        key: 'client_email_tone',
        title: 'A client-facing email in a specified tone',
        prompt:
          'A long-standing enterprise customer’s renewal is 60% likely to slip past the quarter, purely on their ' +
          'procurement timeline, not on product issues. Priya asked you to send their VP of Ops a short check-in — ' +
          'warm, direct, no hint of anxiety about the number, and absolutely not sounding like a sales chase. Write it.',
        placeholder: 'Subject:\n\nBody:'
      }
    ]
  },

  social: {
    disciplineKey: 'social',
    timeLimitMinutes: 180,
    scenario:
      'You are the new Social Media Manager for Fieldwork, a direct-to-consumer boot brand. Their voice is ' +
      'plainspoken and a little dry, never exclamation-point-cheerful. Audience: outdoorsy professionals, 28–45.',
    tasks: [
      {
        key: 'content_calendar',
        title: 'A two-week content plan against a brand voice brief',
        prompt:
          'Fieldwork is launching a resoled-boot repair program — send in old boots, get them rebuilt instead of ' +
          'replaced. Plan two weeks of posts announcing and sustaining this (Instagram feed, one Reel idea, one ' +
          'newsletter blurb). For each: platform, one-line concept, and the actual caption or copy.',
        placeholder: 'Week 1:\n• ...\n\nWeek 2:\n• ...'
      },
      {
        key: 'community_reply',
        title: 'Community management, including a difficult one',
        prompt:
          'Three real comments came in under yesterday’s post. Write the reply to each, in Fieldwork’s voice:\n' +
          '1) "these look great, sizing run true or should I go up half a size?"\n' +
          '2) "$340 for boots is a joke, y’all are just marking up the same factory stuff everyone else sells"\n' +
          '3) A DM from a mid-size hiking creator (40k followers) asking for a free pair in exchange for a post.',
        placeholder: '1)\n2)\n3)'
      },
      {
        key: 'analytics_read',
        title: 'Reading the analytics',
        prompt:
          'Last month: Reels averaged 3.1% engagement and static posts averaged 0.9%, but static posts drove 4x ' +
          'the link-clicks to the shop. Followers grew 6%, mostly off one Reel that got picked up by a hiking page. ' +
          'Write the one paragraph you would send Fieldwork’s founder about what this means for next month’s mix ' +
          'and why — not just the numbers back at her.',
        placeholder: ''
      }
    ]
  },

  finance: {
    disciplineKey: 'finance',
    timeLimitMinutes: 180,
    scenario:
      'You are supporting the books for Marlowe & Finch, a 12-person interior design studio using QuickBooks ' +
      'Online. It is the first week of the month and last month needs to close.',
    tasks: [
      {
        key: 'reconciliation',
        title: 'Bank reconciliation against a sample chart of accounts',
        prompt:
          'The business checking account shows an ending balance of $48,212.60. QuickBooks shows $46,777.10. ' +
          'Three items explain most of the gap: a $1,200 client check deposited on the 30th that hadn’t cleared ' +
          'yet, a recurring $48.50 software charge that was never entered, and a $412 vendor payment entered twice. ' +
          'Walk through how you would resolve each, in the order you would actually do it, and state the true ' +
          'reconciled balance once all three are handled correctly.',
        placeholder: '1) ...\n2) ...\n3) ...\n\nTrue reconciled balance:'
      },
      {
        key: 'ar_chase',
        title: 'Chasing an overdue invoice',
        prompt:
          'Invoice #1042 to a client, $6,400, was due 21 days ago. This client has always paid eventually but is ' +
          'consistently late, and the studio’s owner does not want to damage the relationship over it. Write the ' +
          'email you’d send, and separately, one line on when you’d escalate this to the owner if it still isn’t paid.',
        placeholder: 'Email:\n\nWhen to escalate:'
      },
      {
        key: 'monthly_pack',
        title: 'A one-page management summary',
        prompt:
          'Given: revenue this month $84,300 (last month $76,900), expenses $61,150 (last month $58,400), largest ' +
          'expense increase was $4,200 more spent on contractor design labor tied to two rush projects. Cash in the ' +
          'business account is $48,212.60. Write the short summary you’d actually hand the owner — what changed, ' +
          'and the one thing worth her attention.',
        placeholder: ''
      }
    ]
  },

  support: {
    disciplineKey: 'support',
    timeLimitMinutes: 180,
    scenario:
      'You are on the support queue for Loom & Co, a mid-size online mattress retailer, working tickets in Zendesk.',
    tasks: [
      {
        key: 'ticket_batch',
        title: 'Working a ticket queue to a service level',
        prompt:
          'Three tickets are open. Reply to each as you actually would, in order:\n' +
          '1) "Mattress arrived with a 2-inch dent in the corner, day 3 of the 100-night trial, want a replacement."\n' +
          '2) "Where is my order" — tracking shows it delivered yesterday, customer says it never arrived.\n' +
          '3) A customer asking whether the mattress works on an adjustable base, clearly still deciding whether to buy.',
        placeholder: '1)\n2)\n3)'
      },
      {
        key: 'deescalation',
        title: 'De-escalating an angry customer',
        prompt:
          'A customer is on their fourth message, increasingly heated, because a refund promised "5–7 business ' +
          'days" by a colleague is now on day 11. It is genuinely stuck in a processing backlog on the payment ' +
          'provider’s side, not something support can force through faster. Write the reply.',
        placeholder: ''
      },
      {
        key: 'kb_article',
        title: 'Writing a help article',
        prompt:
          'The same question — "can I use my old bed frame or do I need a new base" — has come in nine times this ' +
          'week. Write the help center article that would stop this question being asked, in plain, reassuring ' +
          'language, no jargon.',
        placeholder: ''
      }
    ]
  },

  sales: {
    disciplineKey: 'sales',
    timeLimitMinutes: 180,
    scenario:
      'You support the sales pipeline for Ardent, a B2B scheduling software company selling $8k–$40k annual deals, in HubSpot.',
    tasks: [
      {
        key: 'followup_sequence',
        title: 'Follow-up discipline',
        prompt:
          'A prospect went quiet 9 days after a strong demo where they said "this looks great, let me talk to my ' +
          'team." Write the two follow-up messages you’d send — one now, and the one you’d send a week after that ' +
          'if there’s still no reply — without sounding like you’re chasing.',
        placeholder: 'Message 1 (now):\n\nMessage 2 (one week later):'
      },
      {
        key: 'proposal',
        title: 'A proposal, assembled and sent',
        prompt:
          'A qualified prospect (60-person ops team) wants a proposal for the Growth plan, annual billing, plus ' +
          'a $3,000 one-time onboarding fee they asked to have itemized separately so procurement can see it. ' +
          'Write the short cover email you’d send along with it, including what you’d ask for next.',
        placeholder: ''
      },
      {
        key: 'objection',
        title: 'Handling a first objection',
        prompt:
          'On a call, a prospect says: "Honestly this looks almost identical to what we already use, why would we ' +
          'switch and go through the migration pain?" Write what you’d actually say back, in your own words, not a script.',
        placeholder: ''
      }
    ]
  },

  ops: {
    disciplineKey: 'ops',
    timeLimitMinutes: 180,
    scenario:
      'You are running operations for a 15-person marketing agency in Asana, mid-way through a client rebrand project with a hard launch date.',
    tasks: [
      {
        key: 'plan_project',
        title: 'Planning a project from a rough brief',
        prompt:
          'Given: logo, brand guidelines, and new website all need to ship together in 6 weeks; the design lead is ' +
          'out for one of those weeks on pre-booked leave; the client’s legal team needs 5 business days to review ' +
          'final assets. Build the milestone plan — dates, owners, and the two points where this is most likely to slip.',
        placeholder: ''
      },
      {
        key: 'status_report',
        title: 'A status report people actually read',
        prompt:
          'Write this week’s update to the client: logo is approved, website is two days behind because a ' +
          'photographer rescheduled, brand guidelines are on track. Keep it to what they need to know and what, if ' +
          'anything, you need from them.',
        placeholder: ''
      },
      {
        key: 'sop',
        title: 'Writing a process someone else can follow',
        prompt:
          'New team members keep asking how client assets get handed off to the design team. Write the SOP — short, ' +
          'numbered, specific enough that someone could follow it without asking you a single question.',
        placeholder: ''
      }
    ]
  },

  marketing: {
    disciplineKey: 'marketing',
    timeLimitMinutes: 180,
    scenario:
      'You support marketing for Halcyon, a wellness app launching a new sleep-tracking feature, in Klaviyo and Webflow.',
    tasks: [
      {
        key: 'launch_email',
        title: 'An email for a dated launch',
        prompt:
          'Write the launch email announcing the new sleep-tracking feature to Halcyon’s existing subscriber list ' +
          '— subject line, preview text, and body. It should feel like news, not an ad.',
        placeholder: 'Subject line:\nPreview text:\n\nBody:'
      },
      {
        key: 'landing_copy',
        title: 'Landing page copy',
        prompt:
          'Write the hero section (headline, subhead, one CTA) for the landing page this email links to. Someone ' +
          'reading only these three lines should understand exactly what the feature does and why to try it.',
        placeholder: 'Headline:\nSubhead:\nCTA:'
      },
      {
        key: 'ab_test',
        title: 'Reading a test honestly',
        prompt:
          'You ran the launch email as an A/B test on subject line. Version A: "Sleep tracking is here" — ' +
          '31% open rate. Version B: "We watched you sleep (in a good way)" — 38% open rate, but click rate on B ' +
          'was lower than A. What do you send to the remaining 80% of the list, and why?',
        placeholder: ''
      }
    ]
  },

  people: {
    disciplineKey: 'people',
    timeLimitMinutes: 180,
    scenario:
      'You support People Ops for a 30-person remote startup, currently hiring for a Senior Backend Engineer, using Gusto and a simple ATS.',
    tasks: [
      {
        key: 'screening',
        title: 'Screening to a shortlist',
        prompt:
          'Given the role needs 5+ years backend experience, comfort with on-call rotation, and startup experience ' +
          'preferred but not required — here are three one-line candidate summaries. Decide who advances and who ' +
          'doesn’t, and write the one-line reason for each:\n' +
          '1) 7 years, all at one large enterprise, no on-call experience, wants full remote.\n' +
          '2) 3 years, two early-stage startups, ran production on-call at both.\n' +
          '3) 6 years, mix of agency and one Series B startup, comfortable with on-call, based in a 9-hour-offset timezone.',
        placeholder: '1)\n2)\n3)'
      },
      {
        key: 'rejection',
        title: 'A rejection that keeps the door open',
        prompt:
          'Candidate #1 above made it to a final interview and was strong, but the team chose someone else. Write ' +
          'the email letting them know — warm enough that they’d apply again for a future role.',
        placeholder: ''
      },
      {
        key: 'onboarding_plan',
        title: 'A first-week onboarding plan',
        prompt:
          'The new hire starts in two weeks, fully remote, in a timezone 6 hours ahead of the rest of engineering. ' +
          'Write their first-week plan — accounts, introductions, and what they should actually be doing by Friday.',
        placeholder: ''
      }
    ]
  },

  data: {
    disciplineKey: 'data',
    timeLimitMinutes: 180,
    scenario:
      'You support reporting for a 5-location boutique gym chain, working from a messy weekly export out of their booking system.',
    tasks: [
      {
        key: 'clean_data',
        title: 'Cleaning a messy export',
        prompt:
          'Below is a description of a raw weekly export: member names sometimes appear as "Last, First" and ' +
          'sometimes "First Last"; three rows have a class location of "TBD"; the visit-count column has both "12" ' +
          'and "12 visits" as values; one member appears twice with slightly different email addresses. Write out, ' +
          'step by step, exactly how you would clean this before it goes anywhere near a report.',
        placeholder: ''
      },
      {
        key: 'reporting_pack',
        title: 'A recurring report, right every time',
        prompt:
          'Design the weekly pack the owner actually needs to run five locations: which numbers, broken out how, ' +
          'and in what order. List the metrics and a one-line reason each earns its place — not a wish list of ' +
          'everything the booking system can export.',
        placeholder: ''
      },
      {
        key: 'sense_check',
        title: 'Sense-checking a number',
        prompt:
          'This week’s export shows one location’s attendance jumped 340% over last week, with no marketing push ' +
          'and no new classes added. What do you do before that number goes in the report, and what are the two ' +
          'most likely explanations?',
        placeholder: ''
      }
    ]
  },

  design: {
    disciplineKey: 'design',
    timeLimitMinutes: 180,
    scenario:
      'You support design for Norling & Vale, a boutique law firm rebranding away from a dated, generic corporate look, working in Figma.',
    tasks: [
      {
        key: 'brief_taking',
        title: 'Working from a brief',
        prompt:
          'The partners said: "We want to look established but not stuffy, trustworthy but not boring — everyone in ' +
          'our field uses navy and a serif logo and we’re tired of looking like all of them." Write the direction ' +
          'you’d actually take into the first concept — palette feel, type feel, and the one idea that makes it ' +
          'not look like every other law firm.',
        placeholder: ''
      },
      {
        key: 'social_assets',
        title: 'Social assets, sized and formatted per channel',
        prompt:
          'The new brand needs to announce itself. List exactly what assets you’d produce for the announcement ' +
          '— which channels, which sizes, and what each one needs to say — as a production checklist, not a mood board.',
        placeholder: ''
      },
      {
        key: 'brand_system',
        title: 'Staying inside a brand system',
        prompt:
          'A partner asks you to make a one-off event flyer "pop more" by adding a bright orange gradient that’s ' +
          'nowhere in the new brand guidelines. Write how you’d actually respond — to the partner, in a way that ' +
          'protects the brand without just saying no.',
        placeholder: ''
      }
    ]
  },

  personal: {
    disciplineKey: 'personal',
    timeLimitMinutes: 180,
    scenario:
      'You support the personal side of a busy executive’s life alongside their EA — two kids, frequent travel, a household to run.',
    tasks: [
      {
        key: 'family_travel',
        title: 'Family travel with the rigor of a business trip',
        prompt:
          'Plan a 6-day family trip (two adults, kids aged 6 and 9) departing in 5 weeks, destination flexible but ' +
          'warm-weather and under a 6-hour flight from the family’s home city. Write out what you’d actually book ' +
          'and in what order, and the two questions you’d ask the family before booking anything.',
        placeholder: ''
      },
      {
        key: 'household_vendor',
        title: 'A household vendor problem',
        prompt:
          'The cleaner has missed two appointments in three weeks with no notice, and it’s the day before a dinner ' +
          'party for 12. Write what you’d actually do today, in order, including what you’d say to the cleaner.',
        placeholder: ''
      },
      {
        key: 'discretion',
        title: 'Discretion in a personal matter',
        prompt:
          'You’re asked to book a surprise anniversary trip, and separately, in the same week, to help coordinate ' +
          'a parent’s medical appointment the executive hasn’t mentioned to anyone at their company. Write, in a ' +
          'sentence or two, how you’d handle keeping these separate from everything else you touch.',
        placeholder: ''
      }
    ]
  },

  tech: {
    disciplineKey: 'tech',
    timeLimitMinutes: 180,
    scenario:
      'You support systems for a 20-person consultancy running Google Workspace, Slack, and a half-dozen SaaS tools nobody fully owns.',
    tasks: [
      {
        key: 'saas_offboarding',
        title: 'Offboarding, done properly',
        prompt:
          'An employee is leaving Friday. List, in order, every account and access point you’d need to check and ' +
          'revoke — not just email — and the one step people most often forget that causes a problem weeks later.',
        placeholder: ''
      },
      {
        key: 'automation',
        title: 'Building a small automation',
        prompt:
          'New client contracts arrive as signed PDFs in a shared inbox, and someone manually creates a folder and ' +
          'a project in the project tool for each one — taking about 15 minutes and sometimes forgotten for days. ' +
          'Describe, step by step, the automation you’d actually build (tool, trigger, steps) to fix this.',
        placeholder: ''
      },
      {
        key: 'troubleshoot',
        title: 'Troubleshooting methodically',
        prompt:
          'Three people report Slack notifications randomly stopped working this week, but only on desktop, not ' +
          'mobile, and only for direct messages, not channels. Walk through how you’d actually diagnose this — ' +
          'the order you’d check things in, not just a guess at the answer.',
        placeholder: ''
      }
    ]
  }
};

export const watchTemplateFor = (disciplineKey: string): WatchTemplate | null =>
  WATCH_TEMPLATES[disciplineKey] ?? null;
