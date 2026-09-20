import { useEffect, useState } from "react";
import { X } from "lucide-react";
import api from "../api/client";
import SearchableSelect from "./SearchableSelect";

export default function RoomForm({ initialValue, onSubmit, onClose, saving }) {
  const [types, setTypes] = useState([]); const [roomType, setRoomType] = useState("");
  useEffect(() => { api.get("/quotations/areas/").then(({ data }) => setTypes(data.results || data)); }, []);
  useEffect(() => { setRoomType(initialValue?.room_type ? String(initialValue.room_type) : ""); }, [initialValue]);
  const input = "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900";
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"><div className="h-full w-full max-w-xl overflow-y-auto bg-white"><div className="flex items-center justify-between border-b p-6"><div><h2 className="text-xl font-bold">{initialValue ? "Edit room" : "Add room"}</h2><p className="text-sm text-slate-500">Choose a dynamically managed room type</p></div><button onClick={onClose}><X /></button></div>
    <form onSubmit={(event) => { event.preventDefault(); const selected = types.find((type) => String(type.id) === roomType); if (selected) onSubmit({ room_type: Number(roomType), name: selected.name }); }} className="space-y-5 p-6"><label className="block text-sm font-medium">Room *<SearchableSelect value={roomType} options={types} onChange={(value) => setRoomType(String(value))} placeholder="Search room type" className={input} /></label>{!types.length && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Create room names in Master Data before adding rooms.</p>}<div className="flex justify-end gap-3 border-t pt-5"><button type="button" onClick={onClose} className="rounded-xl border px-5 py-2.5 font-semibold">Cancel</button><button disabled={saving || !roomType} className="rounded-xl bg-slate-950 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save room"}</button></div></form>
  </div></div>;
}
