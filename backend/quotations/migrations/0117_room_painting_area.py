from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('quotations', '0116_quotation_combined_discounts')]
    operations = [
        migrations.AddField(model_name='area', name='painting_area', field=models.CharField(max_length=10, choices=[('INTERIOR','Interior'),('EXTERIOR','Exterior'),('OTHER','Others')], default='OTHER')),
        migrations.AddField(model_name='propertyroom', name='painting_area', field=models.CharField(max_length=10, choices=[('INTERIOR','Interior'),('EXTERIOR','Exterior'),('OTHER','Others')], blank=True, default='')),
    ]
