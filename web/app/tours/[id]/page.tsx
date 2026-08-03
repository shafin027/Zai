import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import {
  fetchTour,
  fetchTourMembers,
  fetchMemberSummaries,
  fetchTourEntries,
  fetchTourTopups
} from '@/lib/supabase/tours';
import Reveal from '@/components/motion/Reveal';
import { notFound } from 'next/navigation';
import { fmtMoney, fmtDate } from '@/lib/format';
import { LedgerTable, type LedgerRow } from '@/components/ui/Table';
import TourActions from '@/components/tours/TourActions';
import TourExpenseForm from '@/components/tours/TourExpenseForm';
import TourMemberForm from '@/components/tours/TourMemberForm';

export const dynamic = 'force-dynamic';

export default async function TourDetailPage({ params }: { params: { id: string } }) {
  const session = currentSession();
  if (!session) return null;
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) return null;

  const tour = await fetchTour(sb, params.id);
  if (!tour) return notFound();
  const isLeader = tour.owner_id === profile.id;

  const [members, summaries, entries, topups] = await Promise.all([
    fetchTourMembers(sb, params.id),
    fetchMemberSummaries(sb, params.id),
    fetchTourEntries(sb, params.id),
    fetchTourTopups(sb, params.id)
  ]);

  const summaryByMember = new Map(summaries.map((s) => [s.profile_id, s]));
  const rows: LedgerRow[] = entries.map((e) => {
    const cp = members.find((m) => m.profile_id === e.counterparty_id);
    const memberTag = e.tour_member_id
      ? members.find((m) => m.id === e.tour_member_id)?.first_name
      : null;
    return {
      id: e.id,
      date: fmtDate(e.occurred_at),
      counterparty: cp?.first_name ?? memberTag ?? '',
      kind: e.kind,
      amountCents: e.amount_cents,
      currency: e.currency,
      memo: e.memo,
      status: e.status
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.18em] muted mb-2">{tour.status}</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h1 className="mb-1">{tour.name}</h1>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="muted text-sm mb-10">
          {tour.destination ?? 'No destination set'}
          {tour.nickname ? <> · <span className="font-mono">@{tour.nickname}</span></> : null}
        </p>
      </Reveal>

      {/* Top-level pot strip */}
      <Reveal delay={0.16}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          <Stat label="Pot" value={fmtMoney(tour.total_pot_cents, tour.currency)} />
          <Stat label="Spent" value={fmtMoney(tour.spent_cents, tour.currency)} tone="muted" />
          <Stat label="Repaid" value={fmtMoney(tour.repaid_cents, tour.currency)} tone="muted" />
          <Stat
            label="Leftover"
            value={fmtMoney(tour.leftover_cents, tour.currency)}
            tone={tour.leftover_cents >= 0 ? 'gain' : 'loss'}
          />
        </div>
      </Reveal>

      {isLeader ? (
        <div className="grid lg:grid-cols-[2fr_1fr] gap-8 mb-16">
          <Reveal delay={0.2}>
            <section className="border border-surface-line bg-surface-raised rounded-md p-6">
              <h2 className="mb-1">Add spend</h2>
              <p className="muted text-sm mb-6">A new tour expense. Assigned to a member so the leftover balance reconciles back to the right person.</p>
              <TourExpenseForm tourId={tour.tour_id} currency={tour.currency} members={members} />
            </section>
          </Reveal>
          <Reveal delay={0.24}>
            <section className="border border-surface-line bg-surface-raised rounded-md p-6">
              <h2 className="mb-1">Add member</h2>
              <p className="muted text-sm mb-6">Pick from your friends. They get a Telegram voice ping when added.</p>
              <TourMemberForm tourId={tour.tour_id} members={members} />
              {tour.status !== 'closed' ? (
                <TourActions tourId={tour.tour_id} status={tour.status} />
              ) : (
                <p className="dim text-xs mt-6">This tour is closed. No new entries will be accepted.</p>
              )}
            </section>
          </Reveal>
        </div>
      ) : null}

      {/* Per-member leftover reconciliation */}
      <Reveal delay={0.3}>
        <section className="mb-16">
          <div className="flex items-baseline justify-between mb-6">
            <h2>Per-member breakdown</h2>
            <span className="muted text-xs">{members.length} {members.length === 1 ? 'person' : 'people'}</span>
          </div>
          <div className="border-t border-surface-line">
            {members.map((m, i) => {
              const s = summaryByMember.get(m.profile_id);
              const consumed = s?.consumed_cents ?? 0;
              const allocated = s?.allocated_cents ?? m.allocated_cents;
              const leftover = (s?.leftover_to_member_cents ?? allocated);
              return (
                <Reveal key={m.id} delay={0.04 * i}>
                  <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-6 py-5 border-b border-surface-line">
                    <div className="flex items-center gap-3 min-w-0">
                      <span aria-hidden className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-surface-sunken text-xs font-mono uppercase">{m.role === 'leader' ? 'L' : i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm truncate">{[m.first_name, m.last_name].filter(Boolean).join(' ')}</p>
                        <p className="text-xs muted">{m.role === 'leader' ? 'Tour leader' : 'Member'}</p>
                      </div>
                    </div>
                    <Cell label="Allocated" value={fmtMoney(allocated, tour.currency)} />
                    <Cell label="Spent" value={fmtMoney(consumed, tour.currency)} />
                    <Cell
                      label="Leftover"
                      value={fmtMoney(leftover, tour.currency)}
                      tone={leftover >= 0 ? 'gain' : 'loss'}
                    />
                  </div>
                </Reveal>
              );
            })}
            {members.length === 0 ? (
              <p className="dim py-6 text-sm">No members yet.</p>
            ) : null}
          </div>
        </section>
      </Reveal>

      {/* Activity stream */}
      <Reveal delay={0.36}>
        <section className="mb-16">
          <div className="flex items-baseline justify-between mb-6">
            <h2>Activity</h2>
            <span className="muted text-xs">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
          </div>
          <LedgerTable rows={rows} />
        </section>
      </Reveal>

      {/* Top-ups list (leader sees amount + memo) */}
      {topups.length > 0 ? (
        <Reveal delay={0.42}>
          <section className="mb-16">
            <h2 className="mb-6">Top-ups</h2>
            <ul className="divide-y divide-surface-line border-t border-surface-line">
              {topups.map((t) => (
                <li key={t.id} className="py-4 flex items-baseline justify-between tabular">
                  <span className="muted text-sm">{fmtDate(t.occurred_at)} · {t.memo || 'Top-up'}</span>
                  <span className="text-sm">+ {fmtMoney(t.amount_cents, tour.currency)}</span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'muted' | 'gain' | 'loss' }) {
  const cls = tone === 'loss' ? 'text-loss' : tone === 'gain' ? 'text-gain' : tone === 'muted' ? 'muted' : '';
  return (
    <div>
      <p className="text-xs muted uppercase tracking-[0.16em] mb-1">{label}</p>
      <p className={`font-serif text-2xl tabular ${cls}`}>{value}</p>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'gain' | 'loss' }) {
  const cls = tone === 'loss' ? 'text-loss' : tone === 'gain' ? 'text-gain' : '';
  return (
    <div className="text-right">
      <p className="text-xs muted uppercase tracking-[0.16em] mb-1">{label}</p>
      <p className={`text-sm tabular ${cls}`}>{value}</p>
    </div>
  );
}
