import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Building2, Eye, X } from "lucide-react";
import api from "../api/client";
import BackButton from "../components/BackButton";
import { previewPdf } from "../components/PdfPreview";

const emptyTotals = () => ({
  wallGross: 0,
  ceilingGross: 0,
  ceiling: 0,
  doors: 0,
  windows: 0,
  deductions: 0,
  additions: 0,
  wallDeductions: 0,
  wallAdditions: 0,
  ceilingDeductions: 0,
  ceilingAdditions: 0,
  netWalls: 0,
  finalArea: 0,
});

function aggregateRoom(surfaces) {
  const walls = surfaces.filter((surface) => surface.surface_type === "WALL");
  const ceilings = surfaces.filter(
    (surface) => surface.surface_type === "CEILING",
  );
  const openings = surfaces.flatMap((surface) => surface.openings || []);
  const sum = (items, field) =>
    items.reduce((total, item) => total + Number(item[field] || 0), 0);
  const openingTotal = (type) =>
    openings
      .filter((opening) => (opening.type || opening.opening_type) === type)
      .reduce(
        (total, opening) =>
          total +
          Number(
            opening.area ||
              Number(opening.width || 0) *
                Number(opening.height || 0) *
                Number(opening.quantity || 1),
          ),
        0,
      );
  const wallGross = sum(walls, "gross_area");
  const ceilingGross = sum(ceilings, "gross_area");
  const ceilingDeductions = sum(ceilings, "deduction_area");
  const ceilingAdditions = sum(ceilings, "addition_area");
  const ceiling = Math.max(
    0,
    ceilingGross - ceilingDeductions + ceilingAdditions,
  );
  const wallDeductions = sum(walls, "deduction_area");
  const deductions = wallDeductions + sum(ceilings, "deduction_area");
  const wallAdditions = sum(walls, "addition_area");
  const additions = wallAdditions + sum(ceilings, "addition_area");
  const netWalls = Math.max(0, wallGross - wallDeductions + wallAdditions);
  return {
    wallGross,
    ceilingGross,
    ceiling,
    doors: openingTotal("DOOR"),
    windows: openingTotal("WINDOW"),
    deductions,
    additions,
    wallDeductions,
    wallAdditions,
    ceilingDeductions,
    ceilingAdditions,
    netWalls,
    finalArea: netWalls + ceiling,
  };
}

