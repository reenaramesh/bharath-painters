export const DEFAULT_PROFILE_IMAGE_POSITION = Object.freeze({ x: 50, y: 50, zoom: 1 });

export function normalizeProfileImagePosition(position) {
  return {
    x: clamp(Number(position?.x ?? 50), 0, 100),
    y: clamp(Number(position?.y ?? 50), 0, 100),
    zoom: clamp(Number(position?.zoom ?? 1), 1, 3),
  };
}

export function profileImageStyle(position) {
  const value = normalizeProfileImagePosition(position);
  return {
    objectPosition: `${value.x}% ${value.y}%`,
    transform: `scale(${value.zoom})`,
    transformOrigin: `${value.x}% ${value.y}%`,
  };
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
