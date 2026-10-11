"""Saved customer/site presentation shared by detail, portal and documents."""


def quotation_party_details(quotation):
    customer, site = quotation.customer, quotation.property
    customer_snapshot = quotation.customer_snapshot or {}
    site_snapshot = quotation.property_snapshot or {}

    def saved(snapshot, source, field, default=""):
        # A captured empty value must not reveal later profile changes.
        return snapshot[field] if field in snapshot else getattr(source, field, default)

    customer_details = {"id": quotation.customer_id, **{
        field: saved(customer_snapshot, customer, field)
        for field in ("bharath_id", "name", "mobile", "email", "gst_number")
    }}
    property_details = {"id": quotation.property_id, **{
        field: saved(site_snapshot, site, field)
        for field in ("name", "property_type", "measurement_type", "flat_number", "block_name", "address", "city", "pincode")
    }}
    return customer_details, property_details
