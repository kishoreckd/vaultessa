export type ScannedCard = { number: string; cardholder: string; expiry: string };

export function validCardNumber(value: string): boolean {
  const digits = value.replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
    let n = Number(digits[i]);
    if (double) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Suggestions only: ambiguous numbers and names require manual review. */
export function parseCardText(text: string): ScannedCard {
  const candidates = [...text.matchAll(/(?:\d[ -]?){13,19}/g)]
    .map(([value]) => value.replace(/\D/g, ''));
  const unique = [...new Set(candidates)];
  const valid = unique.filter(validCardNumber);
  const number = valid.length === 1 ? valid[0]! : unique.length === 1 ? unique[0]! : '';
  const dates = [...text.matchAll(/\b(0[1-9]|1[0-2])\s*\/\s*(\d{4}|\d{2})\b/g)];
  const labelledExpiry = text.match(/(?:valid\s*(?:thru|until)|exp(?:iry|ires|iration)?)[\s:.]*(0[1-9]|1[0-2])\s*\/\s*(\d{4}|\d{2})\b/i);
  const expiry = labelledExpiry ?? (dates.length === 1 ? dates[0] : undefined);
  const names = text.split(/\r?\n/).map(line => line.trim()).filter(line =>
    /^[A-Za-z][A-Za-z .'-]{3,59}$/.test(line) && line.split(/\s+/).length >= 2 &&
    !/bank|visa|mastercard|credit|debit|valid|thru|until|member|card|platinum|signature|world|electronic/i.test(line));
  return { number, expiry: expiry ? `${expiry[1]}/${expiry[2]!.slice(-2)}` : '',
    cardholder: names.length === 1 ? names[0]! : '' };
}
