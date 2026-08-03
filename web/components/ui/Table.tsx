import { fmtMoney } from '@/lib/format';

export type LedgerRow = {
  id: string;
  date: string;
  counterparty: string;
  kind: 'lend' | 'borrow' | 'expense';
  amountCents: number;
  currency: string;
  memo: string;
  status: 'open' | 'partially_settled' | 'settled' | 'disputed';
};

const statusLabel: Record<LedgerRow['status'], string> = {
  open: 'open',
  partially_settled: 'partial',
  settled: 'settled',
  disputed: 'disputed'
};

const kindLabel: Record<LedgerRow['kind'], string> = {
  lend: '→ lent',
  borrow: '← borrowed',
  expense: '· spent'
};

export function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  if (!rows.length) {
    return (
      <div className="border border-dashed border-surface-line rounded-sm p-10 text-center muted text-sm">
        Nothing recorded yet. Send a voice note to the Telegram bot to begin.
      </div>
    );
  }

  return (
    <table className="w-full text-sm tabular">
      <thead className="text-ink-dim text-xs uppercase tracking-[0.12em]">
        <tr className="text-left">
          <th className="font-normal py-3">Date</th>
          <th className="font-normal py-3">With</th>
          <th className="font-normal py-3">Kind</th>
          <th className="font-normal py-3">Memo</th>
          <th className="font-normal py-3 text-right">Amount</th>
          <th className="font-normal py-3 text-right">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-line">
        {rows.map((r) => (
          <tr key={r.id} className="group hover:bg-surface-sunken transition-colors">
            <td className="py-3 muted">{r.date}</td>
            <td className="py-3">{r.counterparty || <span className="dim">self</span>}</td>
            <td className={`py-3 ${r.kind === 'lend' ? 'text-gain' : r.kind === 'borrow' ? 'text-loss' : 'muted'}`}>{kindLabel[r.kind]}</td>
            <td className="py-3 muted truncate max-w-[28ch]">{r.memo}</td>
            <td className="py-3 text-right">{fmtMoney(r.amountCents, r.currency)}</td>
            <td className="py-3 text-right muted">{statusLabel[r.status]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
