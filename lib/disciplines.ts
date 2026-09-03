/* THE DISCIPLINES

   The heart of the assessment, and the thing that is supposed to make Relève
   worth three thousand a month rather than eight hundred.

   A generic list of "work areas" tells you a role involves social media. It
   does not tell you whether that means scheduling posts from a template or
   owning a paid strategy with a budget — and those are different people at
   different prices. So the questionnaire branches: say what the role is, and
   the questions become specific to it.

   Both sides answer the SAME competency list for a discipline. The executive
   says how much each one is needed; the talent says how good they are at it.
   That is what makes the two directly comparable.

   Client-safe: data and types only. */

export type Need = 'core' | 'useful' | 'no';
export type Prof = 'none' | 'learning' | 'solid' | 'deep';

export const NEEDS: { key: Need; label: string; hint: string }[] = [
  { key: 'core',   label: 'Must have',  hint: 'The role does not work without it' },
  { key: 'useful', label: 'Nice to have', hint: 'Helps, but would not decide it' },
  { key: 'no',     label: 'Not needed', hint: 'Not part of this role' }
];

export const PROFS: { key: Prof; label: string; hint: string }[] = [
  { key: 'none',     label: 'Never done it', hint: '' },
  { key: 'learning', label: 'Some exposure', hint: 'Have helped with it, would need direction' },
  { key: 'solid',    label: 'Can run it',    hint: 'Do this unsupervised, week in week out' },
  { key: 'deep',     label: 'Could teach it', hint: 'Have set it up from nothing and improved it' }
];

/* A specific, checkable competency. The hint exists so that two people
   reading the same line mean the same thing by it. */
export type Comp = { key: string; label: string; hint: string };

/* An extra question that only makes sense inside one discipline. */
export type Detail = {
  key: string;
  /* asked of the executive */
  ask: string;
  /* asked of the talent, about the same thing */
  askTalent: string;
  kind: 'choice' | 'text';
  options?: string[];
  placeholder?: string;
};

export type Discipline = {
  key: string;
  name: string;
  /* how an executive would recognise this as their role */
  blurb: string;
  /* what the role is often called */
  aka: string[];
  comps: Comp[];
  details: Detail[];
};

