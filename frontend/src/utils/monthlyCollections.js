const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const receiptDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'});

// Sum server decimal receipts in paise. Floating point is used only for bar height.
export function monthlyCollections(receipts=[],year=new Date().getFullYear()) {
  const totals=Array(12).fill(0n);
  for (const row of receipts || []) {
    const amount=String(row.amount ?? '');
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) continue;
    const date=new Date(row.date);
    if (!row.date || Number.isNaN(date.getTime())) continue;
    const parts=receiptDate.formatToParts(date);
    if (Number(parts.find(part=>part.type==='year')?.value)!==Number(year)) continue;
    const month=Number(parts.find(part=>part.type==='month')?.value)-1;
    const [whole,fraction='']=amount.split('.');
    totals[month]+=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  }
  const maximum=totals.reduce((max,total)=>total>max ? total : max,0n);
  return totals.map((total,index)=>({month:index+1,label:monthNames[index],amount:`${total/100n}.${String(total%100n).padStart(2,'0')}`,height:maximum ? Number(total*10000n/maximum)/100 : 0}));
}
