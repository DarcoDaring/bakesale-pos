# management/commands/sync_stock.py
from django.core.management.base import BaseCommand
from api.models import Product, StockBatch
from django.db.models import Sum
from decimal import Decimal

class Command(BaseCommand):
    help = 'Resync Product.stock_quantity from StockBatch totals'

    def handle(self, *args, **kwargs):
        for product in Product.objects.all():
            batch_total = StockBatch.objects.filter(
                product=product, quantity__gt=0
            ).aggregate(t=Sum('quantity'))['t'] or Decimal('0')
            
            if product.stock_quantity != batch_total:
                self.stdout.write(
                    f"Fixing {product.name}: {product.stock_quantity} → {batch_total}"
                )
                product.stock_quantity = batch_total
                product.save()
        
        self.stdout.write(self.style.SUCCESS('Stock sync complete!'))