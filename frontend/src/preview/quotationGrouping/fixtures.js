// Synthetic API-shaped data. These IDs never identify live records.
export const masters = {
  categories: [{ id: 1, name: "Painting" }, { id: 2, name: "Texture Painting" }, { id: 3, name: "Waterproofing" }, { id: 4, name: "Putty" }, { id: 5, name: "Plumbing", general: true }, { id: 6, name: "Carpentry", general: true }, { id: 7, name: "Electrical", general: true }, { id: 8, name: "Cleaning", general: true }],
  brands: [{ id: 1, name: "Asian Paints" }, { id: 2, name: "Berger" }],
  paintTypes: [
    { id: 1, name: "Tractor Emulsion", service_category: 1 },
    { id: 2, name: "Royale Emulsion", service_category: 1 },
    { id: 3, name: "Apex Exterior", service_category: 1 },
    { id: 4, name: "Royale Play", service_category: 2 },
    { id: 5, name: "Damp Protection", service_category: 3 },
    { id: 6, name: "Wall Putty", service_category: 4 },
    { id: 7, name: "CPVC Pipe", service_category: 5 },
    { id: 8, name: "Faucet", service_category: 5 },
    { id: 9, name: "Cabinet Door", service_category: 6 },
    { id: 10, name: "LED Fitting", service_category: 7 },
    { id: 11, name: "Surface Cleaner", service_category: 8 },
  ],
  units: [{ id: 1, name: "sqft" }, { id: 2, name: "Job" }, { id: 3, name: "Nos" }, { id: 4, name: "Running ft" }],
};

export const rooms = [
  { id: 1, name: "Bedroom 1", walls: [120, 115, 110, 125], ceiling: 130 },
  { id: 2, name: "Bedroom 2", walls: [110, 110, 100, 100], ceiling: 120 },
  { id: 3, name: "Bedroom 3", walls: [100, 100, 100, 110], ceiling: 120 },
  { id: 4, name: "Main Hall", walls: [160, 160, 160, 170], ceiling: 200 },
  { id: 5, name: "Dining", walls: [80, 80, 80, 80], ceiling: 100 },
  { id: 6, name: "Utility", walls: [35, 35, 35, 35], ceiling: 50 },
  { id: 7, name: "Balcony", walls: [40, 40, 40, 40], ceiling: 60 },
];

export const measurement = {
  id: 901, version: 3, name: "Sample home - measurement version 3",
  rooms: rooms.map(({ id, name }) => ({ id, name })),
  surfaces: rooms.flatMap((room) => [
    ...room.walls.map((area, index) => ({ id: room.id * 10 + index + 1, room: room.id, surface_type: "WALL", name: `Wall ${index + 1}`, net_area: String(area), measurement_record: 901 })),
    { id: room.id * 10 + 5, room: room.id, surface_type: "CEILING", name: "Ceiling", net_area: String(room.ceiling), measurement_record: 901 },
    ...(room.id === 1 ? [{ id: 16, room: 1, surface_type: "DOOR", name: "Door", net_area: "24", measurement_record: 901 }] : []),
  ]),
};

export const defaultSpec = { service_category: 1, paint_brand: 1, paint_type: 1, finish: "Matte", primer_coats: 1, coats: 2, description: "", notes: "" };

export function exampleAssignments() {
  return {
    groups: [
      { id: "bedrooms", name: "Bedrooms Walls", surface: "WALL", room_ids: [1, 2, 3], spec: { ...defaultSpec } },
      { id: "hall", name: "Main Hall & Dining Walls", surface: "WALL", room_ids: [4, 5], spec: { ...defaultSpec, paint_type: 2 } },
      { id: "utility", name: "Utility & Balcony Walls", surface: "WALL", room_ids: [6, 7], spec: { ...defaultSpec, paint_type: 3 } },
    ],
    specials: [{ id: "texture", name: "Texture Wall", room_id: 1, surface_ids: [14], spec: { ...defaultSpec, service_category: 2, paint_type: 4 } }],
    rates: { bedrooms: "10", hall: "18", utility: "20", texture: "45" },
  };
}
