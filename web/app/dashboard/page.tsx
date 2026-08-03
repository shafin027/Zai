import Link from 'next/link';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { fetchBalances, fetchRecentEntries, fetchProfilesByIds, fetchRelations } from '@/lib/supabase/queries';
import { fetchTours } from '@/lib/supabase/tours';
import { LedgerTable, type LedgerRow } from '@/components/ui/Table';
import Reveal from '@/components/motion/Reveal';
import { fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = currentSession();
  if (!session) return null;
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) return null;
  const [entries, balances, relations, tours] = await Promise.all([
    fetchRecentEntries(sb, profile.id, 12),
    fetchBalances(sb, profile.id),
    fetchRelations(sb, profile.id),
    fetchTours(sb, profile.id)
  ]);
  const cpIds = Array.from(
    new Set([...relations.map((r) => r.friend_id), ...entries.map((e) => e.counterparty_id).filter(Boolean) as string[]])
  );
  const cps = await fetchProfilesByIds(sb, cpIds);
  const cpMap = new Map(cps.map((p) => [p.id, p]));
  const greet = greeting(profile.locale);

  const rows: LedgerRow[] = entries.map((e) => ({
    id: e.id,
    date: new Date(e.occurred_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
    counterparty: e.counterparty_id ? cpMap.get(e.counterparty_id)?.first_name ?? 'unknown' : '',
    kind: e.kind,
    amountCents: e.amount_cents,
    currency: e.currency,
    memo: e.memo,
    status: e.status
  }));

  const youAreOwed = balances.filter((b) => b.net_cents > 0).reduce((s, b) => s + b.net_cents, 0);
  const youOwe = balances.filter((b) => b.net_cents < 0).reduce((s, b) => s + Math.abs(b.net_cents), 0);
  const activeTours = tours.filter((t) => t.status === 'active');

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.18em] muted mb-2">{greet}, {profile.first_name}</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h1 className="mb-12">Overview.</h1>
      </Reveal>

      <div className="grid md:grid-cols-3 gap-6 mb-16">
        <Reveal delay={0.1}>
          <div className="border border-surface-line rounded-md bg-surface-raised p-6">
            <p className="text-xs muted uppercase tracking-[0.18em]">You are owed</p>
            <p className="font-serif text-3xl tabular mt-2">{fmtMoney(youAreOwed)}</p>
          </div>
        </Reveal>
        <Reveal delay={0.16}>
          <div className="border border-surface-line rounded-md bg-surface-raised p-6">
            <p className="text-xs muted uppercase tracking-[0.18em]">You owe</p>
            <p className="font-serif text-3xl tabular mt-2 text-loss">{fmtMoney(youOwe)}</p>
          </div>
        </Reveal>
        <Reveal delay={0.22}>
          <div className="border border-surface-line rounded-md bg-surface-raised p-6">
            <p className="text-xs muted uppercase tracking-[0.18em]">Net</p>
            <p className="font-serif text-3xl tabular mt-2 text-accent-glow">{fmtMoney(youAreOwed - youOwe)}</p>
          </div>
        </Reveal>
      </div>

      {activeTours.length > 0 ? (
        <Reveal delay={0.28}>
          <div className="border-t border-surface-line pt-8 mb-12">
            <div className="flex items-baseline justify-between mb-6">
              <h2>Active tour</h2>
              <Link href="/tours" className="text-xs text-accent-glow hover:underline underline-offset-4">All tours</Link>
            </div>
            <ul className="divide-y divide-surface-line">
              {activeTours.map((t) => (
                <li key={t.tour_id}>
                  <Link
                    href={`/tours/${t.tour_id}`}
                    className="block py-5 hover:bg-surface-sunken/40 transition-colors -mx-4 px-4 rounded-sm"
                  >
                    <div className="flex items-baseline justify-between">
                      <div className="min-w-0">
                        <p className="font-serif text-lg">{t.name}</p>
                        {t.nickname ? <p className="dim text-xs font-mono mt-0.5">@{t.nickname}</p> : null}
                      </div>
                      <p className={`text-sm tabular ${t.leftover_cents >= 0 ? 'text-gain' : 'text-loss'}`}>
                        Leftover {fmtMoney(t.leftover_cents, t.currency)}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-3 tabular">
                      <span className="text-xs muted">Pot {fmtMoney(t.total_pot_cents, t.currency)}</span>
                      <span className="text-xs muted">Spent {fmtMoney(t.spent_cents, t.currency)}</span>
                      <span className="text-xs muted">Repaid {fmtMoney(t.repaid_cents, t.currency)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      ) : null}

      <Reveal delay={0.3}>
        <div className="border-t border-surface-line pt-8">
          <div className="flex items-baseline justify-between mb-6">
            <h2>Recent activity</h2>
            <span className="muted text-xs">Last {rows.length}</span>
          </div>
          <LedgerTable rows={rows} />
        </div>
      </Reveal>
    </div>
  );
}

function greeting(locale: 'en' | 'bn') {
  const h = new Date().getHours();
  if (locale === 'bn') return h < 12 ? 'শুভ সকাল' : h < 18 ? 'শুভ বিকেল' : 'শুভ সন্ধ্যা';
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
