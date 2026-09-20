def consolidated_product_details(quotation):
    """Return manual details plus each selected product's features only once."""
    sections = []
    manual = (quotation.product_details or "").strip()
    if manual:
        sections.append(manual)

    if quotation.show_product_key_features:
        seen = set()
        products = []
        for item in quotation.items.all():
            name = (
                item.product_type_name_snapshot
                or item.custom_product_type
                or (item.paint_type.name if item.paint_type else "")
            ).strip()
            features = (
                item.product_type_features_snapshot
                or (item.paint_type.key_features if item.paint_type else "")
            ).strip()
            brand = (
                item.brand_name_snapshot
                or item.custom_brand
                or (item.paint_brand.name if item.paint_brand else "")
            ).strip()
            if not name or not features:
                continue
            key = (name.casefold(), brand.casefold(), features.casefold())
            if key in seen:
                continue
            seen.add(key)
            heading = f"{name} ({brand})" if brand else name
            products.append(f"{heading}: {features}")
        if products:
            sections.append("\n".join(products))

    return "\n\n".join(sections)
