// Local fixture preview; not imported by production routes.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import QuotationPricingRows from '../components/QuotationPricingRows.jsx';
import {LanguageProvider} from '../i18n/LanguageContext.jsx';
import AuthContext from '../context/auth-context.js';
import '../index.css';
import '../styles/mobile-responsive.css';

const masters = {categories:[{id:1,name:'Painting'}],brands:[{id:1,name:'Asian Paints'}],paintTypes:[{id:1,name:'Premium Emulsion'}],units:[{id:1,name:'sqft'}]};
function Preview() {
  const [items,setItems] = useState([{id:1,service_category:1,paint_brand:1,paint_type:1,coats:2,quantity:330,rate:20,unit:1,description:'Smooth finish',specification_details:{kind:'group',painting_process:'PUTTY_PRIMER_PAINT',base_description:'Smooth finish',surface:'WALL',contributions:[{room_name:'Bedroom',quantity:330}],primer_coats:1,process_materials:{primer:{brand:2,product:2},putty:{brand:3,product:3,coats:1}}}}]);
  return React.createElement(QuotationPricingRows,{items,masters,units:masters.units,form:{discount_mode:'LINE'},onChange:(item,key,value)=>setItems(current=>current.map(line=>line.id===item.id?{...line,[key]:value}:line)),onEdit:item=>{window.__pricingEdited=item.id;},onDelete:()=>false});
}
export function mountPricingColumnsAudit() {
  createRoot(document.getElementById('check')).render(React.createElement(AuthContext.Provider,{value:{user:{id:999999,role:'CONTRACTOR'}}},React.createElement(LanguageProvider,null,React.createElement('main',{style:{padding:16,maxWidth:1440,margin:'auto'}},React.createElement(Preview)))));
}
