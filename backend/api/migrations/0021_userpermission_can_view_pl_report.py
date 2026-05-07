from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_stockbatch_purchase_price'),
    ]

    operations = [
        migrations.AddField(
            model_name='userpermission',
            name='can_view_pl_report',
            field=models.BooleanField(default=True),
        ),
    ]
