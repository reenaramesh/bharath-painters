import { useId } from "react";

export function Input({
  id,
  label,
  required = false,
  error,
  helpText: _helpText,
  className = "",
  controlClassName = "",
  type = "text",
  ...props
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [props["aria-describedby"], errorId].filter(Boolean).join(" ") || undefined;
  const invalid = error ? true : props["aria-invalid"];

  return (
    <div className={`bp-field ${className}`.trim()}>
      <label className="bp-field-label" htmlFor={controlId}>
        {label}
        {required && <span className="bp-required" aria-hidden="true">*</span>}
      </label>
      <input
        {...props}
        id={controlId}
        type={type}
        required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`bp-control ${error ? "bp-control-invalid" : ""} ${controlClassName}`.trim()}
      />
      
      {error && <p id={errorId} className="bp-field-error" role="alert">{error}</p>}
    </div>
  );
}

export function Select({
  id,
  label,
  required = false,
  error,
  helpText: _helpText,
  className = "",
  controlClassName = "",
  options = [],
  placeholder = "Select...",
  ...props
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [props["aria-describedby"], errorId].filter(Boolean).join(" ") || undefined;
  const invalid = error ? true : props["aria-invalid"];

  return (
    <div className={`bp-field ${className}`.trim()}>
      <label className="bp-field-label" htmlFor={controlId}>
        {label}
        {required && <span className="bp-required" aria-hidden="true">*</span>}
      </label>
      <select
        {...props}
        id={controlId}
        required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`bp-control ${error ? "bp-control-invalid" : ""} ${controlClassName}`.trim()}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value || opt.id} value={opt.value || opt.id}>
            {opt.label || opt.name}
          </option>
        ))}
      </select>
      
      {error && <p id={errorId} className="bp-field-error" role="alert">{error}</p>}
    </div>
  );
}

export function Textarea({
  id,
  label,
  required = false,
  error,
  helpText: _helpText,
  className = "",
  controlClassName = "",
  rows = 3,
  ...props
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [props["aria-describedby"], errorId].filter(Boolean).join(" ") || undefined;
  const invalid = error ? true : props["aria-invalid"];

  return (
    <div className={`bp-field ${className}`.trim()}>
      <label className="bp-field-label" htmlFor={controlId}>
        {label}
        {required && <span className="bp-required" aria-hidden="true">*</span>}
      </label>
      <textarea
        {...props}
        id={controlId}
        required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        rows={rows}
        className={`bp-control ${error ? "bp-control-invalid" : ""} ${controlClassName}`.trim()}
      />
      
      {error && <p id={errorId} className="bp-field-error" role="alert">{error}</p>}
    </div>
  );
}

export function Checkbox({
  id,
  label,
  error,
  className = "",
  controlClassName = "",
  ...props
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [props["aria-describedby"], errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`bp-field bp-field-checkbox ${className}`.trim()}>
      <label className="bp-field-label bp-field-label-checkbox" htmlFor={controlId}>
        <input
          {...props}
          id={controlId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`bp-control bp-control-checkbox ${controlClassName}`.trim()}
        />
        <span className="bp-checkbox-label">{label}</span>
      </label>
      {error && <p id={errorId} className="bp-field-error" role="alert">{error}</p>}
    </div>
  );
}