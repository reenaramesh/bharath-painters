import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Search and select",
  emptyText = "No matching options",
  className = "",
  disabled = false,
  invalid = false,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const listId = `${inputId}-options`;
  const queryClearPending = useRef(false);
  const activeOptionRef = useRef(null);
  const selected = options.find(
    (option) => String(option.value ?? option.id) === String(value),
  );
  const [query, setQuery] = useState(selected?.label ?? selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!(queryClearPending.current && value === "")) {
      setQuery(selected?.label ?? selected?.name ?? "");
    }
    queryClearPending.current = false;
  }, [selected?.label, selected?.name, value]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return options
      .filter((option) => {
        const label = String(option.label ?? option.name ?? "");
        return !term || label.toLowerCase().includes(term);
      })
      .slice(0, 40);
  }, [options, query]);
  const expanded = open && !disabled;
  const activeOption = expanded ? filtered[activeIndex] : undefined;

  useEffect(() => {
    activeOptionRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  function selectOption(option) {
    queryClearPending.current = false;
    onChange(option.value ?? option.id);
    setQuery(option.label ?? option.name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (!filtered.length) return -1;
        if (!expanded || current < 0 || current >= filtered.length) {
          return event.key === "ArrowDown" ? 0 : filtered.length - 1;
        }
        return (current + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length;
      });
    } else if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      selectOption(activeOption);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Tab") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        id={inputId}
        role="combobox"
        aria-label={ariaLabel || (!ariaLabelledBy ? placeholder : undefined)}
        aria-labelledby={ariaLabelledBy}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={activeOption ? `${listId}-${activeIndex}` : undefined}
        value={query}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={invalid}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setActiveIndex(-1); }}
        onBlur={() => { setOpen(false); setActiveIndex(-1); }}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          setQuery(event.target.value);
          queryClearPending.current = true;
          onChange("");
          setOpen(true);
          setActiveIndex(-1);
        }}
        className={(`${className} pl-10 bp-control-leading-icon ${invalid ? "border-red-400 bg-red-50" : ""}`) + " bp-ui-control"}
      />
      {expanded && (
        <div id={listId} role="listbox" aria-label={ariaLabel || placeholder} className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl">
          {filtered.map((option, index) => {
            const optionValue = option.value ?? option.id;
            const label = option.label ?? option.name;
            return (
              <button
                key={String(optionValue)}
                type="button"
                id={`${listId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={String(optionValue) === String(value)}
                ref={index === activeIndex ? activeOptionRef : undefined}
                data-active={index === activeIndex || undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
                className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-violet-50 bp-ui-action ${index === activeIndex ? "bg-violet-50 outline outline-2 outline-violet-500" : ""}`}
              >
                {label}
              </button>
            );
          })}
          {!filtered.length && (
            <p className="px-3 py-4 text-center text-sm text-slate-500">
              {emptyText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
