import { useId, useState } from "react";
import { SERVICE_MASTER_LABELS } from "../utils/serviceMasterLabels.js";

export default function GroupedMasterChoice({ label, options, value, customValue, onChange, save, onSave, compact = false, hideLabel = false, placeholder, invalid = false }) {
  const [custom, setCustom] = useState(Boolean(customValue));
  const requiredId = useId();
  return <div className="gq-master-choice"><label>{hideLabel ? <span className="sr-only">{label}</span> : label}<select className="bp-ui-control" aria-label={label} aria-invalid={invalid && !(custom && !value) || undefined} aria-describedby={invalid ? requiredId : undefined} value={custom && !value ? "__custom__" : value || ""} onChange={event => {
    const isCustom = event.target.value === "__custom__";
    setCustom(isCustom); onChange(isCustom ? "" : event.target.value, "");
  }}><option value="">{placeholder ?? (compact ? (label === SERVICE_MASTER_LABELS.category ? "Category" : label) : `Select ${label}`)}</option>{value && !options.some(entry => String(entry.id) === String(value)) && <option value={value}>Saved selection</option>}{options.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}<option value="__custom__">Add new {label}</option></select></label>
    {custom && !value && <><label>New {label}<input className="bp-ui-control" placeholder={compact ? "Name" : `Enter ${label.toLowerCase()}`} aria-label={`New ${label}`} aria-invalid={invalid || undefined} aria-describedby={invalid ? requiredId : undefined} maxLength={100} value={customValue || ""} onChange={event => {
      const match = options.find(entry => entry.name.trim().toLowerCase() === event.target.value.trim().toLowerCase());
      if (match) { setCustom(false); onChange(match.id, ""); } else onChange("", event.target.value);
    }} /></label>{String(customValue || "").trim() && <label className="gq-save-description"><input type="checkbox" checked={Boolean(save)} onChange={event => onSave(event.target.checked)} />{compact ? "Save to master" : `Save this ${label} to Service Master for future quotations`}</label>}</>}
    {invalid && <small className="gq-field-required" id={requiredId}>Required</small>}
  </div>;
}

