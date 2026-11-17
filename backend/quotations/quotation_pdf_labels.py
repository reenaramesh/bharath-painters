"""Display-only quotation labels; stored area references remain unchanged."""
import re


_AREA_SUFFIX = re.compile(
    r"\s*(?:[:???-]\s*|\(\s*)?\d[\d,]*(?:\.\d+)?\s*(?:sq\.?\s*ft\.?|sqft|sft|square\s+(?:feet|foot))\s*\)?\s*$",
    re.IGNORECASE,
)


def quotation_contribution_room_names(details):
    contributions = details.get("contributions") if isinstance(details, dict) else None
    rooms = []
    for entry in contributions if isinstance(contributions, list) else []:
        if not isinstance(entry, dict) or not isinstance(entry.get("room_name"), str):
            continue
        try:
            included = float(entry.get("quantity", 0)) > 0
        except (TypeError, ValueError, OverflowError):
            continue
        name = entry["room_name"].strip()
        if included and name and name not in rooms:
            rooms.append(name)
    return rooms


def quotation_room_area_label(item):
    details = getattr(item, "specification_details", None)
    details = details if isinstance(details, dict) else {}
    if details.get("kind") in ("group", "special"):
        rooms = quotation_contribution_room_names(details)
        surface = details.get("surface") if isinstance(details.get("surface"), str) else ""
        surface_name = details.get("name", "") if details.get("kind") == "special" else {"WALL": "Walls", "CEILING": "Ceiling", "DOOR": "Door", "WINDOW": "Window"}.get(surface, surface.removeprefix("OTHER:").replace("_", " ").title())
        if rooms:
            return f"{surface_name} - {', '.join(rooms)}" if surface_name else ", ".join(rooms)
    names = [_AREA_SUFFIX.sub("", name).strip() for name in (item.included_areas or []) if isinstance(name, str)]
    names = list(dict.fromkeys(name for name in names if name))
    return ", ".join(names) or (item.room.name if item.room else "")
