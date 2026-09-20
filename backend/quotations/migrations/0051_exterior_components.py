from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("quotations", "0050_lead_work_stages")]

    operations = [
        migrations.AddField(model_name="measurementsurface", name="quantity", field=models.PositiveIntegerField(default=1)),
        migrations.AddField(
            model_name="measurementopening", name="linked_surface",
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="wall_deduction", to="quotations.measurementsurface"),
        ),
        migrations.AlterField(
            model_name="measurementsurface", name="surface_type",
            field=models.CharField(choices=[("WALL", "Wall"), ("CEILING", "Ceiling"), ("DOOR", "Paintable door"), ("WINDOW", "Paintable window"), ("GATE", "Gate"), ("GRILL", "Grill"), ("BALCONY_SOFFIT", "Balcony ceiling"), ("STAIR_SOFFIT", "Staircase ceiling"), ("PORCH_CEILING", "Porch ceiling"), ("WATERPROOFING", "Floor / terrace waterproofing"), ("PARAPET", "Parapet wall"), ("OTHER", "Other / manual")], max_length=30),
        ),
        migrations.AlterField(
            model_name="measurementopening", name="opening_type",
            field=models.CharField(choices=[("DOOR", "Door"), ("WINDOW", "Window"), ("GATE", "Gate"), ("GRILL", "Grill"), ("WARDROBE", "Wardrobe"), ("OTHER", "Other")], max_length=20),
        ),
    ]
