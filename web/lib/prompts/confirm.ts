// Confirms a parsed action back to the user in their own voice.
// Always short, always one breath, always in the user's locale.
// Note: em-dash is banned in user-visible copy (audio + UI). We use commas or
// a polite period.

export function confirmText(a: {
  kind: 'expense' | 'lend' | 'borrow' | 'settle' | 'unknown';
  amount_cents: number | null;
  currency: string | null;
  counterparty_name: string | null;
  memo: string;
  language: 'en' | 'bn';
}): string {
  const amt = a.amount_cents == null ? '' : formatAmount(a.amount_cents / 100, a.currency ?? 'BDT');
  if (a.language === 'bn') {
    switch (a.kind) {
      case 'lend':
        return `${a.counterparty_name ?? 'বন্ধুকে'} ${amt} ধার দিয়েছ। মনে রাখবো।`;
      case 'borrow':
        return `${a.counterparty_name ?? 'ওনার থেকে'} ${amt} ধার নিয়েছ। পরে শোধ করার সময় জানাবো।`;
      case 'settle':
        return `${a.counterparty_name ?? 'ওনাকে'} ${amt} শোধ করে দিয়েছ।`;
      case 'expense':
        return `${amt} খরচ করেছ। ${a.memo || 'নিজের জন্য'}`;
      default:
        return 'একটু পরিষ্কার করে বলবে?';
    }
  }
  switch (a.kind) {
    case 'lend':
      return `Logged. Lent ${amt} to ${a.counterparty_name ?? 'them'}.`;
    case 'borrow':
      return `Logged. Borrowed ${amt} from ${a.counterparty_name ?? 'them'}.`;
    case 'settle':
      return `Logged. Settled ${amt} with ${a.counterparty_name ?? 'them'}.`;
    case 'expense':
      return `Logged. ${amt} spent on ${a.memo || 'something'}.`;
    default:
      return 'Could you say that more clearly?';
  }
}

function formatAmount(n: number, ccy: string) {
  const formatted = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const prefixed = ['BDT', 'USD', 'EUR'].includes(ccy);
  return prefixed ? `${ccy} ${formatted}` : `${formatted} ${ccy}`;
}
