import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def colour_catalogue():
    path = Path(__file__).resolve().parent / "data" / "chat_colours.json"
    return json.loads(path.read_text(encoding="utf-8"))


def colour_by_id(value):
    try:
        index = int(value)
    except (TypeError, ValueError):
        return None
    colours = colour_catalogue()
    if index < 0 or index >= len(colours):
        return None
    return colours[index]
