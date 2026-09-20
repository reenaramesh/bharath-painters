import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronRight, MapPin, Ruler } from "lucide-react";
import api from "../api/client";

export default function CustomerProperties() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/quotations/customer-portal/properties/")
      .then(({ data }) => setItems(data))
      .catch(() => setError("Properties could not be loaded."));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-amber-600">Customer portal</p>
        <h1 className="mt-1 text-3xl font-bold">My properties</h1>
        <p className="mt-2 text-slate-500">
          Properties and Area Calculations recorded by your connected
          contractors.
        </p>
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <section className="overflow-hidden rounded-2xl border bg-white">
        {items.length ? (
          <>
            <div className="grid gap-3 p-3 md:hidden">
              {items.map((item) => (
                <Link
                  key={item.id}
                  to={`/customer-properties/${item.id}`}
                  className="block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3 bg-slate-950 p-4 text-white">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
                        {item.property_type || "Property"}
                      </p>
                      <h2 className="mt-1 truncate text-base font-bold">
                        {item.name || "Unnamed property"}
                      </h2>
                      <p className="mt-1 truncate text-xs text-slate-300">
                        {item.contractor_name || "Contractor"}
                      </p>
                    </div>
                    <Building2 className="h-5 w-5 shrink-0 text-slate-300" />
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-slate-200">
                    <div className="bg-white p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Area type
                      </p>
                      <p className="mt-1 text-sm font-bold">
                        {item.measurement_type || "Not specified"}
                      </p>
                    </div>
                    <div className="bg-white p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Recorded
                      </p>
                      <p className="mt-1 text-sm font-bold">
                        {item.rooms || 0} rooms
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {item.surfaces || 0} surfaces
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t bg-slate-50 p-3">
                    <p className="min-w-0 truncate text-xs text-slate-600">
                      <MapPin className="mr-1 inline h-3.5 w-3.5" />
                      {[
                        item.flat_number,
                        item.block_name,
                        item.address,
                        item.city,
                        item.pincode,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Address not added"}
                    </p>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-blue-700">
                      View <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div
              className="hidden overflow-x-auto md:block"
              data-mobile-table="keep"
            >
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Property</th>
                    <th className="px-5 py-3">Contractor</th>
                    <th className="px-5 py-3">Address</th>
                    <th className="px-5 py-3">Area calculation type</th>
                    <th className="px-5 py-3" data-no-sort="true">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-bold">
                        {item.name || "Unnamed property"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {item.contractor_name || "—"}
                      </td>
                      <td className="max-w-sm px-5 py-4 text-slate-600">
                        {[
                          item.flat_number,
                          item.block_name,
                          item.address,
                          item.city,
                          item.pincode,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Address not added"}
                      </td>
                      <td className="px-5 py-4">
                        {item.measurement_type || "—"}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          to={`/customer-properties/${item.id}`}
                          className="inline-flex rounded-lg border px-3 py-2 font-semibold hover:bg-white"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-14 text-center text-slate-400">
            <Ruler className="mx-auto h-10 w-10" />
            <p className="mt-3">No synchronized properties yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}
