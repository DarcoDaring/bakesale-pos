from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_product_tax'),
    ]

    operations = [
        migrations.AddField(
            model_name='userpermission',
            name='can_physical_stock',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='userpermission',
            name='can_stock_report',
            field=models.BooleanField(default=True),
        ),
    ]
