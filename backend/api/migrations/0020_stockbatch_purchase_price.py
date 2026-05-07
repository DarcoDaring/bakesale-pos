from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0019_stockadjustmentrequest_batch'),
    ]

    operations = [
        migrations.AddField(
            model_name='stockbatch',
            name='purchase_price',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]
