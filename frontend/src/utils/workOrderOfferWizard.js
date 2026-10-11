export function eligibleChoices(catalog,source){
 return {properties:catalog.properties.filter(row=>String(row.customer)===String(source.customer)),quotations:catalog.quotations.filter(row=>String(row.customer)===String(source.customer) && String(row.property)===String(source.property))};
}
export function resetOfferSource(source,field,value){
 if(field==='customer')return {customer:value,property:'',quotation:''};
 if(field==='property')return {...source,property:value,quotation:''};
 return {...source,quotation:value};
}
export function allocationItems(allocation,vendor){return Object.entries(allocation).filter(([,assigned])=>String(assigned)===String(vendor)).map(([id])=>Number(id));}
export function categoryGroups(items,master){
 const groups=new Map();
 for(const item of items){const key=item.service_category ? `master:${item.service_category}` : `saved:${item.service_category_name || item.category_name || 'Uncategorized'}`;const name=master.find(row=>row.id===item.service_category)?.name || item.service_category_name || item.category_name || 'Uncategorized';if(!groups.has(key))groups.set(key,{key,name,items:[]});groups.get(key).items.push(item);}
 return [...groups.values()];
}
