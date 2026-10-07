"""Prepare static resources offline from English pronunciations, never spelling.

Single CMU pronunciations are phonetic drafts. Explicit overrides take priority.
Ambiguous/unknown words remain English and are listed for review. No service is
called by this tool or the application. Run with a local cmudict.dict argument.
"""
import csv
import ast
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "shared/transliteration"
SCRIPTS = ["te", "kn", "hi", "ta"]
PROTECTED = set("Bharath Apps BharathApps Google Maps WhatsApp Facebook Instagram Pinterest Razorpay Stripe Microsoft Excel Gmail OAuth JWT API PDF QR URL ID PIN GST INR UPI PAN IFSC OTP SMS B2B CRM RGB HEX HSN SAC MOU MB QTY SL sqft sqm sq ft m l pcs nos mm cm km kg ml px Ltd Pvt India Noto Helvetica localhost".lower().split())
# ARPAbet consonants, corresponding native-script graphemes. These are English
# sounds, not native-language vocabulary or English letter substitutions.
CONSONANTS = {
    "B": ["బ", "ಬ", "ब", "ப"], "CH": ["చ", "ಚ", "च", "ச"],
    "D": ["డ", "ಡ", "ड", "ட"], "DH": ["ద", "ದ", "द", "த"],
    "F": ["ఫ", "ಫ", "फ", "ஃப"], "G": ["గ", "ಗ", "ग", "க"],
    "HH": ["హ", "ಹ", "ह", "ஹ"], "JH": ["జ", "ಜ", "ज", "ஜ"],
    "K": ["క", "ಕ", "क", "க"], "L": ["ల", "ಲ", "ल", "ல"],
    "M": ["మ", "ಮ", "म", "ம"], "N": ["న", "ನ", "न", "ந"],
    "NG": ["ంగ", "ಂಗ", "ंग", "ங"], "P": ["ప", "ಪ", "प", "ப"],
    "R": ["ర", "ರ", "र", "ர"], "S": ["స", "ಸ", "स", "ஸ"],
    "SH": ["ష", "ಶ", "श", "ஷ"], "T": ["ట", "ಟ", "ट", "ட"],
    "TH": ["థ", "ಥ", "थ", "த"], "V": ["వ", "ವ", "व", "வ"],
    "W": ["వ", "ವ", "व", "வ"], "Y": ["య", "ಯ", "य", "ய"],
    "Z": ["జ", "ಜ", "ज़", "ஸ"], "ZH": ["జ", "ಜ", "ज़", "ழ"],
}
# Each vowel has independent and consonant-attached forms.
VOWELS = {
    "AH": [("అ", ""), ("ಅ", ""), ("अ", ""), ("அ", "")],
    "AA": [("ఆ", "ా"), ("ಆ", "ಾ"), ("आ", "ा"), ("ஆ", "ா")],
    "AE": [("యా", "్యా"), ("ಯಾ", "್ಯಾ"), ("ऐ", "ै"), ("ஏ", "ே")],
    "AO": [("ఆ", "ా"), ("ಆ", "ಾ"), ("ऑ", "ॉ"), ("ஆ", "ா")],
    "AW": [("ఔ", "ౌ"), ("ಔ", "ೌ"), ("आउ", "ाउ"), ("அவ்", "வ்")],
    "AY": [("ఐ", "ై"), ("ಐ", "ೈ"), ("आइ", "ाइ"), ("ஐ", "ை")],
    "EH": [("ఎ", "ె"), ("ಎ", "ೆ"), ("ए", "े"), ("எ", "ெ")],
    "EY": [("ఏ", "ే"), ("ಏ", "ೇ"), ("ए", "े"), ("ஏ", "ே")],
    "IH": [("ఇ", "ి"), ("ಇ", "ಿ"), ("इ", "ि"), ("இ", "ி")],
    "IY": [("ఈ", "ీ"), ("ಈ", "ೀ"), ("ई", "ी"), ("ஈ", "ீ")],
    "OW": [("ఓ", "ో"), ("ಓ", "ೋ"), ("ओ", "ो"), ("ஓ", "ோ")],
    "OY": [("ఆయి", "ాయి"), ("ಆಯ್", "ಾಯ್"), ("ऑइ", "ॉइ"), ("ஆய்", "ாய்")],
    "UH": [("ఉ", "ు"), ("ಉ", "ು"), ("उ", "ु"), ("உ", "ு")],
    "UW": [("ఊ", "ూ"), ("ಊ", "ೂ"), ("ऊ", "ू"), ("ஊ", "ூ")],
}
VIRAMA = ["్", "್", "्", "்"]


