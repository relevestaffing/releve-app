import { redirect } from 'next/navigation';
import ConsoleTabs from '@/components/ConsoleTabs';
import Shell from '@/components/Shell';
import CampaignDesk from '@/components/CampaignDesk';
import { currentProfile } from '@/lib/supabase/server';
import { listCampaigns, listStats, mailingAddress, upcomingSlots, whenLabel } from '@/lib/campaigns';

export const metadata = { title: 'Email' };
export const dynamic = 'force-dynamic';

/* Relève's twice-weekly email. Claude writes each one two days ahead; it
   sends Tuesday and Thursday at 9:00 AM Pacific unless someone holds it. */
export default async function Campaigns() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const [campaigns, stats] = await Promise.all([listCampaigns(), listStats()]);
  const next = upcomingSlots(new Date(), 9).slice(0, 2).map(s => ({ slot: s.slot, when: whenLabel(s.sendAt.toISOString()) }));
  const rows = campaigns.map(c => ({ ...c, when: whenLabel(c.send_at) }));

  return (
    <Shell profile={profile} active="/console/content" title="Content" crumb="Email">
      <ConsoleTabs active="/console/campaigns" items={[
        { href: '/console/content', label: 'Posts' },
        { href: '/console/campaigns', label: 'Email' },
        { href: '/console/email-list', label: 'Email list' }
      ]} />

      <div className="card tight">
        <p className="small" style={{ margin: 0, maxWidth: 680 }}>
          <b>Relève&rsquo;s email, written for you.</b> Claude drafts each one two days ahead and
          emails you a preview. It goes to everyone on the list Tuesday and Thursday at 9:00 AM
          Pacific, from The Relève Letter, unless you hold it here. Edit anything you like
          before it sends.
        </p>
      </div>

      {!stats.ready && (
        <div className="card tight"><p className="small" style={{ margin: 0 }}>
          <b>One step left:</b> the campaigns tables (part 54) are not in the database yet.
        </p></div>
      )}
      {stats.ready && !mailingAddress() && (
        <div className="card tight"><p className="small" style={{ margin: 0 }}>
          <span className="pill warn">Sending is paused</span>&nbsp; Every marketing email must show a
          mailing address. Add it in Netlify as <code>CAMPAIGN_MAILING_ADDRESS</code> and sending turns
          on by itself. Until then drafts are still written and previewed, and held at send time.
        </p></div>
      )}

      <div className="grid-4">
        <div className="card stat"><div className="eyebrow">On the list</div><div className="score">{stats.subscribed}</div></div>
        <div className="card stat"><div className="eyebrow">Unsubscribed</div><div className="score">{stats.unsubscribed}</div></div>
        <div className="card stat"><div className="eyebrow">Sent so far</div><div className="score">{campaigns.filter(c => c.status === 'sent').length}</div></div>
        <div className="card stat"><div className="eyebrow">Next send</div><div className="small" style={{ marginTop: 10 }}>{next[0]?.when ?? ''}</div></div>
      </div>

      <p className="small" style={{ margin: '4px 0 18px' }}><a href="/console/email-list">See everyone on the list, and unsubscribe someone by hand &rarr;</a></p>

      <CampaignDesk campaigns={rows as any} me={profile.email} ready={stats.ready} />
    </Shell>
  );
}
