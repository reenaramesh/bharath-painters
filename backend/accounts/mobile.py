"""Canonical mobile numbers shared by registration, CRM, and sign-in."""

import re

try:
    import phonenumbers
    from phonenumbers import PhoneNumberFormat, PhoneNumberType
except ImportError:
    phonenumbers = None


def normalize_mobile(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if not re.fullmatch(r"\+?[\d\s().-]+", raw):
        return ""
    digits = re.sub(r"\D", "", raw)
    if not raw.startswith("+") and not raw.startswith("00") and len(digits) == 12 and digits.startswith("91"):
        raw = "+" + digits
    # A national number is Indian by default. International numbers require
    # an explicit + or 00 country prefix so they cannot be guessed incorrectly.
    if raw.startswith("00"):
        raw = "+" + raw[2:]
    if phonenumbers is None:
        if not raw.startswith("+"):
            national = digits[1:] if len(digits) == 11 and digits.startswith("0") else digits
            return "+91" + national if len(national) == 10 and national[0] in "6789" else ""
        international = re.sub(r"\D", "", raw)
        if international.startswith("910") and len(international) == 13:
            international = "91" + international[3:]
        if international.startswith("91") and (len(international) != 12 or international[2] not in "6789"):
            return ""
        return "+" + international if 8 <= len(international) <= 15 and not international.startswith("0") else ""
    try:
        number = phonenumbers.parse(raw, "IN")
    except phonenumbers.NumberParseException:
        return ""
    if not phonenumbers.is_possible_number(number):
        return ""
    if phonenumbers.number_type(number) not in (
        PhoneNumberType.MOBILE,
        PhoneNumberType.FIXED_LINE_OR_MOBILE,
    ):
        return ""
    return phonenumbers.format_number(number, PhoneNumberFormat.E164)


def matching_mobile_users(value, queryset=None, exclude_pk=None):
    from .models import BharathUser

    normalized = normalize_mobile(value)
    if not normalized:
        return []
    queryset = queryset if queryset is not None else BharathUser.objects.all()
    if exclude_pk is not None:
        queryset = queryset.exclude(pk=exclude_pk)
    matches = list(queryset.filter(mobile=normalized))
    # Older accounts can still contain national, trunk-zero, or spaced forms.
    # Compare the full E.164 number, including country code, for those rows.
    matches.extend(
        user for user in queryset.exclude(mobile=normalized).only("id", "mobile")
        if normalize_mobile(user.mobile) == normalized
    )
    return matches
