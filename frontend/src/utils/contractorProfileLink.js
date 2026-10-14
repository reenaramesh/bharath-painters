export function contractorProfilePath(bharathId) {
  return bharathId ? `/contractor-profile/${encodeURIComponent(bharathId)}` : "";
}

export function contractorProfileLink(bharathId, origin = globalThis.window?.location?.origin) {
  const path = contractorProfilePath(bharathId);
  return path ? origin ? new URL(path, origin).href : path : "";
}
