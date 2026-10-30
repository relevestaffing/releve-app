import UnsubscribeForm from '@/components/UnsubscribeForm';

export const metadata = { title: 'Email preferences' };
export const dynamic = 'force-dynamic';

/* Public, no session, the same ivory-on-fern card as /interested and sign-in.
   The person arrives from the unsubscribe link in a Relève email. Nothing
   happens on load (link scanners open every link); one press confirms. */
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <div className="auth">
      <div>
        <img className="auth-logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="auth-card">
          <UnsubscribeForm token={t ?? ''} />
        </div>
        <p className="small muted" style={{ marginTop: 26 }}>Relève Executive Staffing · Consider it handled.</p>
      </div>
    </div>
  );
}
