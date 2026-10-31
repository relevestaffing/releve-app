'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import { supabaseBrowser } from '@/lib/supabase/client';
import { CHANNELS, STATUS_LABEL, STATUS_PILL, type ContentPost, type Slide } from '@/lib/content-model';

/* The Content tab (30 October 2026). One week at a time: everything Claude
   drafted, what posts itself, and what needs a person, with the connections
   and the four LinkedIn groups set up at the top. */

type Row = ContentPost & {
  when: string; day: string; images: string[]; pdf: string | null; imageSrc: string | null; videoSrc: string | null;
};
type Props = {
  week: string; thisWeek: string; prevWeek: string; nextWeek: string;
  posts: Row[]; groups: { name: string; url: string }[];
  meta: { pages: { id: string; name: string; ig: string | null }[]; client: string | null; careers: string | null; user: string | null } | null;
  linkedin: { name: string; expires_at: string; pages: boolean } | null;
  setup: { ready: boolean; metaApp: boolean; linkedinApp: boolean; pageAccess: boolean; ai: boolean };
  draftNext: { status: string; at: string; error?: string } | null;
  va: { status: string; at: string; error?: string; files?: number } | null;
  sageStyle: string;
  flash: { connected: string | null; error: string | null; setup: string | null };
};

async function post(action: string, body: Record<string, unknown> = {}) {
  const r = await fetch('/api/admin/content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'That did not work.');
  return j;
}

function fmtWeek(w: string) {
  const d = new Date(`${w}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export default function ContentDesk(props: Props) {
  const router = useRouter();
  const { posts, setup, meta, linkedin } = props;
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  async function run(key: string, action: string, body: Record<string, unknown> = {}, okText?: string) {
    setBusy(key);
    try { const j = await post(action, body); if (okText) toast.ok(okText); router.refresh(); return j; }
    catch (e: any) { toast.bad(e?.message); }
    finally { setBusy(''); }
  }

  const count = (f: (p: Row) => boolean) => posts.filter(f).length;
  const needsYou = count(p => ['needs_image', 'needs_video', 'manual', 'failed'].includes(p.status));
  const days = Array.from(new Set(posts.map(p => p.day)));
  const liDays = linkedin ? Math.floor((new Date(linkedin.expires_at).getTime() - Date.now()) / 86400000) : null;
  const drafting = props.draftNext?.status === 'drafting';

  /* What is left to set up, in order. Each line disappears once done. */
  const todo: { text: React.ReactNode; action?: React.ReactNode }[] = [];
  if (!setup.ready) todo.push({ text: <>Run <code>part55-content.sql</code> in Supabase to create the content tables.</> });
  if (!setup.ai) todo.push({ text: <>Claude writes the posts with the Anthropic key (<code>ANTHROPIC_API_KEY</code> in Netlify).</> });
  if (!setup.metaApp) todo.push({ text: <>Instagram + Facebook: add <code>META_APP_ID</code> and <code>META_APP_SECRET</code> in Netlify (the setup guide is in the Relève Book).</> });
  else if (!meta) todo.push({ text: 'Connect the Relève Instagram and Facebook pages.', action: <a className="btn sm solid" href="/api/content/connect/meta">Connect Instagram + Facebook</a> });
  if (!setup.linkedinApp) todo.push({ text: <>LinkedIn: add <code>LINKEDIN_CLIENT_ID</code> and <code>LINKEDIN_CLIENT_SECRET</code> in Netlify.</> });
  else if (!linkedin) todo.push({ text: "Connect Sage's LinkedIn.", action: <a className="btn sm solid" href="/api/content/connect/linkedin">Connect LinkedIn</a> });
  if (!props.groups.some(g => g.name || g.url)) todo.push({ text: 'Add the four LinkedIn groups below, so the morning email links straight to each one.' });

  return (
    <div className="stack">
      {props.flash.connected && <div className="card tight"><p className="small" style={{ margin: 0 }}>{props.flash.connected === 'meta' ? 'Instagram and Facebook are connected.' : 'LinkedIn is connected.'}</p></div>}
      {props.flash.error && <div className="card tight"><p className="small" style={{ margin: 0 }}><span className="pill crit">Not connected</span>&nbsp; {props.flash.error}</p></div>}

      {todo.length > 0 && (
        <div className="card">
          <div className="card-head"><div><div className="crumb">Setup</div><h3>{todo.length === 1 ? 'One step left' : `${todo.length} steps left`}</h3></div></div>
          {todo.map((t, i) => (
            <div key={i} className="row between" style={{ gap: 16, padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 'none', flexWrap: 'wrap' }}>
              <span className="small">{t.text}</span>{t.action}
            </div>
          ))}
        </div>
      )}

      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <a className="btn sm ghost" href={`/console/content?week=${props.prevWeek}`}>&larr; Earlier</a>
          <span className="small" style={{ minWidth: 190, textAlign: 'center' }}>
            Week of {fmtWeek(props.week)}{props.week === props.thisWeek ? ' (this week)' : ''}
          </span>
          <a className="btn sm ghost" href={`/console/content?week=${props.nextWeek}`}>Later &rarr;</a>
        </div>
        <button className="btn sm" disabled={!!busy || drafting || !setup.ready}
          onClick={() => run('draft', 'draft_week', { week: props.week === props.thisWeek ? props.nextWeek : props.week },
            'Claude is writing the week. It takes a few minutes; the preview email follows.')}>
          {drafting ? 'Writing the week…' : posts.length ? 'Fill any empty slots' : 'Write this week now'}
        </button>
      </div>
      {posts.some(p => p.channel === 'li_group' || p.channel.startsWith('li_page')) && (
        <div className="row between" style={{ gap: 12, flexWrap: 'wrap', margin: '-10px 0 0' }}>
          <span className="small muted">
            {props.va?.status === 'done' ? `Sent to the VA's Doc and Drive folder ${new Date(props.va.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
              : props.va?.status === 'sending' ? 'Sending to the VA…'
              : props.va?.status === 'failed' ? <><span className="pill crit">Not sent to the VA</span> {props.va.error}</>
              : "The VA's captions and files go to her Google Doc and Drive folder every Sunday at 8:00 AM Pacific."}
          </span>
          <button className="btn sm ghost" disabled={!!busy || props.va?.status === 'sending'}
            onClick={() => run('va', 'send_va', { week: props.week }, 'Sending to the VA. It takes a minute.')}>
            {props.va?.status === 'done' ? 'Send again' : 'Send to the VA'}
          </button>
        </div>
      )}
      {props.draftNext?.status === 'failed' && <p className="small" style={{ margin: '-18px 0 0' }}><span className="pill crit">Drafting stopped</span> {props.draftNext.error}</p>}

      <div className="grid-4">
        <div className="card stat"><div className="eyebrow">This week</div><div className="score">{posts.length}</div></div>
        <div className="card stat"><div className="eyebrow">Posts itself</div><div className="score">{count(p => p.status === 'scheduled')}</div></div>
        <div className="card stat"><div className="eyebrow">Needs you</div><div className="score">{needsYou}</div></div>
        <div className="card stat"><div className="eyebrow">Posted</div><div className="score">{count(p => p.status === 'posted')}</div></div>
      </div>

      {!posts.length && (
        <div className="card tight"><p className="small muted" style={{ margin: 0 }}>
          Nothing drafted for this week. Claude writes each week on Thursday morning and emails you the preview.
          {setup.ready ? ' You can also write it now.' : ''}
        </p></div>
      )}

      {days.map(day => (
        <div key={day}>
          <h2 style={{ margin: '0 0 12px' }}>{day}</h2>
          <div className="stack" style={{ gap: 12 }}>
            {posts.filter(p => p.day === day).map(p => (
              <PostCard key={p.id} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)}
                groups={props.groups} busy={busy} run={run} />
            ))}
          </div>
        </div>
      ))}

      <Connections meta={meta} linkedin={linkedin} liDays={liDays} setup={setup} run={run} busy={busy} />
      <Style text={props.sageStyle} run={run} busy={busy} />
      <Groups groups={props.groups} run={run} busy={busy} />
    </div>
  );
}

