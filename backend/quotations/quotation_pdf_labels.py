"""Display-only quotation labels; stored area references remain unchanged."""
import re


_AREA_SUFFIX = re.compile(
    r"\s*(?:[:???-]\s*|\(\s*)?\d[\d,]*(?:\.\d+)?\s*(?:sq\.?\s*ft\.?|sqft|sft|square\s+(?:feet|foot))\s*\)?\s*$",
    re.IGNORECASE,
)


def quotation_room_area_label(item):
    details = getattr(item, "specification_details", None) or {}
    if details.get("kind") in ("group", "special"):
        rooms = list(dict.fromkeys(entry.get("room_name", "").strip() for entry in details.get("contributions", []) if float(entry.get("quantity", 0)) > 0 and entry.get("room_name")))
        surface = details.get("surface", "")
        surface_name = details.get("name", "") if details.get("kind") == "special" else {"WALL": "Walls", "CEILING": "Ceiling", "DOOR": "Door", "WINDOW": "Window"}.get(surface, surface.removeprefix("OTHER:").replace("_", " ").title())
        if rooms:
            return f"{surface_name} - {', '.join(rooms)}" if surface_name else ", ".join(rooms)
    names = [_AREA_SUFFIX.sub("", name).strip() for name in (item.included_areas or [])]
    names = list(dict.fromkeys(name for name in names if name))
    return ", ".join(names) or (item.room.name if item.room else "")
