import PaintingMaterialFields from './PaintingMaterialFields.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { assignedGroup, groupContribution, groupSurfaces, saveGroup, surfaceLabel, surfaceOptions, validateSpec } from '../utils/groupedQuotation.js';

const areaLabel = value => value === 'EXTERIOR' ? 'Exterior' : 'Interior';
const number = value => Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function PaintingItemDialog({ editor, state, measurement, masters, defaultSpec, Dialog, onClose, onSave, recovery, onRecovery }) {
  const [initial] = useState(() => {
    if (editor.value) return { ...editor.value, spec: { ...editor.value.spec } };
    const work_area = measurement.surfaces.some(surface => (surface.work_area || 'INTERIOR') === 'INTERIOR' && Number(surface.net_area) > 0) ? 'INTERIOR' : 'EXTERIOR';
    return { id: `painting-${crypto.randomUUID()}`, name: '', work_area, painting_item: true, measurement_record: measurement.id, surface: '', room_ids: [], spec: { ...defaultSpec, primer_coats: 0 } };
  });
  const [draft, setDraft] = useState(recovery?.draft || initial);
  const [initialRate] = useState(state.rates[initial.id] ?? '');
  const [rate, setRate] = useState(recovery?.rate ?? initialRate);
  const [error, setError] = useState('');
  const surfaceTrack = useRef(null);
  const fieldPrefix = useId();
  const rateMissing = rate === '' || !Number.isFinite(Number(rate)) || Number(rate) < 0;
  useEffect(() => setError(''), [draft, rate]);
  const legacy = Boolean(editor.value && !editor.value.painting_item);
  const workArea = draft.work_area || 'INTERIOR';
  const surfaces = surfaceOptions(measurement, workArea).filter(surface => measurement.surfaces.some(entry => (entry.work_area || 'INTERIOR') === workArea && Number(entry.net_area) > 0 && (surface === entry.surface_type || surface === `OTHER:${entry.area_group_name || entry.name || 'Other surface'}`)));
  const selectedSurfaces = groupSurfaces(draft).filter(Boolean);
  const rooms = measurement.rooms.map(room => ({
    ...room, quantity: groupContribution(measurement, state.specials, room.id, selectedSurfaces, legacy && !draft.work_area ? undefined : workArea).quantity,
    assigned: assignedGroup(state.groups, room.id, selectedSurfaces, draft.id, legacy && !draft.work_area ? undefined : workArea, measurement.id),
  })).filter(room => room.quantity > 0 || draft.room_ids.includes(room.id));
  const available = rooms.filter(room => !room.assigned && room.quantity > 0);
  const total = rooms.filter(room => draft.room_ids.includes(room.id)).reduce((sum, room) => sum + room.quantity, 0);
  useEffect(() => { onRecovery?.({ editor, draft, rate, stage: 0 }); }, [editor, draft, rate, onRecovery]);
  const close = () => {
    if ((JSON.stringify(draft) !== JSON.stringify(initial) || rate !== initialRate) && !window.confirm('Discard unsaved changes in this painting item?')) return;
    onClose();
  };
  const save = () => {
    try {
      validateSpec(draft.spec, masters);
      if (rate === '' || !Number.isFinite(Number(rate)) || Number(rate) < 0) throw new Error('Enter a valid rate.');
      const name = legacy ? draft.name : `${areaLabel(workArea)} ${selectedSurfaces.map(surfaceLabel).join(' + ')}`;
      const next = saveGroup(state, { ...draft, name }, measurement, masters);
      onSave({ ...next, rates: { ...next.rates, [draft.id]: rate } });
    } catch (failure) { setError(failure.message); }
  };
  return <Dialog className="gq-painting-item-dialog" title={`${editor.value ? 'Edit' : 'Add'} Painting Item`} onClose={close} dismissOnBackdrop={false} footer={<><button className="bp-ui-action" type="button" onClick={close}>Cancel</button><button type="button" className="special-wall-primary bp-ui-action" onClick={save}>{editor.value ? 'Save Changes' : 'Add to Quotation'}</button></>}>
    {error && <p className="gq-error" role="alert">{error}</p>}
    <section className="gq-item-section"><h3>Surface &amp; rooms</h3>
      {!legacy && <fieldset className="gq-painting-surfaces"><legend>Painting Area</legend><div className="gq-surface-carousel-track" role="radiogroup" aria-label="Painting Area">{['INTERIOR','EXTERIOR'].map(area => <label key={area} className={`gq-surface-choice ${workArea === area ? 'is-selected' : ''}`}><input type="radio" name={`painting-area-${draft.id}`} aria-label={areaLabel(area)} value={area} checked={workArea === area} disabled={!measurement.surfaces.some(surface => (surface.work_area || 'INTERIOR') === area && Number(surface.net_area) > 0)} onChange={() => setDraft(current => ({...current,work_area:area,surface:'',surfaces:[],room_ids:[]}))} /><span>{areaLabel(area)}</span></label>)}</div></fieldset>}
      {legacy ? <p>Saved scope: {selectedSurfaces.map(surfaceLabel).join(' + ')}. Existing room assignments are retained.</p> : <fieldset className="gq-painting-surfaces gq-required-surface" aria-invalid={!selectedSurfaces.length || undefined} aria-describedby={!selectedSurfaces.length ? `${fieldPrefix}-surface` : undefined}><legend>Surface Category</legend>
        <div className="gq-surface-carousel">
          <button className="bp-ui-icon-action" type="button" aria-label="Previous surface categories" onClick={() => surfaceTrack.current?.scrollBy({left:-240,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}><ChevronLeft size={18} aria-hidden="true" /></button>
          <div ref={surfaceTrack} className="gq-surface-carousel-track" role="group" aria-label="Measured surface categories">{surfaces.map(surface => <label key={surface} className={`gq-surface-choice ${selectedSurfaces.includes(surface) ? 'is-selected' : ''}`}><input type="checkbox" aria-label={`Select surface ${surfaceLabel(surface)}`} checked={selectedSurfaces.includes(surface)} onChange={() => setDraft(current => {
            const previous = groupSurfaces(current).filter(Boolean);
            const next = previous.includes(surface) ? previous.filter(value => value !== surface) : [...previous,surface];
            return {...current,surface:next[0] || '',surfaces:next,room_ids:[]};
          })} /><span>{surfaceLabel(surface)}</span></label>)}</div>
          <button className="bp-ui-icon-action" type="button" aria-label="Next surface categories" onClick={() => surfaceTrack.current?.scrollBy({left:240,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
        {!selectedSurfaces.length && <small className="gq-field-required" id={`${fieldPrefix}-surface`}>Select a surface.</small>}
      </fieldset>}
      <div className="gq-select-all"><h4>Rooms</h4><button className="bp-ui-action" type="button" disabled={!available.length} onClick={() => setDraft(current => ({ ...current, room_ids: available.map(room => room.id) }))}>Select all</button></div>
      <div className="gq-room-list" role="group" aria-label="Rooms" aria-invalid={selectedSurfaces.length > 0 && !draft.room_ids.length || undefined} aria-describedby={selectedSurfaces.length > 0 && !draft.room_ids.length ? `${fieldPrefix}-rooms` : undefined}>{rooms.map(room => <label key={room.id} className={`gq-room-option ${room.assigned ? 'is-disabled' : ''}`}><input type="checkbox" aria-label={`Select ${room.name}`} disabled={Boolean(room.assigned) || room.quantity <= 0} checked={draft.room_ids.includes(room.id)} onChange={() => setDraft(current => ({ ...current, room_ids: current.room_ids.includes(room.id) ? current.room_ids.filter(id => id !== room.id) : [...current.room_ids, room.id] }))} /><span>{room.name}{room.assigned && <small>Already Assigned</small>}</span><b>{number(room.quantity)} sqft</b></label>)}</div>
      {selectedSurfaces.length > 0 && !draft.room_ids.length && <small className="gq-field-required" id={`${fieldPrefix}-rooms`}>Select at least one room.</small>}
      {!rooms.length && <p>{selectedSurfaces.length ? "No measured rooms for this surface." : "Select a surface to see rooms."}</p>}
    </section>
    <section className="gq-item-section"><h3>Materials &amp; Specifications</h3>
      <PaintingMaterialFields masters={masters} spec={draft.spec} onChange={spec => setDraft(current => ({ ...current, spec }))} />

    </section>
    <section className="gq-item-section"><h3>Pricing</h3><div className="gq-painting-pricing-row"><label>Sqft<input className="bp-ui-control" aria-label="Total Area" value={number(total)} readOnly /></label><label>Rate<input className="bp-ui-control" aria-label="Rate" aria-invalid={rateMissing || undefined} aria-describedby={rateMissing ? `${fieldPrefix}-rate` : undefined} placeholder="Rate" type="number" min="0" step="0.01" inputMode="decimal" value={rate} onChange={event => setRate(event.target.value)} />{rateMissing && <small className="gq-field-required" id={`${fieldPrefix}-rate`}>Enter a rate. Use 0 for no charge.</small>}</label></div><div className="gq-selection-summary" aria-live="polite"><span>{draft.room_ids.length} rooms · {number(total)} sqft</span><strong>Amount: INR {number(total * (Number.isFinite(Number(rate)) ? Number(rate) : 0))}</strong></div></section>
  </Dialog>;
}
