/* What the founder's assistant needs that the Book does not carry yet:
   how the live systems fit together, and where to look for each kind of
   answer. Founder seat only. Keep current when a system changes. No em dashes. */

export const NOTES = `
# Where to look for what (use the lookup tools, do not guess)
- Anything stored in the app (placements, tasks, messages, applications, prospects and leads, offers, payments, check-ins, email log, subscribers, content posts): db_tables, then db_query. Use describe=true to see columns.
- The VA's work: the hand-posted LinkedIn group and LinkedIn page posts go to the VA's Google Doc (va_doc) and Drive folder (va_drive). va_export_status says whether the weekly send ran. The VA works US hours and posts by hand.
- Email to or from hello@relevestaffing.com: inbox_search, then inbox_read.
- Instagram, Facebook and LinkedIn connections and tokens' expiry: social_status.
- Decisions, terms, brand, standing rules: book.
- A single person: find_person, then account_summary.

# The content engine (live)
- Cadence: 6 personal LinkedIn posts a week (Sage's), a training post or carousel for 4 LinkedIn groups 5 times a week, 6 Instagram and Facebook posts a week for the client account, 6 copies for the Relève LinkedIn page, careers posting paused until the careers page is connected.
- The Thursday 9 AM PT cron drafts the next week. Posts wait as held until she approves the week in the Content tab ("Approve the week"), which also sends the group and page copies to the VA.
- The VA gets the week every Sunday from 8 AM PT (once per week per week) into the Doc tab "SOCIAL MEDIA POSTS" and a "Week of ..." subfolder of the Drive folder. An unapproved or paused week (content_settings key va:YYYY-MM-DD with status done and files 0) is not sent.
- Sage's personal LinkedIn is photo-first: she uploads her own candid photos, Claude writes each post around the photo.
- Post statuses: scheduled, needs_image, needs_video, held, posted, skipped, failed. Channels: li_personal, li_group, ig_client, ig_careers, li_page_client, li_page_careers.
- Every post must apply to any business owner, never one industry.

# Other live systems
- The Relève Letter: twice-weekly newsletter to subscribers, written in Sage's first person, approved or held in the console.
- Push notifications: live for every user who adds the app to the home screen and enables them.
- Talent payouts: PayPal and Wise buttons in Billing; money never moves without her confirm.
- Anything Relève runs only through Relève accounts (relevestaffing.com), never Nona Djavid's accounts.
`;
