"""Offline system-copy resources. Never call this with user-entered values."""
import json
import re
from pathlib import Path

RESOURCE = Path(__file__).resolve().parents[2] / "shared/transliteration/glossary.json"
GLOSSARY = json.loads(RESOURCE.read_text(encoding="utf8"))
NOTIFICATIONS = json.loads((RESOURCE.parent / 'notification_sources.json').read_text(encoding='utf8'))
BRANDS = json.loads((RESOURCE.parent / 'protected-brands.json').read_text(encoding='utf8'))
PROTECTED_BRANDS = re.compile('(' + '|'.join(re.escape(brand) for brand in BRANDS) + ')', re.I)
TOKEN = re.compile(r"\{\{[^}]*\}\}|\{[^}]*\}|https?://[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]+|#[\da-fA-F]{3,8}\b|\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b|\b[A-Za-z]+(?:['’][A-Za-z]+)?[\w]*\b")


def system_text(source, language="en"):
    if not isinstance(source, str) or language not in GLOSSARY:
        return source
    return ''.join(part if index % 2 else TOKEN.sub(lambda match: GLOSSARY[language].get(match.group().lower().replace('’', "'"), match.group()) if re.fullmatch(r"[A-Za-z]+(?:['’][A-Za-z]+)?", match.group()) else match.group(), part) for index, part in enumerate(PROTECTED_BRANDS.split(source)))


def format_system_text(source, language, **values):
    return re.sub(r"\{\{(\w+)\}\}|\{(\w+)\}", lambda match: str(values.get(match.group(1) or match.group(2), match.group())), system_text(source, language))
