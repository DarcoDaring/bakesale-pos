from rest_framework import serializers
from .models import Purchase, PurchaseItem, Supplier
from products.models import Product


class PurchaseItemSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())

    class Meta:
        model = PurchaseItem
        fields = [
            'product',
            'quantity',
            'mrp',
            'cost_price',
            'gst',
            'total'
        ]


class PurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True)

    class Meta:
        model = Purchase
        fields = ['invoice_number', 'date', 'supplier', 'total_amount', 'items']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        purchase = Purchase.objects.create(**validated_data)

        for item in items_data:
            PurchaseItem.objects.create(purchase=purchase, **item)

            product = item['product']

            # ✅ Update stock
            product.stock_quantity += item['quantity']

            # 🔥 SAFE MRP UPDATE (IMPORTANT FIX)
            mrp = item.get('mrp')

            print("MRP RECEIVED:", mrp)  # DEBUG

            if mrp and float(mrp) > 0:
                product.selling_price = mrp

            product.save()

        return purchase