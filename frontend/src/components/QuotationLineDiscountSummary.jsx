const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value || 0));
export default function QuotationLineDiscountSummary({items, quotation}) {
  const combined = quotation?.discount_mode === 'BOTH';
  if (!items?.some(item=>Number(item.discount_amount)>0) && !(combined && Number(quotation.discount)>0)) return null;
  const lineCents=items.reduce((total,item)=>total+Math.round(Number(item.discount_amount || 0)*100),0);
  const overall=Math.max(0,Math.round(Number(quotation?.discount || 0)*100)-lineCents)/100;
  return <section aria-label="Line discounts" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-sm font-bold bp-ui-section-heading">Line discounts</h2>
    <div className="mt-3 space-y-3">{items.map(item=><div key={item.id} className="min-w-0 text-sm">
      <p className="break-words font-semibold">{item.description}</p>
      <p className="mt-1 text-slate-600">Gross {money(item.amount)} · Discount {money(item.discount_amount)} · Net {money(item.net_amount ?? item.amount)}</p>
    </div>)}</div>
    {combined && <p className="mt-3 border-t pt-3 text-sm text-slate-600">Line discounts {money(lineCents/100)} · Overall discount {money(overall)} · Total discounts {money(quotation.discount)}</p>}
  </section>;
}
