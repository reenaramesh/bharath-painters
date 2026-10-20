import type { DecimalString } from './contracts.ts';

export interface DecimalParseOptions {
  allowNegative?: boolean;
  maxDecimalPlaces?: number;
}

export type MeasurementDeductionValidation =
  | { ok: true }
  | { ok: false; reason: 'INVALID_DECIMAL' | 'DEDUCTION_EXCEEDS_GROSS' };

/** Validates API decimal strings without converting through JavaScript number. */
export function parseDecimalString(value: unknown, options: DecimalParseOptions = {}): DecimalString | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 128) return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(candidate);
  if (!match || (match[1] === '-' && !options.allowNegative)) return null;
  if (options.maxDecimalPlaces !== undefined && (match[3]?.length ?? 0) > options.maxDecimalPlaces) return null;
  return candidate;
}

function scaledInteger(value: string): { integer: bigint; scale: number } {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const integer = BigInt(`${whole}${fraction}` || '0');
  return { integer: negative ? -integer : integer, scale: fraction.length };
}

/** Compares decimal strings exactly; malformed values throw instead of becoming NaN. */
export function compareDecimalStrings(left: string, right: string): -1 | 0 | 1 {
  const validLeft = parseDecimalString(left, { allowNegative: true });
  const validRight = parseDecimalString(right, { allowNegative: true });
  if (validLeft === null || validRight === null) throw new RangeError('Both values must be decimal strings.');
  const a = scaledInteger(validLeft);
  const b = scaledInteger(validRight);
  const scale = Math.max(a.scale, b.scale);
  const aValue = a.integer * (10n ** BigInt(scale - a.scale));
  const bValue = b.integer * (10n ** BigInt(scale - b.scale));
  return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
}

/** Validates a deduction against the gross area already calculated by the server. */
export function validateMeasurementDeductions(
  serverGrossArea: string,
  deductionArea: string,
): MeasurementDeductionValidation {
  const gross = parseDecimalString(serverGrossArea);
  const deduction = parseDecimalString(deductionArea);
  if (gross === null || deduction === null) return { ok: false, reason: 'INVALID_DECIMAL' };
  if (compareDecimalStrings(deduction, gross) > 0) return { ok: false, reason: 'DEDUCTION_EXCEEDS_GROSS' };
  return { ok: true };
}