def phonetic(phones, script):
    i = SCRIPTS.index(script)
    output = ""
    pending = False
    expanded = []
    for phone in phones:
        expanded.extend(["AH", "R"] if phone == "ER" else [phone])
    for index, phone in enumerate(expanded):
        if phone == 'AO' and index + 1 < len(expanded) and expanded[index + 1] == 'R' and script != 'hi':
            phone = 'OW'
        if phone in CONSONANTS:
            if pending:
                output += VIRAMA[i]
            output += 'ன' if phone == 'N' and script == 'ta' and output else CONSONANTS[phone][i]
            pending = True
        elif phone in VOWELS:
            output += VOWELS[phone][i][1 if pending else 0]
            pending = False
        else:
            return None
    if pending and script != "hi":
        output += VIRAMA[i]
    return output


def build(dictionary):
    pronunciations = defaultdict(set)
    for line in Path(dictionary).read_text(encoding="utf8").splitlines():
        if not line or line.startswith(";;;"):
            continue
        word, _, phones = line.partition(" ")
        word = re.sub(r"\(\d+\)$", "", word).lower()
        pronunciations[word].add(tuple(re.sub(r"\d", "", p) for p in phones.split()))
    words = set()
    files = list((ROOT / "frontend/src").rglob("*.jsx")) + list((ROOT / "frontend/src").rglob("*.js"))
    files += list((ROOT / "backend/quotations").glob("*pdf*.py")) + list((ROOT / "backend/accounts").glob("*pdf*.py")) + [ROOT / "backend/quotations/document_languages.py"]
    files += list((ROOT / 'backend/accounts/templates/accounts').glob('*.html'))
    for file in files:
        if "preview" in file.parts or "fonts" in file.parts:
            continue
        words.update(word.lower() for word in re.findall(r"\b[A-Za-z]+(?:'[A-Za-z]+)?\b", file.read_text(encoding="utf8")))
    words.update("PDF Language Script English words displayed in your selected script Total in words Indian Rupees Only Package Period Ongoing computer generated document Customer Document no Role Phone Service areas Owner View profile".lower().split())
    system_sources = set(['This field is required.', 'This field may not be blank.', 'A valid integer is required.', 'Enter a valid email address.', 'Unable to log in with provided credentials.'])
    backend_files = [file for app in ['accounts', 'quotations', 'jobs', 'billing', 'outsourcing', 'config'] for file in (ROOT / 'backend' / app).rglob('*.py')]
    for file in backend_files:
        if 'migrations' in file.parts or file.name.startswith('test'):
            continue
        for node in ast.walk(ast.parse(file.read_text(encoding='utf-8-sig'))):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and len(node.value) >= 10 and ' ' in node.value and '\n' not in node.value:
                system_sources.add(node.value)
    for source in system_sources:
        words.update(word.lower() for word in re.findall(r"\b[A-Za-z]+(?:'[A-Za-z]+)?\b", source))
    (OUTPUT / 'system-sources.json').write_text(json.dumps(sorted(system_sources), ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    overrides = list(csv.DictReader((OUTPUT / "overrides.tsv").open(encoding="utf8"), delimiter="\t"))
    words.update(row["word"] for row in overrides)
    glossary = {script: {} for script in SCRIPTS}
    review = {"ambiguous_or_unknown_english_fallback": [], "phonetic_drafts_requiring_fluent_review": [], "explicit_overrides": [row["word"] for row in overrides]}
    overridden = {row["word"] for row in overrides}
    for word in sorted(words - PROTECTED - overridden):
        options = pronunciations.get(word, set())
        if len(options) != 1:
            review["ambiguous_or_unknown_english_fallback"].append(word)
            continue
        values = {script: phonetic(next(iter(options)), script) for script in SCRIPTS}
        if not all(values.values()):
            review["ambiguous_or_unknown_english_fallback"].append(word)
            continue
        review["phonetic_drafts_requiring_fluent_review"].append(word)
        for script, value in values.items():
            glossary[script][word] = value
    for row in overrides:
        if row["word"] in PROTECTED:
            continue
        for script in SCRIPTS:
            glossary[script][row["word"]] = row[script]
    for name, data in (("glossary.json", glossary), ("review.json", review)):
        (OUTPUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    notifications = {"titles": set(), "messages": set()}
    for file in (ROOT / 'backend').glob('*/views.py'):
        for node in ast.walk(ast.parse(file.read_text(encoding='utf-8-sig'))):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'create_notification':
                for index, field in ((2, 'titles'), (3, 'messages')):
                    if len(node.args) > index and isinstance(node.args[index], ast.Constant) and isinstance(node.args[index].value, str):
                        notifications[field].add(node.args[index].value)
    (OUTPUT / 'notification_sources.json').write_text(json.dumps({key: sorted(value) for key, value in notifications.items()}, indent=2) + '\n', encoding='utf8')
    print(f"Static glossary: {len(glossary['te'])} words, {len(overrides)} explicit overrides. Fluent review required for drafts.")


if __name__ == "__main__":
    build(sys.argv[1])
