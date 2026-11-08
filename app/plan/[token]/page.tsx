import { getPublicDoc } from '@/lib/studio';
import { renderDoc, DocStyle, DocMast, DocGone } from '@/components/PublicDoc';

export const metadata = { title: 'Your 90-Day Success Plan' };
export const dynamic = 'force-dynamic';

/* An executive's 90-Day Success Plan, once the team has published it. No
   session: they open it from the email. The token names one plan, and an
   unpublished draft never opens. */
export default async function PlanView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const plan = await getPublicDoc('plan', token);
  if (!plan) return <DocGone heading="That link is not active" text="Reply to the email it came from and we will send you a new one." />;
  const html = await renderDoc(plan.content);
  return (
    <main className="audit-wrap">
      <DocStyle />
      <DocMast />
      <article className="audit-body" dangerouslySetInnerHTML={{ __html: html }} />
      <footer className="audit-foot">
        Prepared for {plan.company ?? 'you'} by Relève · <a href="https://relevestaffing.com">relevestaffing.com</a>
      </footer>
    </main>
  );
}
