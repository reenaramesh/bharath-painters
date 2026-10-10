"""Atomic Draft request contract; reuse the installed quotation engine."""
from rest_framework import serializers

from .serializers import QuotationRoomSerializer, QuotationSerializer


class DraftRoomSerializer(QuotationRoomSerializer):
    id = serializers.IntegerField(required=False, min_value=1)


class DraftQuotationSerializer(QuotationSerializer):
    expected_updated_at = serializers.DateTimeField(write_only=True, required=True)
    rooms = DraftRoomSerializer(many=True, required=True)

    class Meta(QuotationSerializer.Meta):
        fields = QuotationSerializer.Meta.fields + ("expected_updated_at",)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if "status" in self.initial_data:
            raise serializers.ValidationError({"status": "Use a separate quotation workflow action to change status."})
        for field in ("customer", "property", "measurement_record", "quotation_type", "lead"):
            if field in attrs and attrs[field] != getattr(self.instance, field):
                raise serializers.ValidationError({field: "Keep the saved Draft relationship. Create a new quotation to change it."})
        if "rooms" not in attrs:
            raise serializers.ValidationError({"rooms": "Include all Draft rooms in the save request."})
        if "items" not in attrs:
            raise serializers.ValidationError({"items": "Include all Draft lines in the save request."})
        rooms = attrs["rooms"]
        seen_rooms, seen_sources, seen_items = set(), set(), set()
        existing_rooms = {room.pk: room for room in self.instance.rooms.all()}
        existing_items = {item.pk: item for item in self.instance.items.all()}
        for room in rooms:
            if not str(room.get("name", "")).strip():
                raise serializers.ValidationError({"rooms": "Each saved room requires a name."})
            room_id = room.get("id")
            if room_id:
                if room_id not in existing_rooms or room_id in seen_rooms:
                    raise serializers.ValidationError({"rooms": "Room IDs must be unique and belong to this Draft."})
                seen_rooms.add(room_id)
                if room.get("property_room") != existing_rooms[room_id].property_room:
                    raise serializers.ValidationError({"rooms": "An existing room must retain its saved measurement relationship."})
            source = room.get("property_room")
            if source:
                if source.pk in seen_sources:
                    raise serializers.ValidationError({"rooms": "A measured room cannot be repeated."})
                seen_sources.add(source.pk)
        for item in attrs["items"]:
            item_id = item.get("id")
            if item_id:
                if item_id not in existing_items or item_id in seen_items:
                    raise serializers.ValidationError({"items": "Line IDs must be unique and belong to this Draft."})
                seen_items.add(item_id)
            index, room = item.get("room_index"), item.get("room")
            if index is not None and room is not None:
                raise serializers.ValidationError({"items": "Use either a room index or a saved room ID for each line."})
            if index is not None and (index < 0 or index >= len(rooms)):
                raise serializers.ValidationError({"items": "A line references an invalid room index."})
            if room and (room.pk not in seen_rooms or room.quotation_id != self.instance.pk):
                raise serializers.ValidationError({"items": "A line references a room outside the saved Draft selection."})
            if item_id and "room" not in item and index is None:
                saved_room_id = existing_items[item_id].room_id
                if saved_room_id and saved_room_id not in seen_rooms:
                    raise serializers.ValidationError({"items": "Reassign or remove lines before removing their saved room."})
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("expected_updated_at")
        self.context["replace_draft_rooms"] = True
        return super().update(instance, validated_data)
