// Friend invite landing page. Public — renders a Telegram Login Widget that
// carries the invite token through /api/telegram-login/callback.
import TelegramLoginButton from '@/components/auth/TelegramLoginButton';
import Reveal from '@/components/motion/Reveal';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: { token: string } }) {
  const sb = supabaseAdmin();
  const { data: rel } = await sb
    .from('relations')
    .select('id, status, invited_at')
    .eq('invite_token', params.token)
    .maybeSingle();
  if (!rel) return notFound();

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg w-full">
        <Reveal>
          <p className="text-xs uppercase tracking-[0.18em] muted mb-3">Invitation</p>
        </Reveal>
        <Reveal delay={0.06}>
          <h1 className="mb-3">
            Someone wants to keep an honest ledger with you.
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="muted mb-10">
            Cofre is a private money ledger. By accepting, you'll see only the entries where you are the counterparty. Nothing else.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="rounded-md border border-surface-line p-8 bg-surface-raised flex flex-col gap-6 items-start">
            <div>
              <p className="muted text-sm">Invite token</p>
              <code className="font-mono text-xs text-accent break-all">{params.token}</code>
            </div>
            <TelegramLoginButton
              botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME!}
              invite={params.token}
            />
            <p className="text-xs muted">
              We use Telegram only to confirm it's you. We never message you outside of ledger notifications.
            </p>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
