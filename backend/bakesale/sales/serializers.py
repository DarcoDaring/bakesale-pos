from rest_framework import serializers
from .models import Sale, SaleItem
from products.models import Product


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = ['product', 'quantity', 'price', 'total']


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True)

    class Meta:
        model = Sale
        fields = [
            'id',
            'date',
            'total_amount',
            'payment_mode',
            'cash_amount',
            'credit_amount',
            'credit_type',
            'items'
        ]

    # ✅ CREATE
    def create(self, validated_data):
        items_data = validated_data.pop('items')

        sale = Sale.objects.create(**validated_data)

        for item in items_data:
            product = item['product']

            # ✅ HANDLE BOTH ID & OBJECT
            if isinstance(product, int):
                product = Product.objects.get(id=product)

            SaleItem.objects.create(
                sale=sale,
                product=product,
                quantity=item['quantity'],
                price=item['price'],
                total=item['total']
            )

            # 🔥 Reduce stock
            product.stock_quantity -= item['quantity']
            product.save()

        return sale

    # ✅ UPDATE (EDIT BILL)
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items')

        # 🔁 Restore old stock
        for old_item in instance.items.all():
            product = old_item.product
            product.stock_quantity += old_item.quantity
            product.save()

        # ❌ Delete old items
        instance.items.all().delete()

        # 🔁 Update sale fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # ➕ Create new items
        for item in items_data:
            product = item['product']

            # ✅ HANDLE BOTH ID & OBJECT
            if isinstance(product, int):
                product = Product.objects.get(id=product)

            SaleItem.objects.create(
                sale=instance,
                product=product,
                quantity=item['quantity'],
                price=item['price'],
                total=item['total']
            )

            # 🔥 Reduce stock again
            product.stock_quantity -= item['quantity']
            product.save()

        return instance