/* ---------- one post ---------- */

function PostCard({ p, open, onToggle, groups, busy, run }: {
  p: Row; open: boolean; onToggle: () => void; groups: { name: string; url: string }[];
  busy: string; run: (k: string, a: string, b?: Record<string, unknown>, ok?: string) => Promise<any>;
}) {
  const [caption, setCaption] = useState(p.caption);
  const [captionFb, setCaptionFb] = useState(p.caption_fb ?? '');
  const [card, setCard] = useState(p.card ?? { kicker: '', quote: '', sub: '' });
  const [slidesText, setSlidesText] = useState((p.slides ?? []).map(s => `${s.title}\n${s.body}`).join('\n\n'));
  const [uploading, setUploading] = useState(false);
  const done = p.status === 'posted' || p.status === 'publishing';
  const isCopy = Boolean(p.parent_id);

  async function upload(file: File, kind: 'image' | 'video') {
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || (kind === 'image' ? 'jpg' : 'mp4')).toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${p.id}/${Date.now()}.${ext}`;
      const { error } = await supabaseBrowser().storage.from('content').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      await run('up' + p.id, kind === 'image' ? 'set_image' : 'set_video', { id: p.id, path }, kind === 'image' ? 'Picture added. It posts on schedule.' : 'Video added. Its Instagram and LinkedIn copies are ready.');
    } catch (e: any) { toast.bad(`The upload did not finish. ${e?.message ?? ''}`); }
    setUploading(false);
  }

  function save() {
    const body: Record<string, unknown> = { id: p.id, caption };
    if (p.channel.startsWith('ig_')) body.caption_fb = captionFb;
    if (p.format === 'card') body.card = card;
    if (p.format === 'carousel') body.slides = slidesText.split(/\n\s*\n/).map(b => {
      const [title, ...rest] = b.trim().split('\n'); return { title: title ?? '', body: rest.join(' ') } as Slide;
    });
    return run('save' + p.id, 'edit', body, 'Saved');
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => toast.ok('Copied'), () => toast.bad('Could not copy.'));
  }

  const ticks = p.results?.groups ?? {};
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="row between" style={{ gap: 16, cursor: 'pointer', alignItems: 'flex-start' }} onClick={onToggle}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{p.when.replace(/^\w+, /, '')} · {CHANNELS[p.channel].label}{p.format === 'video' ? ' · video' : p.format === 'carousel' ? ` · carousel of ${p.slides.length}` : ''}</div>
          <div style={{ fontSize: 17, marginTop: 4 }}>{p.hook || p.topic}</div>
          {p.error && p.status !== 'posted' && <div className="small" style={{ marginTop: 4 }}>{p.error}</div>}
        </div>
        <span className={STATUS_PILL[p.status]}>{STATUS_LABEL[p.status]}</span>
      </div>

      {open && (
        <div style={{ marginTop: 18 }}>
          {p.images.length > 0 && (
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
              {p.images.map((src, i) => <a key={i} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Graphic ${i + 1}`} width={162} height={203} loading="lazy" style={{ display: 'block', border: '1px solid var(--line)' }} /></a>)}
            </div>
          )}

          {p.channel === 'li_personal' && (
            <div className="ff">
              <label>Your picture</label>
              {p.imageSrc ? <img src={p.imageSrc} alt="Chosen picture" style={{ maxWidth: 260, display: 'block', marginBottom: 8, border: '1px solid var(--line)' }} /> : null}
              {p.image_idea && <span className="xs muted">Idea: {p.image_idea}</span>}
              {!done && <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'image'); e.target.value = ''; }} />}
            </div>
          )}

          {p.format === 'video' && p.script && (
            <div className="ff">
              <label>Video script{isCopy ? ' (recorded once, for the group post)' : ''}</label>
              <div className="small" style={{ lineHeight: 1.7 }}>
                <p style={{ margin: '0 0 8px' }}><b>Open:</b> {p.script.hook}</p>
                {p.script.beats.map((b, i) => <p key={i} style={{ margin: '0 0 8px' }}>{i + 1}. {b}</p>)}
                <p style={{ margin: '0 0 8px' }}><b>Close:</b> {p.script.close}</p>
                {p.script.onscreen.length > 0 && <p className="muted" style={{ margin: 0 }}>On screen: {p.script.onscreen.join(' · ')}</p>}
              </div>
              {p.videoSrc ? <a className="small" href={p.videoSrc} target="_blank" rel="noreferrer">Your video</a> : null}
              {!done && <input type="file" accept="video/mp4,video/quicktime" disabled={uploading} style={{ marginTop: 8 }}
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'video'); e.target.value = ''; }} />}
              {uploading && <span className="xs muted">Uploading, keep this open…</span>}
            </div>
          )}

          {p.format === 'card' && !done && (
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="ff" style={{ flex: '0 1 200px' }}><label>Label</label><input value={card.kicker} onChange={e => setCard({ ...card, kicker: e.target.value })} /></div>
              <div className="ff" style={{ flex: '1 1 320px' }}><label>Line on the graphic</label><input value={card.quote} onChange={e => setCard({ ...card, quote: e.target.value })} /></div>
              <div className="ff" style={{ flex: '1 1 240px' }}><label>Second line</label><input value={card.sub ?? ''} onChange={e => setCard({ ...card, sub: e.target.value })} /></div>
            </div>
          )}
          {p.format === 'carousel' && !done && (
            <div className="ff"><label>Slides <span className="muted">(title on the first line, then the text; a blank line between slides)</span></label>
              <textarea rows={10} value={slidesText} onChange={e => setSlidesText(e.target.value)} /></div>
          )}

          <div className="ff"><label>{p.channel.startsWith('ig_') ? 'Instagram caption' : 'Post'}</label>
            <textarea rows={p.channel === 'li_personal' ? 12 : 8} value={caption} readOnly={done} onChange={e => setCaption(e.target.value)} /></div>
          {p.channel.startsWith('ig_') && (
            <div className="ff"><label>Facebook caption</label><textarea rows={5} value={captionFb} readOnly={done} onChange={e => setCaptionFb(e.target.value)} /></div>
          )}

          {p.channel === 'li_group' && (
            <div className="ff"><label>Posted in</label>
              {groups.map((g, i) => (
                <label key={i} className="check-line">
                  <input type="checkbox" checked={Boolean(ticks[i])} disabled={!!busy}
                    onChange={e => run('g' + p.id + i, 'group_tick', { id: p.id, i, on: e.target.checked })} />
                  <span>{g.url ? <a href={g.url} target="_blank" rel="noreferrer">{g.name || `Group ${i + 1}`}</a> : (g.name || `Group ${i + 1}`)}</span>
                </label>
              ))}
            </div>
          )}

          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {!done && <button className="btn sm solid" disabled={!!busy} onClick={save}>Save</button>}
            <button className="btn sm ghost" onClick={() => copy(caption)}>Copy the words</button>
            {p.pdf && <a className="btn sm ghost" href={p.pdf}>Download PDF</a>}
            {p.images.length === 1 && <a className="btn sm ghost" href={p.images[0].replace('fmt=png', 'fmt=jpg')} download>Download graphic</a>}
            {!done && !isCopy && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('re' + p.id, 'redraft', { id: p.id }, 'Rewriting. Refresh in a minute.')}>Rewrite it</button>}
            {['scheduled', 'needs_image', 'needs_video', 'manual'].includes(p.status) && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('h' + p.id, 'hold', { id: p.id }, 'Held')}>Hold</button>}
            {p.status === 'held' && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('r' + p.id, 'resume', { id: p.id }, 'Back on schedule')}>Release the hold</button>}
            {(p.status === 'scheduled' || p.status === 'failed') && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('n' + p.id, p.status === 'failed' ? 'retry' : 'post_now', { id: p.id }, 'Posting now')}>{p.status === 'failed' ? 'Try again' : 'Post now'}</button>}
            {p.status === 'manual' && p.channel !== 'li_group' && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('m' + p.id, 'mark_posted', { id: p.id }, 'Marked as posted')}>Mark as posted</button>}
            {!done && p.status !== 'skipped' && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('s' + p.id, 'skip', { id: p.id }, 'Skipped')}>Skip</button>}
          </div>
          <p className="xs muted" style={{ marginTop: 10 }}>{CHANNELS[p.channel].where}. {p.written_by === 'team' ? 'Edited by the team.' : 'Written by Claude.'}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- connections ---------- */

