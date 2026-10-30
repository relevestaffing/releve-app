import { marked } from 'marked';
import { getAuditByToken } from '@/lib/audits';

export const metadata = { title: 'Your business audit' };
export const dynamic = 'force-dynamic';

/* The private branded audit page. No session: the prospect opens it from the
   link in their email. The token names one audit and nothing else. Markdown
   is rendered with raw HTML escaped first, so nothing a person typed into the
   audit can inject markup here. */
export default async function AuditView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const audit = await getAuditByToken(token);

  if (!audit) {
    return (
      <main className="audit-wrap">
        <AuditStyle />
        <div className="audit-mast"><span className="audit-word">Relève</span><span className="audit-sub">Executive Staffing</span></div>
        <div className="audit-gone">
          <h1>That link is not active</h1>
          <p>Ask your Relève contact to send a fresh one, or reply to the email it came from and we will help.</p>
        </div>
      </main>
    );
  }

  const escaped = (audit.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const raw = await marked.parse(escaped, { gfm: true, breaks: false });
  /* Markdown links can carry javascript: or data: URLs even with the angle
     brackets escaped. Keep http(s) and mailto, drop the rest (QA, 30 Oct). */
  const html = raw.replace(/href="([^"]*)"/g, (_m, u: string) =>
    /^(https?:|mailto:)/i.test(u.replace(/&amp;/g, '&').trim()) ? `href="${u}" rel="noopener noreferrer"` : 'href="#"');

  return (
    <main className="audit-wrap">
      <AuditStyle />
      <div className="audit-mast">
        <span className="audit-word">Relève</span>
        <span className="audit-sub">Executive Staffing</span>
      </div>
      <article className="audit-body" dangerouslySetInnerHTML={{ __html: html }} />
      <footer className="audit-foot">
        Prepared for {audit.company ?? 'you'} by Relève · <a href="https://relevestaffing.com">relevestaffing.com</a>
      </footer>
    </main>
  );
}

function AuditStyle() {
  return (
    <style>{`
      :root{--fern:#35443A;--ink:#22302A;--body:#3C463F;--sage:#6E8073;--cream:#F3EFE6;--paper:#FAF8F2;--rule:rgba(53,68,58,.16);--pale:#B0C4B2}
      body{background:var(--paper)}
      .audit-wrap{max-width:760px;margin:0 auto;padding:46px 22px 90px;font-family:'Tenor Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--body);line-height:1.7}
      .audit-mast{text-align:center;border-bottom:1px solid var(--rule);padding-bottom:26px;margin-bottom:40px}
      .audit-word{display:block;font-family:'Marcellus',serif;font-size:30px;letter-spacing:.34em;text-transform:uppercase;color:var(--ink)}
      .audit-sub{display:block;font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:var(--sage);margin-top:8px}
      .audit-body h1{font-family:'Marcellus',serif;font-weight:400;color:var(--ink);font-size:30px;line-height:1.2;margin:0 0 10px;letter-spacing:-.01em}
      .audit-body h2{font-family:'Marcellus',serif;font-weight:400;color:var(--fern);font-size:21px;margin:40px 0 12px;padding-top:18px;border-top:1px solid var(--rule)}
      .audit-body h3{font-family:'Marcellus',serif;font-weight:400;color:var(--fern);font-size:16px;margin:26px 0 8px}
      .audit-body p{margin:0 0 15px}
      .audit-body strong{color:var(--ink);font-weight:400}
      .audit-body ul,.audit-body ol{margin:0 0 18px;padding-left:22px}
      .audit-body li{margin-bottom:7px}
      .audit-body li input[type=checkbox]{margin-right:8px}
      .audit-body a{color:var(--fern)}
      .audit-body table{width:100%;border-collapse:collapse;margin:8px 0 24px;font-size:15px}
      .audit-body th{font-family:'Marcellus',serif;font-weight:400;text-align:left;color:var(--fern);font-size:13px;letter-spacing:.04em;padding:11px 12px;border-bottom:1px solid var(--fern);vertical-align:top}
      .audit-body td{padding:11px 12px;border-bottom:1px solid var(--rule);vertical-align:top;color:var(--body)}
      .audit-body tr:last-child td{border-bottom:none}
      .audit-body table{overflow-x:auto;display:block}
      .audit-gone{text-align:center;padding:40px 0}
      .audit-gone h1{font-family:'Marcellus',serif;font-weight:400;color:var(--ink);font-size:26px;margin:0 0 12px}
      .audit-foot{margin-top:54px;padding-top:22px;border-top:1px solid var(--rule);font-size:12.5px;color:var(--sage);text-align:center}
      .audit-foot a{color:var(--sage)}
      @media (max-width:600px){.audit-wrap{padding:30px 16px 70px}.audit-body h1{font-size:25px}}
    `}</style>
  );
}
