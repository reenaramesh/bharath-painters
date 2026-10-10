import { useId, useRef } from "react";
import { ChevronDown } from "lucide-react";

export default function CustomerStatusFilter({ value, options, onChange }) {
  const name = useId();
  const disclosure = useRef(null);
  const summary = useRef(null);
  const current = options.find((option) => option.value === value);
  return <details ref={disclosure} className="customer-status-filter md:hidden" onKeyDown={(event) => {
    if (event.key === "Escape") { disclosure.current.open = false; summary.current.focus(); }
  }}>
    <summary ref={summary}><span>{current?.label || "All statuses"}</span><ChevronDown size={16} aria-hidden="true" /></summary>
    <fieldset>
      <legend className="sr-only">Filter customers by status</legend>
      {options.map((option) => <label key={option.value} className={value === option.value ? "is-selected" : ""}>
        <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => {
          onChange(option.value); disclosure.current.open = false; summary.current.focus();
        }} />
        <span>{option.label}</span>
      </label>)}
    </fieldset>
  </details>;
}
