"""Validate grouped quotation references against unchanged saved measurements."""
from decimal import Decimal, InvalidOperation
import json

from rest_framework import serializers


def validate_grouped_specifications(items, measurement_record):
    entries = [(item, item.get("specification_details")) for item in items if item.get("specification_details")]
    if not entries:
        return

    def fail(message):
        raise serializers.ValidationError({"items": message})

    if not measurement_record:
        fail("Select a saved Area Calculation for grouped assignments.")
    surfaces = {surface.id: surface for surface in measurement_record.surfaces.select_related("property").prefetch_related("openings").all()}
    special_ids = set()
    group_ids = set()
    assignment_ids = set()
    checked = []
    try:
        for item, details in entries:
            if not isinstance(details, dict) or len(json.dumps(details)) > 100000:
                fail("Invalid group specification details.")
            if details.get("schema_version") != 1 or details.get("kind") not in ("group", "special", "service"):
                fail("Unsupported group specification format.")
            if str(details.get("measurement_record")) != str(measurement_record.id):
                fail("Group sources must belong to the selected Area Calculation.")
            if str(details.get("measurement_version")) != str(measurement_record.version):
                fail("Group sources must use the selected measurement version.")
            assignment_id = details.get("assignment_id")
            if not isinstance(assignment_id, str) or not assignment_id.strip() or assignment_id in assignment_ids:
                fail("Each assignment must have a unique reference.")
            assignment_ids.add(assignment_id)
            if details["kind"] == "service":
                if not item.get("is_additional_service"):
                    fail("General service assignments must be additional service lines.")
                continue
            contributions = details.get("contributions")
            if not isinstance(contributions, list) or not contributions or len(contributions) > 1000:
                fail("Grouped work must retain its measured room contributions.")
            refs = []
            local_ids = set()
            local_rooms = set()
            for contribution in contributions:
                if not isinstance(contribution, dict) or not isinstance(contribution.get("sources"), list):
                    fail("Invalid room contribution.")
                room_id = contribution.get("room_id")
                local_rooms.add(str(room_id))
                subtotal = Decimal("0")
                for source in contribution["sources"]:
                    source_id = int(source["surface_id"])
                    surface = surfaces.get(source_id)
                    if not surface or str(surface.room_id) != str(room_id):
                        fail("Group sources must belong to their referenced measured room.")
                    if source_id in local_ids:
                        fail("A measured surface cannot be repeated in an assignment.")
                    local_ids.add(source_id)
                    quantity = Decimal(str(source["quantity"]))
                    if not quantity.is_finite() or quantity < 0:
                        fail("Invalid measured contribution quantity.")
                    if "original_area" in source and Decimal(str(source["original_area"])) != surface.net_area.quantize(Decimal("0.01")):
                        fail("Original measured areas must remain unchanged.")
                    if details["kind"] == "special":
                        if surface.surface_type != "WALL" or source_id in special_ids:
                            fail("A special wall must reference an unassigned measured wall.")
                        special_ids.add(source_id)
                    else:
                        declared_surface = details.get("surface")
                        named_other = isinstance(declared_surface, str) and declared_surface.startswith("OTHER:")
                        actual_surface = f"OTHER:{(surface.area_group_name or surface.name or 'Other surface').strip()}" if named_other and surface.surface_type == "OTHER" else surface.surface_type
                        if actual_surface != declared_surface or source_id in group_ids:
                            fail("A measured surface can belong to only one full-area group.")
                        group_ids.add(source_id)
                    refs.append((surface, quantity))
                    subtotal += quantity
                if subtotal != Decimal(str(contribution.get("quantity"))):
                    fail("Room contribution totals do not match their source surfaces.")
            if "room_ids" in details:
                declared_rooms = details["room_ids"]
                if not isinstance(declared_rooms, list) or {str(value) for value in declared_rooms} != local_rooms or len(declared_rooms) != len(local_rooms):
                    fail("Selected rooms must match the saved room contributions.")
            if details["kind"] == "special" and "surface_ids" in details:
                declared_sources = details["surface_ids"]
                if not isinstance(declared_sources, list) or {str(value) for value in declared_sources} != {str(value) for value in local_ids} or len(declared_sources) != len(local_ids):
                    fail("Selected special walls must match their saved source surfaces.")
            checked.append((item, details, refs))
        for item, details, refs in checked:
            expected_total = Decimal("0")
            for surface, quantity in refs:
                expected = Decimal("0") if details["kind"] == "group" and surface.id in special_ids else surface.net_area.quantize(Decimal("0.01"))
                if quantity != expected:
                    fail("Assigned quantities must match saved measurements after special-wall allocation.")
                expected_total += expected
            if Decimal(str(item.get("quantity"))) != expected_total or expected_total <= 0:
                fail("Group quantity must equal its remaining measured contributions.")
    except (KeyError, TypeError, ValueError, InvalidOperation):
        fail("Invalid measured group references or quantities.")
