import { parseDecimalString } from './calculationSafety.ts';

const inrWholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Formats a server decimal amount to whole rupees without converting it to a JS number. */
export function formatINRAmount(value: unknown): string | null {
  const amount = parseDecimalString(value, { allowNegative: true, maxDecimalPlaces: 2 });
  if (amount === null) return null;

  const negative = amount.startsWith('-');
  const unsigned = negative ? amount.slice(1) : amount;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  let rupees = BigInt(whole);
  if ((fraction[0] ?? '0') >= '5') rupees += 1n;
  if (negative) rupees = -rupees;
  return inrWholeRupees.format(rupees);
}
