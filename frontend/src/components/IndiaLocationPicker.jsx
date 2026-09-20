import { useEffect, useState } from "react";
import { Crosshair, LoaderCircle, MapPin, Search } from "lucide-react";
import { getLocationEngine, getMobileLocation } from "../utils/indiaLocation";

export default function IndiaLocationPicker({ value, onChange, required = false, title = "Work location" }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setSuggestions([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const engine = await getLocationEngine();
        const result = engine.search(term, { limit: 20 });
        const unique = [];
        const used = new Set();
        for (const item of result.success ? result.data.data : []) {
          const key = `${item.pincode}-${item.area}`;
          if (!used.has(key)) {
            used.add(key);
            unique.push(item);
          }
          if (unique.length === 8) break;
        }
        setSuggestions(unique);
        setError(unique.length ? "" : "No matching Indian location found.");
      } catch {
        setSuggestions([]);
        setError("PIN directory could not be loaded. You can still use mobile location.");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function select(item) {
    onChange({
      ...value,
      location: item.area,
      city: item.district,
      state: item.state,
      pincode: item.pincode,
      latitude: item.latitude,
      longitude: item.longitude,
      location_source: "PINCODE",
    });
    setQuery("");
    setSuggestions([]);
    setError("");
  }

  async function locate() {
    setLocating(true);
    setError("");
    try {
      onChange({ ...value, ...(await getMobileLocation()) });
    } catch (requestError) {
      setError(requestError.message || "Location permission was not granted.");
    } finally {
      setLocating(false);
    }
  }

  const selected = value?.latitude != null && value?.longitude != null;
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold text-slate-950">{title}{required ? " *" : ""}</p>
          <p className="mt-1 text-xs text-slate-500">Search any Indian city, locality or PIN code, or use this phone's location.</p>
        </div>
        <button type="button" onClick={locate} disabled={locating} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {locating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          {locating ? "Finding location..." : "Use my current location"}
        </button>
      </div>
      <div className="relative mt-4">
        <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-3">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" /> : <Search className="h-4 w-4 text-slate-400" />}
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type city, area or PIN code" className="w-full bg-transparent text-sm outline-none" />
        </label>
        {suggestions.length > 0 && (
          <div className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-2xl">
            {suggestions.map((item) => (
              <button type="button" key={`${item.pincode}-${item.area}`} onClick={() => select(item)} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-blue-50">
                <b className="block text-sm">{item.area} · {item.pincode}</b>
                <small className="text-slate-500">{item.district}, {item.state}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-white p-3 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span><b>{value.location}</b><br /><span className="text-slate-500">{[value.city, value.state, value.pincode].filter(Boolean).join(" · ")} · {value.location_source === "GPS" ? "Mobile GPS" : "PIN directory"}</span></span>
        </div>
      )}
      <label className="mt-3 block text-sm font-semibold">Search radius
        <select value={value?.radius_km || 10} onChange={(event) => onChange({ ...value, radius_km: Number(event.target.value) })} className="mt-2 w-full rounded-xl border bg-white px-3 py-3 font-normal">
          {[5, 10, 15, 25, 50, 100].map((radius) => <option key={radius} value={radius}>{radius} km radius</option>)}
        </select>
      </label>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
