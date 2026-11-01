'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import { supabaseBrowser } from '@/lib/supabase/client';
import { CHANNELS, STATUS_LABEL, STATUS_PILL, type ContentPost, type Slide } from '@/lib/content-model';

/* The Content tab. One week at a time: the week at a glance, the day you are
   looking at, and every post for that day as a card you open in place. The
   one-time setup (connections, Sage's style, the four groups) lives folded
   away at the bottom, because the day-to-day job is reading and releasing the
   week, not configuring it. Rebuilt 1 November 2026 for a calmer, more
   finished feel: thumbnails on every row, a day rail that lifts, and an
   editor that opens with the app's own motion. */

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
  va: { status: string; at: string; error?: string; files?: number; when?: string } | null;
  liDays: number | null;
  today: string;
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

const NEEDS = ['needs_image', 'needs_video', 'manual', 'failed'];
const needsDot = (s: string) => ['needs_image', 'needs_video', 'failed', 'held'].includes(s);

/* One easy step a week: pick all your personal photos at once and they fill
   the week's six personal slots in order, each written from its photo. */
function PhotoWeek({ posts, onRefresh }: { posts: Row[]; onRefresh: () => void }) {
  const personal = posts
    .filter(p => p.channel === 'li_personal' && !p.parent_id && p.status !== 'skipped')
    .sort((a, b) => (a.publish_at < b.publish_at ? -1 : 1));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  if (!personal.length) return null;
  const filled = personal.filter(p => p.image_path).length;

  async function uploadTo(target: Row, file: File) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${target.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await supabaseBrowser().storage.from('content').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(error.message);
    await post('set_image', { id: target.id, path });
  }

  async function onPick(files: FileList) {
    const chosen = Array.from(files);
    /* Fill the empty slots first, in day order; if she picked more than are
       empty, the rest replace from the top. */
    const empties = personal.filter(p => !p.image_path);
    const targets = (empties.length ? empties.concat(personal.filter(p => p.image_path)) : personal);
    setBusy(true);
    try {
      for (let i = 0; i < chosen.length && i < targets.length; i++) {
        setProgress(`Uploading ${i + 1} of ${Math.min(chosen.length, targets.length)}\u2026`);
        await uploadTo(targets[i], chosen[i]);
      }
      toast.ok('Photos uploaded. Each post is being written from its photo, give it a moment.');
      onRefresh();
    } catch (e: any) { toast.bad(`Upload stopped. ${e?.message ?? ''}`); }
    setBusy(false); setProgress('');
  }

  return (
    <div className="card">
      <div className="card-head"><div><div className="crumb">Your personal LinkedIn</div><h3>Photos for this week</h3></div></div>
      <p className="small muted" style={{ marginTop: 4 }}>
        Pick your candid photos for the week in one go. Each post is written around its photo, for you to approve. {filled} of {personal.length} added.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 14px' }}>
        {personal.map((p, i) => (
          <div key={p.id} title={p.day} style={{ width: 74, height: 74, border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', position: 'relative', background: '#F3EFE6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {p.imageSrc
              ? <img src={p.imageSrc} alt={p.day} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#8A9A8C' }}>{p.day || `#${i + 1}`}</span>}
          </div>
        ))}
      </div>
      <label className="btn sm solid" style={{ cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
        {busy ? (progress || 'Uploading\u2026') : (filled ? 'Add or replace photos' : "Add this week's photos")}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} style={{ display: 'none' }}
          onChange={e => { if (e.target.files && e.target.files.length) onPick(e.target.files); e.target.value = ''; }} />
      </label>
    </div>
  );
}

export default function ContentDesk(props: Props) {
  const router = useRouter();
  const { posts, setup, meta, linkedin } = props;
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  async function run(key: string, action: string, body: Record<string, unknown> = {}, okText?: string) {
    setBusy(key);
    try { const j = await post(action, body); if (okText) toast.ok(okText); router.refresh(); return j; }
    catch (e: any) { toast.bad(e?.message); }
    finally { setBusy(''); }
  }

  const count = (f: (p: Row) => boolean) => posts.filter(f).length;
  const needsYou = count(p => NEEDS.includes(p.status));
  const held = count(p => p.status === 'held');
  const days = Array.from(new Set(posts.map(p => p.day)));
  const liDays = props.liDays;  // worked out on the server, so the page hydrates cleanly
  const drafting = props.draftNext?.status === 'drafting';
  const hasVa = posts.some(p => p.channel === 'li_group' || p.channel.startsWith('li_page'));

  /* What is left to set up, in order. Each line disappears once done. */
  const todo: { text: React.ReactNode; action?: React.ReactNode }[] = [];
  if (!setup.ready) todo.push({ text: <>Run <code>part55-content.sql</code> in Supabase to create the content tables.</> });
  if (!setup.ai) todo.push({ text: <>Claude writes the posts with the Anthropic key (<code>ANTHROPIC_API_KEY</code> in Netlify).</> });
  if (!setup.metaApp) todo.push({ text: <>Instagram + Facebook: add <code>META_APP_ID</code> and <code>META_APP_SECRET</code> in Netlify (the setup guide is in the Relève Book).</> });
  else if (!meta) todo.push({ text: 'Connect the Relève Instagram and Facebook pages.', action: <a className="btn sm solid" href="/api/content/connect/meta">Connect Instagram + Facebook</a> });
  if (!setup.linkedinApp) todo.push({ text: <>LinkedIn: add <code>LINKEDIN_CLIENT_ID</code> and <code>LINKEDIN_CLIENT_SECRET</code> in Netlify.</> });
  else if (!linkedin) todo.push({ text: "Connect Sage's LinkedIn.", action: <a className="btn sm solid" href="/api/content/connect/linkedin">Connect LinkedIn</a> });
  if (!props.groups.some(g => g.name || g.url)) todo.push({ text: 'Add the four LinkedIn groups below, so the morning email links straight to each one.' });

  const needsSetup = todo.length > 0 || !meta || !linkedin;

  return (
    <div className="stack cd">
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

      {/* ---- the week, and the one action ---- */}
      <div className="card cd-top">
        <div className="cd-weeknav">
          <a className="cd-nudge" aria-label="Earlier week" href={`/console/content?week=${props.prevWeek}`}>{'‹'}</a>
          <div className="cd-wk">
            <span className="crumb">{props.week === props.thisWeek ? 'This week' : (props.week > props.thisWeek ? 'Upcoming' : 'Earlier')}</span>
            <span className="wk-name">Week of {fmtWeek(props.week)}</span>
          </div>
          <a className="cd-nudge" aria-label="Later week" href={`/console/content?week=${props.nextWeek}`}>{'›'}</a>
        </div>
        <button className="btn sm" disabled={!!busy || drafting || !setup.ready}
          onClick={() => run('draft', 'draft_week', { week: props.week === props.thisWeek ? props.nextWeek : props.week },
            'Claude is writing the week. It takes a few minutes; the preview email follows.')}>
          {drafting ? 'Writing the week…' : posts.length ? 'Fill any empty slots' : 'Write this week now'}
        </button>
      </div>

      {/* ---- the week at a glance ---- */}
      <div className="grid-4">
        <div className="card stat"><div className="eyebrow">This week</div><div className="score">{count(p => p.status !== 'skipped')}</div></div>
        <div className="card stat"><div className="eyebrow">Posts itself</div><div className="score">{count(p => p.status === 'scheduled')}</div></div>
        <div className="card stat"><div className="eyebrow">Needs you</div><div className="score">{needsYou}</div></div>
        <div className="card stat"><div className="eyebrow">Posted</div><div className="score">{count(p => p.status === 'posted')}</div></div>
      </div>

      {/* ---- the one thing to do: release the held week ---- */}
      {held > 0 && (
        <div className="card dark cd-approve">
          <div>
            <div className="crumb" style={{ color: 'var(--pale)' }}>Waiting on you</div>
            <h3 style={{ margin: '4px 0 0' }}>{held} {held === 1 ? 'post is' : 'posts are'} held</h3>
            <p className="small" style={{ margin: '8px 0 0', color: '#D9DDD4', maxWidth: '52ch' }}>
              Nothing posts, and the group and page posts do not go to the VA, until you release the week. Read through the days below, then approve.
            </p>
          </div>
          <button className="btn on-dark" disabled={!!busy} onClick={() => run('approve', 'approve_week', { week: props.week }, 'Approved. Everything is back on schedule.')}>
            {busy === 'approve' ? 'Approving…' : 'Approve the week'}
          </button>
        </div>
      )}
      {props.draftNext?.status === 'failed' && <p className="small" style={{ margin: '-8px 0 0' }}><span className="pill crit">Drafting stopped</span> {props.draftNext.error}</p>}

      {props.week >= props.thisWeek && <PhotoWeek posts={posts} onRefresh={() => router.refresh()} />}

      {/* ---- the week ---- */}
      {posts.length > 0 ? (
        <DayRail days={days} today={props.today} posts={posts} showSkipped={showSkipped} setShowSkipped={setShowSkipped}
          render={(list) => (
            <div className="cd-list">
              {list.map(p => (
                <PostCard key={`${p.id}-${p.updated_at}`} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)}
                  onClose={() => setOpen(null)} groups={props.groups} busy={busy} run={run} />
              ))}
            </div>
          )} />
      ) : (
        <div className="card cd-empty">
          <div className="empty-mark" aria-hidden="true" />
          <p className="small muted" style={{ margin: '14px 0 0' }}>
            Nothing drafted for this week yet. Claude writes each week on Thursday morning and emails you the preview.
            {setup.ready ? ' You can also write it now with the button above.' : ''}
          </p>
        </div>
      )}

      {/* ---- the VA's weekly delivery (quiet line) ---- */}
      {hasVa && (
        <div className="cd-va">
          <span className="small muted">
            {props.va?.status === 'done' ? `Group and page posts sent to the VA's Doc and Drive ${props.va.when ?? ''}.`
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

      {/* ---- one-time setup, folded away ---- */}
      <details className="cd-more" open={needsSetup}>
        <summary><span className="crumb">Setup</span><span className="sum-title">Connections, Sage{'’'}s style, and the four groups</span><span className="sum-caret" aria-hidden="true">{'›'}</span></summary>
        <div className="stack" style={{ marginTop: 16, gap: 16 }}>
          <Connections meta={meta} linkedin={linkedin} liDays={liDays} setup={setup} run={run} busy={busy} />
          <Style text={props.sageStyle} run={run} busy={busy} />
          <Groups groups={props.groups} run={run} busy={busy} />
        </div>
      </details>
    </div>
  );
}

/* ---------- the week, one tab per day ---------- */

function DayRail({ days, today, posts, showSkipped, setShowSkipped, render }: {
  days: string[]; today: string; posts: Row[]; showSkipped: boolean; setShowSkipped: (v: boolean) => void;
  render: (list: Row[]) => React.ReactNode;
}) {
  const [day, setDay] = useState(days.includes(today) ? today : days[0]);
  const current = days.includes(day) ? day : days[0];
  const ofDay = posts.filter(p => p.day === current);
  const skipped = ofDay.filter(p => p.status === 'skipped');
  const list = showSkipped ? ofDay : ofDay.filter(p => p.status !== 'skipped');
  const short = (d: string) => d.split(',')[0].slice(0, 3);
  const date = (d: string) => (d.split(', ')[1] ?? '').replace(/^(\w{3})\w*/, '$1');
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="cd-railwrap"><div role="tablist" aria-label="Days of the week" className="cd-rail">
        {days.map(d => {
          const n = posts.filter(p => p.day === d && p.status !== 'skipped').length;
          const needs = posts.filter(p => p.day === d && needsDot(p.status)).length;
          const on = d === current;
          return (
            <button key={d} role="tab" aria-selected={on} className="cd-day" onClick={() => setDay(d)}>
              {needs ? <span className="cd-day-dot" aria-label={`${needs} need you`} /> : null}
              <span className="dow">{d === today ? 'Today' : short(d)}</span>
              <span className="dt">{date(d)}</span>
              <span className="ct">{n} post{n === 1 ? '' : 's'}</span>
            </button>
          );
        })}
      </div></div>
      <div className="row between" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 className="cd-dayhead" style={{ margin: 0 }}>{current}</h2>
        {skipped.length > 0 && (
          <button className="btn sm ghost" onClick={() => setShowSkipped(!showSkipped)}>
            {showSkipped ? 'Hide skipped' : `Show skipped (${skipped.length})`}
          </button>
        )}
      </div>
      <div key={current} className="cd-dayfade">
        {list.length ? render(list) : <p className="small muted" style={{ margin: 0 }}>Nothing posts this day.</p>}
      </div>
    </div>
  );
}

/* ---------- one post ---------- */

function Thumb({ p }: { p: Row }) {
  const src = p.images[0] ?? p.imageSrc ?? null;
  if (src) return <span className="cd-thumb" style={{ backgroundImage: `url(${src})` }} aria-hidden="true">
    {p.format === 'carousel' && p.images.length > 1 ? <span className="cd-thumb-n">{p.images.length}</span> : null}
  </span>;
  const glyph = p.format === 'video' ? '▶' : p.format === 'carousel' ? '☰' : p.channel === 'li_personal' ? '✎' : '▭';
  return <span className="cd-thumb ph" aria-hidden="true">{glyph}</span>;
}

function PostCard({ p, open, onToggle, onClose, groups, busy, run }: {
  p: Row; open: boolean; onToggle: () => void; onClose: () => void; groups: { name: string; url: string }[];
  busy: string; run: (k: string, a: string, b?: Record<string, unknown>, ok?: string) => Promise<any>;
}) {
  const [caption, setCaption] = useState(p.caption);
  const [captionFb, setCaptionFb] = useState(p.caption_fb ?? '');
  const [card, setCard] = useState(p.card ?? { kicker: '', quote: '', sub: '' });
  const [slidesText, setSlidesText] = useState((p.slides ?? []).map(s => `${s.title}\n${s.body}`).join('\n\n'));
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const done = p.status === 'posted' || p.status === 'publishing';
  const isCopy = Boolean(p.parent_id);
  const photoFirst = p.channel === 'li_personal' && !(p.caption ?? '').trim();

  async function upload(file: File, kind: 'image' | 'video') {
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || (kind === 'image' ? 'jpg' : 'mp4')).toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${p.id}/${Date.now()}.${ext}`;
      const { error } = await supabaseBrowser().storage.from('content').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      await run('up' + p.id, kind === 'image' ? 'set_image' : 'set_video', { id: p.id, path }, kind === 'image' ? (photoFirst ? 'Got it. Writing your post from the photo, refresh in a moment.' : 'Picture added. It posts on schedule.') : 'Video added. Its Instagram and LinkedIn copies are ready.');
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
    return run('save' + p.id, 'edit', body, 'Saved').then(j => { if (j) onClose(); });
  }

  /* Files are made on request (a carousel PDF takes a few seconds), so the
     button says so while it works, then the download starts. */
  const [getting, setGetting] = useState('');
  async function download(url: string, name: string, key: string) {
    setGetting(key);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`status ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e: any) { toast.bad(`The file did not download. ${e?.message ?? ''}`); }
    setGetting('');
  }
  const label = (key: string, idle: string, working: string) => busy === key + p.id ? working : idle;

  function copy(text: string) {
    const fallback = () => {
      const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); toast.ok('Copied'); } catch { toast.bad('Could not copy. Select the text and copy it.'); }
      t.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast.ok('Copied'), fallback);
    else fallback();
  }

  const ticks = p.results?.groups ?? {};
  const sub = `${p.when.replace(/^\w+, /, '')} · ${CHANNELS[p.channel].label}${p.format === 'video' ? ' · video' : p.format === 'carousel' ? ` · carousel of ${p.slides.length}` : ''}`;
  return (
    <div className={`cd-row${open ? ' open' : ''}${p.status === 'skipped' ? ' faded' : ''}`}>
      <div className="cd-rowhead" onClick={onToggle} role="button" aria-expanded={open}>
        <Thumb p={p} />
        <div className="cd-rowmain">
          <div className="cd-rowmeta">{sub}</div>
          <div className="cd-rowhook">{p.hook || p.topic}</div>
          {p.error && p.status !== 'posted' && <div className="small" style={{ marginTop: 4, color: 'var(--crit)' }}>{p.error}</div>}
        </div>
        <span className={`${STATUS_PILL[p.status]} cd-rowpill`}>{STATUS_LABEL[p.status]}</span>
        <span className="cd-caret" aria-hidden="true">{'›'}</span>
      </div>

      <div className="cd-exp">
        <div className="cd-exp-in">
          <div className="cd-body">
          {p.images.length > 0 && (
            <div className="cd-strip">
              {p.images.map((src, i) => <button key={i} type="button" onClick={() => setView(i)} aria-label={`Open graphic ${i + 1} of ${p.images.length}`} className="cd-tile">
                <img src={src} alt={`Graphic ${i + 1}`} width={162} height={203} loading="lazy" /></button>)}
            </div>
          )}
          {view !== null && <Viewer images={p.images} start={view} onClose={() => setView(null)} />}

          {p.channel === 'li_personal' && (
            <div className="ff">
              <label>{photoFirst ? 'Upload a photo, and the post writes itself' : 'Your picture'}</label>
              {photoFirst && !p.imageSrc && <span className="xs muted" style={{ marginBottom: 6 }}>Pick a real, candid photo from your week. Claude writes the post around what the photo actually shows, in your voice, for you to approve.</span>}
              {p.imageSrc ? <img src={p.imageSrc} alt="Chosen picture" style={{ maxWidth: 260, display: 'block', marginBottom: 8, border: '1px solid var(--line)' }} /> : null}
              {!photoFirst && p.image_idea && <span className="xs muted">Idea: {p.image_idea}</span>}
              {!done && <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'image'); e.target.value = ''; }} />}
              {!done && p.image_path && <button className="btn sm ghost" style={{ marginTop: 8 }} disabled={!!busy || uploading}
                onClick={() => run('wi' + p.id, 'write_image', { id: p.id }, 'Writing your post from the photo, refresh in a moment.')}>
                {(p.caption ?? '').trim() ? 'Rewrite from this photo' : 'Write from this photo'}
              </button>}
              {uploading && <span className="xs muted">Uploading, keep this open\u2026</span>}
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
            {!done && <button className="btn sm solid" disabled={!!busy} onClick={save}>{label('save', 'Save', 'Saving…')}</button>}
            <button className="btn sm ghost" onClick={() => copy(caption)}>Copy the words</button>
            {p.pdf && <button className="btn sm ghost" disabled={!!getting} onClick={() => download(p.pdf!, `releve-${p.slot}.pdf`, 'pdf')}>{getting === 'pdf' ? 'Preparing the PDF…' : 'Download PDF'}</button>}
            {p.images.length > 0 && <button className="btn sm ghost" disabled={!!getting} onClick={async () => {
              for (let i = 0; i < p.images.length; i++) await download(p.images[i].replace('fmt=png', 'fmt=jpg'), `releve-${p.slot}-${i + 1}.jpg`, 'img');
            }}>{getting === 'img' ? 'Preparing…' : p.images.length === 1 ? 'Download graphic' : `Download ${p.images.length} graphics`}</button>}
            {!done && !isCopy && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('re' + p.id, 'redraft', { id: p.id }, 'Opus is rewriting this post. It updates here in about two minutes.').then(() => setTimeout(() => window.location.reload(), 120000))}>{label('re', 'Rewrite it', 'Starting…')}</button>}
            {['scheduled', 'needs_image', 'needs_video', 'manual'].includes(p.status) && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('h' + p.id, 'hold', { id: p.id }, 'Held')}>{label('h', 'Hold', 'Holding…')}</button>}
            {p.status === 'held' && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('r' + p.id, 'resume', { id: p.id }, 'Back on schedule')}>{label('r', 'Release the hold', 'Releasing…')}</button>}
            {(p.status === 'scheduled' || p.status === 'failed') && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('n' + p.id, p.status === 'failed' ? 'retry' : 'post_now', { id: p.id }, 'Posting now')}>{label('n', p.status === 'failed' ? 'Try again' : 'Post now', 'Posting…')}</button>}
            {p.status === 'manual' && p.channel !== 'li_group' && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('m' + p.id, 'mark_posted', { id: p.id }, 'Marked as posted')}>{label('m', 'Mark as posted', 'Saving…')}</button>}
            {!done && p.status !== 'skipped' && <button className="btn sm ghost" disabled={!!busy} onClick={() => run('s' + p.id, 'skip', { id: p.id }, 'Skipped')}>{label('s', 'Skip', 'Skipping…')}</button>}
            <button className="btn sm ghost" onClick={onClose}>Close</button>
          </div>
          <p className="xs muted" style={{ marginTop: 10 }}>{CHANNELS[p.channel].where}. {p.written_by === 'team' ? 'Edited by the team.' : 'Written by Claude.'}</p>
          </div>
        </div>
      </div>
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

