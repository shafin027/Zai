import Reveal from '@/components/motion/Reveal';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { Avatar } from '@/components/ui/Avatar';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = currentSession();
  if (!session) return null;
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) return null;
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.18em] muted mb-2">Account</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h1 className="mb-12">Settings.</h1>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="border border-surface-line rounded-md bg-surface-raised p-8 flex items-center gap-6">
          <Avatar src={profile.photo_url ?? null} name={profile.first_name} size={56} />
          <div>
            <p className="text-lg font-serif">{[profile.first_name, profile.last_name].filter(Boolean).join(' ')}</p>
            <p className="muted text-sm">{profile.telegram_username ? `@${profile.telegram_username}` : profile.telegram_id}</p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.2}>
        <form
          method="post"
          action="/api/profile"
          className="border border-surface-line rounded-md bg-surface-raised p-8 grid gap-6 mt-6"
        >
          <label className="grid gap-2">
            <span className="text-xs muted uppercase tracking-[0.18em]">Default currency</span>
            <select
              name="default_currency"
              defaultValue={profile.default_currency}
              className="bg-transparent border-b border-surface-line py-3 text-sm focus:border-accent outline-none"
            >
              {['BDT', 'USD', 'EUR', 'INR', 'GBP'].map((c) => (
                <option className="bg-surface-raised" key={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs muted uppercase tracking-[0.18em]">Voice replies in</span>
            <select
              name="locale"
              defaultValue={profile.locale}
              className="bg-transparent border-b border-surface-line py-3 text-sm focus:border-accent outline-none"
            >
              <option className="bg-surface-raised" value="en">English</option>
              <option className="bg-surface-raised" value="bn">Bangla</option>
            </select>
          </label>

          <div className="flex items-center justify-end pt-4">
            <button
              type="submit"
              className="px-5 h-10 bg-ink text-surface rounded-sm hover:bg-accent-glow text-sm tracking-tight"
            >
              Save
            </button>
          </div>
        </form>
      </Reveal>

      <Reveal delay={0.3}>
        <form action="/api/logout" method="post" className="mt-12">
          <button className="text-xs muted hover:text-loss tracking-tight">Sign out</button>
        </form>
      </Reveal>
    </div>
  );
}
