import { redirect } from 'next/navigation';
import { configured, supabaseServer } from '@/lib/supabase/server';
import SignIn from '@/components/SignIn';

export default async function Home() {
  if (configured()) {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (user) redirect('/app');
  }
  return <SignIn />;
}