export const DISCIPLINES: Discipline[] = [
  {
    key: 'ea',
    name: 'Executive assistance',
    blurb: 'Your inbox, your diary, your travel, and the follow-through around them.',
    aka: ['Executive Assistant', 'Personal Assistant', 'Chief of Staff'],
    comps: [
      { key: 'inbox_triage', label: 'Inbox triage', hint: 'Reading everything, surfacing the few things that need you' },
      { key: 'inbox_draft', label: 'Drafting in your voice', hint: 'Replies that go out without you rewriting them' },
      { key: 'calendar', label: 'Calendar ownership', hint: 'Booking, moving, protecting focus time, resolving conflicts' },
      { key: 'timezones', label: 'Multi-timezone scheduling', hint: 'Coordinating people across three or more zones without errors' },
      { key: 'travel', label: 'Travel and itineraries', hint: 'Flights, hotels, ground, visas, and rebooking when it collapses' },
      { key: 'meeting_prep', label: 'Meeting preparation', hint: 'Agendas, briefing notes, background on who you are meeting' },
      { key: 'minutes', label: 'Minutes and action capture', hint: 'What was decided, who owns it, by when' },
      { key: 'chasing', label: 'Chasing on your behalf', hint: 'Politely relentless with people who owe you things' },
      { key: 'gatekeeping', label: 'Gatekeeping', hint: 'Saying no to people without damaging the relationship' },
      { key: 'confidential', label: 'Handling confidential material', hint: 'Board papers, comp, legal, personal matters' },
      { key: 'events', label: 'Events and offsites', hint: 'Venue, logistics, run of day, budget' },
      { key: 'exec_reporting', label: 'Board and investor prep', hint: 'Assembling the pack, chasing inputs, formatting' }
    ],
    details: [
      { key: 'inbox_volume', kind: 'choice',
        ask: 'How much email lands on you in a normal day?',
        askTalent: 'What inbox volume have you actually managed?',
        options: ['Under 50', '50–150', '150–300', '300+'] },
      { key: 'access', kind: 'choice',
        ask: 'How much access will they have?',
        askTalent: 'What level of access have you held before?',
        options: ['Read only, drafts for approval', 'Send on my behalf', 'Full inbox and calendar control'] },
      { key: 'exposure', kind: 'text',
        ask: 'Who will they be dealing with on your behalf?',
        askTalent: 'Who have you dealt with on an executive’s behalf?',
        placeholder: 'Board members, investors, our top twenty clients, my family' }
    ]
  },

  {
    key: 'social',
    name: 'Social media and content',
    blurb: 'Publishing, growing an audience, and everything that feeds it.',
    aka: ['Social Media Manager', 'Content Manager', 'Community Manager'],
    comps: [
      { key: 'strategy', label: 'Content strategy', hint: 'Deciding what to post and why, not just filling a calendar' },
      { key: 'calendar_content', label: 'Running a content calendar', hint: 'Planning weeks ahead and keeping it fed' },
      { key: 'copy', label: 'Writing captions and hooks', hint: 'Copy that sounds like the brand and earns the scroll-stop' },
      { key: 'shortform', label: 'Short-form video editing', hint: 'Reels, TikToks, Shorts — cutting, captions, sound' },
      { key: 'graphics', label: 'Graphics from a template', hint: 'Canva or Figma, on brand, without a designer' },
      { key: 'scheduling_tools', label: 'Scheduling tools', hint: 'Later, Buffer, Metricool, native schedulers' },
      { key: 'community', label: 'Community management', hint: 'Comments and DMs, including the difficult ones' },
      { key: 'analytics_social', label: 'Reading the analytics', hint: 'Knowing which numbers matter and what to change' },
      { key: 'influencer', label: 'Creator and influencer outreach', hint: 'Finding, briefing and managing collaborators' },
      { key: 'paid_social', label: 'Paid social', hint: 'Boosting, audiences, budget, reading a Meta or TikTok dashboard' },
      { key: 'ugc', label: 'Sourcing and repurposing content', hint: 'Turning one asset into a fortnight of posts' },
      { key: 'brand_voice', label: 'Holding a brand voice', hint: 'Consistent tone across channels and formats' }
    ],
    details: [
      { key: 'channels', kind: 'text',
        ask: 'Which channels does this role cover?',
        askTalent: 'Which channels have you actually run?',
        placeholder: 'Instagram, LinkedIn, TikTok, a newsletter' },
      { key: 'cadence', kind: 'choice',
        ask: 'How often do you want to post?',
        askTalent: 'What posting cadence have you sustained?',
        options: ['A few times a month', 'Weekly', 'Several times a week', 'Daily or more'] },
      { key: 'ownership_social', kind: 'choice',
        ask: 'How much of it is theirs to decide?',
        askTalent: 'How much have you owned outright before?',
        options: ['I approve everything', 'I approve the plan, not each post', 'They own it end to end'] },
      { key: 'budget_social', kind: 'choice',
        ask: 'Will they handle a paid budget?',
        askTalent: 'What paid budget have you managed?',
        options: ['No paid spend', 'Under $2k a month', '$2k–$10k a month', '$10k+ a month'] }
    ]
  },

  {
    key: 'finance',
    name: 'Bookkeeping and finance',
    blurb: 'The money admin — invoicing, expenses, reconciliation, reporting.',
    aka: ['Bookkeeper', 'Finance Assistant', 'Accounts Manager'],
    comps: [
      { key: 'ap', label: 'Accounts payable', hint: 'Bills in, approved, scheduled, paid on time' },
      { key: 'ar', label: 'Accounts receivable', hint: 'Invoicing out and chasing what is owed' },
      { key: 'reconcile', label: 'Bank reconciliation', hint: 'Matching transactions and finding what does not' },
      { key: 'expenses', label: 'Expense management', hint: 'Receipts, categories, card reconciliation, policy' },
      { key: 'payroll', label: 'Payroll administration', hint: 'Running or coordinating payroll and contractor payments' },
      { key: 'reporting_fin', label: 'Management reporting', hint: 'P&L, cash position, a monthly pack that means something' },
      { key: 'forecast', label: 'Cash flow forecasting', hint: 'Knowing what the balance will be in six weeks' },
      { key: 'budget', label: 'Budget tracking', hint: 'Actual against plan, and flagging drift early' },
      { key: 'tax_prep', label: 'Tax and year-end prep', hint: 'Getting the books ready for the accountant' },
      { key: 'accounting_sw', label: 'Accounting software', hint: 'Xero, QuickBooks, Wave — running it, not just entering into it' },
      { key: 'vendor', label: 'Vendor and subscription management', hint: 'What we pay for, whether we still need it' },
      { key: 'audit_trail', label: 'Documentation and audit trail', hint: 'Records a third party could follow' }
    ],
    details: [
      { key: 'software_fin', kind: 'text',
        ask: 'What are your books kept in?',
        askTalent: 'Which accounting systems do you know well?',
        placeholder: 'Xero, QuickBooks Online, Ramp, Bill.com' },
      { key: 'scale_fin', kind: 'choice',
        ask: 'Roughly how many transactions a month?',
        askTalent: 'What transaction volume have you handled?',
        options: ['Under 50', '50–200', '200–1,000', '1,000+'] },
      { key: 'entities', kind: 'choice',
        ask: 'How many entities or currencies?',
        askTalent: 'Have you worked across entities or currencies?',
        options: ['One entity, one currency', 'One entity, multiple currencies', 'Multiple entities'] },
      { key: 'qualified', kind: 'text',
        ask: 'Do you need any formal qualification?',
        askTalent: 'Any bookkeeping or accounting qualifications?',
        placeholder: 'Not required / AAT / CPA / degree in accounting' }
    ]
  },

  {
    key: 'support',
    name: 'Customer support and success',
    blurb: 'Answering customers, solving problems, and keeping them.',
    aka: ['Customer Support', 'Client Success', 'Help Desk'],
    comps: [
      { key: 'tickets', label: 'Ticket handling', hint: 'Working a queue to a service level without dropping anyone' },
      { key: 'live_chat', label: 'Live chat', hint: 'Several conversations at once, in real time' },
      { key: 'phone_support', label: 'Phone support', hint: 'Comfortable on inbound and outbound calls' },
      { key: 'escalation', label: 'De-escalation', hint: 'Turning an angry customer around rather than passing them on' },
      { key: 'troubleshoot', label: 'Technical troubleshooting', hint: 'Diagnosing a problem rather than reciting a script' },
      { key: 'kb', label: 'Writing help articles', hint: 'Documentation that stops the question being asked again' },
      { key: 'onboarding_cs', label: 'Customer onboarding', hint: 'Walking a new customer to their first success' },
      { key: 'retention', label: 'Renewals and retention', hint: 'Spotting a customer about to leave, and acting' },
      { key: 'crm_support', label: 'Support tooling', hint: 'Zendesk, Intercom, HelpScout, Front' },
      { key: 'feedback_loop', label: 'Feeding issues back', hint: 'Turning repeated complaints into a change request' },
      { key: 'sla', label: 'Working to a service level', hint: 'Response and resolution times as a discipline' },
      { key: 'multilingual', label: 'Second language support', hint: 'Handling customers in another language' }
    ],
    details: [
      { key: 'volume_cs', kind: 'choice',
        ask: 'How many customer conversations a day?',
        askTalent: 'What daily volume have you handled?',
        options: ['Under 10', '10–40', '40–100', '100+'] },
      { key: 'channels_cs', kind: 'text',
        ask: 'Which channels?',
        askTalent: 'Which channels have you worked?',
        placeholder: 'Email, live chat, phone, Instagram DMs' },
      { key: 'hours_cs', kind: 'choice',
        ask: 'What coverage do you need?',
        askTalent: 'What hours can you genuinely cover?',
        options: ['Business hours, my timezone', 'Extended hours', 'Weekend cover too'] }
    ]
  },

  {
    key: 'sales',
    name: 'Sales and CRM',
    blurb: 'Pipeline, follow-up, and keeping the commercial machine recorded.',
    aka: ['Sales Assistant', 'SDR', 'Revenue Operations'],
    comps: [
      { key: 'crm_hygiene', label: 'CRM hygiene', hint: 'Every deal, contact and note where it should be' },
      { key: 'prospecting', label: 'Prospect research', hint: 'Building a list that is actually qualified' },
      { key: 'outreach_cold', label: 'Cold outreach', hint: 'Writing and sending sequences that get replies' },
      { key: 'followup', label: 'Follow-up discipline', hint: 'Nobody goes cold because someone forgot' },
      { key: 'proposals', label: 'Proposals and quotes', hint: 'Assembling, formatting, sending, chasing' },
      { key: 'demo_booking', label: 'Booking meetings', hint: 'Getting a qualified call in the diary' },
      { key: 'pipeline_report', label: 'Pipeline reporting', hint: 'What is where, what is stuck, what will close' },
      { key: 'contracts', label: 'Contract administration', hint: 'Sending, chasing signature, filing' },
      { key: 'crm_build', label: 'Configuring the CRM', hint: 'Building fields, stages, automations — not just using them' },
      { key: 'objections', label: 'Handling first objections', hint: 'Confident on the phone with a sceptical prospect' },
      { key: 'upsell', label: 'Spotting expansion', hint: 'Noticing when an account is ready for more' },
      { key: 'handover', label: 'Clean handover', hint: 'Passing a deal on with nothing lost' }
    ],
    details: [
      { key: 'crm_which', kind: 'text',
        ask: 'Which CRM do you use?',
        askTalent: 'Which CRMs do you know well?',
        placeholder: 'HubSpot, Salesforce, Pipedrive, Close' },
      { key: 'talk_to_customers', kind: 'choice',
        ask: 'Will they speak to prospects directly?',
        askTalent: 'How much direct selling have you done?',
        options: ['Never — behind the scenes only', 'Email and chat only', 'Calls too', 'They run the call'] },
      { key: 'deal_size', kind: 'choice',
        ask: 'Typical deal size?',
        askTalent: 'What deal sizes have you worked?',
        options: ['Under $1k', '$1k–$10k', '$10k–$100k', '$100k+'] }
    ]
  },

  {
    key: 'ops',
    name: 'Operations and project management',
    blurb: 'Holding work together across people, and building the process.',
    aka: ['Operations Manager', 'Project Manager', 'Programme Coordinator'],
    comps: [
      { key: 'plan', label: 'Planning a project', hint: 'Scope, milestones, owners, dependencies' },
      { key: 'track', label: 'Tracking to a deadline', hint: 'Knowing what is late before it is late' },
      { key: 'coordinate', label: 'Coordinating other people', hint: 'Chasing across departments without authority' },
      { key: 'sop', label: 'Writing process documentation', hint: 'An SOP someone else can follow without asking' },
      { key: 'automate', label: 'Building automations', hint: 'Zapier, Make, native integrations' },
      { key: 'tools_admin', label: 'Administering the tool stack', hint: 'Notion, Asana, ClickUp, Monday — setting them up' },
      { key: 'vendor_ops', label: 'Vendor management', hint: 'Selecting, briefing and holding suppliers to account' },
      { key: 'status', label: 'Status reporting', hint: 'A weekly update people actually read' },
      { key: 'risk', label: 'Spotting risk early', hint: 'Raising the problem while it is still small' },
      { key: 'budget_ops', label: 'Managing a project budget', hint: 'Tracking spend against plan' },
      { key: 'improve', label: 'Process improvement', hint: 'Making the second time faster than the first' },
      { key: 'meetings_run', label: 'Running meetings', hint: 'Chairing, keeping to time, landing decisions' }
    ],
    details: [
      { key: 'pm_tools', kind: 'text',
        ask: 'What do you run projects in?',
        askTalent: 'Which project tools do you know well?',
        placeholder: 'Notion, Asana, ClickUp, Monday, Linear' },
      { key: 'team_size', kind: 'choice',
        ask: 'How many people will they coordinate?',
        askTalent: 'How many people have you coordinated?',
        options: ['Just me', '2–5', '6–20', '20+'] },
      { key: 'authority', kind: 'choice',
        ask: 'How much authority do they have?',
        askTalent: 'What authority have you held?',
        options: ['They ask, I decide', 'They decide within a brief', 'They own the outcome'] }
    ]
  },

  {
    key: 'marketing',
    name: 'Marketing and campaigns',
    blurb: 'Email, funnels, launches and the numbers underneath them.',
    aka: ['Marketing Assistant', 'Campaign Manager', 'Growth Associate'],
    comps: [
      { key: 'email_marketing', label: 'Email marketing', hint: 'Building, sending, segmenting, testing' },
      { key: 'funnels', label: 'Funnels and landing pages', hint: 'Building a page and the sequence behind it' },
      { key: 'copy_marketing', label: 'Marketing copy', hint: 'Subject lines, landing pages, ad copy' },
      { key: 'launch', label: 'Running a launch', hint: 'A dated campaign with moving parts and a deadline' },
      { key: 'ads', label: 'Paid advertising', hint: 'Meta, Google — building, monitoring, optimising' },
      { key: 'seo', label: 'SEO and blog', hint: 'Keywords, briefs, on-page, publishing' },
      { key: 'webinar', label: 'Webinars and events', hint: 'Promotion, registration, run of show, follow-up' },
      { key: 'analytics_mkt', label: 'Marketing analytics', hint: 'GA4, attribution, knowing what worked' },
      { key: 'crm_marketing', label: 'Marketing automation', hint: 'Klaviyo, ActiveCampaign, HubSpot workflows' },
      { key: 'affiliate', label: 'Affiliates and partnerships', hint: 'Recruiting and managing partners' },
      { key: 'brand_assets', label: 'Managing brand assets', hint: 'Keeping a library and holding the standard' },
      { key: 'ab_test', label: 'Testing', hint: 'Running a real test and reading the result honestly' }
    ],
    details: [
      { key: 'mkt_stack', kind: 'text',
        ask: 'What is your marketing stack?',
        askTalent: 'Which marketing tools do you know well?',
        placeholder: 'Klaviyo, ActiveCampaign, Webflow, GA4, Meta Ads' },
      { key: 'list_size', kind: 'choice',
        ask: 'How big is your list or audience?',
        askTalent: 'What audience sizes have you worked with?',
        options: ['Under 1,000', '1,000–10,000', '10,000–100,000', '100,000+'] },
      { key: 'mkt_spend', kind: 'choice',
        ask: 'Monthly marketing spend they would touch?',
        askTalent: 'What monthly spend have you managed?',
        options: ['None', 'Under $5k', '$5k–$25k', '$25k+'] }
    ]
  },

  {
    key: 'people',
    name: 'Recruiting and people operations',
    blurb: 'Hiring admin, onboarding, and keeping the team running.',
    aka: ['Recruiting Coordinator', 'HR Assistant', 'People Ops'],
    comps: [
      { key: 'sourcing', label: 'Sourcing candidates', hint: 'Finding people, not just posting an advert' },
      { key: 'screening', label: 'Screening applications', hint: 'Filtering to a shortlist against a brief' },
      { key: 'interview_coord', label: 'Interview coordination', hint: 'Scheduling panels across diaries without friction' },
      { key: 'candidate_comms', label: 'Candidate communication', hint: 'Keeping people warm, including the rejections' },
      { key: 'onboarding_hr', label: 'Onboarding new starters', hint: 'Paperwork, accounts, first-week plan' },
      { key: 'contracts_hr', label: 'Contracts and paperwork', hint: 'Offer letters, agreements, right-to-work records' },
      { key: 'hris', label: 'HR systems', hint: 'BambooHR, Rippling, Gusto, Deel' },
      { key: 'policy', label: 'Policies and handbook', hint: 'Drafting and keeping them current' },
      { key: 'reviews_hr', label: 'Performance review admin', hint: 'Running the cycle, chasing the inputs' },
      { key: 'culture', label: 'Team events and culture', hint: 'The things that make a remote team feel like one' },
      { key: 'payroll_hr', label: 'Payroll coordination', hint: 'Working with finance to get people paid correctly' },
      { key: 'compliance_hr', label: 'Compliance record-keeping', hint: 'Knowing what must be kept, and keeping it' }
    ],
    details: [
      { key: 'hiring_volume', kind: 'choice',
        ask: 'How much hiring do you expect?',
        askTalent: 'What hiring volume have you supported?',
        options: ['Occasional', 'A few roles a quarter', 'Continuous'] },
      { key: 'geography_hr', kind: 'text',
        ask: 'Where do you hire?',
        askTalent: 'Which regions have you hired in?',
        placeholder: 'US only / US and Philippines / global contractors' }
    ]
  },

  {
    key: 'data',
    name: 'Data, research and reporting',
    blurb: 'Turning scattered information into something you can decide from.',
    aka: ['Research Assistant', 'Data Analyst', 'Reporting Analyst'],
    comps: [
      { key: 'spreadsheets', label: 'Advanced spreadsheets', hint: 'Pivots, lookups, formulas that survive someone else opening them' },
      { key: 'dashboards', label: 'Building dashboards', hint: 'Looker Studio, Power BI, or a live sheet that updates itself' },
      { key: 'research', label: 'Desk research', hint: 'Finding, verifying, and summarising to a brief' },
      { key: 'data_clean', label: 'Cleaning data', hint: 'Making a messy export usable' },
      { key: 'reporting_pack', label: 'Recurring reporting', hint: 'The same pack every month, right every time' },
      { key: 'competitor', label: 'Competitor and market analysis', hint: 'Structured comparison, not a list of links' },
      { key: 'survey', label: 'Surveys and feedback', hint: 'Designing, running, and reading the results' },
      { key: 'sql', label: 'SQL or querying', hint: 'Pulling their own data rather than asking someone' },
      { key: 'viz', label: 'Presenting findings', hint: 'A chart that makes the point without narration' },
      { key: 'crm_data', label: 'Data entry at volume', hint: 'Accurate, fast, and consistent over hundreds of rows' },
      { key: 'automation_data', label: 'Automating a report', hint: 'Making it build itself next month' },
      { key: 'sense_check', label: 'Sense-checking numbers', hint: 'Noticing when a figure cannot be right' }
    ],
    details: [
      { key: 'data_tools', kind: 'text',
        ask: 'What would they work in?',
        askTalent: 'Which data tools do you know well?',
        placeholder: 'Google Sheets, Excel, Looker Studio, Airtable, SQL' },
      { key: 'data_depth', kind: 'choice',
        ask: 'How technical does this need to be?',
        askTalent: 'How technical is your data work?',
        options: ['Spreadsheets only', 'Spreadsheets and dashboards', 'Querying databases directly'] }
    ]
  },

  {
    key: 'design',
    name: 'Design and creative',
    blurb: 'Making things look the way the brand should look.',
    aka: ['Graphic Designer', 'Creative Assistant', 'Brand Designer'],
    comps: [
      { key: 'canva', label: 'Template-based design', hint: 'Canva or similar, on brand, at speed' },
      { key: 'adobe', label: 'Professional design tools', hint: 'Figma, Illustrator, Photoshop, InDesign' },
      { key: 'brand_system', label: 'Working to a brand system', hint: 'Staying inside the rules without being told' },
      { key: 'decks', label: 'Presentation design', hint: 'Turning a rough deck into something worth showing' },
      { key: 'social_assets', label: 'Social assets', hint: 'Sized, formatted and scheduled per channel' },
      { key: 'video_edit', label: 'Video editing', hint: 'Cutting, captions, colour, sound' },
      { key: 'web_design', label: 'Web pages', hint: 'Webflow, Squarespace, Wix, or a WordPress theme' },
      { key: 'print', label: 'Print-ready artwork', hint: 'Bleed, colour space, files a printer accepts' },
      { key: 'photo_edit', label: 'Photo retouching', hint: 'Cleaning up product and portrait shots' },
      { key: 'motion', label: 'Motion and animation', hint: 'After Effects or template-based motion' },
      { key: 'asset_library', label: 'Managing a brand library', hint: 'Everything findable and current' },
      { key: 'brief_taking', label: 'Working from a brief', hint: 'Getting close on the first attempt' }
    ],
    details: [
      { key: 'design_tools', kind: 'text',
        ask: 'What do you design in?',
        askTalent: 'Which design tools are you strongest in?',
        placeholder: 'Figma, Canva, Adobe CC, Webflow' },
      { key: 'portfolio', kind: 'text',
        ask: 'What kind of output do you need most?',
        askTalent: 'What is your portfolio strongest in?',
        placeholder: 'Social graphics, pitch decks, landing pages' }
    ]
  },

  {
    key: 'personal',
    name: 'Personal and household',
    blurb: 'The life admin that takes the same hours as the business.',
    aka: ['Personal Assistant', 'Household Manager', 'Lifestyle Manager'],
    comps: [
      { key: 'appointments', label: 'Personal appointments', hint: 'Medical, dental, and the reminders around them' },
      { key: 'family_cal', label: 'Family calendar', hint: 'Schools, activities, and who is where' },
      { key: 'gifts', label: 'Gifts and occasions', hint: 'Researched, bought, wrapped, sent, on time' },
      { key: 'household_vendors', label: 'Household vendors', hint: 'Cleaners, contractors, deliveries, repairs' },
      { key: 'personal_travel', label: 'Personal and family travel', hint: 'Holidays with the same rigour as business trips' },
      { key: 'reservations', label: 'Reservations', hint: 'Restaurants, tickets, and the ones that are hard to get' },
      { key: 'household_admin', label: 'Household admin', hint: 'Insurance, subscriptions, renewals, bills' },
      { key: 'personal_shop', label: 'Personal shopping', hint: 'Sourcing and returning without supervision' },
      { key: 'property', label: 'Property coordination', hint: 'Second homes, rentals, and the people who look after them' },
      { key: 'staff_household', label: 'Household staff coordination', hint: 'Rotas, instructions, and standards' },
      { key: 'discretion_personal', label: 'Discretion in personal matters', hint: 'The reason this work needs the right person' },
      { key: 'wellness', label: 'Wellness and routine', hint: 'Trainers, appointments, and protecting the time for them' }
    ],
    details: [
      { key: 'household_scope', kind: 'text',
        ask: 'What does the personal side involve?',
        askTalent: 'What personal support have you provided?',
        placeholder: 'One home, two children, frequent family travel' },
      { key: 'personal_sensitivity', kind: 'choice',
        ask: 'How sensitive is the personal work?',
        askTalent: 'How sensitive has your personal work been?',
        options: ['Straightforward errands', 'Family and finances', 'Highly private matters'] }
    ]
  },

  {
    key: 'tech',
    name: 'Technical and systems',
    blurb: 'Keeping the tools working and joining them together.',
    aka: ['Technical Assistant', 'Systems Administrator', 'Automation Specialist'],
    comps: [
      { key: 'saas_admin', label: 'SaaS administration', hint: 'Accounts, permissions, licences, offboarding' },
      { key: 'integrations', label: 'Integrations', hint: 'Making two systems talk without a developer' },
      { key: 'zapier_deep', label: 'Automation platforms', hint: 'Zapier, Make, n8n — multi-step, with error handling' },
      { key: 'website_admin', label: 'Website maintenance', hint: 'Updates, plugins, uptime, small fixes' },
      { key: 'ecommerce', label: 'E-commerce platforms', hint: 'Shopify, WooCommerce — products, orders, apps' },
      { key: 'data_migration', label: 'Data migration', hint: 'Moving from one system to another without loss' },
      { key: 'security_hygiene', label: 'Security hygiene', hint: 'Password managers, 2FA, access reviews' },
      { key: 'ai_tools', label: 'AI tooling', hint: 'Using it well and knowing when not to' },
      { key: 'docs_tech', label: 'Technical documentation', hint: 'Writing down how the system actually works' },
      { key: 'troubleshoot_tech', label: 'Troubleshooting', hint: 'Working a problem methodically to its cause' },
      { key: 'no_code', label: 'No-code app building', hint: 'Airtable, Softr, Bubble, internal tools' },
      { key: 'backup', label: 'Backups and continuity', hint: 'Knowing what would be lost, and preventing it' }
    ],
    details: [
      { key: 'stack_tech', kind: 'text',
        ask: 'What is your stack?',
        askTalent: 'Which systems do you know deeply?',
        placeholder: 'Google Workspace, Shopify, Airtable, Zapier' },
      { key: 'tech_depth', kind: 'choice',
        ask: 'How technical is this role?',
        askTalent: 'How technical is your work?',
        options: ['Using tools well', 'Configuring and connecting them', 'Light scripting or code'] }
    ]
  }
];

export const DISCIPLINE = Object.fromEntries(DISCIPLINES.map(d => [d.key, d])) as Record<string, Discipline>;
export const compsOf = (key: string) => DISCIPLINE[key]?.comps ?? [];
