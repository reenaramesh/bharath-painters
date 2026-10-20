const defaults = { primary: "#5740EC", accent: "#FB4B8B" };
const legacyDefaults = [["#176B9B", "#508398"], ["#2563EB", "#F59E0B"]];
const isHexColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function resolveAppTheme(colors = {}) {
  const primary = colors.app_primary_color;
  const accent = colors.app_accent_color;
  // Only migrate complete former defaults; mixed custom palettes stay intact.
  const formerDefault = legacyDefaults.some(([p, a]) => primary?.toUpperCase?.() === p && accent?.toUpperCase?.() === a);
  return {
    app_primary_color: !isHexColor(primary) || formerDefault ? defaults.primary : primary.toUpperCase(),
    app_accent_color: !isHexColor(accent) || formerDefault ? defaults.accent : accent.toUpperCase(),
  };
}
