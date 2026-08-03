import Link from 'next/link';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { fetchTours } from '@/lib/supabase/tours';
import Reveal from '@/components/motion/Reveal';
import { fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ToursListPage() {
  const session = currentSession();
  if (!session) return null;
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) return null;
  const tours = await fetchTours(sb, profile.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <div>
          <Reveal>
            <p className="text-xs uppercase tracking-[0.18em] muted mb-2">Tours</p>
          </Reveal>
          <Reveal delay={0.06}>
            <h1>Trips you're running.</h1>
          </Reveal>
        </div>
        <Reveal delay={0.12}>
          <Link
            href="/tours/new"
            className="px-5 h-10 inline-flex items-center bg-ink text-surface rounded-sm hover:bg-accent-glow text-sm tracking-tight transition-colors"
          >
            New tour
          </Link>
        </Reveal>
      </div>

      {tours.length === 0 ? (
        <Reveal delay={0.16}>
          <div className="border border-dashed border-surface-line rounded-md p-10 text-center muted">
            <p className="mb-2">No tours yet.</p>
            <p className="text-sm">A tour sits at the intersection of a group of friends and one shared pot.</p>
          </div>
        </Reveal>
      ) : (
        <div className="divide-y divide-surface-line border-t border-surface-line">
          {tours.map((t, i) => (
            <Reveal key={t.tour_id} delay={0.1 * i}>
              <Link href={`/tours/${t.tour_id}`} className="block py-6 hover:bg-surface-sunken/50 transition-colors -mx-4 px-4 rounded-sm">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="font-serif text-xl">{t.name}</p>
                    {t.destination ? <p className="muted text-xs mt-1">{t.destination}</p> : null}
                    {t.nickname ? <p className="dim text-xs mt-0.5 font-mono">@{t.nickname}</p> : null}
                  </div>
                  <span className={`text-xs uppercase tracking-[0.16em] ${
                    t.status === 'active' ? 'text-accent-glow'
                    : t.status === 'closed' ? 'muted'
                    : 'dim'
                  }`}>{t.status}</span>
                </div>
                <div className="grid grid-cols-4 gap-6 mt-5 tabular">
                  <Stat label="Pot" value={fmtMoney(t.total_pot_cents, t.currency)} />
                  <Stat label="Spent" value={fmtMoney(t.spent_cents, t.currency)} />
                  <Stat label="Repaid" value={fmtMoney(t.repaid_cents, t.currency)} />
                  <Stat
                    label="Leftover"
                    value={fmtMoney(t.leftover_cents, t.currency)}
                    tone={t.leftover_cents >= 0 ? 'gain' : 'loss'}
                  />
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'gain' | 'loss' }) {
  return (
    <div>
      <p className="text-xs muted uppercase tracking-[0.16em] mb-1">{label}</p>
      <p className={`text-base ${tone === 'loss' ? 'text-loss' : tone === 'gain' ? 'text-gain' : ''}`}>{value}</p>
    </div>
  );
}
