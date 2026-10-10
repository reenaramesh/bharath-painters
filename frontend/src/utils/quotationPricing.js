// Integer cents and half-even rounding mirror the existing Decimal quotation engine.
const divide = (value, divisor) => {
  const whole = value / divisor, remainder = value % divisor;
  return whole + (remainder * 2n > divisor || (remainder * 2n === divisor && whole % 2n !== 0n) ? 1n : 0n);
};
const cents = (value) => {
  const match = String(value ?? 0).trim().match(/^(-?)(\d+)(?:\.(\d*))?$/);
  if (!match) return 0n;
  const digits = (match[3] || '').padEnd(2, '0');
  const base = BigInt(match[2]) * 100n + BigInt(digits.slice(0, 2));
  const rounded = digits.length > 2 ? divide(base * 10n + BigInt(digits[2]), 10n) : base;
  return match[1] ? -rounded : rounded;
};
const nonnegative = value => value < 0n ? 0n : value;
const min = (a,b) => a < b ? a : b;
const discount = (gross, kind, value) => min(gross, kind === 'PERCENTAGE'
  ? divide(gross * min(nonnegative(cents(value)),10000n),10000n) : nonnegative(cents(value)));
const money = value => Number(value) / 100;
export const rateAtPercentage = (rate, percentage) => money(divide(nonnegative(cents(rate))*nonnegative(cents(percentage)),10000n)).toFixed(2);

export function quotationTotals(items, form = {}) {
  const lineMode = form.discount_mode === 'LINE';
  const calculated = items.map(item => {
    const gross = nonnegative(item.amount !== undefined && (item.quantity === undefined || item.rate === undefined) ? cents(item.amount) : item.calculation_method === 'LUMPSUM'
      ? cents(item.rate) : divide(nonnegative(cents(item.quantity)) * nonnegative(cents(item.rate)),100n));
    const reduction = lineMode ? discount(gross,item.discount_type,item.discount_value) : 0n;
    return { gross, reduction, net: gross - reduction, quantity:item.calculation_method === 'LUMPSUM' ? 1 : money(nonnegative(cents(item.quantity))) };
  });
  const subtotal = calculated.reduce((sum,line)=>sum+line.gross,0n);
  const reduction = lineMode ? calculated.reduce((sum,line)=>sum+line.reduction,0n) : discount(subtotal,form.discount_type,form.discount_value);
  const taxable = subtotal - reduction;
  const percentage = nonnegative(cents(form.gst_percentage));
  const gst = form.gst_mode === 'GST_EXTRA' ? divide(taxable*percentage,10000n)
    : form.gst_mode === 'GST_INCLUDED' && percentage > 0n ? divide(taxable*percentage,10000n+percentage) : 0n;
  return { subtotal:money(subtotal),discount:money(reduction),taxable:money(taxable),gst:money(gst),
    total:money(taxable+(form.gst_mode === 'GST_EXTRA'?gst:0n)),
    lines:calculated.map(line=>({amount:money(line.gross),discount:money(line.reduction),net:money(line.net),quantity:line.quantity})) };
}
