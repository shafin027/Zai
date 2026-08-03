import { Shell } from '@/components/layout/Shell';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { currentPathname } from '@/lib/url/pathname';
import { redirect } from 'next/navigation';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = currentSession();
  if (!session) redirect('/');
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) redirect('/');
  return (
    <Shell user={profile} pathname={currentPathname()}>
      {children}
    </Shell>
  );
}
