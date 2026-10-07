import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import api from "../api/client";
import { quotationRoomAreaLabel } from "../utils/groupedQuotation";
import BackButton from "../components/BackButton";
import SearchableSelect from "../components/SearchableSelect";
import { Button, ErrorState, LoadingState, PageHeader, SectionCard } from "../components/ui";
import "./quotation-measurement.css";

export default function QuotationEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [quotationRooms, setQuotationRooms] = useState([]);
  const [items, setItems] = useState([]);
  const [propertyRooms, setPropertyRooms] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [paintTypes, setPaintTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [descriptions, setDescriptions] = useState([]);
  const [units, setUnits] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState([]);
  const [mobileItemId, setMobileItemId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get(`/quotations/${id}/`)
      .then(async ({ data }) => {
        setForm({
          quotation_type: data.quotation_type,
          status: data.status,
          valid_until: data.valid_until || "",
          discount_type: data.discount_type,
          discount_value: data.discount_value,
          gst_mode: data.gst_mode,
          gst_percentage: data.gst_percentage,
          notes: data.notes || "",
          terms_conditions: data.terms_conditions || "",
          prepared_by: data.prepared_by || "",
          inspected_by: data.inspected_by || "",
          payment_terms: data.payment_terms || "",
          product_details: data.product_details || "",
          show_product_key_features: data.show_product_key_features !== false,
          work_duration: data.work_duration || "",
          work_procedures: data.work_procedures || "",
        });
        setQuotationRooms(data.rooms || []);
        setSelectedRoomIds(
          (data.rooms || []).map((room) => room.property_room).filter(Boolean),
        );
        const [rooms, measures, masterServices, masterPaintTypes, masterBrands, masterUnits, masterDescriptions, masterCategories, masterRooms] = await Promise.all([
          api.get(`/quotations/properties/${data.property}/rooms/`),
          api.get(`/quotations/properties/${data.property}/measurements/`),
          api.get("/quotations/service-types/"),
          api.get("/quotations/paint-types/"),
          api.get("/quotations/brands/"),
          api.get("/quotations/units/"),
          api.get("/quotations/work-descriptions/"),
          api.get("/quotations/service-categories/"),
          api.get("/quotations/areas/"),
        ]);
        const loadedRooms = rooms.data.results || rooms.data;
        const loadedMeasurements = measures.data.results || measures.data;
        const loadedServices = masterServices.data.results || masterServices.data;
        const loadedUnits = masterUnits.data.results || masterUnits.data;
        setPropertyRooms(loadedRooms);
        setMeasurements(loadedMeasurements);
        setServices(loadedServices);
        setCategories(masterCategories.data.results || masterCategories.data);
        setPaintTypes(masterPaintTypes.data.results || masterPaintTypes.data);
        setBrands(masterBrands.data.results || masterBrands.data);
        setUnits(loadedUnits);
        setDescriptions(masterDescriptions.data.results || masterDescriptions.data);
        setRoomTypes(masterRooms.data.results || masterRooms.data);
        // Editing must preserve every saved quotation line exactly as stored.
        // Rebuilding room lines from current measurements here caused existing
        // and newly added room services to collapse into the same full-house lines.
        setItems((data.items || []).map((item) => ({ ...item })));
      })
      .catch(() => setError("Quotation could not be loaded."));
  }, [id]);
  const update = (event) =>
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  const updateItem = (itemId, field, value) =>
    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item,
      ),
    );
  const updateProductType = (itemId, value) => {
    const product = paintTypes.find((entry) => String(entry.id) === String(value));
    setItems((current) => current.map((item) => item.id === itemId
      ? { ...item, paint_type: value, ...(product?.default_price !== null && product?.default_price !== undefined ? { rate: String(product.default_price) } : {}) }
      : item));
  };
  const updateService = (itemId, value) => {
    const selected = services.find((service) => String(service.id) === String(value));
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              service_type: value,
              service_category: selected?.category_master || null,
              paint_type: "",
            }
          : item,
      ),
    );
  };
  const removeItem = (itemToRemove) =>
    setItems((current) =>
      current.filter((item) => item !== itemToRemove && item.id !== itemToRemove.id),
    );
  const addAdditionalService = () => setItems((current) => [...current, { id: `new-service-${Date.now()}`, room: null, service_type: "", paint_type: null, paint_brand: null, color: null, description: "", coats: 1, calculation_method: "MANUAL", is_additional_service: true, custom_unit: "", quantity: "1", unit: "", rate: "" }]);
  const input =
    "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900";
  const isLumpSum = form?.quotation_type === "MANUAL_LUMPSUM";
  const roomById = new Map([
    ...quotationRooms.map((room) => [room.id, room]),
    ...propertyRooms.map((room) => [`property-${room.id}`, room]),
    ...roomTypes.map((room) => [`master-${room.id}`, room]),
  ]);
  const allRoomOptions = useMemo(() => {
    const options = [];
    const linkedPropertyRooms = new Set();
    const roomNames = new Set();
    quotationRooms.forEach((room) => {
      const propertyRoomId = room.property_room || null;
      if (propertyRoomId) linkedPropertyRooms.add(String(propertyRoomId));
      roomNames.add(String(room.name || "").trim().toLowerCase());
      options.push({
        key: `quotation-${room.id}`,
        name: room.name,
        quotationRoomId: room.id,
        propertyRoomId,
      });
    });
    propertyRooms.forEach((room) => {
      if (linkedPropertyRooms.has(String(room.id))) return;
      const nameKey = String(room.name || "").trim().toLowerCase();
      if (!nameKey || roomNames.has(nameKey)) return;
      roomNames.add(nameKey);
      options.push({
        key: `property-${room.id}`,
        name: room.name,
        quotationRoomId: null,
        propertyRoomId: room.id,
      });
    });
    roomTypes.forEach((room) => {
      const nameKey = String(room.name || "").trim().toLowerCase();
      if (!nameKey || roomNames.has(nameKey)) return;
      roomNames.add(nameKey);
      options.push({
        key: `master-${room.id}`,
        name: room.name,
        quotationRoomId: null,
        propertyRoomId: null,
        masterRoomId: room.id,
      });
    });
    return options;
  }, [quotationRooms, propertyRooms, roomTypes]);
  const assignItemRoom = (itemId, optionKey) => {
    const option = allRoomOptions.find((entry) => entry.key === optionKey);
    setItems((current) => current.map((item) => item.id === itemId
      ? {
          ...item,
          room: option ? (option.quotationRoomId || (option.propertyRoomId ? `property-${option.propertyRoomId}` : `master-${option.masterRoomId}`)) : null,
          property_room: option?.propertyRoomId || null,
          custom_room_name: option?.masterRoomId ? option.name : "",
        }
      : item));
    if (option?.propertyRoomId) {
      setSelectedRoomIds((current) => current.some((roomId) => String(roomId) === String(option.propertyRoomId))
        ? current
        : [...current, option.propertyRoomId]);
    }
  };
  const isRoomSelected = (roomId) =>
    selectedRoomIds.some((value) => String(value) === String(roomId));
  const visibleItems = items.filter((item) => {
    const propertyRoomId =
      item.property_room || roomById.get(item.room)?.property_room;
    return !propertyRoomId || isRoomSelected(propertyRoomId);
  });
  const selectedProductDetails = uniqueProductDetails(visibleItems, paintTypes, brands);
  const fullHouseTotals = measurements.reduce((totals, surface) => {
    if (surface.surface_type === "WALL") {
      totals.grossWall += Number(surface.gross_area || 0);
      totals.deductions += Number(surface.deduction_area || 0);
      totals.additions += Number(surface.addition_area || 0);
    }
    if (surface.surface_type === "CEILING") totals.ceiling += Number(surface.net_area || 0);
    return totals;
  }, { grossWall: 0, deductions: 0, additions: 0, ceiling: 0 });
  const fullHouseNetWall = Math.max(0, fullHouseTotals.grossWall - fullHouseTotals.deductions + fullHouseTotals.additions);
  const hasFullHouseWallLine = items.some((item) => /full house.*net wall/i.test(item.description || ""));
  const hasFullHouseCeilingLine = items.some((item) => /full house.*ceiling/i.test(item.description || ""));
  const addFullHouseLine = (type) => setItems((current) => [
    ...current,
    ...fullHouseMeasurementLines(
      type === "wall" ? fullHouseNetWall : 0,
      type === "ceiling" ? fullHouseTotals.ceiling : 0,
      services,
      units,
    ),
  ]);
  function toggleRoom(roomId) {
    const selecting = !isRoomSelected(roomId);
    setSelectedRoomIds((ids) =>
      selecting
        ? [...ids, roomId]
        : ids.filter((value) => String(value) !== String(roomId)),
    );
    if (
      selecting &&
      !items.some(
        (item) =>
          String(item.property_room || "") === String(roomId) ||
          String(roomById.get(item.room)?.property_room || "") ===
            String(roomId),
      )
    ) {
      const room = propertyRooms.find(
        (entry) => String(entry.id) === String(roomId),
      );
      if (room) {
        setItems((current) => [
          ...current,
          ...roomMeasurementLines(room, services, units, measurements),
        ]);
      }
    }
  }
  async function submit(event) {
    event.preventDefault();
    const invalidService = visibleItems.find((item) => editQuotationMissingFields(item).length);
    if (invalidService) {
      setMobileItemId(invalidService.id);
      setError("Please complete the highlighted fields before updating the quotation.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const customRoomNames = [...new Set(items.map((item) => String(item.custom_room_name || "").trim()).filter(Boolean))];
      const sync = await api.post(`/quotations/${id}/rooms/sync/`, {
        property_room_ids: selectedRoomIds,
        custom_room_names: customRoomNames,
      });
      const syncedRooms = sync.data.quotation.rooms || [];
      const syncedByProperty = new Map(
        syncedRooms
          .filter((room) => room.property_room)
          .map((room) => [room.property_room, room.id]),
      );
      const syncedByCustomName = new Map(
        syncedRooms
          .filter((room) => !room.property_room)
          .map((room) => [String(room.name || "").trim().toLowerCase(), room.id]),
      );
      const cleanItems = items
        .map((item) => {
          const propertyRoomId =
            item.property_room || roomById.get(item.room)?.property_room;
          const customRoomName = String(item.custom_room_name || "").trim();
          if (propertyRoomId && !isRoomSelected(propertyRoomId))
            return null;
          const payload = {
            room: propertyRoomId
              ? syncedByProperty.get(propertyRoomId)
              : customRoomName
                ? syncedByCustomName.get(customRoomName.toLowerCase())
                : item.room || null,
            service_category: item.service_category || null,
            service_type: item.service_type || null,
            paint_type: item.paint_type || null,
            paint_brand: item.paint_brand || null,
            color: item.color || null,
            description: item.description,
            coats: Number(item.coats) || 1,
            included_areas: Array.isArray(item.included_areas) ? item.included_areas : [],
            specification_details: item.specification_details || {},
            calculation_method: item.calculation_method,
            is_additional_service: Boolean(item.is_additional_service),
            custom_unit: item.unit ? "" : item.custom_unit || "",
            quantity: item.quantity === "" ? 0 : Number(item.quantity),
            unit: item.unit || null,
            rate: Number(item.rate) || 0,
          };
          if (typeof item.id === "number") payload.id = item.id;
          return payload;
        })
        .filter(Boolean);
      await api.patch(`/quotations/${id}/`, {
        ...form,
        items: cleanItems,
        valid_until: form.valid_until || null,
        discount_value: Number(form.discount_value) || 0,
        gst_percentage: Number(form.gst_percentage) || 0,
      });
      navigate(`/quotations/${id}`);
    } catch (requestError) {
      setError(
        formatError(requestError.response?.data) ||
          "Quotation could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (!form)
    return error ? <ErrorState message={error} /> : <LoadingState label="Loading quotation for editing..." />;
  return (
    <div className="mx-auto max-w-5xl space-y-6 quotation-measurement-page bp-quotation-edit">
      <BackButton fallback={`/quotations/${id}`} label="Back to quotation" />
      <PageHeader eyebrow="Quotation management" title="Edit quotation" description="Review room selections, line details and pricing before saving." />
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      <form
        onSubmit={submit}
        className="grid gap-5 rounded-2xl border bg-white p-6 sm:grid-cols-2"
      >
        <SectionCard title="Property rooms" description="Select the measured rooms required in this quotation. Walls and ceilings remain separate for pricing." className="quotation-edit-rooms sm:col-span-2" bodyClassName="p-4 sm:p-5">
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => propertyRooms.forEach((room) => { if (!isRoomSelected(room.id)) toggleRoom(room.id); })} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-violet-800">Select all rooms</button>
            <button type="button" onClick={() => setSelectedRoomIds([])} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Clear all</button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {propertyRooms.map((room) => (
              <label
                key={room.id}
                className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${isRoomSelected(room.id) ? "border-emerald-600 bg-emerald-50" : "border-slate-200"}`}
              >
                <input
                  type="checkbox"
                  checked={isRoomSelected(room.id)}
                  onChange={() => toggleRoom(room.id)}
                />
                <div>
                  <p className="font-semibold">{room.name}</p>
                  <p className="text-xs text-slate-500">
                    Net walls {room.measurement_totals?.wall_net || "0.00"} sq ft · Ceiling {room.measurement_totals?.ceiling || "0.00"} sq ft
                  </p>
                </div>
              </label>
            ))}
          </div>
        </SectionCard>
        <div className="sm:col-span-2">
          <h2 className="font-bold">{isLumpSum ? "Lump Sum services" : "Final full-house quotation lines"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isLumpSum ? "Edit each service using the same card and popup format used during quotation creation." : "Room Area Calculations are combined into one net wall line and one ceiling line."}
          </p>
          {!isLumpSum && measurements.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50"><div className="border-b border-emerald-200 px-4 py-3 font-bold text-emerald-950">Full house Area Calculation</div><div className="divide-y divide-emerald-200"><div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="font-semibold text-emerald-950">Full House Net Wall Area</p><p className="text-sm text-emerald-800">{fullHouseNetWall.toFixed(0)} sq ft after deductions</p></div>{!hasFullHouseWallLine && <button type="button" onClick={() => addFullHouseLine("wall")} className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white">Add net wall line</button>}</div><div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="font-semibold text-emerald-950">Full House Total Ceiling Area</p><p className="text-sm text-emerald-800">{fullHouseTotals.ceiling.toFixed(0)} sq ft</p></div>{!hasFullHouseCeilingLine && <button type="button" onClick={() => addFullHouseLine("ceiling")} className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white">Add ceiling line</button>}</div></div></div>}
          <div className="hidden">
            <table className="w-full min-w-[1460px] text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="p-3">Type of service</th>
                  <th className="p-3">Room / Area</th>
                  <th className="p-3">Area type</th>
                  <th className="p-3">Product type</th>
                  <th className="p-3">Product description</th>
                  <th className="p-3">MOU</th>
                  <th className="p-3">Quantity</th>
                  <th className="p-3">Brand</th>
                  <th className="p-3">No. of coats</th>
                  <th className="p-3">Rate</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleItems.map((item, index) => {
                  const room = roomById.get(item.room);
                  const group = item.is_additional_service
                    ? "Additional services"
                    : /full house/i.test(item.description || "")
                      ? "Full house Area Calculation"
                      : `${room?.name || "Room"} Area Calculation`;
                  const previous = visibleItems[index - 1];
                  const previousRoom = previous && roomById.get(previous.room);
                  const previousGroup = previous && (previous.is_additional_service
                    ? "Additional services"
                    : /full house/i.test(previous.description || "")
                      ? "Full house Area Calculation"
                      : `${previousRoom?.name || "Room"} Area Calculation`);
                  return (
                    <Fragment key={item.id}>
                      {group !== previousGroup && <tr key={`${group}-heading`}><td colSpan="12" className="bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">{group}</td></tr>}
                    <tr>
                      <td className="p-3">
                        <EditSearchableProductType label="" placeholder="Search service" emptyText="No matching services" value={item.service_type || ""} options={services} onChange={(value) => updateService(item.id, value)} controlClass="w-48 rounded-lg border px-3 py-2" />
                      </td>
                      <td className="p-3 font-semibold text-slate-700">{quotationRoomAreaLabel(item) || room?.name || "Full House"}</td>
                      <td className="p-3"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">{room?.room_type_name || "General"}</span></td>
                      <td className="p-3">
                        <EditSearchableProductType label="" value={item.paint_type || ""} options={paintTypes.filter((paintType) => !item.service_category || String(paintType.service_category) === String(item.service_category))} onChange={(value) => updateProductType(item.id, value)} controlClass="w-40 rounded-lg border px-3 py-2" />
                      </td>
                      <td className="p-3">
                        <input
                          value={item.description || ""}
                          onChange={(event) =>
                            updateItem(
                              item.id,
                              "description",
                              event.target.value,
                            )
                          }
                          placeholder={item.is_additional_service ? "Service details" : "Select or enter description"}
                          className="w-full rounded-lg border px-3 py-2"
                        />
                      </td>
                      <td className="p-3">
                        <select required value={item.unit || ""} onChange={(event) => updateItem(item.id, "unit", event.target.value)} className="w-32 rounded-lg border px-3 py-2"><option value="">Select MOU</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(event) =>
                            updateItem(item.id, "quantity", event.target.value)
                          }
                          className="w-24 rounded-lg border px-3 py-2 text-right"
                        />
                      </td>
                      <td className="p-3">
                        <EditSearchableProductType label="" placeholder="Search brand" emptyText="No matching brands" value={item.paint_brand || ""} options={brands} onChange={(value) => updateItem(item.id, "paint_brand", value)} controlClass="w-32 rounded-lg border px-3 py-2" />
                      </td>
                      <td className="p-3">
                        <select value={item.coats || 1} onChange={(event) => updateItem(item.id, "coats", event.target.value)} className="w-20 rounded-lg border px-3 py-2">{[1, 2, 3, 4, 5, 6].map((coats) => <option key={coats} value={coats}>{coats}</option>)}</select>
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(event) =>
                            updateItem(item.id, "rate", event.target.value)
                          }
                          className="w-28 rounded-lg border px-3 py-2 text-right"
                        />
                      </td>
                      <td className="p-3 text-right font-semibold">
                        ₹
                        {(
                          (Number(item.quantity) || 0) *
                          (Number(item.rate) || 0)
                        ).toFixed(0)}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          title="Delete line item"
                          aria-label={`Delete ${item.description || "line item"}`}
                          onClick={() => removeItem(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
                {!visibleItems.length && (
                  <tr>
                    <td colSpan="7" className="p-6 text-center text-slate-500">
                      No quotation lines are available for the selected rooms.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item) => {
              const room = roomById.get(item.room);
              const serviceName = categories.find((category) => String(category.id) === String(item.service_category))?.name || "Select service";
              const productName = item.description || "Description not added";
              const amount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
              return (
                <article key={"mobile-edit-" + item.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${editQuotationMissingFields(item).length ? "border-red-400 ring-2 ring-red-100" : "border-slate-200"}`}>
                  <header className="flex items-start justify-between gap-3 bg-slate-950 px-4 py-3 text-white">
                    <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">{serviceName}</p><h3 className="mt-1 truncate font-bold">{quotationRoomAreaLabel(item) || room?.name || "Full House"}</h3><p className="mt-0.5 truncate text-xs text-slate-300">{productName}</p></div>
                    <button type="button" onClick={() => setMobileItemId(item.id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/30 px-3 py-2 text-xs font-bold"><Pencil className="h-3.5 w-3.5" />Edit</button>
                  </header>
                  <div className="grid grid-cols-4 gap-px bg-slate-200">
                    <EditMobileValue label="Quantity" value={item.quantity || "—"} />
                    <EditMobileValue label="Coats" value={item.is_additional_service ? "—" : item.coats || 1} />
                    <EditMobileValue label="Rate" value={formatMoney(item.rate)} />
                    <EditMobileValue label="Amount" value={formatMoney(amount)} strong />
                  </div>
                </article>
              );
            })}
            {!visibleItems.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No quotation lines are available.</p>}
          </div>
          <div className="mt-4 flex justify-end border-t border-slate-200 pt-4"><button type="button" onClick={addAdditionalService} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-900 px-5 py-3 text-sm font-semibold text-white sm:w-auto"><Plus className="h-4 w-4" />Add services</button></div>
          {mobileItemId !== null && items.find((item) => item.id === mobileItemId) && (
            <EditQuotationMobileDialog
              item={items.find((item) => item.id === mobileItemId)}
              room={roomById.get(items.find((item) => item.id === mobileItemId)?.room)}
              services={services}
              categories={categories}
              descriptions={descriptions}
              paintTypes={paintTypes}
              brands={brands}
              units={units}
              roomOptions={allRoomOptions}
              assignRoom={assignItemRoom}
              updateItem={updateItem}
              updateProductType={updateProductType}
              updateService={updateService}
              complete={() => {
                const currentItem = items.find((item) => item.id === mobileItemId);
                if (currentItem && editQuotationMissingFields(currentItem).length) {
                  setError("Please complete the highlighted fields before updating this service.");
                  return;
                }
                setError("");
                setMobileItemId(null);
              }}
              close={() => setMobileItemId(null)}
              remove={() => {
                removeItem(items.find((item) => item.id === mobileItemId));
                setMobileItemId(null);
              }}
            />
          )}
        </div>
        {quotationRooms.some((room) => !room.property_room) && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700 sm:col-span-2">
            Custom quotation rooms are preserved.
          </p>
        )}
        <label className="text-sm font-medium">
          Status
          <select
            name="status"
            value={form.status}
            onChange={update}
            className={input}
          >
            {[
              "DRAFT",
              "SENT",
              "VIEWED",
              "ACCEPTED",
              "REJECTED",
              "EXPIRED",
              "CONVERTED",
              "CANCELLED",
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Valid until
          <input
            type="date"
            name="valid_until"
            value={form.valid_until}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          Discount type
          <select
            name="discount_type"
            value={form.discount_type}
            onChange={update}
            className={input}
          >
            <option value="FIXED">Fixed amount</option>
            <option value="PERCENTAGE">Percentage</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Discount value
          <input
            type="number"
            min="0"
            step="0.01"
            name="discount_value"
            value={form.discount_value}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          GST mode
          <select
            name="gst_mode"
            value={form.gst_mode}
            onChange={update}
            className={input}
          >
            <option value="GST_EXTRA">GST extra</option>
            <option value="GST_INCLUDED">GST included</option>
            <option value="NO_GST">No GST</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          GST percentage
          <input
            type="number"
            min="0"
            step="0.01"
            name="gst_percentage"
            value={form.gst_percentage}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Notes
          <textarea
            rows="4"
            name="notes"
            value={form.notes}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Terms and conditions
          <textarea
            rows="5"
            name="terms_conditions"
            value={form.terms_conditions}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">Prepared by<input name="prepared_by" value={form.prepared_by} onChange={update} className={input} /></label>
        <label className="text-sm font-medium">Inspected by<input name="inspected_by" value={form.inspected_by} onChange={update} className={input} /></label>
        <label className="text-sm font-medium sm:col-span-2">Work duration<input name="work_duration" value={form.work_duration} onChange={update} className={input} placeholder="For example, 15-18 days" /></label>
        <label className="text-sm font-medium sm:col-span-2">Payment terms<textarea rows="3" name="payment_terms" value={form.payment_terms} onChange={update} className={input} /></label>
        <label className="text-sm font-medium sm:col-span-2">Product details<textarea rows="3" name="product_details" value={form.product_details} onChange={update} className={input} placeholder="Add any general product notes here" /></label>
        {form.show_product_key_features && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:col-span-2"><b className="text-slate-950">Selected product details</b>{selectedProductDetails ? <p className="mt-2 whitespace-pre-wrap leading-6 text-slate-600">{selectedProductDetails}</p> : <p className="mt-2 text-slate-500">Select a Product Type to preview its saved details here.</p>}</div>}
        <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm sm:col-span-2"><input type="checkbox" checked={form.show_product_key_features} onChange={(event) => setForm((value) => ({ ...value, show_product_key_features: event.target.checked }))} className="mt-0.5 h-4 w-4" /><span><b className="block text-emerald-950">Include selected product details</b><span className="mt-1 block text-xs text-emerald-800">Each selected product and its key features will appear only once in Product details.</span></span></label>
        <label className="text-sm font-medium sm:col-span-2">Work procedures and safety<textarea rows="5" name="work_procedures" value={form.work_procedures} onChange={update} className={input} /></label>
        <div className="flex justify-end border-t pt-5 sm:col-span-2">
          <Button type="submit" loading={saving} className="flex items-center gap-2 px-5">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
function formatError(data) {
  if (!data) return "";
  return Object.entries(data)
    .map(
      ([key, value]) =>
        `${key}: ${Array.isArray(value) ? value.join(" ") : typeof value === "object" ? JSON.stringify(value) : value}`,
    )
    .join(" ");
}
function EditMobileValue({ label, value, strong }) {
  return <div className="min-w-0 bg-white px-3 py-3"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className={"mt-1 truncate text-xs " + (strong ? "font-extrabold text-emerald-700" : "font-bold text-slate-900")}>{value}</p></div>;
}
function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
}
function uniqueProductDetails(items, products, brands) {
  const seen = new Set();
  return items.reduce((lines, item) => {
    const product = products.find((entry) => String(entry.id) === String(item.paint_type));
    if (!product?.name || !String(product.key_features || "").trim()) return lines;
    const brand = brands.find((entry) => String(entry.id) === String(item.paint_brand));
    const key = `${product.name}|${brand?.name || ""}|${product.key_features}`.toLowerCase();
    if (seen.has(key)) return lines;
    seen.add(key);
    lines.push(`${product.name}${brand?.name ? ` (${brand.name})` : ""}: ${product.key_features}`);
    return lines;
  }, []).join("\n");
}
function EditQuotationMobileDialog({ item, room, roomOptions, assignRoom, services, categories, descriptions, paintTypes, brands, units, updateItem, updateProductType, complete, close, remove }) {
  const amount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
  const categoryName = categories.find((entry) => String(entry.id) === String(item.service_category))?.name || "";
  const paintingApplicable = categoryName.toLowerCase().includes("paint");
  const productOptions = paintTypes.filter((entry) => !item.service_category || String(entry.service_category) === String(item.service_category));
  const descriptionOptions = descriptions.filter((entry) => !item.service_category || String(entry.service_category) === String(item.service_category));
  const selectedRoomKey = roomOptions.find((entry) =>
    (entry.quotationRoomId && String(entry.quotationRoomId) === String(item.room)) ||
    (entry.propertyRoomId && String(entry.propertyRoomId) === String(item.property_room)) ||
    (entry.masterRoomId && entry.name === item.custom_room_name),
  )?.key || "";
  const groupedRoom = ["group", "special"].includes(item.specification_details?.kind);
  const roomMissing = !groupedRoom && !selectedRoomKey && !/full house|full exterior/i.test(item.description || "");
  const control = "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100";
  const requiredControl = (missing) => `${control} ${missing ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100" : ""}`;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-label="Services and rates" className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-slate-50 shadow-2xl sm:max-w-2xl sm:rounded-[28px]">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white px-4 py-4">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">Services & rates</p><h2 className="truncate text-lg font-bold">{quotationRoomAreaLabel(item) || room?.name || "Full House"}</h2></div>
          <button type="button" onClick={close} aria-label="Close editor" className="rounded-xl border p-2.5"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 p-4 pb-28">
          <div className="grid gap-3 sm:grid-cols-2">
            <EditSearchableProductType label="Type of service" placeholder="Search type of service" emptyText="No matching services" value={item.service_category || ""} options={categories} onChange={(value) => { updateItem(item.id, "service_category", value); const selectedService = services.find((entry) => String(entry.id) === String(item.service_type)); if (selectedService && String(selectedService.category_master) !== String(value)) updateItem(item.id, "service_type", ""); updateItem(item.id, "paint_type", ""); }} controlClass={requiredControl(!item.service_category)} />
            <label className="block text-sm font-semibold">Room / Area
              <SearchableSelect value={selectedRoomKey} options={[...(groupedRoom ? [{ value: "", label: quotationRoomAreaLabel(item) }] : []), ...roomOptions.map((entry) => ({ ...entry, value: entry.key, label: entry.name }))]} onChange={(value) => assignRoom(item.id, value)} placeholder="Search room / area" invalid={roomMissing} className={requiredControl(roomMissing)} />
            </label>
          </div>
          <EditSearchableDescription value={item.description || ""} options={descriptionOptions} onChange={(value) => updateItem(item.id, "description", value)} controlClass={requiredControl(!String(item.description || "").trim())} />
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">MOU
              <select value={item.unit || ""} aria-invalid={!item.unit} onChange={(event) => updateItem(item.id, "unit", event.target.value)} className={requiredControl(!item.unit)}><option value="">Select MOU</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
            </label>
            <label className="block text-sm font-semibold">Quantity
              <input type="number" min="0.01" step="0.01" value={item.quantity} aria-invalid={Number(item.quantity || 0) <= 0} onChange={(event) => updateItem(item.id, "quantity", event.target.value)} className={requiredControl(Number(item.quantity || 0) <= 0)} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <EditSearchableProductType label="Brand" placeholder="Search brand (optional)" emptyText="No matching brands" value={item.paint_brand || ""} options={brands} onChange={(value) => updateItem(item.id, "paint_brand", value)} controlClass={control} />
            <EditSearchableProductType key={item.service_category || "all-products"} value={item.paint_type || ""} options={productOptions} onChange={(value) => updateProductType(item.id, value)} controlClass={control} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {paintingApplicable ? <label className="block text-sm font-semibold">No. of coats<select value={item.coats || 1} onChange={(event) => updateItem(item.id, "coats", event.target.value)} className={control}>{[1,2,3,4,5,6].map((coat) => <option key={coat} value={coat}>{coat}</option>)}</select></label> : <label className="block text-sm font-semibold">No. of coats<div className={control + " bg-slate-100 text-slate-500"}>—</div></label>}
            <label className="block text-sm font-semibold">Rate
              <input type="number" min="0" step="0.01" value={item.rate} aria-invalid={item.rate === "" || item.rate === null || item.rate === undefined} onChange={(event) => updateItem(item.id, "rate", event.target.value)} className={requiredControl(item.rate === "" || item.rate === null || item.rate === undefined)} />
            </label>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-slate-950 p-4 text-white"><span className="text-sm text-slate-300">Line amount</span><b className="text-xl text-emerald-300">{formatMoney(amount)}</b></div>
        </div>
        <footer className="sticky bottom-0 z-20 grid grid-cols-[auto_1fr] gap-3 border-t bg-white p-4">
          <button type="button" onClick={remove} className="inline-flex items-center justify-center rounded-xl border border-red-200 px-4 py-3 text-red-600" aria-label="Delete line"><Trash2 className="h-5 w-5" /></button>
          <button type="button" onClick={complete} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">Update line</button>
        </footer>
      </section>
    </div>
  );
}

function EditSearchableProductType({ value, options, onChange, controlClass, label = "Product type", placeholder = "Search product type", emptyText = "No matching entries" }) {
  const selected = options.find((entry) => String(entry.id) === String(value));
  const [query, setQuery] = useState(selected?.name || "");
  const [open, setOpen] = useState(false);
  useEffect(() => { setQuery(selected?.name || ""); }, [selected?.name, value]);
  const filtered = useMemo(() => { const term = query.trim().toLowerCase(); return options.filter((entry) => !term || String(entry.name || "").toLowerCase().includes(term)).slice(0, 30); }, [options, query]);
  return <label className="block text-sm font-semibold">{label}<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onChange={(event) => { setQuery(event.target.value); setOpen(true); onChange(""); }} placeholder={placeholder} autoComplete="off" className={`${controlClass} pl-10`} />{open && <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-xl">{filtered.map((entry) => <button key={entry.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(entry.id); setQuery(entry.name); setOpen(false); }} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-violet-50"><span className="block text-sm font-bold">{entry.name}</span></button>)}{!filtered.length && <p className="px-3 py-4 text-center text-xs text-slate-500">{emptyText}</p>}</div>}</div></label>;
}

function EditSearchableDescription({ value, options, onChange, controlClass }) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => { const term = value.trim().toLowerCase(); return options.filter((entry) => !term || String(entry.name || "").toLowerCase().includes(term)).slice(0, 30); }, [options, value]);
  return <label className="block text-sm font-semibold">Product description<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={value} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} placeholder="Type or select product description" autoComplete="off" className={`${controlClass} pl-10`} />{open && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-xl">{filtered.map((entry) => <button key={entry.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(entry.name); setOpen(false); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-violet-50">{entry.name}</button>)}{!filtered.length && <p className="px-3 py-4 text-center text-xs text-slate-500">Continue typing a new description</p>}</div>}</div></label>;
}
function editQuotationMissingFields(item) {
  const missing = [];
  if (!item.service_category) missing.push("service_category");
  const hasRoom = Boolean(item.room || item.property_room || String(item.custom_room_name || "").trim() || ["group", "special"].includes(item.specification_details?.kind));
  if (!hasRoom && !/full house|full exterior/i.test(item.description || "")) missing.push("room");
  if (!String(item.description || "").trim()) missing.push("description");
  if (!item.unit) missing.push("unit");
  if (Number(item.quantity || 0) <= 0) missing.push("quantity");
  if (item.rate === "" || item.rate === null || item.rate === undefined || Number(item.rate) < 0) missing.push("rate");
  return missing;
}
function fullHouseMeasurementLines(netWall, ceiling, services, units) {
  const unit = units.find((entry) => ["sq ft", "sqft", "square feet", "square foot"].includes(entry.name.toLowerCase()));
  const line = (id, description, quantity, type) => ({
    id: `new-${id}-${Date.now()}`,
    room: null,
    service_category: null,
    service_type: services.find((service) => service.calculation_type === type)?.id || "",
    paint_type: null,
    paint_brand: null,
    color: null,
    description,
    coats: 1,
    calculation_method: "MANUAL",
    is_additional_service: false,
    custom_unit: "",
    quantity: quantity.toFixed(2),
    unit: unit?.id || "",
    rate: "",
  });
  return [
    ...(netWall > 0 ? [line("wall", "Full House - Net Wall Area", netWall, "WALL")] : []),
    ...(ceiling > 0 ? [line("ceiling", "Full House - Total Ceiling Area", ceiling, "CEILING")] : []),
  ];
}

