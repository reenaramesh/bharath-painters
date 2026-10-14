import QuotationAssignmentActions from './QuotationAssignmentActions.jsx';
import { replacesStandard } from '../utils/groupedQuotation.js';

const nameFor = (entries, id, custom = '') => entries.find(entry => String(entry.id) === String(id))?.name || custom || 'Not selected';
const number = value => Number(value).toLocaleString('en-IN', {maximumFractionDigits:2});
const money = value => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:2}).format(value);

export default function AssignmentLineItems({ lines, masters, squareFeetUnit, onView, onEdit, onDelete, onContributions }) {
  return <div className="gq-assignment-line-items" role="region" aria-label="Measured services and products" tabIndex={0}>
    <table aria-label="Quotation line items" data-mobile-table="keep"><thead><tr>{['Room / Area','Service','Surface','Brand','Description','Quantity','Coats','Rate','Amount','Actions'].map(label => <th key={label} scope="col" data-no-sort="true">{label==='Actions'?<span className="sr-only">Actions</span>:label}</th>)}</tr></thead>
      <tbody>{lines.map(line => {
        const product = nameFor(masters.paintTypes,line.spec.paint_type,line.spec.custom_product_type);
        const validRate = line.rate !== '' && line.rate != null && Number.isFinite(Number(line.rate)) && Number(line.rate) >= 0;
        return <tr key={line.id}>
          <th scope="row"><strong>{line.name}</strong>{line.kind === 'special' && <small>{replacesStandard(line) ? 'Replaces standard painting' : 'Additional service process'}</small>}{line.contributions.length > 0 ? <button type="button" className="gq-line-scope bp-ui-action" aria-label={`View rooms for ${line.name}`} aria-haspopup="dialog" onClick={() => onContributions(line)}>{line.scope}</button> : <small>{line.scope}</small>}</th>
          <td>{nameFor(masters.categories,line.spec.service_category,line.spec.custom_service_category)}</td>
          <td>{line.contributions.length > 0 ? <button type="button" className="gq-line-scope bp-ui-action" aria-label={`View surface for ${line.name}`} aria-haspopup="dialog" onClick={() => onContributions(line)}>{line.surface_label}</button> : line.surface_label}</td>
          <td>{nameFor(masters.brands,line.spec.paint_brand,line.spec.custom_brand)}</td>
          <td><strong>{product}</strong>{line.spec.description && line.spec.description.trim().toLowerCase() !== product.trim().toLowerCase() && <small>{line.spec.description}</small>}</td>
          <td className="gq-line-number">{number(line.quantity)}<small>{nameFor(masters.units,line.unit || squareFeetUnit)}</small></td>
          <td>{line.spec.coats || 1}</td>
          <td className="gq-line-number">{validRate ? money(Number(line.rate)) : <span className="gq-field-required">Rate needed</span>}</td>
          <td className="gq-line-number"><strong>{validRate ? money(line.quantity * Number(line.rate)) : '—'}</strong></td>
          <td><QuotationAssignmentActions name={line.name} onView={() => onView(line)} onEdit={() => onEdit(line)} onDelete={() => onDelete(line)} /></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
