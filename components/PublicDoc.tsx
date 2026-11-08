import { marked } from 'marked';

/* The client-facing page for an audit or a 90-day plan: the Markdown the team
   wrote, in Relève's own type on warm paper. Raw HTML is escaped before the
   Markdown is read, and links are limited to http(s) and mailto, so nothing a
   person typed into the document can inject markup. Shared by /audit/[token]
   and /plan/[token]. */
export async function renderDoc(content: string): Promise<string> {
  const escaped = (content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const raw = await marked.parse(escaped, { gfm: true, breaks: false });
  return raw.replace(/href="([^"]*)"/g, (_m, u: string) =>
    /^(https?:|mailto:)/i.test(u.replace(/&amp;/g, '&').trim()) ? `href="${u}" rel="noopener noreferrer"` : 'href="#"');
}

export function DocMast() {
  return (
    <div className="audit-mast">
      <img className="audit-logo" src="/logo-fern.png" alt="Relève Executive Staffing" width="1200" height="360" />
    </div>
  );
}

export function DocGone({ heading, text }: { heading: string; text: string }) {
  return (
    <main className="audit-wrap">
      <DocStyle />
      <DocMast />
      <div className="audit-gone"><h1>{heading}</h1><p>{text}</p></div>
    </main>
  );
}

export function DocStyle() {
  return (
    <style>{`
      :root{--fern:#35443A;--ink:#22302A;--body:#3C463F;--sage:#888466;--cream:#F3EFE6;--paper:#FAF8F2;--rule:rgba(53,68,58,.16);--pale:#C8CFD4}
      body{background:var(--paper)}
      .audit-wrap{max-width:760px;margin:0 auto;padding:46px 22px 90px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--body);line-height:1.7}
      .audit-mast{text-align:center;border-bottom:1px solid var(--rule);padding-bottom:26px;margin-bottom:40px}
      .audit-logo{display:block;margin:0 auto;width:min(300px,70vw);height:auto}
      .audit-body h1{font-family:'Lora',serif;font-weight:400;color:var(--ink);font-size:30px;line-height:1.2;margin:0 0 10px;letter-spacing:-.01em}
      .audit-body h2{font-family:'Lora',Georgia,serif;font-weight:400;color:var(--fern);font-size:21px;margin:40px 0 12px;padding-top:18px;border-top:1px solid var(--rule)}
      .audit-body h3{font-family:'Lora',Georgia,serif;font-weight:400;color:var(--fern);font-size:16px;margin:26px 0 8px}
      .audit-body p{margin:0 0 15px}
      .audit-body strong{color:var(--ink);font-weight:400}
      .audit-body ul,.audit-body ol{margin:0 0 18px;padding-left:22px}
      .audit-body li{margin-bottom:7px}
      .audit-body li input[type=checkbox]{margin-right:8px}
      .audit-body a{color:var(--fern)}
      .audit-body table{width:100%;border-collapse:collapse;margin:8px 0 24px;font-size:15px;overflow-x:auto;display:block}
      .audit-body th{font-family:'Lora',serif;font-weight:400;text-align:left;color:var(--fern);font-size:13px;letter-spacing:.04em;padding:11px 12px;border-bottom:1px solid var(--fern);vertical-align:top}
      .audit-body td{padding:11px 12px;border-bottom:1px solid var(--rule);vertical-align:top;color:var(--body)}
      .audit-body tr:last-child td{border-bottom:none}
      .audit-gone{text-align:center;padding:40px 0}
      .audit-gone h1{font-family:'Lora',serif;font-weight:400;color:var(--ink);font-size:26px;margin:0 0 12px}
      .audit-foot{margin-top:54px;padding-top:22px;border-top:1px solid var(--rule);font-size:12.5px;color:var(--sage);text-align:center}
      .audit-foot a{color:var(--sage)}
      @media (max-width:600px){.audit-wrap{padding:30px 16px 70px}.audit-body h1{font-size:25px}}
    `}</style>
  );
}