function roomMeasurementLines(room, services, units, measurements = []) {
  const squareFeetUnit = units.find((entry) =>
    ["sq ft", "sqft", "square feet", "square foot"].includes(
      String(entry.name || "").toLowerCase(),
    ),
  );
  const line = (surface, quantity, description, key = surface) => {
    const service = services.find(
      (entry) => entry.calculation_type === surface,
    ) || (surface === "OTHER"
      ? services.find((entry) => entry.calculation_type === "WALL")
      : null);
    return {
      id: `new-room-${room.id}-${key}-${Date.now()}`,
      room: `property-${room.id}`,
      property_room: room.id,
      service_category: service?.category_master || null,
      service_type: service?.id || "",
      paint_type: null,
      paint_brand: null,
      color: null,
      description,
      coats: 1,
      calculation_method: "MANUAL",
      is_additional_service: false,
      custom_unit: "",
      quantity: Number(quantity || 0).toFixed(2),
      unit: squareFeetUnit?.id || "",
      rate: "",
    };
  };
  const totals = room.measurement_totals || {};
  const customAreas = measurements.filter(
    (surface) =>
      String(surface.room || "") === String(room.id) &&
      surface.surface_type === "OTHER" &&
      Number(surface.net_area || 0) > 0,
  );
  const customAreaGroups = new Map();
  customAreas.forEach((surface) => {
    const areaName = String(
      surface.area_group_name || surface.name || "Custom area",
    ).trim();
    const key = areaName.toLowerCase();
    if (!customAreaGroups.has(key)) {
      customAreaGroups.set(key, { areaName, quantity: 0 });
    }
    customAreaGroups.get(key).quantity += Number(surface.net_area || 0);
  });
  return [
    ...(Number(totals.wall_net || 0) > 0
      ? [line("WALL", totals.wall_net, `${room.name} - Net Wall Area`)]
      : []),
    ...(Number(totals.ceiling || 0) > 0
      ? [line("CEILING", totals.ceiling, `${room.name} - Net Ceiling Area`)]
      : []),
    ...[...customAreaGroups.values()].map(({ areaName, quantity }) =>
      line(
        "OTHER",
        quantity,
        areaName,
        `custom-${encodeURIComponent(areaName.toLowerCase())}`,
      ),
    ),
  ];
}
