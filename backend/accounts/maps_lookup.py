"""Resolve an allowlisted Google Maps link to structured place address fields."""

import re
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests
from quotations.integration_secrets import get_google_maps_key


SHORT_HOSTS = {"maps.app.goo.gl", "goo.gl"}
MAP_HOSTS = {"google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"}


class MapLookupError(Exception):
    pass


def _google_error(response):
    if response.status_code in (401, 403):
        return MapLookupError("Google rejected the API key. Check Places API (New), billing, and the key's application/API restrictions in Google Cloud.")
    if response.status_code == 429:
        return MapLookupError("Google Maps quota has been reached. Check the project's quota and billing in Google Cloud.")
    if response.status_code >= 500:
        return MapLookupError("Google Maps is temporarily unavailable. Try again later.")
    try:
        message = str((response.json().get("error") or {}).get("message") or "")
    except ValueError:
        message = ""
    # Do not echo arbitrary Google response text; it may contain request data.
    if "field mask" in message.lower():
        return MapLookupError("Google rejected the requested address fields. Contact the app administrator.")
    return MapLookupError(f"Google Maps rejected the address request (HTTP {response.status_code}). Check the Maps API setup.")


def _parsed_map_url(value):
    parsed = urlparse(value)
    try:
        port = parsed.port
    except ValueError as exc:
        raise MapLookupError("Paste a valid HTTPS Google Maps link.") from exc
    if parsed.scheme != "https" or parsed.hostname not in MAP_HOSTS or port is not None:
        raise MapLookupError("Paste an HTTPS Google Maps link.")
    return parsed


def lookup_google_map_link(value):
    if len(value) > 2048:
        raise MapLookupError("The Maps link is too long.")
    parsed = _parsed_map_url(value)
    if parsed.hostname in SHORT_HOSTS:
        try:
            response = requests.get(value, allow_redirects=False, stream=True, timeout=5)
            location = response.headers.get("Location", "")
            status_code = response.status_code
            response.close()
        except requests.RequestException as exc:
            raise MapLookupError("The server could not reach the Google Maps link. Check internet access from the backend server and try again.") from exc
        if status_code >= 400:
            raise MapLookupError(f"Google Maps could not open this share link (HTTP {status_code}). Copy a fresh place link from Google Maps.")
        if not location:
            raise MapLookupError("Google Maps did not redirect this short link to a place. Copy a fresh place link from Google Maps.")
        parsed = _parsed_map_url(urljoin(value, location))

    params = parse_qs(parsed.query)
    place_id = (params.get("query_place_id") or [""])[0]
    if place_id and not re.fullmatch(r"[A-Za-z0-9_-]{10,200}", place_id):
        raise MapLookupError("The Maps link contains an invalid place ID.")
    place_query = (params.get("query") or params.get("q") or [""])[0].strip()
    if not place_query and "/maps/place/" in parsed.path:
        place_query = unquote(parsed.path.split("/maps/place/", 1)[1].split("/", 1)[0]).replace("+", " ").strip()
    if not place_query and not place_id:
        raise MapLookupError("This Maps link has no place name. Open the place in Google Maps and copy its Share link.")

    api_key = get_google_maps_key()
    if not api_key:
        raise MapLookupError("Maps address lookup is not configured yet. Enter the address, city and PIN manually.")
    headers = {"X-Goog-Api-Key": api_key}
    try:
        if place_id:
            response = requests.get(
                f"https://places.googleapis.com/v1/places/{place_id}",
                headers={**headers, "X-Goog-FieldMask": "displayName,formattedAddress,addressComponents"},
                timeout=6,
            )
            if not response.ok:
                raise _google_error(response)
            place = response.json()
        else:
            response = requests.post(
                "https://places.googleapis.com/v1/places:searchText",
                headers={**headers, "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.addressComponents"},
                json={"textQuery": place_query, "regionCode": "IN", "maxResultCount": 1},
                timeout=6,
            )
            if not response.ok:
                raise _google_error(response)
            places = response.json().get("places") or []
            if not places:
                raise MapLookupError("No place was found for this link. Enter the address manually.")
            place = places[0]
    except requests.Timeout as exc:
        raise MapLookupError("Google Places did not respond in time. Try again.") from exc
    except requests.ConnectionError as exc:
        raise MapLookupError("The server could not reach Google Places. Check backend internet access.") from exc
    except (requests.RequestException, ValueError) as exc:
        raise MapLookupError("Google Places returned an unreadable response. Try again or enter the address manually.") from exc

    components = place.get("addressComponents") or []
    def part(*types):
        return next((item.get("longText", "") for item in components if set(item.get("types") or []) & set(types)), "")

    city = part("locality", "postal_town", "administrative_area_level_3", "administrative_area_level_2")
    pincode = part("postal_code")
    name = (place.get("displayName") or {}).get("text", "")
    address = place.get("formattedAddress", "")
    if not address:
        raise MapLookupError("Google Maps did not provide an address for this place.")
    return {"apartment_community": name[:160], "address": address, "city": city[:160], "pincode": pincode[:10]}
