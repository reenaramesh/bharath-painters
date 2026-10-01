export const WORK_REQUIREMENTS_PATH = "/jobs";
export const APPLICATOR_AVAILABILITY_PATH = "/painter-seeking";

export const paintingSkillOptions = [
  "Brush Painting",
  "Roller Painting",
  "Spray Painting",
  "Wall Putty",
  "Primer",
  "Interior Painting",
  "Exterior Painting",
  "Wall Texture",
  "Wood Polish",
  "Enamel Painting",
  "Waterproofing",
  "Scaffolding",
];

export function isWorkNetworkPath(pathname) {
  return pathname === WORK_REQUIREMENTS_PATH || pathname === APPLICATOR_AVAILABILITY_PATH;
}
