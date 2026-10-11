import { groupedQuotationRoom } from './groupedQuotation.js';
import { groupedDraftItems, hasAssignment, restoreDraftAssignments } from './groupedQuotationDraft.js';
import { draftSavePayload } from './quotationDraftSave.js';
import { rememberQuotationSubmission } from './quotationSubmission.js';

export const quotationMetadata = ['customer','property','quotation_type','measurement_record','lead','valid_until','discount_mode','discount_type','discount_value','gst_mode','gst_percentage','notes','terms_conditions','prepared_by','inspected_by','payment_terms','product_details','show_product_key_features','work_duration','work_procedures'];
export function draftForm(quotation, defaults) {
  return Object.fromEntries(Object.entries(defaults).map(([key,value]) => [key,quotation[key] ?? value]));
}
const scope = state => JSON.stringify({groups:state.groups.map(({id,room_ids,surface,surfaces})=>({id,room_ids,surface,surfaces})),specials:state.specials.map(({id,room_id,surface_ids,exclude_from_standard})=>({id,room_id,surface_ids,exclude_from_standard}))});
export function restoredGroupedItems(quotation, measurement, state, masters) {
  const originalState=restoreDraftAssignments(quotation.items || []);
  const scopeChanged=scope(originalState)!==scope(state);
  const entries=source=>[...source.groups,...source.specials,...source.services];
  if(!scopeChanged && JSON.stringify(entries(state))===JSON.stringify(entries(originalState))){
    return (quotation.items || []).filter(hasAssignment).map(item=>{
      const id=item.specification_details.assignment_id || `saved-${item.id}`;
      return {...item,field_id:`assignment-${id}`,room_name:item.specification_details.kind==='service'?item.included_areas?.[0] || 'General':item.specification_details.name || item.description,rate:state.rates[id] ?? item.rate,discount_type:state.discounts[id]?.type ?? item.discount_type,discount_value:state.discounts[id]?.value ?? item.discount_value};
    });
  }
  return groupedDraftItems(measurement,state,masters,quotation.items || [],quotation.rooms || []).map(line=>{
    const original=quotation.items.find(item=>item.id===line.id);
    if(!original)return line;
    const id=line.specification_details.assignment_id;
    const unchanged=JSON.stringify(entries(state).find(entry=>entry.id===id))===JSON.stringify(entries(originalState).find(entry=>entry.id===id));
    const financial={rate:state.rates[id] ?? original.rate,discount_type:state.discounts[id]?.type ?? original.discount_type,discount_value:state.discounts[id]?.value ?? original.discount_value};
    if(unchanged && !scopeChanged)return {...line,...original,...financial};
    return {...line,...(!scopeChanged && line.specification_details.kind!=='service' ? {quantity:original.quantity} : {}),...financial};
  }).map(item=>({...item,field_id:`assignment-${item.specification_details.assignment_id}`,room_name:item.specification_details.kind==='service'?item.included_areas?.[0] || 'General':item.specification_details.name || item.description}));
}
export function builderDraftPayload(quotation, form, items, propertyRooms) {
  const rooms=(quotation.rooms || []).map(room=>({...room}));
  const lines=items.map(item=>{
    for(const roomId of item.specification_details?.room_ids || []){
      if(rooms.some(room=>String(room.property_room)===String(roomId)))continue;
      const source=propertyRooms.find(room=>String(room.id)===String(roomId));
      if(!source)throw new Error('A grouped room is missing from the saved measurement.');
      rooms.push(groupedQuotationRoom(source));
    }
    let propertyId=item.property_room_id || item.property_room;
    if(propertyId && !rooms.some(room=>String(room.property_room)===String(propertyId))){
      const source=propertyRooms.find(room=>String(room.id)===String(propertyId));
      if(!source)throw new Error('A selected room is missing from the saved measurement.');
      rooms.push(groupedQuotationRoom(source));
    }
    let room=item.room;
    const customRoom=!item.specification_details?.kind && item.room_name && item.room_name!=='General';
    if(!room && !propertyId && customRoom){
      const existing=rooms.find(entry=>entry.name===item.room_name);
      if(existing)room=existing.id;
      else rooms.push({name:item.room_name,property_room:null,length:0,width:0,height:0});
    }
    return {...item,room:room || null,...(propertyId?{property_room:propertyId}:{}),...(!room && !propertyId && customRoom?{custom_room_name:item.room_name}:{})};
  });
  const metadata={...Object.fromEntries(quotationMetadata.map(key=>[key,quotation[key]])),...form};
  return draftSavePayload(quotation,metadata,rooms,lines);
}

// Keep the saved identity even when the subsequent submission fails.
export async function persistQuotation(api, savedRef, createPayload, editPayload, send=false) {
  let saved;
  try {
    const response=savedRef.current
      ? await api.patch(`/quotations/${savedRef.current.id}/draft/`,editPayload)
      : await api.post('/quotations/create/',createPayload);
    saved=response.data;savedRef.current=saved;
    if(send){const {data}=await api.post(`/quotations/${saved.id}/submit/`,{});rememberQuotationSubmission(saved.id,data);}
    return saved;
  } catch(error) {
    if(saved)error.savedDraft=saved;
    throw error;
  }
}
