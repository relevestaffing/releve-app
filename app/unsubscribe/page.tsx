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
        <img className="auth-tagline" src="/consider-it-handled.png" alt="Consider it handled." width={2755} height={414} />
      </div>
    </div>
  );
}
