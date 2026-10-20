export function persistRefreshedSession(storage,data) {
  if(typeof data?.access!=='string' || !data.access.trim()
      || (data.refresh!==undefined && (typeof data.refresh!=='string' || !data.refresh.trim()))) {
    throw new Error('Invalid refreshed session response.');
  }
  storage.setItem('bharath_access',data.access);
  if(data.refresh!==undefined) storage.setItem('bharath_refresh',data.refresh);
  return data.access;
}
