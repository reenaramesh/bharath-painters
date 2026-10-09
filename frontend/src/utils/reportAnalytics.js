export const reportLabel = value => String(value || 'Unknown').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase());
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const distribution = (rows,key) => {
  const counts=new Map();
  rows.forEach(row=>{const name=reportLabel(row[key]);counts.set(name,(counts.get(name)||0)+1);});
  return [...counts].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
};
export function userReportSeries(data) {
  if (!data) return null;
  const contractors=data.contractors||[],employees=data.applicators||[],customers=data.customers||[];
  return {
    roles:[{label:'Contractors',value:contractors.length},{label:'Employees',value:employees.length},{label:'Customers',value:customers.length}],
    verification:distribution([...contractors,...employees],'verification_status'),
    customers:distribution(customers,'status'),
    availability:distribution(employees,'availability'),
  };
}
export function monthlyReportSeries(rows=[]) {
  return [...rows].sort((a,b)=>String(a.month).localeCompare(String(b.month))).map(row=>({...row,billed:numeric(row.billed),paid:numeric(row.paid),due:numeric(row.billed)-numeric(row.paid)}));
}
