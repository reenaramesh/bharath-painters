import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Search and select",
  emptyText = "No matching options",
  className = "",
  disabled = false,
  invalid = false,
}) {
  const selected = options.find(
    (option) => String(option.value ?? option.id) === String(value),
  );
  const [query, setQuery] = useState(selected?.label ?? selected?.name ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selected?.label ?? selected?.name ?? "");
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

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={invalid}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOpen(true);
        }}
        className={`${className} pl-10 ${invalid ? "border-red-400 bg-red-50" : ""}`}
      />
      {open && !disabled && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl">
          {filtered.map((option) => {
            const optionValue = option.value ?? option.id;
            const label = option.label ?? option.name;
            return (
              <button
                key={String(optionValue)}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(optionValue);
                  setQuery(label);
                  setOpen(false);
                }}
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-violet-50"
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
