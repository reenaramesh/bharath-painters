const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value || 0));
export default function QuotationLineDiscountSummary({items}) {
  if (!items?.some(item=>Number(item.discount_amount)>0)) return null;
  return <section aria-label="Line discounts" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-sm font-bold">Line discounts</h2>
    <div className="mt-3 space-y-3">{items.map(item=><div key={item.id} className="min-w-0 text-sm">
      <p className="break-words font-semibold">{item.description}</p>
      <p className="mt-1 text-slate-600">Gross {money(item.amount)} · Discount {money(item.discount_amount)} · Net {money(item.net_amount ?? item.amount)}</p>
    </div>)}</div>
  </section>;
}
