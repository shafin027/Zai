export function fmtMoney(cents: number, currency = 'BDT') {
  const amount = (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  // BDT/USD are conventionally prefixed, not suffixed.
  const prefixed = currency === 'BDT' || currency === 'USD' || currency === 'EUR';
  return prefixed ? `${currency} ${amount}` : `${amount} ${currency}`;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function pluralize(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