/* ---------- full-size viewer: arrows, swipe, keyboard ---------- */

function Viewer({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const n = images.length;
  const go = (d: number) => setI(x => Math.min(n - 1, Math.max(0, x + d)));
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, []);

  const arrow = (d: number, show: boolean) => (
    <button type="button" aria-label={d < 0 ? 'Previous graphic' : 'Next graphic'} disabled={!show}
      onClick={e => { e.stopPropagation(); go(d); }}
      style={{ position: 'absolute', top: '50%', [d < 0 ? 'left' : 'right']: 12, transform: 'translateY(-50%)', width: 48, height: 48,
        borderRadius: 24, border: 0, background: 'rgba(243,239,230,.92)', color: '#2A332D', fontSize: 24, lineHeight: '48px',
        cursor: show ? 'pointer' : 'default', opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none' }}>{d < 0 ? '‹' : '›'}</button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={`Graphic ${i + 1} of ${n}`} onClick={onClose}
      onTouchStart={e => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }}
      onTouchEnd={e => {
        const s = touch.current; touch.current = null; if (!s) return;
        const t = e.changedTouches[0]; const dx = t.clientX - s.x; const dy = t.clientY - s.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      }}
      className="cd-viewer"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,24,21,.92)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '56px 16px 28px' }}>
      <button type="button" aria-label="Close" onClick={onClose}
        style={{ position: 'absolute', top: 12, right: 12, width: 44, height: 44, borderRadius: 22, border: 0,
          background: 'rgba(243,239,230,.92)', color: '#2A332D', fontSize: 22, cursor: 'pointer' }}>{'×'}</button>
      <div style={{ position: 'absolute', top: 22, left: 0, right: 0, textAlign: 'center', color: '#F3EFE6', fontSize: 13, letterSpacing: 2 }}>{i + 1} / {n}</div>
      <img src={images[i]} alt={`Graphic ${i + 1} of ${n}`} onClick={e => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: 'calc(100dvh - 120px)', objectFit: 'contain', display: 'block', userSelect: 'none' }} draggable={false} />
      {n > 1 && arrow(-1, i > 0)}
      {n > 1 && arrow(1, i < n - 1)}
      {n > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }} onClick={e => e.stopPropagation()}>
          {images.map((_, k) => <button key={k} type="button" aria-label={`Graphic ${k + 1}`} onClick={() => setI(k)}
            style={{ width: 8, height: 8, padding: 0, borderRadius: 4, border: 0, cursor: 'pointer', background: k === i ? '#F3EFE6' : 'rgba(243,239,230,.35)' }} />)}
        </div>
      )}
    </div>
  );
}
