import { getIndiaPincode } from "india-pincode/browser";

const DATA_URL = "https://cdn.jsdelivr.net/npm/india-pincode@2.5.9/data/pincodes.json.gz";
let enginePromise;

export function getLocationEngine() {
  if (!enginePromise) enginePromise = getIndiaPincode(DATA_URL).catch(error => { enginePromise = undefined; throw error; });
  return enginePromise;
}

export async function getMobileLocation() {
  if (!navigator.geolocation) throw new Error("Location is not supported on this device.");
  const position = await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    }),
  );
  const latitude = Number(position.coords.latitude.toFixed(6));
  const longitude = Number(position.coords.longitude.toFixed(6));
  let nearest = null;
  try {
    const engine = await getLocationEngine();
    const result = engine.findNearby(latitude, longitude, 25, 1);
    nearest = result.success ? result.data[0] : null;
  } catch {
    // Exact GPS radius matching still works if place-name lookup is offline.
  }
  return {
    location: nearest?.area || "Current mobile location",
    city: nearest?.district || "Current location",
    state: nearest?.state || "",
    pincode: nearest?.pincode || "",
    latitude,
    longitude,
    location_source: "GPS",
  };
}