function Connections({ meta, linkedin, liDays, setup, run, busy }: {
  meta: Props['meta']; linkedin: Props['linkedin']; liDays: number | null; setup: Props['setup'];
  run: (k: string, a: string, b?: Record<string, unknown>, ok?: string) => Promise<any>; busy: string;
}) {
  const [client, setClient] = useState(meta?.client ?? '');
  const [careers, setCareers] = useState(meta?.careers ?? '');
  return (
    <div className="card">
      <div className="card-head"><div><div className="crumb">Where it posts</div><h3>Connected accounts</h3></div></div>
      <div className="ff"><label>Instagram + Facebook</label>
        {meta ? (
          <>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="ff" style={{ flex: '1 1 240px', marginBottom: 0 }}><label>Relève (clients)</label>
                <select value={client} onChange={e => setClient(e.target.value)}>
                  <option value="">Not chosen</option>
                  {meta.pages.map(p => <option key={p.id} value={p.id}>{p.name}{p.ig ? ` · @${p.ig}` : ' · no Instagram linked'}</option>)}
                </select></div>
              <div className="ff" style={{ flex: '1 1 240px', marginBottom: 0 }}><label>Careers</label>
                <select value={careers} onChange={e => setCareers(e.target.value)}>
                  <option value="">Not chosen</option>
                  {meta.pages.map(p => <option key={p.id} value={p.id}>{p.name}{p.ig ? ` · @${p.ig}` : ' · no Instagram linked'}</option>)}
                </select></div>
              <button className="btn sm" disabled={!!busy} onClick={() => run('map', 'map_meta', { client: client || null, careers: careers || null }, 'Saved')}>Save</button>
            </div>
            {!meta.careers && <span className="xs muted" style={{ display: 'block' }}>Careers posts are paused. Choose a careers page here and they start again with the next week Claude writes.</span>}
            <span className="xs muted">Connected{meta.user ? ` by ${meta.user}` : ''}. <a href="/api/content/connect/meta">Reconnect</a></span>
          </>
        ) : setup.metaApp ? <a className="btn sm solid" href="/api/content/connect/meta">Connect Instagram + Facebook</a>
          : <span className="small muted">Waiting on META_APP_ID and META_APP_SECRET in Netlify.</span>}
      </div>
      <div className="ff"><label>Sage&rsquo;s LinkedIn{setup.pageAccess ? ' and the Relève pages' : ''}</label>
        {linkedin ? (
          <span className="small">Connected as {linkedin.name}. {liDays !== null && liDays <= 7
            ? <><span className="pill warn">Reconnect {liDays <= 0 ? 'now' : `within ${liDays} days`}</span> <a href="/api/content/connect/linkedin">Reconnect</a></>
            : <span className="muted">Good for {liDays} more days. <a href="/api/content/connect/linkedin">Reconnect</a></span>}</span>
        ) : setup.linkedinApp ? <a className="btn sm solid" href="/api/content/connect/linkedin">Connect LinkedIn</a>
          : <span className="small muted">Waiting on LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in Netlify.</span>}
        {!setup.pageAccess && <span className="xs muted" style={{ display: 'block', marginTop: 6 }}>The LinkedIn pages are prepared for LinkedIn&rsquo;s own scheduler until LinkedIn approves page access for the Relève app.</span>}
      </div>
    </div>
  );
}

