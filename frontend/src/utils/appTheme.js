const defaults = { primary: "#2563EB", accent: "#F59E0B" };
const legacyDefaults = { primary: "#176B9B", accent: "#508398" };
const isHexColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function resolveAppTheme(colors = {}) {
  const primary = colors.app_primary_color;
  const accent = colors.app_accent_color;
  return {
    app_primary_color: !isHexColor(primary) || primary.toUpperCase() === legacyDefaults.primary ? defaults.primary : primary.toUpperCase(),
    app_accent_color: !isHexColor(accent) || accent.toUpperCase() === legacyDefaults.accent ? defaults.accent : accent.toUpperCase(),
  };
}
