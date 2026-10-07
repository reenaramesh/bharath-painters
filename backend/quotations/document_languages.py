"""Request-local PDF script labels derived from the shared phonetic glossary."""
from rest_framework.exceptions import ValidationError
from .transliteration import system_text
SUPPORTED_LANGUAGES = ('en', 'te', 'kn', 'hi', 'ta')
ENGLISH_LABELS = {'quotation': 'Quotation', 'invoice': 'Invoice', 'receipt': 'Payment receipt', 'measurement': 'Area Calculation', 'customer': 'Customer', 'property': 'Property', 'date': 'Date', 'description': 'Description', 'quantity': 'Quantity', 'rate': 'Rate', 'amount': 'Amount', 'subtotal': 'Subtotal', 'discount': 'Discount', 'tax': 'Tax', 'total': 'Grand total', 'paid': 'Amount paid', 'balance': 'Balance due', 'terms': 'Terms and conditions', 'notes': 'Notes', 'room': 'Room', 'surface': 'Surface', 'length': 'Length', 'width': 'Width / Height', 'gross': 'Gross area', 'deduction': 'Deduction', 'addition': 'Addition', 'net': 'Net area', 'reference': 'Reference', 'mode': 'Payment mode', 'page': 'Page', 'total_words': 'Total in words', 'package_invoice': 'Package invoice', 'profile': 'Contractor profile', 'owner': 'Owner', 'mobile': 'Mobile', 'email': 'Email', 'services': 'Work skills', 'service_areas': 'Service areas', 'projects': 'Completed projects', 'years': 'Years in business', 'workers': 'Workers', 'profession': 'Profession', 'verify': 'View profile', 'document_number': 'Document no.', 'package': 'Package', 'period': 'Period', 'payment_status': 'Payment status', 'unit': 'Unit', 'advance_receipt': 'Advance payment receipt', 'address': 'Address', 'footer': 'This is a computer-generated document.', 'included_areas': 'Included areas', 'work': 'Work', 'material': 'Material', 'brand': 'Brand', 'coats': 'Coats'}
ENGLISH_STANDARD_LABELS = {'CASH': 'Cash', 'UPI': 'UPI', 'BANK_TRANSFER': 'Bank transfer', 'CARD': 'Card', 'CHEQUE': 'Cheque', 'OTHER': 'Other', 'WALL': 'Wall', 'CEILING': 'Ceiling', 'FLOOR': 'Floor', 'DOOR': 'Door', 'WINDOW': 'Window'}
ENGLISH_LABELS.update({'logo':'Company logo', 'photo':'Owner photo', 'community':'Community', 'location':'Location', 'pincode':'PIN code', 'work_completed':'Work completed', 'completed_on':'Completed on', 'rating':'Rating', 'linear_unit':'Linear unit', 'area_unit':'Area unit'})
LABELS = {code: {key: system_text(value, code) for key, value in ENGLISH_LABELS.items()} for code in SUPPORTED_LANGUAGES}
STANDARD_LABELS = {code: {key: system_text(value, code) for key, value in ENGLISH_STANDARD_LABELS.items()} for code in SUPPORTED_LANGUAGES}


def standard_label(language, value):
    return STANDARD_LABELS.get(language, STANDARD_LABELS['en']).get(value, value)


def document_language(request):
    language = str(request.query_params.get('document_language') or getattr(request.user, 'preferred_language', 'en') or 'en').lower()
    if language not in SUPPORTED_LANGUAGES:
        raise ValidationError({'code': 'unsupported_document_language', 'detail': 'Select a supported PDF language / script.'})
    return language


def label(language, key):
    return LABELS.get(language, LABELS['en']).get(key, ENGLISH_LABELS.get(key, key.replace('_', ' ').capitalize()))
