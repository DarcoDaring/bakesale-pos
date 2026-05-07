from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0018_purchasebill_round_off'),
    ]

    operations = [
        migrations.AddField(
            model_name='stockadjustmentrequest',
            name='batch',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='adjustments',
                to='api.stockbatch',
            ),
        ),
    ]
