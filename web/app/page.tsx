// Landing page — single-screen pitch with 3D hero.
// Designed Read: a "warm vault" — restrained, brass-on-paper, like a private ledger.
// Motion: subtle rotation of cubes, hairline headings that lift on enter.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Reveal from '@/components/motion/Reveal';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

const Hero3D = dynamic(() => import('@/components/three/Hero'), { ssr: false });

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LandingPage() {
  // Server-rendered header: if the user is logged in, jump straight to /dashboard.
  const session = currentSession();
  if (session) {
    const sb = await supabaseServer();
    const { data } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
    if (data) {
      // Server redirect (no flash)
      const { redirect } = await import('next/navigation');
      redirect('/dashboard');
    }
  }

  return (
    <main className="relative min-h-[100dvh] flex flex-col">
      {/* 3D hero — suspended brass cubes around a torus vault */}
      <div className="absolute inset-0 -z-0">
        <Hero3D />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        <header className="px-6 py-5 flex items-center justify-between mx-auto w-full max-w-6xl">
          <Link href="/" className="flex items-center gap-2">
            <span aria-hidden className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-serif text-2xl tracking-tight">cofre</span>
          </Link>
          <span className="text-xs muted tracking-[0.18em] uppercase">Personal Money Ledger</span>
        </header>

        <section className="flex-1 flex flex-col items-center justify-center text-center px-6 -mt-10">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.22em] muted mb-6">A Private Vault. Two Doors.</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="max-w-3xl mx-auto">
              Your money,<br />
              <span className="text-accent">kept honest</span>.
            </h1>
          </Reveal>
          <Reveal delay={0.18}>
            <p className="mt-6 max-w-md muted text-base">
              Expenses and a private lend and borrow ledger with friends.
              Update from the website or by voice note to the Telegram bot.
            </p>
          </Reveal>
          <Reveal delay={0.28}>
            <div className="mt-12 flex flex-col sm:flex-row items-center gap-3">
              <Link
                href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}`}
                className="inline-flex items-center gap-2 px-6 h-12 rounded-sm bg-ink text-surface hover:bg-accent-glow transition-colors duration-200 text-sm tracking-tight"
              >
                Open the bot
              </Link>
              <Link
                href="/api/telegram-login/callback"
                className="inline-flex items-center gap-2 px-6 h-12 rounded-sm border border-surface-line text-ink hover:border-accent transition-colors duration-200 text-sm tracking-tight"
              >
                Sign in with Telegram
              </Link>
            </div>
          </Reveal>
        </section>

        <section className="mx-auto max-w-6xl w-full px-6 pb-24 grid md:grid-cols-3 gap-6 relative z-10">
          {[
            { title: 'Voice-first capture', body: 'A Bangla or English voice note transcribes, classifies, and stores it before the second sip of tea.' },
            { title: 'Two doors, one ledger', body: 'Update from the website or the bot. Both surfaces see the same number, the same history.' },
            { title: 'Honest with friends', body: 'Counterparties get a Telegram message the second a new lend entry lands, also by voice.' }
          ].map((f, i) => (
            <Reveal key={f.title} delay={0.12 * i}>
              <article className="border-t border-surface-line pt-6 h-full">
                <h3 className="font-serif text-lg">{f.title}</h3>
                <p className="muted mt-2 text-sm leading-relaxed">{f.body}</p>
              </article>
            </Reveal>
          ))}
        </section>
      </div>
    </main>
  );
}
