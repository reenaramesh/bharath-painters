"""Public-page display tags. Dynamic business values are never transliterated."""
import json
from django import template
from django.utils.safestring import mark_safe
from quotations.document_languages import SUPPORTED_LANGUAGES
from quotations.transliteration import system_text
from pathlib import Path

register = template.Library()
STANDARD = {value.lower() for value in json.loads((Path(__file__).resolve().parents[3] / 'shared/transliteration/standard-labels.json').read_text(encoding='utf8'))}


@register.simple_tag(takes_context=True)
def selected_script(context):
    request = context.get('request')
    value = request.GET.get('document_language', 'en') if request else 'en'
    return value if value in SUPPORTED_LANGUAGES else 'en'


@register.simple_tag(takes_context=True)
def system_copy(context, source):
    return system_text(source, selected_script(context))


@register.simple_tag(takes_context=True)
def js_copy(context, source):
    # Only source-owned literals use this tag. JSON protects JavaScript quoting.
    return mark_safe(json.dumps(system_text(source, selected_script(context)), ensure_ascii=True))


@register.simple_tag(takes_context=True)
def standard_copy(context, value):
    return system_text(value, selected_script(context)) if isinstance(value, str) and value.lower() in STANDARD else value


@register.simple_tag(takes_context=True)
def data_with_fallback(context, value, fallback):
    return value or system_text(fallback, selected_script(context))
