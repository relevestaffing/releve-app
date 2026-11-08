import { getAuditByToken } from '@/lib/audits';
import { renderDoc, DocStyle, DocMast, DocGone } from '@/components/PublicDoc';

export const metadata = { title: 'Your business audit' };
export const dynamic = 'force-dynamic';

/* The private branded audit page. No session: the prospect opens it from the
   link in their email. The token names one audit and nothing else. */
export default async function AuditView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const audit = await getAuditByToken(token);
  if (!audit) return <DocGone heading="That link is no longer active" text="Reply to the email it came from and we will send you a new one." />;
  const html = await renderDoc(audit.content);
  return (
    <main className="audit-wrap">
      <DocStyle />
      <DocMast />
      <article className="audit-body" dangerouslySetInnerHTML={{ __html: html }} />
      <footer className="audit-foot">
        Prepared for {audit.company ?? 'you'} by Relève · <a href="https://relevestaffing.com">relevestaffing.com</a>
      </footer>
    </main>
  );
}
