from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import (
    User, UserPermission, Vendor, Product, StockBatch, PurchaseBill, Purchase,
    SaleBill, SaleItem, ReturnItem,
    InternalSaleMaster, InternalSale, PurchaseReturn,
    DirectSaleMaster, DirectSale, StockAdjustmentRequest, StockTransfer,
    ItemReturn, ItemReturnLine, InternalSaleBill
)
from decimal import Decimal


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['role']     = user.role
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['role']     = self.user.role
        data['username'] = self.user.username
        data['user_id']  = self.user.id
        return data


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model  = User
        fields = ['id', 'username', 'password', 'role', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserPermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UserPermission
        fields = '__all__'
        read_only_fields = ['id', 'user']


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Vendor
        fields = ['id', 'name', 'phone', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class StockBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model  = StockBatch
        fields = ['id', 'mrp', 'quantity', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProductSerializer(serializers.ModelSerializer):
    batches = StockBatchSerializer(many=True, read_only=True)

    class Meta:
        model  = Product
        fields = ['id', 'barcode', 'name', 'selling_price', 'selling_unit',
                  'tax', 'stock_quantity', 'damaged_quantity', 'expired_quantity',
                  'is_active', 'created_at', 'batches']
        read_only_fields = ['id', 'created_at']


class PurchaseItemSerializer(serializers.ModelSerializer):
    product_name    = serializers.CharField(source='product.name',    read_only=True)
    product_barcode = serializers.CharField(source='product.barcode', read_only=True)
    cost_per_item   = serializers.SerializerMethodField()

    class Meta:
        model  = Purchase
        fields = ['id', 'product', 'product_name', 'product_barcode',
                  'purchase_unit', 'quantity', 'purchase_price', 'tax', 'tax_type',
                  'mrp', 'selling_unit', 'selling_qty', 'cost_per_item', 'date']
        read_only_fields = ['id', 'date']

    def get_cost_per_item(self, obj):
        """purchase_price ÷ selling_qty = cost per selling unit"""
        selling_qty = float(obj.selling_qty) if obj.selling_qty else 1
        if selling_qty <= 0:
            selling_qty = 1
        return round(float(obj.purchase_price) / selling_qty, 4)


class PurchaseBillListSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    total_value = serializers.SerializerMethodField()
    item_count  = serializers.SerializerMethodField()

    class Meta:
        model  = PurchaseBill
        fields = ['id', 'purchase_number', 'vendor', 'vendor_name',
                  'is_paid', 'date', 'total_value', 'item_count']
        read_only_fields = ['id', 'purchase_number', 'date']

    def get_total_value(self, obj):
        total = 0
        for item in obj.items.all():
            qty   = float(item.quantity)
            price = float(item.purchase_price)
            tax   = float(item.tax)
            total += qty * price * (1 + tax / 100)
        return round(total, 2)

    def get_item_count(self, obj):
        return obj.items.count()


class PurchaseBillSerializer(serializers.ModelSerializer):
    items       = PurchaseItemSerializer(many=True)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)

    class Meta:
        model  = PurchaseBill
        fields = ['id', 'purchase_number', 'vendor', 'vendor_name',
                  'is_paid', 'items', 'date']
        read_only_fields = ['id', 'purchase_number', 'date']

    def create(self, validated_data):
        items_data      = validated_data.pop('items')
        purchase_number = PurchaseBill.generate_purchase_number()
        bill = PurchaseBill.objects.create(
            purchase_number=purchase_number,
            **validated_data
        )

        for item_data in items_data:
            product       = item_data['product']
            quantity      = item_data['quantity']
            selling_qty   = item_data.get('selling_qty', 1)
            mrp           = item_data['mrp']
            selling_unit  = item_data['selling_unit']
            purchase_unit = item_data.get('purchase_unit', 'nos')

            Purchase.objects.create(bill=bill, **item_data)

            if purchase_unit == 'case':
                stock_to_add = Decimal(str(float(quantity) * float(selling_qty)))
            else:
                stock_to_add = Decimal(str(float(quantity)))

            mrp_decimal = Decimal(str(mrp)).quantize(Decimal('0.01'))

            existing_batch = None
            for b in StockBatch.objects.filter(product=product):
                if Decimal(str(b.mrp)).quantize(Decimal('0.01')) == mrp_decimal:
                    existing_batch = b
                    break

            if existing_batch:
                existing_batch.quantity = Decimal(str(existing_batch.quantity)) + stock_to_add
                existing_batch.save()
            else:
                StockBatch.objects.create(product=product, mrp=mrp_decimal, quantity=stock_to_add)

            product.stock_quantity = Decimal(str(product.stock_quantity)) + stock_to_add
            product.selling_unit   = selling_unit
            product.selling_price  = mrp_decimal
            if item_data.get('tax') is not None:
                product.tax = item_data['tax']
            product.save()

        return bill


class SaleItemSerializer(serializers.ModelSerializer):
    product_name    = serializers.CharField(source='product.name',    read_only=True)
    product_barcode = serializers.CharField(source='product.barcode', read_only=True)
    subtotal        = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    batch_id        = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    tax             = serializers.SerializerMethodField()
    cost_per_item   = serializers.SerializerMethodField()

    class Meta:
        model  = SaleItem
        fields = ['id', 'product', 'product_name', 'product_barcode',
                  'batch_id', 'quantity', 'price', 'subtotal',
                  'tax', 'cost_per_item']

    def get_tax(self, obj):
        return float(obj.tax or 0)

    def get_cost_per_item(self, obj):
        last = obj.product.purchases.order_by('-date').first()
        if last:
            selling_qty = float(last.selling_qty) if last.selling_qty else 1
            if selling_qty <= 0:
                selling_qty = 1
            return round(float(last.purchase_price) / selling_qty, 4)
        return 0


class SaleBillSerializer(serializers.ModelSerializer):
    items               = SaleItemSerializer(many=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model  = SaleBill
        fields = ['id', 'bill_number', 'total_amount', 'payment_type',
                  'cash_amount', 'card_amount', 'upi_amount',
                  'items', 'created_at', 'created_by_username']
        read_only_fields = ['id', 'bill_number', 'created_at']

    def create(self, validated_data):
        items_data  = validated_data.pop('items')
        bill_number = SaleBill.generate_bill_number()
        bill        = SaleBill.objects.create(bill_number=bill_number, **validated_data)

        for item_data in items_data:
            # Lock the product row to prevent race conditions with simultaneous sales
            product  = Product.objects.select_for_update().get(pk=item_data['product'].pk)
            qty      = Decimal(str(item_data['quantity']))
            batch_id = item_data.pop('batch_id', None)
            batch    = None

            if batch_id:
                try:
                    batch = StockBatch.objects.select_for_update().get(id=batch_id, product=product)
                except StockBatch.DoesNotExist:
                    pass

            if batch:
                if batch.quantity < qty:
                    bill.delete()
                    raise serializers.ValidationError(
                        f"Insufficient stock in batch ₹{batch.mrp} for {product.name}"
                    )
                batch.quantity -= qty
                batch.save()
            else:
                remaining = qty
                for b in StockBatch.objects.select_for_update().filter(
                    product=product, quantity__gt=0
                ).order_by('mrp', 'created_at'):
                    if remaining <= 0:
                        break
                    deduct = min(Decimal(str(b.quantity)), remaining)
                    b.quantity -= deduct
                    b.save()
                    remaining -= deduct

                if remaining > Decimal('0.001'):
                    bill.delete()
                    raise serializers.ValidationError(
                        f"Insufficient stock for {product.name}"
                    )

            # Use product.tax (set by purchase or opening stock); fall back to last purchase
            if float(product.tax or 0) > 0:
                tax_rate = float(product.tax)
            else:
                last = product.purchases.order_by('-date').first()
                tax_rate = float(last.tax) if last else 0

            SaleItem.objects.create(
                bill=bill,
                product=product,
                batch=batch,
                quantity=qty,
                price=item_data['price'],
                tax=tax_rate
            )

            product.stock_quantity = Decimal(str(product.stock_quantity)) - qty
            if product.stock_quantity < 0:
                product.stock_quantity = Decimal('0')
            product.save()

        return bill


class SaleBillListSerializer(serializers.ModelSerializer):
    item_count    = serializers.SerializerMethodField()
    return_total  = serializers.SerializerMethodField()
    return_number = serializers.SerializerMethodField()

    class Meta:
        model  = SaleBill
        fields = ['id', 'bill_number', 'total_amount', 'payment_type',
                  'cash_amount', 'card_amount', 'upi_amount',
                  'created_at', 'item_count', 'return_total', 'return_number']

    def get_item_count(self, obj):
        return obj.items.count()

    def get_return_total(self, obj):
        total = sum(
            l.quantity * l.price
            for ir in obj.return_lines.select_related('item_return').all()
            for l in [ir]
        )
        return float(total)

    def get_return_number(self, obj):
        lines = obj.return_lines.select_related('item_return').all()
        nums = list({l.item_return.return_number for l in lines if l.item_return})
        return ', '.join(nums) if nums else None


class ReturnItemSerializer(serializers.ModelSerializer):
    product_name    = serializers.CharField(source='product.name',    read_only=True)
    product_barcode = serializers.CharField(source='product.barcode', read_only=True)

    class Meta:
        model  = ReturnItem
        fields = ['id', 'product', 'product_name', 'product_barcode',
                  'return_type', 'quantity', 'date']
        read_only_fields = ['id', 'date']

    def create(self, validated_data):
        return_item = ReturnItem.objects.create(**validated_data)
        product     = return_item.product
        qty         = Decimal(str(return_item.quantity))

        if return_item.return_type == 'customer_return':
            product.stock_quantity = Decimal(str(product.stock_quantity)) + qty
            latest = StockBatch.objects.filter(product=product).order_by('-mrp', '-created_at').first()
            if latest:
                latest.quantity = Decimal(str(latest.quantity)) + qty
                latest.save()
            else:
                StockBatch.objects.create(product=product, mrp=product.selling_price, quantity=qty)
        elif return_item.return_type == 'damaged':
            product.damaged_quantity = Decimal(str(product.damaged_quantity)) + qty
            remaining = qty
            for b in StockBatch.objects.filter(product=product, quantity__gt=0).order_by('-mrp'):
                if remaining <= 0:
                    break
                deduct = min(Decimal(str(b.quantity)), remaining)
                b.quantity = Decimal(str(b.quantity)) - deduct
                b.save()
                remaining -= deduct
            product.stock_quantity = Decimal(str(product.stock_quantity)) - qty
            if product.stock_quantity < 0:
                product.stock_quantity = Decimal('0')
        elif return_item.return_type == 'expired':
            product.expired_quantity = Decimal(str(product.expired_quantity)) + qty
            remaining = qty
            for b in StockBatch.objects.filter(product=product, quantity__gt=0).order_by('mrp'):
                if remaining <= 0:
                    break
                deduct = min(Decimal(str(b.quantity)), remaining)
                b.quantity = Decimal(str(b.quantity)) - deduct
                b.save()
                remaining -= deduct
            product.stock_quantity = Decimal(str(product.stock_quantity)) - qty
            if product.stock_quantity < 0:
                product.stock_quantity = Decimal('0')

        product.save()
        return return_item


class InternalSaleMasterSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model  = InternalSaleMaster
        fields = ['id', 'name', 'is_active', 'created_at', 'created_by_username']
        read_only_fields = ['id', 'created_at']


class InternalSaleSerializer(serializers.ModelSerializer):
    product_name     = serializers.CharField(source='product.name',     read_only=True)
    product_barcode  = serializers.CharField(source='product.barcode',  read_only=True)
    destination_name = serializers.CharField(source='destination.name', read_only=True)

    class Meta:
        model  = InternalSale
        fields = ['id', 'product', 'product_name', 'product_barcode',
                  'destination', 'destination_name', 'quantity', 'price', 'date']
        read_only_fields = ['id', 'date']

    def create(self, validated_data):
        internal = InternalSale.objects.create(**validated_data)
        product  = internal.product
        qty      = Decimal(str(internal.quantity))
        if Decimal(str(product.stock_quantity)) < qty:
            internal.delete()
            raise serializers.ValidationError(f"Insufficient stock for {product.name}")
        remaining = qty
        for b in StockBatch.objects.filter(
            product=product, quantity__gt=0
        ).order_by('mrp', 'created_at'):
            if remaining <= 0:
                break
            deduct = min(Decimal(str(b.quantity)), remaining)
            b.quantity = Decimal(str(b.quantity)) - deduct
            b.save()
            remaining -= deduct
        product.stock_quantity = Decimal(str(product.stock_quantity)) - qty
        if product.stock_quantity < 0:
            product.stock_quantity = Decimal('0')
        product.save()
        return internal


class PurchaseReturnSerializer(serializers.ModelSerializer):
    mrp             = serializers.DecimalField(source='product.selling_price', max_digits=10, decimal_places=2, read_only=True)
    product_name    = serializers.CharField(source='product.name',    read_only=True)
    product_barcode = serializers.CharField(source='product.barcode', read_only=True)
    vendor_name     = serializers.SerializerMethodField()
    item_cost       = serializers.FloatField(read_only=True)

    def get_vendor_name(self, obj):
        return obj.vendor.name if obj.vendor else '—'

    class Meta:
        model  = PurchaseReturn
        fields = ['id', 'return_number', 'product', 'product_name', 'product_barcode', 'mrp',
                  'vendor', 'vendor_name',
                  'quantity', 'purchase_price', 'tax', 'item_cost',
                  'reason', 'status', 'date']
        read_only_fields = ['id', 'date']

    def create(self, validated_data):
        pr      = PurchaseReturn.objects.create(**validated_data)
        product = pr.product
        qty     = Decimal(str(pr.quantity))
        remaining = qty
        for b in StockBatch.objects.filter(product=product, quantity__gt=0).order_by('mrp'):
            if remaining <= 0:
                break
            deduct = min(Decimal(str(b.quantity)), remaining)
            b.quantity = Decimal(str(b.quantity)) - deduct
            b.save()
            remaining -= deduct
        product.stock_quantity = Decimal(str(product.stock_quantity)) - qty
        if product.stock_quantity < 0:
            product.stock_quantity = Decimal('0')
        product.save()
        return pr


class DirectSaleMasterSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model  = DirectSaleMaster
        fields = ['id', 'name', 'is_active', 'created_at', 'created_by_username']
        read_only_fields = ['id', 'created_at']


class DirectSaleSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model  = DirectSale
        fields = ['id', 'item', 'item_name', 'price', 'payment_type',
                  'cash_amount', 'card_amount', 'upi_amount', 'date']
        read_only_fields = ['id', 'date']


class StockAdjustmentRequestSerializer(serializers.ModelSerializer):
    product_name      = serializers.CharField(source='product.name',         read_only=True)
    product_barcode   = serializers.CharField(source='product.barcode',       read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.username', read_only=True)
    reviewed_by_name  = serializers.CharField(source='reviewed_by.username',  read_only=True)

    class Meta:
        model  = StockAdjustmentRequest
        fields = ['id', 'product', 'product_name', 'product_barcode',
                  'system_stock', 'physical_stock', 'status', 'reason',
                  'requested_by_name', 'reviewed_by_name',
                  'created_at', 'reviewed_at']
        read_only_fields = ['id', 'status', 'created_at', 'reviewed_at']


class StockTransferSerializer(serializers.ModelSerializer):
    product_name    = serializers.CharField(source='product.name',    read_only=True)
    product_barcode = serializers.CharField(source='product.barcode', read_only=True)

    new_product_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    new_barcode      = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model  = StockTransfer
        fields = ['id', 'product', 'product_name', 'product_barcode',
                  'quantity', 'mrp', 'purchase_price', 'tax', 'date',
                  'new_product_name', 'new_barcode']
        read_only_fields = ['id', 'date']
        extra_kwargs = {'product': {'required': False}}

    def create(self, validated_data):
        new_name    = validated_data.pop('new_product_name', '').strip()
        new_barcode = validated_data.pop('new_barcode', '').strip()
        product     = validated_data.pop('product', None)

        if not product:
            if not new_name:
                raise serializers.ValidationError(
                    "Product name is required when creating a new product."
                )
            create_kwargs = {'name': new_name, 'selling_price': validated_data['mrp']}
            if new_barcode:
                create_kwargs['barcode'] = new_barcode
            product = Product.objects.create(**create_kwargs)

        product.selling_price = validated_data['mrp']
        if validated_data.get('tax'):
            product.tax = validated_data['tax']
        product.save()

        mrp_decimal = Decimal(str(validated_data['mrp'])).quantize(Decimal('0.01'))
        qty         = Decimal(str(validated_data['quantity']))

        existing = None
        for b in StockBatch.objects.filter(product=product):
            if Decimal(str(b.mrp)).quantize(Decimal('0.01')) == mrp_decimal:
                existing = b
                break

        if existing:
            existing.quantity = Decimal(str(existing.quantity)) + qty
            existing.save()
        else:
            StockBatch.objects.create(product=product, mrp=mrp_decimal, quantity=qty)

        product.stock_quantity = Decimal(str(product.stock_quantity)) + qty
        product.save()

        transfer = StockTransfer.objects.create(product=product, **validated_data)
        return transfer


# ── ItemReturn Serializers ────────────────────────────────────────────────────

class ItemReturnLineSerializer(serializers.ModelSerializer):
    product_name     = serializers.CharField(source='product.name', read_only=True)
    sale_bill_number = serializers.CharField(source='sale_bill.bill_number', read_only=True)

    class Meta:
        model  = ItemReturnLine
        fields = ['id', 'product', 'product_name', 'sale_bill', 'sale_bill_number',
                  'quantity', 'price', 'return_type']


class ItemReturnSerializer(serializers.ModelSerializer):
    lines      = ItemReturnLineSerializer(many=True, read_only=True)
    created_by = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model  = ItemReturn
        fields = ['id', 'return_number', 'payment_type', 'cash_amount', 'card_amount',
                  'upi_amount', 'total_amount', 'date', 'created_by', 'lines']


# ── InternalSaleBill Serializers ──────────────────────────────────────────────

class InternalSaleBillSerializer(serializers.ModelSerializer):
    destination_name = serializers.CharField(source='destination.name', read_only=True)
    created_by       = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model  = InternalSaleBill
        fields = ['id', 'sale_number', 'destination', 'destination_name', 'date', 'created_by']