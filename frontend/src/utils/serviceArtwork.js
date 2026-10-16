export const serviceArtwork = Object.freeze(Object.fromEntries(
  ['painting', 'plumbing', 'electrical', 'carpentry', 'cleaning', 'waterproofing', 'false-ceiling']
    .map(service => [service, `/service-art/${service}.webp`]),
));

export function resolveServiceArtwork(service) {
  if (typeof service !== 'string') return null;
  const key = service.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return serviceArtwork[key] || null;
}