export default function CustomerPropertyDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [selectedMeasurement, setSelectedMeasurement] = useState("");
  const [viewingRoom, setViewingRoom] = useState(null);
  const [error, setError] = useState("");
  const roomTableRef = useRef(null);

  const load = useCallback(
    (measurement = "") => {
      setError("");
      return api
        .get(`/quotations/customer-portal/properties/${id}/`, {
          params: measurement ? { measurement } : {},
        })
        .then((response) => {
          setData(response.data);
          setSelectedMeasurement(
            String(response.data.property.measurement_id || ""),
          );
          setViewingRoom(null);
          return true;
        })
        .catch(() => {
          setError("Property Area Calculations could not be loaded.");
          return false;
        });
    },
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  const viewMeasurement = async (recordId) => {
    const loaded = await load(recordId);
    if (loaded)
      window.setTimeout(
        () =>
          roomTableRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        0,
      );
  };

  const viewRoom = (roomId) => {
    setViewingRoom(roomId);
  };

  const downloadPdf = async (record) => {
    setError("");
    try {
      const response = await api.get(
        `/quotations/customer-portal/properties/${id}/measurements/pdf/`,
        {
          params: { measurement: record.id },
          responseType: "blob",
        },
      );
      previewPdf(response.data, `${record.reference_no}-area-calculation.pdf`);
    } catch {
      setError("Area Calculation PDF could not be previewed.");
    }
  };

  if (!data)
    return (
      <p className="p-12 text-center text-slate-500">
        {error || "Loading property..."}
      </p>
    );

  const property = data.property;
  const roomSheets = data.rooms
    .map((room) => ({
      room,
      surfaces: data.surfaces.filter((surface) => surface.room === room.id),
    }))
    .filter((sheet) => sheet.surfaces.length > 0);
  const exteriorSurfaces = data.surfaces.filter((surface) => !surface.room);
  if (exteriorSurfaces.length)
    roomSheets.push({
      room: { id: "EXTERIOR", name: "Exterior" },
      surfaces: exteriorSurfaces,
    });
  const roomTotals = roomSheets.map((sheet) => ({
    ...sheet,
    totals: aggregateRoom(sheet.surfaces),
  }));
  const allRoomTotals = roomTotals.reduce(
    (result, sheet) => ({
      wallGross: result.wallGross + sheet.totals.wallGross,
      ceilingGross: result.ceilingGross + sheet.totals.ceilingGross,
      ceiling: result.ceiling + sheet.totals.ceiling,
      doors: result.doors + sheet.totals.doors,
      windows: result.windows + sheet.totals.windows,
      deductions: result.deductions + sheet.totals.deductions,
      additions: result.additions + sheet.totals.additions,
      wallDeductions: result.wallDeductions + sheet.totals.wallDeductions,
      wallAdditions: result.wallAdditions + sheet.totals.wallAdditions,
      ceilingDeductions:
        result.ceilingDeductions + sheet.totals.ceilingDeductions,
      ceilingAdditions: result.ceilingAdditions + sheet.totals.ceilingAdditions,
      netWalls: result.netWalls + sheet.totals.netWalls,
      finalArea: result.finalArea + sheet.totals.finalArea,
    }),
    emptyTotals(),
  );
  const selectedRoom = roomTotals.find(
    (sheet) => String(sheet.room.id) === String(viewingRoom),
  );

  return (
    <div className="space-y-6">
      <BackButton fallback="/customer-properties" label="Back to properties" />
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-6">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-950 text-white">
            <Building2 />
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-600">
              {property.contractor_name}
            </p>
            <h1 className="mt-1 text-3xl font-bold">{property.name}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {property.property_type} · {property.measurement_type} ·{" "}
              {[
                property.flat_number,
                property.block_name,
                property.address,
                property.city,
                property.pincode,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white">
        <header className="border-b p-5">
          <h2 className="font-bold">Saved Area Calculations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Select an Area Calculation to view its room-wise totals and
            dimensions.
          </p>
        </header>
        <div className="grid gap-3 p-3 md:hidden">
          {data.measurement_records.map((record) => {
            const selected = String(record.id) === selectedMeasurement;
            return (
              <article
                key={record.id}
                className={`rounded-2xl border p-4 shadow-sm ${selected ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-950">
                      {record.reference_no}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {record.measured_on} · {record.contractor_name}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                    {record.status_display}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/80 p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      Area
                    </p>
                    <p className="mt-1 text-sm font-bold">
                      {Math.round(Number(record.total_sqft || 0))} sq ft
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      Rooms
                    </p>
                    <p className="mt-1 text-sm font-bold">
                      {record.room_count}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => downloadPdf(record)}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 text-sm font-bold text-white"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                </div>
              </article>
            );
          })}
          {!data.measurement_records.length && (
            <p className="p-8 text-center text-sm text-slate-500">
              No Area Calculations have been shared yet.
            </p>
          )}
        </div>
        <div
          className="hidden overflow-x-auto md:block"
          data-mobile-table="keep"
        >
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Select",
                  "Area Calculation ID",
                  "Date",
                  "Contractor",
                  "Area",
                  "Rooms",
                  "Status",
                  "Actions",
                ].map((title) => (
                  <th key={title} className="px-4 py-3">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.measurement_records.map((record) => (
                <tr
                  key={record.id}
                  className={
                    String(record.id) === selectedMeasurement
                      ? "bg-amber-50"
                      : "hover:bg-slate-50"
                  }
                >
                  <td className="px-4 py-3">
                    <input
                      type="radio"
                      name="customer-measurement"
                      checked={String(record.id) === selectedMeasurement}
                      onChange={() => viewMeasurement(record.id)}
                      aria-label={`Select ${record.reference_no}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {record.reference_no}
                  </td>
                  <td className="px-4 py-3">{record.measured_on}</td>
                  <td className="px-4 py-3">{record.contractor_name}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {Math.round(Number(record.total_sqft || 0))} sq ft
                  </td>
                  <td className="px-4 py-3">{record.room_count}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">
                      {record.status_display}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => downloadPdf(record)}
                        className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 font-semibold"
                      >
                        <Eye className="h-4 w-4" /> View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!data.measurement_records.length && (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-500">
                    No Area Calculations have been shared yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        ref={roomTableRef}
        className="scroll-mt-6 overflow-hidden rounded-2xl border bg-white"
      >
        <header className="border-b p-5">
          <h2 className="text-xl font-bold">Room Area Calculations</h2>
          <p className="mt-1 text-sm text-slate-500">
            {property.measurement_reference
              ? `${property.measurement_reference} · `
              : ""}
            {property.measurement_date
              ? `Calculated on ${property.measurement_date}.`
              : ""}
          </p>
        </header>
        {roomTotals.length > 0 && (
          <div className="space-y-3 p-3 md:hidden">
            <article className="overflow-hidden rounded-2xl border border-emerald-300 bg-emerald-50 shadow-sm">
              <header className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                    All rooms wall total
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-emerald-950">
                    {allRoomTotals.netWalls.toFixed(0)} sq ft
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                  {roomTotals.length} areas
                </span>
              </header>
              <div className="grid grid-cols-2 gap-px bg-emerald-200 text-center">
                <TotalMini label="Walls" value={allRoomTotals.wallGross} />
                <TotalMini label="Doors" value={allRoomTotals.doors} />
                <TotalMini label="Windows" value={allRoomTotals.windows} />
                <TotalMini
                  label="Deductions"
                  value={allRoomTotals.wallDeductions}
                />
                <TotalMini
                  label="Additions"
                  value={allRoomTotals.wallAdditions}
                />
                <TotalMini
                  label="Net walls"
                  value={allRoomTotals.netWalls}
                  strong
                />
              </div>
            </article>
            <article className="overflow-hidden rounded-2xl border border-blue-300 bg-blue-50 shadow-sm">
              <header className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
                  All rooms ceiling total
                </p>
                <p className="mt-1 text-xl font-extrabold text-blue-950">
                  {allRoomTotals.ceiling.toFixed(0)} sq ft
                </p>
              </header>
              <div className="grid grid-cols-2 gap-px bg-blue-200 text-center">
                <TotalMini label="Ceiling" value={allRoomTotals.ceilingGross} />
                <TotalMini
                  label="Deductions"
                  value={allRoomTotals.ceilingDeductions}
                />
                <TotalMini
                  label="Additions"
                  value={allRoomTotals.ceilingAdditions}
                />
                <TotalMini
                  label="Net ceiling"
                  value={allRoomTotals.ceiling}
                  strong
                />
              </div>
            </article>
            {roomTotals.map((sheet) => (
              <button
                key={sheet.room.id}
                type="button"
                onClick={() => viewRoom(sheet.room.id)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-slate-950">
                    {sheet.room.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Net walls {sheet.totals.netWalls.toFixed(0)} sq ft · Net
                    ceiling {sheet.totals.ceiling.toFixed(0)} sq ft
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold">
                  <Eye className="h-4 w-4" />
                  View
                </span>
              </button>
            ))}
          </div>
        )}
        {!roomTotals.length && (
          <p className="p-8 text-center text-sm text-slate-500 md:hidden">
            No completed room area values yet.
          </p>
        )}
        <div
          className="hidden overflow-x-auto md:block"
          data-mobile-table="keep"
        >
          <table className="w-full min-w-[1080px] border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 text-left text-white">
                {[
                  "Room name",
                  "Walls",
                  "Ceiling",
                  "Doors",
                  "Windows",
                  "Deductions",
                  "Additions",
                  "Net walls",
                  "Final area",
                  "Actions",
                ].map((title) => (
                  <th key={title} className="border border-slate-700 px-3 py-3">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roomTotals.map((sheet) => (
                <tr key={sheet.room.id} className="hover:bg-slate-50">
                  <td className="border border-slate-300 px-3 py-3 font-semibold">
                    {sheet.room.name}
                  </td>
                  <RoomValue value={sheet.totals.wallGross} />
                  <RoomValue value={sheet.totals.ceiling} />
                  <RoomValue value={sheet.totals.doors} />
                  <RoomValue value={sheet.totals.windows} />
                  <RoomValue value={sheet.totals.deductions} />
                  <RoomValue value={sheet.totals.additions} />
                  <RoomValue value={sheet.totals.netWalls} />
                  <RoomValue value={sheet.totals.finalArea} strong />
                  <td className="border border-slate-300 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => viewRoom(sheet.room.id)}
                      className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                  </td>
                </tr>
              ))}
              {!roomTotals.length && (
                <tr>
                  <td colSpan="10" className="p-8 text-center text-slate-500">
                    No completed room area values yet.
                  </td>
                </tr>
              )}
            </tbody>
            {roomTotals.length > 0 && (
              <tfoot>
                <tr className="bg-emerald-100 font-bold text-emerald-950">
                  <td className="border border-slate-300 px-3 py-3">
                    All rooms total
                  </td>
                  <RoomValue value={allRoomTotals.wallGross} />
                  <RoomValue value={allRoomTotals.ceiling} />
                  <RoomValue value={allRoomTotals.doors} />
                  <RoomValue value={allRoomTotals.windows} />
                  <RoomValue value={allRoomTotals.deductions} />
                  <RoomValue value={allRoomTotals.additions} />
                  <RoomValue value={allRoomTotals.netWalls} />
                  <RoomValue value={allRoomTotals.finalArea} strong />
                  <td className="border border-slate-300 px-3 py-3 text-center">
                    —
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {selectedRoom && (
        <MeasurementDetailsModal
          sheet={selectedRoom}
          close={() => setViewingRoom(null)}
        />
      )}
    </div>
  );
}

function RoomValue({ value, strong }) {
  return (
    <td
      className={`border border-slate-300 px-3 py-3 text-right tabular-nums ${strong ? "font-bold" : ""}`}
    >
      {Number(value || 0).toFixed(0)}
    </td>
  );
}

function TotalMini({ label, value, strong = false }) {
  return (
    <div className="bg-white p-3">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-xs tabular-nums text-slate-900 ${strong ? "font-extrabold" : "font-bold"}`}
      >
        {Number(value || 0).toFixed(0)}
      </p>
    </div>
  );
}

function MeasurementDetailsModal({ sheet, close }) {
  const { room, surfaces, totals } = sheet;
  const walls = surfaces.filter((surface) => surface.surface_type === "WALL");
  const ceilings = surfaces.filter(
    (surface) => surface.surface_type === "CEILING",
  );
  const openings = walls.flatMap((wall) =>
    (wall.openings || []).map((opening) => ({
      ...opening,
      wallName: wall.name,
    })),
  );
  const openingArea = (opening) =>
    Number(
      opening.area ||
        Number(opening.width || 0) *
          Number(opening.height || 0) *
          Number(opening.quantity || 1),
    );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${room.name} Area Calculation`}
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-slate-100 p-3 shadow-2xl sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Area Calculation Details
            </p>
            <h3 className="text-xl font-bold">{room.name}</h3>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close Area Calculation Details"
            className="rounded-xl border bg-white p-2.5 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <article className="overflow-hidden rounded-lg border border-slate-300 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="bg-emerald-50 text-left text-emerald-900">
                  {[
                    "Wall total",
                    "Ceiling total",
                    "Door total",
                    "Window total",
                    "Deductions",
                    "Additions",
                    "Net walls",
                    "Final area",
                  ].map((title) => (
                    <th
                      key={title}
                      className="border border-slate-300 px-3 py-2.5"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <RoomValue value={totals.wallGross} />
                  <RoomValue value={totals.ceiling} />
                  <RoomValue value={totals.doors} />
                  <RoomValue value={totals.windows} />
                  <RoomValue value={totals.deductions} />
                  <RoomValue value={totals.additions} />
                  <RoomValue value={totals.netWalls} />
                  <RoomValue value={totals.finalArea} strong />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto border-t border-slate-300">
            <table className="w-full min-w-[760px] border-collapse text-xs">
              <thead>
                <tr className="bg-slate-200 text-left font-semibold text-slate-700">
                  {[
                    "Category",
                    "Name",
                    "Height / width",
                    "Length / width",
                    "Quantity",
                    "Calculation",
                    "Area (sq ft)",
                  ].map((title) => (
                    <th
                      key={title}
                      className="border border-slate-300 px-3 py-2.5"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ceilings.map((surface) => (
                  <DetailRow
                    key={`ceiling-${surface.id}`}
                    category="Ceiling"
                    name={surface.name}
                    first={surface.length}
                    second={surface.breadth}
                    quantity="1"
                    area={surface.gross_area}
                  />
                ))}
                {walls.map((surface) => (
                  <DetailRow
                    key={`wall-${surface.id}`}
                    category="Wall"
                    name={surface.name}
                    first={surface.breadth}
                    second={surface.length}
                    quantity="1"
                    area={surface.gross_area}
                  />
                ))}
                {openings.map((opening, index) => {
                  const type = opening.type || opening.opening_type || "Other";
                  const added = opening.effect === "ADD";
                  return (
                    <DetailRow
                      key={`opening-${index}`}
                      category={added ? "Addition" : type}
                      name={opening.name || opening.wallName}
                      first={opening.height}
                      second={opening.width}
                      quantity={opening.quantity || 1}
                      area={`${added ? "+" : "-"}${openingArea(opening).toFixed(0)}`}
                    />
                  );
                })}
                {!ceilings.length && !walls.length && !openings.length && (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-500">
                      No Area Calculation Details available.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-emerald-100 font-bold text-emerald-950">
                <tr>
                  <td colSpan="6" className="border border-slate-300 px-3 py-3">
                    Final wall + ceiling area
                  </td>
                  <td className="border border-slate-300 px-3 py-3 text-right">
                    {totals.finalArea.toFixed(0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </article>
      </div>
    </div>
  );
}

function DetailRow({ category, name, first, second, quantity, area }) {
  return (
    <tr>
      <td className="border border-slate-300 px-3 py-2.5 font-semibold">
        {category}
      </td>
      <td className="border border-slate-300 px-3 py-2.5">{name}</td>
      <td className="border border-slate-300 px-3 py-2.5">{first}</td>
      <td className="border border-slate-300 px-3 py-2.5">{second}</td>
      <td className="border border-slate-300 px-3 py-2.5">{quantity}</td>
      <td className="border border-slate-300 px-3 py-2.5">
        {first} × {second} × {quantity}
      </td>
      <td className="border border-slate-300 px-3 py-2.5 text-right font-semibold tabular-nums">
        {area}
      </td>
    </tr>
  );
}
