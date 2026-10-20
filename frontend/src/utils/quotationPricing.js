/** @typedef {string | number | null | undefined} DecimalInput */
/** @typedef {{ amount?: DecimalInput, quantity?: DecimalInput, rate?: DecimalInput, calculation_method?: 'LUMPSUM' | 'MANUAL' | string, discount_type?: 'FIXED' | 'PERCENTAGE', discount_value?: DecimalInput }} QuotationPricingItem */
/** @typedef {{ discount_mode?: 'OVERALL' | 'LINE' | 'BOTH', discount_type?: 'FIXED' | 'PERCENTAGE', discount_value?: DecimalInput, gst_mode?: 'GST_EXTRA' | 'GST_INCLUDED' | 'NO_GST', gst_percentage?: DecimalInput }} QuotationPricingForm */
/** @typedef {{ amount: number, discount: number, net: number, quantity: number }} QuotationPricingLine */
/** @typedef {{ subtotal: number, lineDiscount: number, overallDiscount: number, discount: number, taxable: number, gst: number, total: number, lines: QuotationPricingLine[] }} QuotationTotals */

// Integer cents and half-even rounding mirror the existing Decimal quotation engine.
/** @param {bigint} value @param {bigint} divisor */
const divide = (value, divisor) => {
  const whole = value / divisor, remainder = value % divisor;
  return whole + (remainder * 2n > divisor || (remainder * 2n === divisor && whole % 2n !== 0n) ? 1n : 0n);
};
/** @param {DecimalInput} value */
const cents = (value) => {
  const match = String(value ?? 0).trim().match(/^(-?)(\d+)(?:\.(\d*))?$/);
  if (!match) return 0n;
  const digits = (match[3] || '').padEnd(2, '0');
  const base = BigInt(match[2] || '0') * 100n + BigInt(digits.slice(0, 2));
  const rounded = digits.length > 2 ? divide(base * 10n + BigInt(digits[2] ?? '0'), 10n) : base;
  return match[1] ? -rounded : rounded;
};
/** @param {bigint} value */
const nonnegative = value => value < 0n ? 0n : value;
/** @param {bigint} a @param {bigint} b */
const min = (a,b) => a < b ? a : b;
/** @param {bigint} gross @param {'FIXED' | 'PERCENTAGE' | undefined} kind @param {DecimalInput} value */
const discount = (gross, kind, value) => min(gross, kind === 'PERCENTAGE'
  ? divide(gross * min(nonnegative(cents(value)),10000n),10000n) : nonnegative(cents(value)));
/** @param {bigint} value */
const money = value => Number(value) / 100;
/** @param {DecimalInput} rate @param {DecimalInput} percentage @returns {string} */
export const rateAtPercentage = (rate, percentage) => money(divide(nonnegative(cents(rate))*nonnegative(cents(percentage)),10000n)).toFixed(2);

/** @param {QuotationPricingItem[]} items @param {QuotationPricingForm} [form] @returns {QuotationTotals} */
export function quotationTotals(items, form = {}) {
  const lineMode = Boolean(form.discount_mode && ['LINE','BOTH'].includes(form.discount_mode));
  const calculated = items.map(item => {
    const gross = nonnegative(item.amount !== undefined && (item.quantity === undefined || item.rate === undefined) ? cents(item.amount) : item.calculation_method === 'LUMPSUM'
      ? cents(item.rate) : divide(nonnegative(cents(item.quantity)) * nonnegative(cents(item.rate)),100n));
    const reduction = lineMode ? discount(gross,item.discount_type,item.discount_value) : 0n;
    return { gross, reduction, net: gross - reduction, quantity:item.calculation_method === 'LUMPSUM' ? 1 : money(nonnegative(cents(item.quantity))) };
  });
  const subtotal = calculated.reduce((sum,line)=>sum+line.gross,0n);
  const lineReduction = calculated.reduce((sum,line)=>sum+line.reduction,0n);
  const overallReduction = form.discount_mode === 'LINE' ? 0n : discount(subtotal-lineReduction,form.discount_type,form.discount_value);
  const reduction = lineReduction + overallReduction;
  const taxable = subtotal - reduction;
  const percentage = nonnegative(cents(form.gst_percentage));
  const gst = form.gst_mode === 'GST_EXTRA' ? divide(taxable*percentage,10000n)
    : form.gst_mode === 'GST_INCLUDED' && percentage > 0n ? divide(taxable*percentage,10000n+percentage) : 0n;
  return { subtotal:money(subtotal),lineDiscount:money(lineReduction),overallDiscount:money(overallReduction),discount:money(reduction),taxable:money(taxable),gst:money(gst),
    total:money(taxable+(form.gst_mode === 'GST_EXTRA'?gst:0n)),
    lines:calculated.map(line=>({amount:money(line.gross),discount:money(line.reduction),net:money(line.net),quantity:line.quantity})) };
}