/* ---------- how Sage's posts are built ---------- */

function Style({ text, run, busy }: { text: string; run: (k: string, a: string, b?: Record<string, unknown>, ok?: string) => Promise<any>; busy: string }) {
  const [v, setV] = useState(text);
  return (
    <div className="card">
      <div className="card-head"><div><div className="crumb">Claude follows this</div><h3>How Sage&rsquo;s LinkedIn posts are built</h3></div></div>
      <div className="ff"><label>The structure to follow <span className="muted">(paste a reference post or the script of a reel you like, and any notes)</span></label>
        <textarea rows={8} value={v} onChange={e => setV(e.target.value)} /></div>
      <button className="btn sm solid" disabled={!!busy} onClick={() => run('style', 'style', { channel: 'li_personal', text: v }, 'Saved. The next drafts follow it.')}>Save</button>
    </div>
  );
}

/* ---------- the four groups ---------- */

function Groups({ groups, run, busy }: { groups: { name: string; url: string }[]; run: (k: string, a: string, b?: Record<string, unknown>, ok?: string) => Promise<any>; busy: string }) {
  const [list, setList] = useState(groups.map(g => ({ ...g })));
  return (
    <div className="card">
      <div className="card-head"><div><div className="crumb">Training posts go here</div><h3>The four LinkedIn groups</h3></div></div>
      {list.map((g, i) => (
        <div key={i} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="ff" style={{ flex: '1 1 220px' }}><label>Group {i + 1}</label>
            <input value={g.name} placeholder="Name" onChange={e => setList(list.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></div>
          <div className="ff" style={{ flex: '2 1 320px' }}><label>Link</label>
            <input value={g.url} placeholder="https://www.linkedin.com/groups/..." onChange={e => setList(list.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} /></div>
        </div>
      ))}
      <button className="btn sm solid" disabled={!!busy} onClick={() => run('groups', 'groups', { list }, 'Groups saved')}>Save the groups</button>
    </div>
  );
}
