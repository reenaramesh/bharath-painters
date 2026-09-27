import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import api from "../api/client";

const newWall = (i) => ({ name: `Wall ${i + 1}`, height: "", length: "" });
const newCeiling = (i) => ({ name: `Ceiling ${i + 1}`, length: "", width: "" });
const newCustomArea = (i, areaGroupName = "Floor", groupIndex = 0) => ({
  areaGroupName,
  name: `${areaGroupName} ${groupIndex + 1}`,
  length: "",
  width: "",
  quantity: 1,
});
const newItem = (type, i) => ({
  type,
  name: `${type} ${i + 1}`,
  height: "",
  width: "",
  quantity: 1,
  sides: 1,
  deduct: !["Other", "Ceiling"].includes(type),
});
const typeToApi = {
  Window: "WINDOW",
  Door: "DOOR",
  Wardrobe: "WARDROBE",
  Ceiling: "CEILING",
  Other: "OTHER",
};
const apiToType = {
  WINDOW: "Window",
  DOOR: "Door",
  WARDROBE: "Wardrobe",
  CEILING: "Ceiling",
  OTHER: "Other",
};

export default function RoomMeasurementForm({
  propertyId,
  measurementRecordId = "",
  measurementUnit = "FEET",
  workArea = "INTERIOR",
  rooms,
  surfaces,
  initialRoomId = "",
  initialRoomTypeId = "",
  onSaved,
  onError,
}) {
  const [roomTypes, setRoomTypes] = useState([]);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [roomTypeInput, setRoomTypeInput] = useState("");
  const [customRoomType, setCustomRoomType] = useState("");
  const [saveCustomRoomType, setSaveCustomRoomType] = useState(false);
  const [roomTypeMenuOpen, setRoomTypeMenuOpen] = useState(false);
  const [savingRoomType, setSavingRoomType] = useState(false);
  const [roomTypeSaved, setRoomTypeSaved] = useState(false);
  const [walls, setWalls] = useState([newWall(0)]);
  const [ceilings, setCeilings] = useState([]);
  const [customAreas, setCustomAreas] = useState([]);
  const [customAreaGroupName, setCustomAreaGroupName] = useState("Floor");
  const [items, setItems] = useState([]);
  const [itemType, setItemType] = useState("Window");
  const [openWall, setOpenWall] = useState(0);
  const [openCeiling, setOpenCeiling] = useState(null);
  const [openCustomArea, setOpenCustomArea] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const factor = measurementUnit === "METRES" ? 10.7639104167 : 1;
  const unit = measurementUnit === "METRES" ? "m" : "ft";
  const calc = useCallback(
    (entry, keys = ["height", "width"]) =>
      Number(entry[keys[0]] || 0) *
      Number(entry[keys[1]] || 0) *
      Number(entry.quantity || 1) *
      factor,
    [factor],
  );
  const update = (setter, index, key, value) =>
    setter((list) =>
      list.map((entry, position) =>
        position === index ? { ...entry, [key]: value } : entry,
      ),
    );

  useEffect(() => {
    api
      .get("/quotations/areas/")
      .then(({ data }) => {
        const savedRoomTypes = data.results || data;
        if (workArea !== "EXTERIOR") {
          setRoomTypes(savedRoomTypes);
          return;
        }
        const names = [
        "Front elevation",
        "Rear elevation",
        "Left elevation",
        "Right elevation",
        "Compound wall",
        "Balcony",
        "Terrace",
        ...rooms.map((room) => room.name),
        ...savedRoomTypes.map((entry) => entry.name),
      ];
      setRoomTypes([...new Set(names)].map((name) => ({ id: name, name })));
      })
      .catch(() => onError("Room dropdown could not be loaded."));
  }, [onError, workArea, rooms]);
  useEffect(() => {
    const initialRoom = rooms.find(
      (entry) => String(entry.id) === String(initialRoomId),
    );
    const matchingType = roomTypes.find(
      (entry) =>
        entry.name.trim().toLowerCase() ===
        initialRoom?.name?.trim().toLowerCase(),
    );
    const initialType =
      (workArea === "EXTERIOR" ? initialRoom?.name : initialRoom?.room_type) ||
      initialRoomTypeId ||
      matchingType?.id;
    if (initialType) {
      setRoomTypeId(String(initialType));
      setCustomRoomType("");
      setRoomTypeInput(
        roomTypes.find(
          (entry) => String(entry.id) === String(initialType),
        )?.name || initialRoom?.name || "",
      );
    } else if (initialRoom?.name) {
      setRoomTypeId("");
      setCustomRoomType(initialRoom.name);
      setRoomTypeInput(initialRoom.name);
    }
  }, [initialRoomId, initialRoomTypeId, roomTypes, rooms, workArea]);
  useEffect(() => {
    if (!roomTypeId) return;
    const selected = roomTypes.find(
      (entry) => String(entry.id) === String(roomTypeId),
    );
    const room =
      rooms.find((entry) => String(entry.id) === String(initialRoomId)) ||
      rooms.find((entry) => String(entry.room_type) === String(roomTypeId)) ||
      rooms.find(
        (entry) =>
          entry.name.trim().toLowerCase() ===
          selected?.name?.trim().toLowerCase(),
      );
    if (!room) {
      setWalls([newWall(0)]);
      setCeilings([]);
      setCustomAreas([]);
      setCustomAreaGroupName("Floor");
      setItems([]);
      setOpenWall(0);
      return;
    }
    const saved = surfaces.filter(
      (entry) =>
        entry.work_area === workArea &&
        (room.id === "exterior" ? !entry.room : entry.room === room.id),
    );
    const adjustmentAnchors = saved.filter((entry) => entry.is_adjustment_anchor);
    const savedWalls = saved.filter(
      (entry) => entry.surface_type === "WALL" && !entry.is_adjustment_anchor,
    );
    const savedCeilings = saved.filter(
      (entry) => entry.surface_type === "CEILING" && !entry.is_adjustment_anchor,
    );
    const savedCustomAreas = saved.filter(
      (entry) => entry.surface_type === "OTHER",
    );
    const paintable = saved.filter((entry) =>
      ["DOOR", "WINDOW"].includes(entry.surface_type),
    );
    const loaded = [...savedWalls, ...savedCeilings, ...adjustmentAnchors]
      .flatMap((entry) => entry.openings || [])
      .map((entry) => {
        const match = paintable.find(
          (surface) =>
            surface.surface_type === entry.opening_type &&
            surface.name.trim().toLowerCase() ===
              (entry.name || "").trim().toLowerCase(),
        );
        return {
          type: apiToType[entry.opening_type] || "Other",
          name: entry.name || apiToType[entry.opening_type] || "Other",
          height: entry.height,
          width: entry.width,
          quantity: entry.quantity || 1,
          sides: match?.paintable_sides || 1,
          deduct:
            entry.effect === "DEDUCT" && entry.deduction_mode !== "IGNORE",
        };
      });
    paintable
      .filter(
        (surface) =>
          !loaded.some(
            (entry) =>
              typeToApi[entry.type] === surface.surface_type &&
              entry.name.trim().toLowerCase() ===
                surface.name.trim().toLowerCase(),
          ),
      )
      .forEach((surface) =>
        loaded.push({
          type: apiToType[surface.surface_type],
          name: surface.name,
          height: surface.length,
          width: surface.breadth,
          quantity: surface.quantity || 1,
          sides: surface.paintable_sides || 1,
          deduct: false,
        }),
      );
    setWalls(
      savedWalls.length
        ? savedWalls.map((entry, i) => ({
            name: entry.name || `Wall ${i + 1}`,
            height: entry.breadth,
            length: entry.length,
            quantity: entry.quantity || 1,
          }))
        : [newWall(0)],
    );
    setCeilings(
      savedCeilings.map((entry, i) => ({
        name: entry.name || `Ceiling ${i + 1}`,
        length: entry.length,
        width: entry.breadth,
        quantity: entry.quantity || 1,
      })),
    );
    setCustomAreas(
      savedCustomAreas.map((entry, i) => ({
        areaGroupName: entry.area_group_name || entry.name || "Custom Area",
        name: entry.name || `Custom Area ${i + 1}`,
        length: entry.length,
        width: entry.breadth,
        quantity: entry.quantity || 1,
      })),
    );
    setCustomAreaGroupName(
      savedCustomAreas.at(-1)?.area_group_name ||
        savedCustomAreas.at(-1)?.name ||
        "Floor",
    );
    setItems(loaded);
    setOpenWall(0);
    setOpenCeiling(null);
    setOpenCustomArea(null);
    setOpenItem(null);
  }, [initialRoomId, roomTypeId, roomTypes, rooms, surfaces, workArea]);

  const availableRoomTypes = useMemo(() => {
    const measuredRoomIds = new Set(
      surfaces
        .filter((entry) => entry.work_area === workArea)
        .map((entry) =>
          String(entry.room || (workArea === "EXTERIOR" ? "exterior" : "")),
        ),
    );
    const measuredRooms = rooms.filter((room) =>
      measuredRoomIds.has(String(room.id)),
    );
    const usedTypeIds = new Set(
      measuredRooms
        .filter((room) => String(room.id) !== String(initialRoomId))
        .map((room) => String(room.room_type || ""))
        .filter(Boolean),
    );
    const usedNames = new Set(
      measuredRooms
        .filter((room) => String(room.id) !== String(initialRoomId))
        .map((room) =>
          String(room.name || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );
    return roomTypes.filter(
      (entry) =>
        !usedTypeIds.has(String(entry.id)) &&
        !usedNames.has(
          String(entry.name || "")
            .trim()
            .toLowerCase(),
        ),
    );
  }, [initialRoomId, roomTypes, rooms, surfaces, workArea]);

  const filteredRoomTypes = useMemo(() => {
    const query = roomTypeInput.trim().toLowerCase();
    return availableRoomTypes
      .filter(
        (entry) =>
          !query || String(entry.name || "").toLowerCase().includes(query),
      )
      .slice(0, 30);
  }, [availableRoomTypes, roomTypeInput]);

  async function saveRoomTypeForFuture() {
    const name = customRoomType.trim();
    if (!name) return;
    setSavingRoomType(true);
    onError("");
    try {
      const existing = roomTypes.find(
        (entry) => entry.name.trim().toLowerCase() === name.toLowerCase(),
      );
      const saved =
        existing || (await api.post("/quotations/areas/", { name })).data;
      setRoomTypes((current) =>
        current.some(
          (entry) =>
            entry.name.trim().toLowerCase() === name.toLowerCase(),
        )
          ? current
          : [...current, saved],
      );
      setRoomTypeId(String(saved.id));
      setRoomTypeInput(saved.name);
      setCustomRoomType("");
      setSaveCustomRoomType(true);
      setRoomTypeSaved(true);
      setRoomTypeMenuOpen(false);
    } catch (error) {
      setSaveCustomRoomType(false);
      onError(
        Object.values(error.response?.data || {})
          .flat()
          .join(" ") || "Room type could not be saved for future use.",
      );
    } finally {
      setSavingRoomType(false);
    }
  }

  const totals = useMemo(() => {
    const gross = walls.reduce(
      (sum, entry) => sum + calc(entry, ["height", "length"]),
      0,
    );
    const ceilingGross = ceilings.reduce(
      (sum, entry) => sum + calc(entry, ["length", "width"]),
      0,
    );
    const customAreaGross = customAreas.reduce(
      (sum, entry) => sum + calc(entry, ["length", "width"]),
      0,
    );
    const wallDeductions = items
      .filter((entry) => entry.deduct && entry.type !== "Ceiling")
      .reduce((sum, entry) => sum + calc(entry), 0);
    const ceilingDeductions = items
      .filter((entry) => entry.deduct && entry.type === "Ceiling")
      .reduce((sum, entry) => sum + calc(entry), 0);
    const wallAdditions = items
      .filter((entry) => entry.type === "Other" && !entry.deduct)
      .reduce((sum, entry) => sum + calc(entry), 0);
    const ceilingAdditions = items
      .filter((entry) => entry.type === "Ceiling" && !entry.deduct)
      .reduce((sum, entry) => sum + calc(entry), 0);
    return {
      gross,
      ceilingGross,
      customAreaGross,
      ceilingDeductions,
      ceilingAdditions,
      ceiling: Math.max(0, ceilingGross + ceilingAdditions - ceilingDeductions),
      deductions: wallDeductions + ceilingDeductions,
      additions: wallAdditions + ceilingAdditions,
      net: Math.max(0, gross + wallAdditions - wallDeductions),
    };
  }, [walls, ceilings, customAreas, items, calc]);

  async function save(event) {
    event.preventDefault();
    const customName = customRoomType.trim();
    if (!roomTypeId && !customName)
      return onError("Select a room or enter a new room type.");
    const requestedRoomName =
      customName ||
      roomTypes.find((entry) => String(entry.id) === String(roomTypeId))?.name ||
      roomTypeInput;
    const duplicateCalculatedRoom = rooms.find(
      (room) =>
        String(room.id) !== String(initialRoomId) &&
        room.name.trim().toLowerCase() ===
          requestedRoomName.trim().toLowerCase() &&
        surfaces.some((surface) => String(surface.room) === String(room.id)),
    );
    if (duplicateCalculatedRoom)
      return onError(
        "This room already has an Area Calculation. Select a different room.",
      );
    const hasValue = (entry, keys) =>
      keys.some((key) => String(entry[key] ?? "").trim() !== "");
    const completedWalls = walls.filter((entry) =>
      hasValue(entry, ["height", "length"]),
    );
    const completedCeilings = ceilings.filter((entry) =>
      hasValue(entry, ["length", "width"]),
    );
    const completedCustomAreas = customAreas.filter((entry) =>
      hasValue(entry, ["areaGroupName", "name", "length", "width"]),
    );
    if (
      completedWalls.some(
        (entry) => Number(entry.height) <= 0 || Number(entry.length) <= 0,
      )
    )
      return onError(
        "Complete every wall with a height and length greater than zero.",
      );
    if (
      completedCeilings.some(
        (entry) => Number(entry.length) <= 0 || Number(entry.width) <= 0,
      )
    )
      return onError("Complete every ceiling or delete the unused line.");
    if (
      completedCustomAreas.some(
        (entry) =>
          !entry.areaGroupName.trim() ||
          !entry.name.trim() ||
          Number(entry.length) <= 0 ||
          Number(entry.width) <= 0 ||
          Number(entry.quantity) < 1,
      )
    )
      return onError("Complete every custom area or delete the unused line.");
    if (
      items.some(
        (entry) =>
          Number(entry.height) <= 0 ||
          Number(entry.width) <= 0 ||
          Number(entry.quantity) < 1 ||
          !entry.name.trim(),
      )
    )
      return onError(
        "Complete every deduction/addition line or delete the unused line.",
      );
    if (
      !completedWalls.length &&
      !completedCeilings.length &&
      !completedCustomAreas.length &&
      !items.length
    )
      return onError(
        "Enter at least one wall, ceiling, custom area, door, window, deduction or addition.",
      );
    setSaving(true);
    onError("");
    try {
      let resolvedRoomTypeId = roomTypeId;
      let selected = roomTypes.find(
        (entry) => String(entry.id) === String(roomTypeId),
      );
      if (customName) {
        selected = { id: null, name: customName };
        resolvedRoomTypeId = "";
        if (saveCustomRoomType) {
          const existing = roomTypes.find(
            (entry) =>
              entry.name.trim().toLowerCase() === customName.toLowerCase(),
          );
          const saved =
            existing ||
            (await api.post("/quotations/areas/", { name: customName })).data;
          resolvedRoomTypeId = saved.id;
          selected = saved;
          setRoomTypes((current) =>
            current.some(
              (entry) =>
                entry.name.trim().toLowerCase() === customName.toLowerCase(),
            )
              ? current
              : [...current, saved],
          );
        }
      }
      const originalRoom = rooms.find(
        (entry) => String(entry.id) === String(initialRoomId),
      );
      let room;
      if (originalRoom) {
        const nextRoomType =
          workArea === "EXTERIOR" || !resolvedRoomTypeId
            ? null
            : Number(resolvedRoomTypeId);
        const roomChanged =
          originalRoom.name.trim().toLowerCase() !==
            selected.name.trim().toLowerCase() ||
          String(originalRoom.room_type || "") !==
            String(nextRoomType || "");
        room = roomChanged
          ? (
              await api.patch("/quotations/rooms/" + originalRoom.id + "/", {
                name: selected.name,
                room_type: nextRoomType,
              })
            ).data
          : originalRoom;
      } else {
        room =
          (resolvedRoomTypeId &&
            rooms.find(
              (entry) =>
                String(entry.room_type) === String(resolvedRoomTypeId),
            )) ||
          rooms.find(
            (entry) =>
              entry.name.trim().toLowerCase() ===
              selected.name.trim().toLowerCase(),
          );
      }
      if (!room)
        room = (
          await api.post(
            `/quotations/properties/${propertyId}/rooms/`,
            {
              room_type:
                workArea === "EXTERIOR" || !resolvedRoomTypeId
                  ? null
                  : Number(resolvedRoomTypeId),
              name: selected.name,
              measurement_record: measurementRecordId || undefined,
            },
            {
              params: measurementRecordId
                ? { measurement: measurementRecordId }
                : { new: 1 },
            },
          )
        ).data;
      else if (
        !room.room_type &&
        workArea !== "EXTERIOR" &&
        resolvedRoomTypeId
      )
        room = (
          await api.patch(`/quotations/rooms/${room.id}/`, {
            room_type: Number(resolvedRoomTypeId),
          })
        ).data;
      const openings = items.map((entry) => ({
        opening_type: typeToApi[entry.type],
        name: entry.name,
        height: Number(entry.height),
        width: Number(entry.width),
        quantity: Number(entry.quantity),
        effect: entry.deduct ? "DEDUCT" : "ADD",
        deduction_mode: entry.deduct ? "FULL" : "IGNORE",
        deduction_percentage: entry.deduct ? 100 : 0,
      }));
      const paintable_openings = items
        .filter((entry) => ["Window", "Door"].includes(entry.type))
        .map((entry) => ({
          surface_type: typeToApi[entry.type],
          name: entry.name,
          length: Number(entry.height),
          breadth: Number(entry.width),
          quantity: Number(entry.quantity),
          paintable_sides: Number(entry.sides) || 1,
        }));
      const activeMeasurementRecordId =
        measurementRecordId || room.measurement_record;
      await api.post(
        `/quotations/properties/${propertyId}/room-measurement/save/`,
        {
          room_id: room.id,
          walls: completedWalls.map((entry) => ({
            name: entry.name,
            length: Number(entry.length),
            breadth: Number(entry.height),
            quantity: Number(entry.quantity) || 1,
          })),
          ceilings: completedCeilings.map((entry) => ({
            name: entry.name,
            length: Number(entry.length),
            breadth: Number(entry.width),
            quantity: Number(entry.quantity) || 1,
          })),
          custom_areas: completedCustomAreas.map((entry) => ({
            area_group_name: entry.areaGroupName.trim(),
            name: entry.name.trim(),
            length: Number(entry.length),
            breadth: Number(entry.width),
            quantity: Number(entry.quantity) || 1,
          })),
          openings,
          paintable_openings,
        },
        {
          params: activeMeasurementRecordId
            ? { measurement: activeMeasurementRecordId }
            : { new: 1 },
        },
      );
      await onSaved(activeMeasurementRecordId);
    } catch (error) {
      onError(
        Object.values(error.response?.data || {})
          .flat()
          .join(" ") || "Room Area Calculation could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      id="room-measurement-form"
      onSubmit={save}
      noValidate
      className="scroll-mt-6 space-y-4 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 p-2.5 shadow-xl shadow-slate-200/60 sm:space-y-5 sm:p-5"
    >
      <header className="relative overflow-hidden rounded-2xl bg-slate-950 p-5 text-white sm:p-6">
        <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20">
            <Calculator className="h-5 w-5" />
          </span>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
              Contractor measurement workspace
            </div>
            <h2 className="text-2xl font-bold">
              {initialRoomId ? "Edit Room Calculation" : "New Room"}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Enter dimensions in {unit}. All results are automatically
              converted to sq ft.
            </p>
          </div>
        </div>
      </header>
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 sm:p-5">
        <div className="max-w-2xl">
          <label className="block text-sm font-bold text-slate-900">
            Room type *
            <div className="relative">
              <input
                type="text"
                value={roomTypeInput}
                maxLength={150}
                autoComplete="off"
                placeholder="Select or type a room, for example Pooja Room"
                onFocus={() => setRoomTypeMenuOpen(true)}
                onBlur={() =>
                  window.setTimeout(() => setRoomTypeMenuOpen(false), 150)
                }
                onChange={(event) => {
                  const value = event.target.value;
                  const match = availableRoomTypes.find(
                    (entry) =>
                      entry.name.trim().toLowerCase() ===
                      value.trim().toLowerCase(),
                  );
                  setRoomTypeInput(value);
                  setRoomTypeId(match ? String(match.id) : "");
                  setCustomRoomType(match ? "" : value);
                  setSaveCustomRoomType(false);
                  setRoomTypeSaved(false);
                  setRoomTypeMenuOpen(true);
                }}
                className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-base font-semibold shadow-sm outline-none transition placeholder:font-normal focus:border-amber-500 focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
              />
              {roomTypeMenuOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl">
                  {filteredRoomTypes.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setRoomTypeInput(entry.name);
                        setRoomTypeId(String(entry.id));
                        setCustomRoomType("");
                        setSaveCustomRoomType(false);
                        setRoomTypeSaved(false);
                        setRoomTypeMenuOpen(false);
                      }}
                      className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-amber-50"
                    >
                      {entry.name}
                    </button>
                  ))}
                  {!filteredRoomTypes.length && (
                    <p className="px-3 py-3 text-sm text-slate-500">
                      New room type. Tick below to save it for future use.
                    </p>
                  )}
                </div>
              )}
            </div>
          </label>
          {customRoomType.trim() && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={saveCustomRoomType}
                disabled={savingRoomType}
                onChange={(event) => {
                  setSaveCustomRoomType(event.target.checked);
                  if (event.target.checked) saveRoomTypeForFuture();
                }}
                className="h-5 w-5 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
              />
              {savingRoomType
                ? "Saving room type..."
                : "Save this room type for future use"}
            </label>
          )}
          {roomTypeSaved && (
            <p className="mt-3 text-sm font-semibold text-emerald-700">
              Room type saved for future use. Measurements can be added later.
            </p>
          )}
        </div>
      </section>
      {!initialRoomId && availableRoomTypes.length === 0 && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          All available rooms have already been added to this calculation.
        </p>
      )}
      {!roomTypeId && !customRoomType.trim() && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          Select the current room before entering any dimensions.
        </p>
      )}
      <fieldset
        disabled={!roomTypeId && !customRoomType.trim()}
        className={`space-y-5 ${!roomTypeId && !customRoomType.trim() ? "opacity-50" : ""}`}
      >
        <Section
          title="1. Wall dimensions"
          subtitle={`Height × length (${unit})`}
          action="Add another wall"
          add={() => {
            if (
              walls.some(
                (entry) =>
                  Number(entry.height) <= 0 || Number(entry.length) <= 0,
              )
            ) {
              onError(
                "Complete the current wall height and length before adding another wall.",
              );
              return;
            }
            onError("");
            const i = walls.length;
            setWalls((list) => [...list, newWall(i)]);
            setOpenWall(i);
          }}
        >
          {walls.map((entry, i) =>
            i === openWall ? (
              <Wall
                key={i}
                {...{ entry, unit }}
                area={calc(entry, ["height", "length"])}
                change={(key, value) => update(setWalls, i, key, value)}
                remove={() =>
                  setWalls((list) => list.filter((_, index) => index !== i))
                }
              />
            ) : (
              <Collapsed
                key={i}
                label="Wall total"
                name={entry.name}
                area={calc(entry, ["height", "length"])}
                open={() => setOpenWall(i)}
              />
            ),
          )}
        </Section>
        <Section
          title="2. Ceiling dimensions"
          subtitle={`Length × width (${unit})`}
          action="Add ceiling"
          add={() => {
            if (
              ceilings.some(
                (entry) =>
                  Number(entry.length) <= 0 || Number(entry.width) <= 0,
              )
            ) {
              onError(
                "Complete the current ceiling length and width before adding another ceiling.",
              );
              return;
            }
            onError("");
            const i = ceilings.length;
            setCeilings((list) => [...list, newCeiling(i)]);
            setOpenCeiling(i);
          }}
        >
          {ceilings.map((entry, i) =>
            i === openCeiling ? (
              <Ceiling
                key={i}
                {...{ entry, unit }}
                area={calc(entry, ["length", "width"])}
                change={(key, value) => update(setCeilings, i, key, value)}
                remove={() =>
                  setCeilings((list) => list.filter((_, index) => index !== i))
                }
              />
            ) : (
              <Collapsed
                key={i}
                label="Ceiling total"
                name={entry.name}
                area={calc(entry, ["length", "width"])}
                open={() => setOpenCeiling(i)}
              />
            ),
          )}
        </Section>
        <Section
          title="3. Custom areas"
          subtitle={`Add floor, terrace, balcony or any other area. Length × width (${unit})`}
          action="Add custom area"
          add={() => {
            if (
              customAreas.some(
                (entry) =>
                  !entry.name.trim() ||
                  Number(entry.length) <= 0 ||
                  Number(entry.width) <= 0 ||
                  Number(entry.quantity) < 1,
              )
            ) {
              onError(
                "Complete the current custom area before adding another one.",
              );
              return;
            }
            const selectedAreaName = customAreaGroupName.trim();
            if (!selectedAreaName) {
              onError("Enter or select an area name such as Floor or Terrace.");
              return;
            }
            onError("");
            const i = customAreas.length;
            const groupIndex = customAreas.filter(
              (entry) =>
                entry.areaGroupName.trim().toLowerCase() ===
                selectedAreaName.toLowerCase(),
            ).length;
            setCustomAreas((list) => [
              ...list,
              newCustomArea(i, selectedAreaName, groupIndex),
            ]);
            setOpenCustomArea(i);
          }}
        >
          <label className="block rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm font-semibold text-violet-950 sm:p-4">
            Area name
            <input
              list="custom-area-group-options"
              value={customAreaGroupName}
              onChange={(event) => setCustomAreaGroupName(event.target.value)}
              placeholder="Floor, Terrace, Balcony..."
              className="mt-1.5 h-10 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 font-normal text-slate-950 outline-none focus:border-violet-600"
            />
            <datalist id="custom-area-group-options">
              <option value="Floor" />
              <option value="Terrace" />
              <option value="Balcony" />
              <option value="Utility Area" />
              <option value="Roof" />
              <option value="Staircase" />
              <option value="Parking Area" />
              <option value="Parapet Wall" />
              <option value="Textured Wall" />
              <option value="Compound Wall" />
              <option value="Front Elevation" />
            </datalist>
          </label>
          {customAreas.map((entry, i) =>
            i === openCustomArea ? (
              <CustomArea
                key={i}
                {...{ entry, unit }}
                area={calc(entry, ["length", "width"])}
                change={(key, value) => {
                  update(setCustomAreas, i, key, value);
                  if (key === "areaGroupName") setCustomAreaGroupName(value);
                }}
                remove={() =>
                  setCustomAreas((list) =>
                    list.filter((_, index) => index !== i),
                  )
                }
              />
            ) : (
              <Collapsed
                key={i}
                label="Custom area"
                name={entry.name}
                area={calc(entry, ["length", "width"])}
                open={() => setOpenCustomArea(i)}
              />
            ),
          )}
        </Section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-950 text-sm font-bold text-white">
                4
              </span>
              <h3 className="font-bold text-slate-950">
                Deductions and other additions
              </h3>
            </div>
          </header>
          <div className="space-y-3 p-3 sm:p-5">
            {items.map((entry, i) =>
              i === openItem ? (
                <Item
                  key={i}
                  {...{ entry, unit }}
                  area={calc(entry)}
                  change={(key, value) => update(setItems, i, key, value)}
                  remove={() =>
                    setItems((list) => list.filter((_, index) => index !== i))
                  }
                />
              ) : (
                <Collapsed
                  key={i}
                  label={`${entry.type} total`}
                  name={entry.name}
                  area={calc(entry)}
                  open={() => setOpenItem(i)}
                />
              ),
            )}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-slate-100 bg-slate-50 p-3 sm:flex sm:items-center sm:justify-end sm:p-4">
            <select
              value={itemType}
              onChange={(event) => setItemType(event.target.value)}
              className="min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold sm:w-56 sm:px-4"
            >
              <option>Window</option>
              <option>Door</option>
              <option>Wardrobe</option>
              <option>Ceiling</option>
              <option>Other</option>
            </select>
            <button
              type="button"
              onClick={() => {
                if (
                  items.some(
                    (entry) =>
                      Number(entry.height) <= 0 ||
                      Number(entry.width) <= 0 ||
                      Number(entry.quantity) < 1 ||
                      !entry.name.trim(),
                  )
                ) {
                  onError(
                    "Complete the current deduction or addition before adding another item.",
                  );
                  return;
                }
                onError("");
                const i = items.length;
                setItems((list) => [
                  ...list,
                  newItem(
                    itemType,
                    list.filter((entry) => entry.type === itemType).length,
                  ),
                ]);
                setOpenItem(i);
              }}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400 sm:px-5"
            >
              <Plus className="h-4 w-4" />
              Add item
            </button>
          </div>
        </section>
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:grid-cols-3 sm:p-3 lg:grid-cols-7">
          <Total label="Walls" value={totals.gross} />
          <Total label="Additions" value={totals.additions} />
          <Total label="All deductions" value={totals.deductions} />
          <Total label="Net walls" value={totals.net} />
          <Total label="Net ceiling" value={totals.ceiling} />
          <Total label="Custom areas" value={totals.customAreaGross} />
          <Total
            label="Final total"
            value={totals.net + totals.ceiling + totals.customAreaGross}
            strong
          />
        </div>
        <div className="flex flex-col-reverse gap-2 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:justify-between">
          {initialRoomId && initialRoomId !== "exterior" && (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Delete this complete room calculation? This will remove its walls, ceiling, custom areas and deductions.",
                  )
                )
                  return;
                setSaving(true);
                onError("");
                try {
                  await api.delete("/quotations/rooms/" + initialRoomId + "/");
                  await onSaved(measurementRecordId);
                } catch (error) {
                  onError(
                    Object.values(error.response?.data || {})
                      .flat()
                      .join(" ") || "Room calculation could not be deleted.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-3.5 font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50 sm:w-auto"
            >
              <Trash2 className="h-4 w-4" />
              Delete Room Calculation
            </button>
          )}
          <button
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3.5 font-bold text-white shadow-lg shadow-emerald-700/20 transition hover:bg-emerald-600 disabled:opacity-50 sm:w-auto"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : initialRoomId ? "Update Room" : "Save Room"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function Section({ title, subtitle, action, add, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-4 space-y-3">{children}</div>
      <div className="mt-3 flex justify-end sm:mt-4">
        <button
          type="button"
          onClick={add}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold transition hover:border-amber-400 hover:bg-amber-50 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          {action}
        </button>
      </div>
    </section>
  );
}
function Wall({ entry, unit, area, change, remove }) {
  return (
    <Row>
      <Field
        className="col-span-2 sm:col-span-1"
        label="Name"
        value={entry.name}
        set={(v) => change("name", v)}
      />
      <Field
        number
        label={`Height (${unit})`}
        value={entry.height}
        set={(v) => change("height", v)}
      />
      <Field
        number
        label={`Length (${unit})`}
        value={entry.length}
        set={(v) => change("length", v)}
      />
      <div className="col-span-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 sm:contents">
        <Area value={area} />
        <Delete action={remove} compact />
      </div>
    </Row>
  );
}
function Ceiling({ entry, unit, area, change, remove }) {
  return (
    <Row>
      <Field
        className="col-span-2 sm:col-span-1"
        label="Name"
        value={entry.name}
        set={(v) => change("name", v)}
      />
      <Field
        number
        label={`Length (${unit})`}
        value={entry.length}
        set={(v) => change("length", v)}
      />
      <Field
        number
        label={`Width (${unit})`}
        value={entry.width}
        set={(v) => change("width", v)}
      />
      <div className="col-span-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 sm:contents">
        <Area value={area} />
        <Delete action={remove} compact />
      </div>
    </Row>
  );
}
function CustomArea({ entry, unit, area, change, remove }) {
  return (
    <Row>
      <label className="col-span-2 min-w-0 text-sm sm:col-span-1">
        Area name
        <input
          required
          list="custom-area-group-options"
          value={entry.areaGroupName}
          onChange={(event) => change("areaGroupName", event.target.value)}
          placeholder="Floor, Terrace, Balcony..."
          className="mt-1.5 h-10 w-full min-w-0 rounded-lg border px-3 py-2"
        />
      </label>
      <Field
        label="Line name"
        value={entry.name}
        set={(v) => change("name", v)}
      />
      <Field
        number
        label={`Length / Height (${unit})`}
        value={entry.length}
        set={(v) => change("length", v)}
      />
      <Field
        number
        label={`Width (${unit})`}
        value={entry.width}
        set={(v) => change("width", v)}
      />
      <div className="col-span-2 flex items-center justify-between rounded-xl bg-violet-50 px-3 py-2 sm:contents">
        <Area value={area} />
        <Delete action={remove} compact />
      </div>
    </Row>
  );
}
function Row({ children }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border p-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto] sm:p-4">
      {children}
    </div>
  );
}
function Item({ entry, unit, area, change, remove }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 xl:grid-cols-12 xl:items-end">
        <div className="col-span-2 xl:col-span-3">
          <Field
            label={`${entry.type} name`}
            value={entry.name}
            set={(v) => change("name", v)}
          />
        </div>
        <div className="xl:col-span-2">
          <Field
            number
            label={`Height (${unit})`}
            value={entry.height}
            set={(v) => change("height", v)}
          />
        </div>
        <div className="xl:col-span-2">
          <Field
            number
            label={`Width (${unit})`}
            value={entry.width}
            set={(v) => change("width", v)}
          />
        </div>
        <div className="xl:col-span-1">
          <Field
            number
            whole
            label="Quantity"
            value={entry.quantity}
            set={(v) => change("quantity", v)}
          />
        </div>
        <label className="min-w-0 text-sm">
          Sides
          <select
            value={entry.sides}
            onChange={(e) => change("sides", e.target.value)}
            className="mt-1.5 h-10 w-full min-w-0 rounded-lg border px-3 py-2"
          >
            <option value="1">1 side</option>
            <option value="2">2 sides</option>
          </select>
        </label>
        <label className="col-span-2 flex h-10 items-center gap-2 rounded-lg bg-slate-100 px-3 text-sm font-semibold xl:col-span-2">
          <input
            type="checkbox"
            checked={entry.deduct}
            onChange={(e) => change("deduct", e.target.checked)}
          />
          {entry.type === "Ceiling"
            ? "Deduct from ceiling"
            : "Deduct from wall"}
        </label>
        <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2 lg:col-span-4 xl:col-span-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Calculated area
            </p>
            <p className="font-bold text-emerald-950">
              {area.toFixed(0)} sq ft
            </p>
          </div>
          <Delete action={remove} compact />
        </div>
      </div>
    </div>
  );
}
function Collapsed({ label, name, area, open }) {
  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full items-center justify-between rounded-xl border bg-slate-50 px-4 py-3 text-left hover:border-amber-400 hover:bg-amber-50"
    >
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">
          {label}
        </p>
        <p className="font-bold">{name}</p>
      </div>
      <div className="text-right">
        <b>{area.toFixed(0)} sq ft</b>
        <small className="block text-amber-700">Click to edit</small>
      </div>
    </button>
  );
}
function Field({ label, value, set, number, whole, className = "" }) {
  return (
    <label className={`min-w-0 text-sm ${className}`}>
      {label}
      <input
        required
        type={number ? "number" : "text"}
        min={number ? (whole ? 1 : 0.01) : undefined}
        step={number ? (whole ? 1 : 0.01) : undefined}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="mt-1.5 h-10 w-full min-w-0 rounded-lg border px-3 py-2"
      />
    </label>
  );
}
function Area({ value }) {
  return (
    <div className="text-sm sm:pt-6">
      <b>{value.toFixed(0)} sq ft</b>
    </div>
  );
}
function Delete({ action, compact = false }) {
  return (
    <button
      type="button"
      onClick={action}
      aria-label="Delete line"
      className={
        compact
          ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600"
          : "mt-5 p-2 text-red-600"
      }
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
function Total({ label, value, strong }) {
  return (
    <div
      className={`rounded-xl p-3 ${strong ? "bg-slate-950 text-white" : "bg-slate-50"}`}
    >
      <p className="text-xs opacity-65">{label}</p>
      <p className="mt-1 font-bold">{value.toFixed(0)} sq ft</p>
    </div>
  );
}
