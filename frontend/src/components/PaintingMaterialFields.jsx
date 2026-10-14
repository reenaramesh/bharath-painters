import GroupedMasterChoice from './GroupedMasterChoice.jsx';
import { SERVICE_MASTER_LABELS } from '../utils/serviceMasterLabels.js';

export default function PaintingMaterialFields({ spec, onChange, masters }) {
  const update = (key, value) => onChange({ ...spec, [key]: value });
  const category = masters.categories.find(entry => String(entry.id) === String(spec.service_category));
  const categoryMissing = !category && !String(spec.custom_service_category || '').trim();
  const productRequired = (category?.name || spec.custom_service_category || '').toLowerCase().includes('paint');
  const productMissing = productRequired && !spec.paint_type && !String(spec.custom_product_type || '').trim();
  return <div className="gq-painting-specs">
    <div className="gq-painting-category">
      <GroupedMasterChoice compact invalid={categoryMissing} label={SERVICE_MASTER_LABELS.category} options={masters.categories.filter(entry => !entry.general)} value={spec.service_category} customValue={spec.custom_service_category} onChange={(id, name) => onChange({...spec, service_category:id ? Number(id) : '', custom_service_category:name, save_service_category_to_master:false, paint_type:'', custom_product_type:'', service_type:''})} save={spec.save_service_category_to_master} onSave={value => update('save_service_category_to_master', value)} />
    </div>
    <div className="gq-process-column-headings gq-process-row" aria-hidden="true"><span>Brand</span><span>Product</span><span>Coats</span></div>
    <div className="gq-process-row">
      <GroupedMasterChoice compact hideLabel placeholder="Select" label="Brand" options={masters.brands} value={spec.paint_brand} customValue={spec.custom_brand} onChange={(id, name) => onChange({...spec, paint_brand:id ? Number(id) : '', custom_brand:name, save_brand_to_master:false})} save={spec.save_brand_to_master} onSave={value => update('save_brand_to_master', value)} />
      <GroupedMasterChoice compact hideLabel invalid={productMissing} placeholder="Select" label="Product" options={masters.paintTypes.filter(entry => !entry.service_category || String(entry.service_category) === String(spec.service_category))} value={spec.paint_type} customValue={spec.custom_product_type} onChange={(id, name) => onChange({...spec, paint_type:id ? Number(id) : '', custom_product_type:name, save_product_type_to_master:false})} save={spec.save_product_type_to_master} onSave={value => update('save_product_type_to_master', value)} />
      <label><span className="sr-only">Coats</span><select className="bp-ui-control" aria-label="Coats" value={spec.coats} onChange={event => update('coats', Number(event.target.value))}>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <label>Description<input className="bp-ui-control" aria-label="Description" placeholder="Describe the work and painting process" maxLength={255} list={`painting-description-${spec.service_category}`} value={spec.description || ''} onChange={event => update('description', event.target.value)} /><datalist id={`painting-description-${spec.service_category}`}>{(masters.descriptions || []).filter(entry => !entry.service_category || String(entry.service_category) === String(spec.service_category)).map(entry => <option key={entry.id} value={entry.name} />)}</datalist></label>
    {String(spec.description || '').trim() && <label className="gq-save-description"><input type="checkbox" checked={Boolean(spec.promote_to_master)} onChange={event => update('promote_to_master', event.target.checked)} />Save description</label>}
  </div>;
}
