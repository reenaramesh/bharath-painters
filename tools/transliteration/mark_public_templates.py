"""One-time provenance marking of literal HTML copy, excluding data and code."""
import json
import re
from html import escape
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def tag(source, javascript=False):
    return '{% ' + ('js_copy' if javascript else 'system_copy') + ' ' + json.dumps(source, ensure_ascii=False) + ' %}'


class Marker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.output = []
        self.raw = None

    def start(self, name, attrs, closed=False):
        source = self.get_starttag_text()
        if name == 'html':
            source = source.replace('lang="en"', 'lang="{{ display_script }}"')
        source = re.sub(r'(\b(?:title|alt|placeholder|aria-label)=)([\'"])(.*?)(\2)', lambda m:
            m.group() if '{{' in m[3] or '{%' in m[3] or not re.search('[A-Za-z]', m[3]) else m[1] + '"' + tag(m[3]) + '"', source)
        if name == 'a' and 'href="{{ pdf_url }}"' in source:
            source = source.replace('href="{{ pdf_url }}"', 'href="{{ pdf_url }}?document_language={{ display_script }}"')
        self.output.append(source)
        if name in ('script','style'):
            self.raw = name
        if name == 'body':
            self.output.append('{% include "accounts/script_selector.html" %}')

    def handle_starttag(self, name, attrs): self.start(name, attrs)
    def handle_startendtag(self, name, attrs): self.start(name, attrs, True)
    def handle_endtag(self, name):
        self.output.append(f'</{name}>')
        if name == self.raw: self.raw = None
    def handle_decl(self, decl): self.output.append(f'<!{decl}>')
    def handle_comment(self, data): self.output.append('<!--'+data+'-->')
    def handle_entityref(self, name): self.output.append('&'+name+';')
    def handle_charref(self, name): self.output.append('&#'+name+';')
    def handle_data(self, data):
        if self.raw == 'style': self.output.append(data); return
        if self.raw == 'script':
            data = re.sub(r'(\.textContent\s*=\s*)("[^"\n]+"|\'[^\'\n]+\')', lambda m: m[1]+tag(m[2][1:-1], True), data)
            self.output.append(data); return
        for part in re.split(r'(\{%.*?%\}|\{\{.*?\}\})', data, flags=re.S):
            source = part.strip()
            if not source or source.startswith(('{{','{%')) or not re.search('[A-Za-z]', source): self.output.append(part); continue
            leading = part[:len(part)-len(part.lstrip())]
            trailing = part[len(part.rstrip()):]
            self.output.append(leading + tag(' '.join(source.split())) + trailing)


for name in ('verify', 'digital_card', 'painter_card'):
    path = ROOT / f'backend/accounts/templates/accounts/{name}.html'
    source = path.read_text(encoding='utf-8-sig')
    if '{% load app_script %}' in source:
        continue
    marker = Marker()
    marker.feed(source)
    path.write_text('{% load app_script %}{% selected_script as display_script %}\n'+''.join(marker.output), encoding='utf8')
print('Marked public verification and both public profile templates.')
